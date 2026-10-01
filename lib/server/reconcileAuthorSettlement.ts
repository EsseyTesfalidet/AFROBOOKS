import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { accountReadiness } from '@/functions/src/stripe/accountReadiness';
import { isSettledRefund, isSettledReversal } from '@/functions/src/stripe/refundSettlement';
import { settleUnpaidRefunds } from './settleUnpaidRefunds';

export interface SettlementResult { settled: boolean; message: string; retainedFeeCents?: number }
const blocked = (message: string): SettlementResult => ({ settled: false, message });
const objectId = (value: string | { id: string } | null | undefined) => typeof value === 'string' ? value : value?.id;
const cents = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) >= 0;

/** Reconcile provider evidence and ledger records. Never create a refund or transfer. */
export async function reconcileAuthorSettlement(db: Firestore, stripe: Stripe, sellerId: string): Promise<SettlementResult> {
  if (await settleUnpaidRefunds(db, stripe, sellerId)) return { settled: true, message: 'Refunds settled. This author can receive new purchases.' };
  return db.runTransaction(async tx => {
    const sellerRef = db.doc(`sellers/${sellerId}`);
    const [sellerSnap, orders, payouts] = await Promise.all([
      tx.get(sellerRef), tx.get(db.collection('orders').where('sellerId', '==', sellerId)),
      tx.get(db.collection('payouts').where('sellerId', '==', sellerId)),
    ]);
    const seller = sellerSnap.data();
    if (!seller?.stripeAccountId) return blocked('The author must connect Stripe first.');
    if (seller.payoutHoldReason && !['payment_review', 'balance_mismatch', 'transfer_mismatch', 'unrecorded_transfer'].includes(seller.payoutHoldReason)) return blocked('This account has a separate security or legacy-ledger hold that requires support review.');
    const account = await stripe.accounts.retrieve(seller.stripeAccountId);
    const readiness = accountReadiness(account);
    if (account.metadata?.userId !== sellerId) return blocked('Stripe account ownership does not match this author.');
    if (readiness.stripeAccountStatus !== 'active') return blocked('Stripe has not enabled this author’s transfers and payouts yet.');
    if (orders.size > 200 || payouts.size > 200) return blocked('This ledger needs a larger reconciliation. Contact support.');
    if (orders.docs.some(o => !['completed', 'refunded', 'failed'].includes(o.data().status))) return blocked('A payment is pending, disputed or only partly refunded. Resolve it in Stripe, then check again.');
    const sales = orders.docs.filter(o => ['completed', 'refunded'].includes(o.data().status));
    if (sales.some(o => !cents(o.data().sellerEarnings) || !cents(o.data().finalPrice) || !o.data().stripePaymentIntentId)) return blocked('An order has missing or invalid financial information.');
    if (payouts.docs.some(p => p.data().kind !== 'book_royalty' || !['paid', 'reversed'].includes(p.data().status) || !cents(p.data().amountCents))) return blocked('A payout is reserved, processing or missing confirmation. Resolve that payout before settling.');
    const transfers = new Map<string, Stripe.Transfer>();
    for await (const transfer of stripe.transfers.list({ destination: account.id, limit: 100 })) transfers.set(transfer.id, transfer);
    const verified = new Map<string, { payment: Stripe.PaymentIntent; charge: Stripe.Charge; refunded: boolean; retainedFee: number }>();
    for (const paymentId of new Set(sales.map(o => o.data().stripePaymentIntentId as string))) {
      const lines = await tx.get(db.collection('orders').where('stripePaymentIntentId', '==', paymentId));
      const payment = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
      const charge = payment.latest_charge;
      const refunded = lines.docs.every(o => o.data().status === 'refunded' && o.data().refundStatus === 'full');
      if (payment.status !== 'succeeded' || payment.currency !== 'usd' || !payment.metadata.userId ||
          !charge || typeof charge === 'string' || !charge.paid || charge.disputed ||
          lines.docs.some(o => o.data().buyerId !== payment.metadata.userId) ||
          lines.docs.reduce((sum, o) => sum + o.data().finalPrice, 0) !== payment.amount_received ||
          (!refunded && lines.docs.some(o => o.data().status !== 'completed'))) return blocked('Stripe payment details or order statuses do not match, or a dispute remains open.');
      let successfulRefunds = 0;
      for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) {
        if (refund.status === 'succeeded') successfulRefunds += refund.amount;
        else if (!['failed', 'canceled'].includes(refund.status ?? '')) return blocked('A refund is still pending. Wait for Stripe to confirm it.');
      }
      if (refunded ? successfulRefunds !== payment.amount_received : successfulRefunds > 0 || charge.amount_refunded > 0) return blocked('The refund is partial or not confirmed in Stripe.');
      let retainedFee = 0;
      if (payment.transfer_data?.destination) {
        if (objectId(payment.transfer_data.destination) !== account.id) return blocked('The payment destination does not match the author.');
        const feeAmount = payment.application_fee_amount ?? 0;
        if (!cents(feeAmount)) return blocked('Invalid application fee.');
        if (feeAmount) {
          const feeId = objectId(charge.application_fee);
          if (!feeId) return blocked('Stripe has not confirmed the application fee yet.');
          const fee = await stripe.applicationFees.retrieve(feeId);
          if (fee.amount !== feeAmount || fee.currency !== 'usd' || objectId(fee.account) !== account.id ||
              objectId(fee.originating_transaction) !== charge.id || !cents(fee.amount_refunded) || fee.amount_refunded > feeAmount ||
              (!refunded && fee.amount_refunded > 0)) return blocked('Application fee records need review.');
          if (refunded) retainedFee = feeAmount - fee.amount_refunded;
        }
      }
      verified.set(paymentId, { payment, charge, refunded, retainedFee });
    }
    const usedTransfers = new Set<string>();
    const paidOrderIds = new Set<string>();
    const reversedPayouts = [];
    let reserved = 0;
    let previouslyReservedRefunds = 0;
    for (const payout of payouts.docs) {
      const p = payout.data();
      const fact = verified.get(p.stripePaymentIntentId);
      const transfer = transfers.get(p.stripeTransferId);
      const ids: string[] = p.chargeRouting === 'destination' ? p.orderIds : [p.orderId];
      const linked = sales.filter(o => ids?.includes(o.id));
      if (!fact || !transfer || usedTransfers.has(transfer.id) || !ids?.length || linked.length !== ids.length ||
          new Set(ids).size !== ids.length || ids.some(id => paidOrderIds.has(id)) ||
          linked.some(o => o.data().stripePaymentIntentId !== fact.payment.id) ||
          linked.reduce((sum, o) => sum + o.data().sellerEarnings, 0) !== p.amountCents ||
          p.stripeAccountId !== account.id || objectId(transfer.destination) !== account.id || transfer.currency !== 'usd' ||
          p.stripeChargeId !== fact.charge.id || objectId(transfer.source_transaction) !== fact.charge.id) return blocked('A transfer does not match its payout and orders.');
      if (p.chargeRouting === 'destination') {
        if (objectId(fact.payment.transfer_data?.destination) !== account.id || objectId(fact.charge.transfer) !== transfer.id ||
            p.grossAmountCents !== fact.payment.amount_received || transfer.amount !== p.grossAmountCents ||
            p.applicationFeeAmount !== (fact.payment.application_fee_amount ?? 0) ||
            transfer.amount - p.applicationFeeAmount !== p.amountCents) return blocked('Destination transfer amounts do not match.');
      } else if (fact.payment.transfer_data?.destination || transfer.amount !== p.amountCents ||
          transfer.metadata.payoutId !== payout.id || transfer.metadata.sellerId !== sellerId) return blocked('Royalty transfer details do not match.');
      if (fact.refunded) {
        if (!transfer.reversed || transfer.amount_reversed !== transfer.amount) return blocked('The reader was refunded, but the author transfer has not been fully reversed in Stripe. Review that transfer, then check again.');
        if (!isSettledReversal(p)) previouslyReservedRefunds += p.amountCents;
        reversedPayouts.push(payout);
      } else {
        if (p.status !== 'paid' || transfer.reversed || transfer.amount_reversed !== 0) return blocked('A paid order has a reversed or unconfirmed author transfer.');
        reserved += p.amountCents;
      }
      usedTransfers.add(transfer.id); ids.forEach(id => paidOrderIds.add(id));
    }
    if (usedTransfers.size !== transfers.size) return blocked('Stripe contains an unrecorded transfer. Reconcile that transfer before clearing the hold.');
    for (const order of sales) {
      const fact = verified.get(order.data().stripePaymentIntentId)!;
      if ((fact.payment.transfer_data?.destination || order.data().royaltyPayoutId) && !paidOrderIds.has(order.id)) return blocked('A transferred payment is missing its payout record.');
    }
    const refunded = sales.filter(o => o.data().status === 'refunded');
    const earned = sales.filter(o => o.data().status === 'completed').reduce((sum, o) => sum + o.data().sellerEarnings, 0);
    const creditedRefunds = refunded.filter(o => o.data().fulfilledAt && !isSettledRefund(o.data())).reduce((sum, o) => sum + o.data().sellerEarnings, 0);
    const pending = earned - reserved;
    const beforeEarned = earned + creditedRefunds;
    const beforePending = pending + creditedRefunds - previouslyReservedRefunds;
    if (!cents(pending) || !cents(seller.totalEarnings) || !cents(seller.pendingBalance) ||
        !((seller.totalEarnings === earned && seller.pendingBalance === pending) ||
          (seller.totalEarnings === beforeEarned && seller.pendingBalance === beforePending))) return blocked('Author balances differ from the verified ledger. No balance was overwritten.');
    const now = new Date();
    const retainedFeeCents = [...verified.values()].reduce((sum, fact) => sum + fact.retainedFee, 0);
    for (const order of refunded) tx.update(order.ref, {
      refundRoyaltyStatus: paidOrderIds.has(order.id) ? 'settled_reversed_transfer' : 'settled_no_transfer', refundRoyaltySettledAt: now,
    });
    for (const payout of reversedPayouts) tx.update(payout.ref, {
      status: 'reversed', refundSettlement: 'full_reversal', refundSettledAt: now,
      retainedApplicationFeeCents: verified.get(payout.data().stripePaymentIntentId)!.retainedFee,
    });
    tx.update(sellerRef, { ...readiness, totalEarnings: earned, pendingBalance: pending,
      payoutHoldReason: FieldValue.delete(), payoutHoldAt: FieldValue.delete(), payoutsReconciledAt: now, payoutLedgerVersion: 2 });
    tx.set(db.doc(`payoutReviews/${sellerId}`), { sellerId, status: 'resolved', reason: 'stripe_settlement_verified',
      resolvedAt: now, updatedAt: now, retainedFeeCents, orderIds: refunded.map(o => o.id) }, { merge: true });
    return { settled: true, retainedFeeCents, message: retainedFeeCents
      ? `Settled. New purchases are allowed. Stripe still records $${(retainedFeeCents / 100).toFixed(2)} in retained platform fees; no additional refund was issued.`
      : 'Settled. This author can receive new purchases.' };
  });
}
