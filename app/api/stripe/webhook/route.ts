import type Stripe from 'stripe';
import { syncSubscription } from '@/lib/server/syncSubscription';
import { NextRequest, NextResponse } from 'next/server';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { getStripeServer } from '@/lib/stripe/server';
import { getAdminDb } from '@/lib/firebase/admin';
import { sendPurchaseReceiptEmail } from '@/lib/server/email';
import { fulfillPayment, type SuccessfulPayment } from '@/lib/server/fulfillPayment';
import { paymentConfiguration } from '@/lib/stripe/config';
import { sendBookRoyalties, reviewPaymentRoyalties } from '@/lib/server/authorPayments';
import { expirePromotionCheckout, fulfillPromotionCheckout, reviewPromotionCharge, reconcilePromotionRefund } from '@/lib/server/promotionPayments';
import { reviewGiftPayment } from '@/lib/server/bookGifts';
import { deliverBookGift } from '@/lib/server/giftEmail';
import { currentBookPayment } from '@/lib/server/currentBookPayment';
import { reconcileBookRefunds } from '@/lib/server/bookRefunds';

export async function POST(req: NextRequest) {
  const sig = req.headers.get('stripe-signature');
  const body = await req.text();

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 });
  }
  if (!paymentConfiguration(process.env).checkoutReady) return NextResponse.json({ error: 'Payments are not configured' }, { status: 503 });
  const stripe = getStripeServer();

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return NextResponse.json({ error: 'Webhook signature verification failed' }, { status: 400 });
  }

  const adminDb = await getAdminDb();

  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.expired'].includes(event.type)) {
    const eventSession = event.data.object as Stripe.Checkout.Session;
    if (eventSession.metadata?.purchaseType === 'book_promotion') {
      try {
        const session = await stripe.checkout.sessions.retrieve(eventSession.id);
        if (session.status === 'expired') await expirePromotionCheckout(adminDb, session);
        else if (session.payment_status === 'paid') {
          const paymentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
          if (!paymentId) throw new Error('Promotion payment missing');
          const payment = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
          const charge = payment.latest_charge as Stripe.Charge | null;
          if (!charge || typeof charge === 'string') throw new Error('Promotion charge missing');
          await fulfillPromotionCheckout(adminDb, session, { ...payment, refunded: charge.amount_refunded > 0, disputed: charge.disputed }, /^(?:sk|rk)_live_/.test(process.env.STRIPE_SECRET_KEY ?? ''));
        }
      } catch { return NextResponse.json({ error: 'Promotion fulfillment incomplete; retry required' }, { status: 500 }); }
    }
  }

  if (event.type === 'payment_intent.succeeded') {
    const pi = event.data.object as SuccessfulPayment & Stripe.PaymentIntent;
    if (!pi.metadata.bookIds && pi.metadata.purchaseType !== 'books') return NextResponse.json({ received: true });
    try {
      // Fetch the current intent for every book payment: routing must never be
      // inferred from a stale event or a client-supplied author account.
      const latest = await stripe.paymentIntents.retrieve(pi.id, { expand: ['latest_charge'] });
      const verified = await currentBookPayment(stripe, latest);
      if (verified.reviewReason) {
        await reviewGiftPayment(adminDb, pi.id);
        await reviewPaymentRoyalties(adminDb, pi.id);
      }
      await fulfillPayment(adminDb, verified);
    } catch (error) {
      console.error('Payment fulfillment failed:', error);
      return NextResponse.json({ error: 'Fulfillment incomplete; retry required' }, { status: 500 });
    }
    const ordersSnap = await adminDb.collection('orders').where('stripePaymentIntentId', '==', pi.id).get();
    // The sale and entitlement are already durable. Scheduled retries recover
    // deferred royalties without crediting the sale a second time.
    await sendBookRoyalties(adminDb, stripe, pi.id).catch(() => console.error('Book royalty transfer deferred to scheduled retry'));
    const orders = ordersSnap.docs.map((doc) => doc.data());
    const buyer = (await adminDb.collection('users').doc(pi.metadata.userId).get()).data();
    if (buyer?.email && orders.every(order => order.status === 'completed') && orders.some((order) => !order.receiptEmailSent)) {
      const sent = await sendPurchaseReceiptEmail({
        to: buyer.email,
        buyerName: [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Reader',
        items: orders.map((order) => ({ title: order.bookTitle, authorName: order.authorName ?? 'Unknown Author', priceCents: order.finalPrice })),
        totalCents: pi.amount_received,
        orderId: pi.id,
        isGift: orders.some(order => !!order.giftId),
      }).catch(() => false);
      if (sent) await Promise.all(ordersSnap.docs.map((doc: QueryDocumentSnapshot) => doc.ref.update({ receiptEmailSent: true })));
    }
    // Returning a retryable error preserves email delivery after a transient
    // provider failure; fulfillment and royalties are independently deduplicated.
    if (pi.metadata.giftId && orders.every(order => order.status === 'completed')) {
      try { await deliverBookGift(adminDb, pi.metadata.giftId); }
      catch { return NextResponse.json({ error: 'Gift email pending; retry required' }, { status: 500 }); }
    }
  }

  if (['charge.refunded', 'charge.dispute.created', 'charge.dispute.updated', 'transfer.reversed'].includes(event.type)) {
    try {
      if (event.type === 'transfer.reversed') {
        const transfer = event.data.object as Stripe.Transfer;
        const sourceId = typeof transfer.source_transaction === 'string' ? transfer.source_transaction : transfer.source_transaction?.id;
        if (sourceId) {
          const charge = await stripe.charges.retrieve(sourceId);
          const paymentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
          if (paymentId) await reviewPaymentRoyalties(adminDb, paymentId);
        }
      } else {
        const object = event.data.object as Stripe.Charge | Stripe.Dispute;
        const paymentId = typeof object.payment_intent === 'string' ? object.payment_intent : object.payment_intent?.id;
        if (paymentId) {
          if (event.type === 'charge.refunded') await reconcileBookRefunds(adminDb, stripe, paymentId);
          else await reviewGiftPayment(adminDb, paymentId);
          await reviewPaymentRoyalties(adminDb, paymentId);
          const payment = await stripe.paymentIntents.retrieve(paymentId);
          if (event.type === 'charge.refunded') await reconcilePromotionRefund(adminDb, stripe, payment);
          else await reviewPromotionCharge(adminDb, payment);
        }
      }
    } catch { return NextResponse.json({ error: 'Payment review incomplete; retry required' }, { status: 500 }); }
  }

  if (['refund.created', 'refund.updated', 'refund.failed'].includes(event.type)) {
    try {
      const refund = event.data.object as Stripe.Refund;
      const paymentId = typeof refund.payment_intent === 'string' ? refund.payment_intent : refund.payment_intent?.id;
      if (paymentId) {
        await reconcileBookRefunds(adminDb, stripe, paymentId);
        await reconcilePromotionRefund(adminDb, stripe, await stripe.paymentIntents.retrieve(paymentId));
      }
    } catch { return NextResponse.json({ error: 'Refund synchronization incomplete; retry required' }, { status: 500 }); }
  }

  if (event.type === 'application_fee.refunded') {
    try {
      const fee = event.data.object as Stripe.ApplicationFee;
      const chargeId = typeof fee.originating_transaction === 'string' ? fee.originating_transaction : fee.originating_transaction?.id;
      if (chargeId) {
        const charge = await stripe.charges.retrieve(chargeId);
        const paymentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        if (paymentId) await reviewPaymentRoyalties(adminDb, paymentId);
      }
    } catch { return NextResponse.json({ error: 'Application fee review incomplete; retry required' }, { status: 500 }); }
  }

  if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
    try {
      const eventSub = event.data.object as Stripe.Subscription;
      const latest = await stripe.subscriptions.retrieve(eventSub.id);
      await syncSubscription(adminDb, latest);
    } catch (error) {
      console.error('Subscription synchronization failed:', error);
      return NextResponse.json({ error: 'Subscription synchronization incomplete; retry required' }, { status: 500 });
    }
  }

  return NextResponse.json({ received: true });
}
