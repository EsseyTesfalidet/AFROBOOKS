import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { accountReadiness } from '@/functions/src/stripe/accountReadiness';

/** Resolve only fully refunded, untransferred royalties. Does not move Stripe funds. */
export async function settleUnpaidRefunds(db: Firestore, stripe: Stripe, sellerId: string) {
  return db.runTransaction(async tx => {
    const sellerRef = db.doc(`sellers/${sellerId}`);
    const [sellerSnap, orders, payouts] = await Promise.all([
      tx.get(sellerRef), tx.get(db.collection('orders').where('sellerId', '==', sellerId)),
      tx.get(db.collection('payouts').where('sellerId', '==', sellerId)),
    ]);
    const seller = sellerSnap.data();
    if (!seller?.stripeAccountId || seller.payoutHoldReason !== 'payment_review' || !payouts.empty) return false;
    // Payout reservations, disputes, partial refunds and legacy states remain held.
    if (orders.docs.some(o => !['completed', 'refunded', 'failed'].includes(o.data().status))) return false;
    const refunded = orders.docs.filter(o => o.data().status === 'refunded');
    if (!refunded.length || refunded.some(o => o.data().refundStatus !== 'full')) return false;
    const account = await stripe.accounts.retrieve(seller.stripeAccountId);
    const readiness = accountReadiness(account);
    if (account.metadata?.userId !== sellerId || readiness.stripeAccountStatus !== 'active') return false;
    // Even an unrecorded or reversed transfer requires financial review. Never
    // infer the absence of a transfer from Firestore alone or a truncated list.
    for await (const transfer of stripe.transfers.list({ destination: account.id, limit: 100 })) {
      if (transfer) return false;
    }
    const completed = orders.docs.filter(o => o.data().status === 'completed');
    const paymentIds = [...new Set([...refunded, ...completed].map(o => o.data().stripePaymentIntentId as string))];
    for (const paymentId of paymentIds) {
      if (!paymentId) return false;
      const isRefund = refunded.some(o => o.data().stripePaymentIntentId === paymentId);
      const lines = await tx.get(db.collection('orders').where('stripePaymentIntentId', '==', paymentId));
      const payment = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
      const charge = payment.latest_charge;
      if (payment.status !== 'succeeded' || payment.currency !== 'usd' || payment.transfer_data?.destination ||
          !charge || typeof charge === 'string' || !charge.paid || charge.disputed || charge.transfer ||
          payment.amount_received <= 0 || lines.docs.some(o => o.data().buyerId !== payment.metadata.userId || o.data().status !== (isRefund ? 'refunded' : 'completed')) ||
          lines.docs.reduce((sum, o) => sum + o.data().finalPrice, 0) !== payment.amount_received) return false;
      let successful = 0;
      for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
        if (!isRefund && !['failed', 'canceled'].includes(refund.status ?? '')) return false;
        if (refund.status === 'succeeded') successful += refund.amount;
      }
      if (isRefund ? successful !== payment.amount_received : charge.amount_refunded > 0) return false;
    }
    const cents = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;
    if ([...completed, ...refunded].some(o => !cents(o.data().sellerEarnings))) return false;
    const earned = completed.reduce((sum, o) => sum + o.data().sellerEarnings, 0);
    const creditedRefunds = refunded.filter(o => !!o.data().fulfilledAt && o.data().refundRoyaltyStatus !== 'settled_no_transfer')
      .reduce((sum, o) => sum + o.data().sellerEarnings, 0);
    // Permit only the exact ledger before/after removing proven unpaid refund
    // credits. An arbitrary mismatch is not an invitation to overwrite balances.
    if (!cents(seller.pendingBalance) || seller.pendingBalance !== seller.totalEarnings ||
        ![earned, earned + creditedRefunds].includes(seller.totalEarnings)) return false;
    const now = new Date();
    for (const order of refunded) tx.update(order.ref, { refundRoyaltyStatus: 'settled_no_transfer', refundRoyaltySettledAt: now });
    tx.update(sellerRef, {
      ...readiness, totalEarnings: earned, pendingBalance: earned,
      payoutHoldReason: FieldValue.delete(), payoutHoldAt: FieldValue.delete(),
      payoutsReconciledAt: now, payoutLedgerVersion: 2,
    });
    tx.set(db.doc(`payoutReviews/${sellerId}`), {
      sellerId, status: 'resolved', reason: 'full_refunds_without_transfers',
      resolvedAt: now, updatedAt: now, orderIds: refunded.map(o => o.id),
    }, { merge: true });
    return true;
  });
}
