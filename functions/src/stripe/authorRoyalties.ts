import type { Firestore } from 'firebase-admin/firestore';
import { accountReadiness, type ConnectedAccount } from './accountReadiness';
import { isSettledRefund } from './refundSettlement';

export interface RoyaltyTransfer {
  id: string; amount: number; currency: string; destination: string | { id: string } | null;
  source_transaction: string | { id: string } | null; reversed: boolean; amount_reversed: number;
  metadata: { [key: string]: string };
}
export interface RoyaltyPayment {
  id: string; status: string; currency: string; amount_received: number; livemode: boolean;
  metadata: { [key: string]: string };
  destinationAccountId?: string | null;
  charge: { id: string; paid: boolean; amount_refunded: number; disputed: boolean; transferId?: string | null } | null;
}
export interface RoyaltyGateway {
  account(id: string): Promise<ConnectedAccount>;
  payment(id: string): Promise<RoyaltyPayment>;
  transfers(accountId: string): Promise<RoyaltyTransfer[]>;
  transfer(input: { amount: number; destination: string; source: string; orderId: string; sellerId: string; payoutId: string; idempotencyKey: string }): Promise<RoyaltyTransfer>;
}
const objectId = (value: string | { id: string } | null) => typeof value === 'string' ? value : value?.id;
const validAmount = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

// Also called for refunds/disputes. Never silently send additional money when an
// earlier payment requires review; staff can reconcile any transferred funds.
export async function holdAuthorPayouts(db: Firestore, sellerId: string, reason: string) {
  await db.runTransaction(async tx => {
    const ref = db.doc(`sellers/${sellerId}`);
    if (!(await tx.get(ref)).exists) return;
    tx.update(ref, { payoutHoldReason: reason, payoutHoldAt: new Date() });
    tx.set(db.doc(`payoutReviews/${sellerId}`), { sellerId, reason, status: 'open', updatedAt: new Date() }, { merge: true });
  });
}

/** Reconcile Firestore liabilities against confirmed Stripe transfers before any reservation. */
export async function reconcileAuthor(db: Firestore, sellerId: string, gateway: RoyaltyGateway) {
  const sellerRef = db.doc(`sellers/${sellerId}`);
  const [sellerSnap, orders, payouts] = await db.runTransaction(tx => Promise.all([
    tx.get(sellerRef), tx.get(db.collection('orders').where('sellerId', '==', sellerId)),
    tx.get(db.collection('payouts').where('sellerId', '==', sellerId)),
  ]));
  const seller = sellerSnap.data();
  if (!seller?.stripeAccountId || seller.payoutHoldReason) return false;
  const account = await gateway.account(seller.stripeAccountId);
  const readiness = accountReadiness(account);
  if (account.metadata?.userId !== sellerId) { await holdAuthorPayouts(db, sellerId, 'account_mismatch'); return false; }
  await sellerRef.update(readiness);
  if (readiness.stripeAccountStatus !== 'active') return false;
  const received = await gateway.transfers(account.id);
  const byId = new Map(received.map(transfer => [transfer.id, transfer]));
  const byTransfer = new Map(payouts.docs.filter(p => p.data().stripeTransferId).map(p => [p.data().stripeTransferId, p]));
  let earned = 0;
  let reserved = 0;
  let reason = '';
  for (const order of orders.docs) {
    const data = order.data();
    if (isSettledRefund(data)) continue;
    if (['refunded', 'disputed', 'needs_review'].includes(data.status)) { reason = 'payment_review'; break; }
    if (data.status !== 'completed') continue;
    if (!validAmount(data.sellerEarnings)) { reason = 'balance_mismatch'; break; }
    earned += data.sellerEarnings;
  }
  for (const payout of payouts.docs) {
    const data = payout.data();
    if (data.kind !== 'book_royalty' || !validAmount(data.amountCents) || !['pending', 'processing', 'paid', 'needs_review'].includes(data.status)) { reason = 'legacy_payout_review'; break; }
    reserved += data.amountCents;
    if (data.status === 'paid') {
      const transfer = byId.get(data.stripeTransferId);
      if (!transfer || !matchesTransfer(transfer, data, payout.id)) { reason = 'transfer_mismatch'; break; }
    }
  }
  for (const transfer of received) {
    const payout = byTransfer.get(transfer.id) ?? payouts.docs.find(p => p.id === transfer.metadata.payoutId);
    if (!payout) {
      // Stripe's automatic transfer can arrive before fulfillment commits. Defer
      // reconciliation without a permanent hold; never send a replacement.
      for (const order of orders.docs.filter(o => o.data().chargeRouting === 'destination' && o.data().status === 'pending')) {
        const payment = await gateway.payment(order.data().stripePaymentIntentId);
        if (payment.destinationAccountId === account.id && payment.charge?.transferId === transfer.id && objectId(transfer.source_transaction) === payment.charge.id) return false;
      }
    }
    if (!payout || !matchesTransfer(transfer, payout.data(), payout.id)) { reason = 'unrecorded_transfer'; break; }
  }
  if (!validAmount(seller.pendingBalance) || !validAmount(seller.totalEarnings) || earned !== seller.totalEarnings || earned - reserved !== seller.pendingBalance) reason = 'balance_mismatch';
  if (reason) {
    // A concurrent sale/reservation changes these balances. Re-audit it on the
    // next run instead of placing a false permanent hold on a moving snapshot.
    await db.runTransaction(async tx => {
      const current = (await tx.get(sellerRef)).data();
      if (!current || current.pendingBalance !== seller.pendingBalance || current.totalEarnings !== seller.totalEarnings) return;
      tx.update(sellerRef, { payoutHoldReason: reason, payoutHoldAt: new Date() });
      tx.set(db.doc(`payoutReviews/${sellerId}`), { sellerId, reason, status: 'open', updatedAt: new Date() }, { merge: true });
    });
    return false;
  }
  return db.runTransaction(async tx => {
    const current = (await tx.get(sellerRef)).data();
    if (!current || current.payoutHoldReason || current.pendingBalance !== seller.pendingBalance || current.totalEarnings !== seller.totalEarnings || current.stripeAccountId !== account.id) return false;
    tx.update(sellerRef, { payoutsReconciledAt: new Date(), payoutLedgerVersion: 2 });
    return true;
  });
}

function matchesTransfer(transfer: RoyaltyTransfer, payout: Record<string, unknown>, payoutId: string) {
  if (payout.chargeRouting === 'destination') {
    return transfer.id === payout.stripeTransferId && transfer.amount === payout.grossAmountCents &&
      validAmount(payout.applicationFeeAmount) && validAmount(payout.amountCents) && transfer.amount - payout.applicationFeeAmount === payout.amountCents &&
      transfer.currency === 'usd' && objectId(transfer.destination) === payout.stripeAccountId &&
      objectId(transfer.source_transaction) === payout.stripeChargeId && !transfer.reversed && transfer.amount_reversed === 0;
  }
  return transfer.amount === payout.amountCents && transfer.currency === 'usd' &&
    objectId(transfer.destination) === payout.stripeAccountId && objectId(transfer.source_transaction) === payout.stripeChargeId &&
    transfer.metadata.payoutId === payoutId && transfer.metadata.sellerId === payout.sellerId &&
    !transfer.reversed && transfer.amount_reversed === 0;
}

export async function payAuthorOrder(db: Firestore, orderId: string, gateway: RoyaltyGateway, now = Date.now()) {
  const orderRef = db.doc(`orders/${orderId}`);
  const order = (await orderRef.get()).data();
  if (!order || order.status !== 'completed' || !validAmount(order.sellerEarnings) || order.sellerEarnings === 0) return 'skipped';
  if (order.chargeRouting === 'destination') return 'skipped';
  const sellerRef = db.doc(`sellers/${order.sellerId}`);
  const seller = (await sellerRef.get()).data();
  if (!seller?.stripeAccountId || !seller.payoutsReconciledAt || seller.payoutLedgerVersion !== 2 || seller.payoutHoldReason) return 'skipped';
  const account = await gateway.account(seller.stripeAccountId);
  if (accountReadiness(account).stripeAccountStatus !== 'active' || account.metadata?.userId !== order.sellerId) return 'setup_required';
  const payment = await gateway.payment(order.stripePaymentIntentId);
  // Defense in depth when a legacy/malformed order lacks the routing marker.
  if (payment.destinationAccountId) {
    await holdAuthorPayouts(db, order.sellerId, 'destination_payment_review'); return 'needs_review';
  }
  const cart = await db.collection('orders').where('stripePaymentIntentId', '==', payment.id).get();
  const cartAmount = cart.docs.reduce((sum, doc) => sum + doc.data().finalPrice, 0);
  if (!payment.livemode || payment.status !== 'succeeded' || payment.currency !== 'usd' ||
      payment.amount_received !== cartAmount || payment.metadata.userId !== order.buyerId || !payment.charge?.paid ||
      payment.charge.amount_refunded > 0 || payment.charge.disputed || order.sellerEarnings > order.finalPrice) {
    await holdAuthorPayouts(db, order.sellerId, 'payment_review'); return 'needs_review';
  }
  const source = payment.charge.id;
  const payoutRef = db.doc(`payouts/royalty_${orderId}`);
  const payout = await db.runTransaction(async tx => {
    const [currentOrder, currentSeller, currentPayout] = await Promise.all([tx.get(orderRef), tx.get(sellerRef), tx.get(payoutRef)]);
    const author = currentSeller.data();
    const sale = currentOrder.data();
    if (!sale || sale.status !== 'completed' || sale.sellerEarnings !== order.sellerEarnings || !author || author.payoutHoldReason || author.stripeAccountId !== account.id) return null;
    if (currentPayout.exists) {
      const data = currentPayout.data()!;
      if (data.kind !== 'book_royalty' || data.orderId !== orderId || data.sellerId !== order.sellerId ||
          data.stripeAccountId !== account.id || data.amountCents !== order.sellerEarnings || data.stripeChargeId !== source) {
        tx.update(sellerRef, { payoutHoldReason: 'transfer_mismatch', payoutHoldAt: new Date(now) });
        tx.set(db.doc(`payoutReviews/${order.sellerId}`), { sellerId: order.sellerId, reason: 'transfer_mismatch', status: 'open', updatedAt: new Date(now) }, { merge: true });
        return null;
      }
      if (data.status === 'paid' || (data.leaseUntil?.toMillis() ?? 0) > now) return null;
      tx.update(payoutRef, { leaseUntil: new Date(now + 5 * 60000) });
      return data;
    }
    if (!validAmount(author.pendingBalance) || author.pendingBalance < sale.sellerEarnings) return null;
    const data = {
      kind: 'book_royalty', sellerId: order.sellerId, sellerName: order.sellerName || order.sellerId,
      orderId, bookId: order.bookId, stripeAccountId: account.id, stripeChargeId: source,
      stripePaymentIntentId: payment.id, amountCents: order.sellerEarnings,
      periodLabel: new Date(now).toISOString().slice(0, 7), status: 'processing', stripeTransferId: null,
      createdAt: new Date(now), firstAttemptAt: new Date(now), leaseUntil: new Date(now + 5 * 60000),
    };
    tx.create(payoutRef, data);
    tx.update(sellerRef, { pendingBalance: author.pendingBalance - sale.sellerEarnings });
    tx.update(orderRef, { royaltyPayoutId: payoutRef.id });
    return data;
  });
  if (!payout) return 'unchanged';
  try {
    // A previous request might have reached Stripe even if its response was lost.
    const known = (await gateway.transfers(account.id)).filter(transfer => transfer.metadata.payoutId === payoutRef.id);
    if (known.length > 1 || (known[0] && !matchesTransfer(known[0], payout, payoutRef.id))) throw new Error('Transfer mismatch');
    const firstAttempt = payout.firstAttemptAt instanceof Date ? payout.firstAttemptAt.getTime() : payout.firstAttemptAt.toMillis();
    if (!known.length && now - firstAttempt >= 23 * 3600000) {
      await payoutRef.update({ status: 'needs_review', leaseUntil: null });
      await holdAuthorPayouts(db, order.sellerId, 'transfer_review');
      return 'needs_review';
    }
    const transfer = known[0] ?? await gateway.transfer({
      amount: payout.amountCents, destination: account.id, source, orderId,
      sellerId: order.sellerId, payoutId: payoutRef.id, idempotencyKey: `afrobooks-royalty-${orderId}`,
    });
    if (!matchesTransfer(transfer, payout, payoutRef.id)) throw new Error('Transfer confirmation mismatch');
    await db.runTransaction(async tx => {
      const current = await tx.get(payoutRef);
      if (current.data()?.status === 'paid') return;
      tx.update(payoutRef, { status: 'paid', stripeTransferId: transfer.id, paidAt: new Date(now), leaseUntil: null });
      tx.set(db.doc(`notifications/payout_${payoutRef.id}`), {
        userId: order.sellerId, type: 'payout', title: 'Earnings sent to Stripe',
        message: `$${(payout.amountCents / 100).toFixed(2)} from your book sale has been transferred to Stripe. Bank arrival follows your Stripe payout schedule.`,
        isRead: false, actionUrl: '/seller/profile/payout', relatedBookId: order.bookId, createdAt: new Date(now),
      });
    });
    return 'paid';
  } catch {
    await db.runTransaction(async tx => {
      const current = await tx.get(payoutRef);
      if (current.data()?.status !== 'paid') tx.update(payoutRef, { status: 'pending', leaseUntil: null });
    });
    return 'pending';
  }
}

export async function processAuthorRoyalties(db: Firestore, gateway: RoyaltyGateway, sellerId?: string) {
  if ((await db.doc('platformSettings/global').get()).data()?.automatedPayoutsEnabled !== true) return { enabled: false, paid: 0, pending: 0 };
  const sellers = sellerId ? [await db.doc(`sellers/${sellerId}`).get()] : (await db.collection('sellers').get()).docs;
  let paid = 0; let pending = 0;
  for (const seller of sellers) {
    try {
      if (!seller.exists || !(await reconcileAuthor(db, seller.id, gateway))) continue;
      const orders = await db.collection('orders').where('sellerId', '==', seller.id).get();
      const payouts = await db.collection('payouts').where('sellerId', '==', seller.id).get();
      const paidOrders = new Set(payouts.docs.filter(doc => doc.data().status === 'paid').map(doc => doc.data().orderId));
      for (const order of orders.docs) {
        if (paidOrders.has(order.id)) continue;
        const result = await payAuthorOrder(db, order.id, gateway);
        if (result === 'paid') paid++;
        if (result === 'pending') pending++;
      }
    } catch {
      // An unavailable account must not prevent another author's transfer.
      pending++;
      console.error('Author royalty processing deferred', { sellerId: seller.id });
    }
  }
  return { enabled: true, paid, pending };
}
