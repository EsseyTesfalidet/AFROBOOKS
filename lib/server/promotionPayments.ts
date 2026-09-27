import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import type { Promotion } from '../../types/promotion';
import {
  eligiblePromotionBook,
  PromotionError,
  promotionId,
  requirePromotionAdmin,
  type PromotionActor,
} from './promotions';
import { promotionSettings } from '../promotions';

export async function preparePromotionCheckout(
  db: Firestore,
  actor: PromotionActor,
  id: string,
  now = Date.now(),
) {
  promotionId(id);
  const ref = db.doc(`bookPromotions/${id}`);
  return db.runTransaction(async (tx) => {
    const item = (await tx.get(ref)).data() as Promotion | undefined;
    if (!item) throw new PromotionError('Promotion not found.', 404);
    if (item.sellerId !== actor.uid)
      throw new PromotionError('This promotion belongs to another author.', 403);
    if (item.status !== 'approved' || item.priceCents < 100)
      throw new PromotionError('This promotion is not awaiting payment.');
    if (!promotionSettings((await tx.get(db.doc('promotionSettings/global'))).data()).enabled)
      throw new PromotionError('New promotions are temporarily closed.');
    if (!(await eligiblePromotionBook(db, tx, item.bookId, item.sellerId, item.creativeHash)))
      throw new PromotionError(
        'The book changed or is unavailable. Cancel this promotion and submit a new request.',
      );
    if (
      item.checkoutAttemptAt &&
      !item.checkoutSessionId &&
      now - item.checkoutAttemptAt > 22 * 3600000
    )
      throw new PromotionError(
        'An earlier checkout needs payment review. Contact support before trying again.',
      );
    const attemptAt = item.checkoutAttemptAt || now;
    if (!item.checkoutAttemptAt) tx.update(ref, { checkoutAttemptAt: attemptAt, updatedAt: now });
    return { ...item, checkoutAttemptAt: attemptAt };
  });
}

export async function createPromotionCheckout(
  db: Firestore,
  stripe: Stripe,
  actor: PromotionActor,
  id: string,
  base: string,
) {
  const item = await preparePromotionCheckout(db, actor, id);
  let session: Stripe.Checkout.Session;
  if (item.checkoutSessionId)
    session = await stripe.checkout.sessions.retrieve(item.checkoutSessionId);
  else {
    // One immutable checkout per campaign. Retries recover the same session, even
    // when Stripe succeeded but the Firestore write or HTTP response was lost.
    const metadata = { purchaseType: 'book_promotion', campaignId: id, userId: item.sellerId };
    session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        client_reference_id: id,
        metadata,
        payment_intent_data: { metadata },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'usd',
              unit_amount: item.priceCents,
              product_data: {
                name: 'AfroBooks · 7-day book promotion',
                description: 'Shared sponsored placement in Discover. No automatic renewal.',
              },
            },
          },
        ],
        expires_at: Math.floor(item.checkoutAttemptAt! / 1000) + 23 * 3600,
        success_url: `${base}/promotions?payment=received`,
        cancel_url: `${base}/promotions?payment=cancelled`,
      },
      { idempotencyKey: `afrobooks-promotion-${id}` },
    );
    await db.runTransaction(async (tx) => {
      const ref = db.doc(`bookPromotions/${id}`);
      const latest = (await tx.get(ref)).data() as Promotion | undefined;
      if (!latest || (latest.checkoutSessionId && latest.checkoutSessionId !== session.id))
        throw new PromotionError('Checkout needs payment review.');
      tx.update(ref, {
        checkoutSessionId: session.id,
        checkoutExpiresAt: session.expires_at * 1000,
      });
    });
  }
  if (session.status === 'expired') {
    await expirePromotionCheckout(db, session);
    throw new PromotionError('This checkout expired. Submit a new promotion request.');
  }
  const latest = (await db.doc(`bookPromotions/${id}`).get()).data();
  if (latest?.status !== 'approved')
    throw new PromotionError('The campaign changed. Refresh to see its status.');
  if (session.status !== 'open' || !session.url)
    throw new PromotionError('Payment is processing. Refresh your campaigns shortly.');
  return session.url;
}

export type PromotionPayment = Pick<
  Stripe.PaymentIntent,
  'id' | 'status' | 'amount_received' | 'currency' | 'livemode' | 'metadata'
> & { refunded: boolean; disputed: boolean };
export async function fulfillPromotionCheckout(
  db: Firestore,
  session: Stripe.Checkout.Session,
  payment: PromotionPayment,
  liveMode: boolean,
  now = Date.now(),
) {
  if (session.metadata?.purchaseType !== 'book_promotion' || session.payment_status !== 'paid')
    return;
  const id = session.metadata.campaignId;
  promotionId(id);
  const ref = db.doc(`bookPromotions/${id}`);
  await db.runTransaction(async (tx) => {
    const item = (await tx.get(ref)).data() as Promotion | undefined;
    if (
      !item ||
      session.metadata?.userId !== item.sellerId ||
      session.client_reference_id !== id ||
      payment.metadata.campaignId !== id ||
      payment.metadata.userId !== item.sellerId ||
      payment.metadata.purchaseType !== 'book_promotion'
    )
      throw new PromotionError('Promotion payment ownership does not match.');
    const sessionPayment =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id;
    if (
      sessionPayment !== payment.id ||
      (item.checkoutSessionId && item.checkoutSessionId !== session.id) ||
      (item.paymentIntentId && item.paymentIntentId !== payment.id)
    )
      throw new PromotionError('Promotion payment reference does not match.');
    // A refund/dispute can arrive before the checkout completion event.
    if (item.status === 'refunded') return;
    if (item.paidAt && !payment.refunded && !payment.disputed) return;
    const book = await eligiblePromotionBook(db, tx, item.bookId, item.sellerId, item.creativeHash);
    const slot = (await tx.get(db.doc(`promotionSlots/${item.bookId}`))).data();
    const valid =
      item.status === 'approved' &&
      !!item.checkoutAttemptAt &&
      !!book &&
      slot?.campaignId === id &&
      payment.status === 'succeeded' &&
      payment.amount_received === item.priceCents &&
      session.amount_total === item.priceCents &&
      payment.currency === 'usd' &&
      session.currency === 'usd' &&
      session.livemode === liveMode &&
      payment.livemode === liveMode &&
      !payment.refunded &&
      !payment.disputed;
    const endsAt = valid ? now + 7 * 86400000 : item.endsAt;
    tx.update(ref, {
      status: valid ? 'active' : 'needs_review',
      paidAt: item.paidAt || now,
      paymentIntentId: payment.id,
      checkoutSessionId: session.id,
      startsAt: valid ? now : item.startsAt,
      endsAt,
      servingUntil: valid ? endsAt : 0,
      note: valid
        ? ''
        : 'Payment received; the campaign could not run as agreed. Refund review required.',
      updatedAt: now,
    });
    tx.create(db.collection('promotionAudit').doc(), {
      campaignId: id,
      action: valid ? 'payment_activated' : 'payment_review',
      paymentIntentId: payment.id,
      at: now,
    });
  });
}

export async function expirePromotionCheckout(db: Firestore, session: Stripe.Checkout.Session) {
  if (session.metadata?.purchaseType !== 'book_promotion') return;
  const id = session.metadata.campaignId;
  promotionId(id);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`bookPromotions/${id}`);
    const item = (await tx.get(ref)).data() as Promotion | undefined;
    if (
      !item ||
      item.paidAt ||
      item.paymentIntentId ||
      !['approved', 'needs_review'].includes(item.status) ||
      (item.checkoutSessionId && item.checkoutSessionId !== session.id) ||
      session.metadata?.userId !== item.sellerId
    )
      return;
    tx.update(ref, {
      status: 'stopped',
      checkoutSessionId: session.id,
      servingUntil: 0,
      note: 'Checkout expired without a payment.',
      updatedAt: Date.now(),
    });
  });
}

export async function reviewPromotionCharge(
  db: Firestore,
  payment: Stripe.PaymentIntent,
  refunded = false,
  authoritativeRefundState = false,
) {
  if (payment.metadata.purchaseType !== 'book_promotion') return;
  const id = payment.metadata.campaignId;
  promotionId(id);
  await db.runTransaction(async (tx) => {
    const ref = db.doc(`bookPromotions/${id}`);
    const item = (await tx.get(ref)).data() as Promotion | undefined;
    if (!item || item.sellerId !== payment.metadata.userId)
      throw new PromotionError('Promotion payment ownership does not match.');
    if (item.paymentIntentId && item.paymentIntentId !== payment.id)
      throw new PromotionError('Promotion payment reference does not match.');
    if (item.status === 'refunded' && !authoritativeRefundState) return;
    tx.update(ref, {
      status: refunded ? 'refunded' : 'needs_review',
      paymentIntentId: payment.id,
      paidAt: item.paidAt || Date.now(),
      servingUntil: 0,
      note: refunded ? 'Payment fully refunded.' : 'A refund or payment dispute needs review.',
      updatedAt: Date.now(),
    });
  });
}

export async function reconcilePromotionRefund(
  db: Firestore,
  stripe: Stripe,
  payment: Stripe.PaymentIntent,
) {
  if (payment.metadata.purchaseType !== 'book_promotion') return;
  let successfulRefunds = 0;
  for await (const refund of stripe.refunds.list({ payment_intent: payment.id, limit: 100 })) {
    if (refund.status === 'succeeded') successfulRefunds += refund.amount;
  }
  // Refunds can change from succeeded to failed. Only Stripe's current refund
  // state, not an old event payload or charge.refunded alone, proves completion.
  await reviewPromotionCharge(
    db,
    payment,
    payment.amount_received > 0 && successfulRefunds >= payment.amount_received,
    true,
  );
}

// Admin-only recovery: expire unpaid sessions or issue a full refund. Stripe's
// remaining refundable balance protects retries beyond the idempotency window.
export async function resolvePromotionPayment(
  db: Firestore,
  stripe: Stripe,
  actor: PromotionActor,
  id: string,
) {
  requirePromotionAdmin(actor);
  promotionId(id);
  const ref = db.doc(`bookPromotions/${id}`);
  const item = (await ref.get()).data() as Promotion | undefined;
  if (!item) throw new PromotionError('Promotion not found.', 404);
  if (item.status !== 'needs_review')
    throw new PromotionError('Stop the campaign before resolving its payment.');
  if (!item.checkoutSessionId) {
    // Recover a successful creation whose response was lost. Never create a new
    // session while resolving an ambiguous checkout.
    const matches: Stripe.Checkout.Session[] = [];
    let scanned = 0;
    for await (const candidate of stripe.checkout.sessions.list({
      limit: 100,
      created: { gte: Math.floor((item.checkoutAttemptAt ?? item.createdAt) / 1000) - 60 },
    })) {
      if (++scanned > 2000)
        throw new PromotionError(
          'This checkout requires a manual Stripe review using its campaign reference.',
        );
      if (
        candidate.metadata?.campaignId === id &&
        candidate.metadata?.userId === item.sellerId &&
        candidate.metadata?.purchaseType === 'book_promotion'
      )
        matches.push(candidate);
    }
    if (matches.length !== 1)
      throw new PromotionError(
        'No unique checkout was found. Reconcile this campaign in Stripe using its campaign reference. No further payment will be taken.',
      );
    item.checkoutSessionId = matches[0].id;
    await db.runTransaction(async (tx) => {
      const latest = (await tx.get(ref)).data();
      if (latest?.checkoutSessionId && latest.checkoutSessionId !== item.checkoutSessionId)
        throw new PromotionError('Checkout reference changed. Refresh and try again.');
      tx.update(ref, { checkoutSessionId: item.checkoutSessionId });
    });
  }
  let session = await stripe.checkout.sessions.retrieve(item.checkoutSessionId);
  if (session.status === 'open') {
    try {
      session = await stripe.checkout.sessions.expire(session.id);
    } catch {
      session = await stripe.checkout.sessions.retrieve(session.id);
    }
  }
  if (session.status === 'expired' && session.payment_status === 'unpaid') {
    await expirePromotionCheckout(db, session);
    return;
  }
  const paymentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;
  if (session.payment_status !== 'paid' || !paymentId)
    throw new PromotionError('Stripe is still processing this payment. Try again later.');
  const payment = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
  if (
    payment.metadata.campaignId !== id ||
    payment.metadata.userId !== item.sellerId ||
    payment.metadata.purchaseType !== 'book_promotion'
  )
    throw new PromotionError('Payment requires manual reconciliation in Stripe.');
  const charge = payment.latest_charge as Stripe.Charge | null;
  if (!charge || typeof charge === 'string' || charge.disputed)
    throw new PromotionError('Resolve this payment dispute in Stripe before issuing a refund.');
  if (charge.refunded) {
    await reconcilePromotionRefund(db, stripe, payment);
    return;
  }
  const refund = await stripe.refunds.create(
    {
      payment_intent: paymentId,
      amount: charge.amount - charge.amount_refunded,
      reason: 'requested_by_customer',
      metadata: { campaignId: id },
    },
    { idempotencyKey: `afrobooks-promotion-refund-${id}` },
  );
  await reviewPromotionCharge(db, payment, refund.status === 'succeeded');
  await db.collection('promotionAudit').add({
    campaignId: id,
    action: 'refund_requested',
    actorId: actor.uid,
    refundId: refund.id,
    at: Date.now(),
  });
}
