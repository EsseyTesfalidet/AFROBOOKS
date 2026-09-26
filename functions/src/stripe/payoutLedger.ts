import type { Firestore } from 'firebase-admin/firestore';

export type Transfer = (input: {
  amount: number; destination: string; payoutId: string; sellerId: string;
  idempotencyKey: string;
}) => Promise<{ id: string }>;

// Reserve before contacting Stripe. New sales accrue in pendingBalance separately.
// Ambiguous transfers keep their reservation until reconciled, never automatically refunded.
export async function paySeller(db: Firestore, sellerId: string, period: string, transfer: Transfer, now = Date.now()) {
  const sellerRef = db.collection('sellers').doc(sellerId);
  const payoutRef = await db.runTransaction(async (tx) => {
    const seller = (await tx.get(sellerRef)).data();
    if (!seller || !seller.payoutsReconciledAt) return null;
    const ref = db.collection('payouts').doc(seller.activePayoutId || `${sellerId}_${period}`);
    const existing = await tx.get(ref);
    if (existing.exists) return ref;
    const amount = seller.pendingBalance;
    if (!Number.isSafeInteger(amount) || amount < 100 || !seller.stripeAccountId) return null;
    tx.create(ref, {
      sellerId, sellerName: seller.penName || sellerId,
      stripeAccountId: seller.stripeAccountId, amountCents: amount,
      periodLabel: period, status: 'pending', createdAt: new Date(now),
      stripeTransferId: null,
    });
    tx.update(sellerRef, {
      pendingBalance: seller.pendingBalance - amount,
      activePayoutId: ref.id, updatedAt: new Date(now),
    });
    return ref;
  });
  if (!payoutRef) return 'skipped';

  const payout = await db.runTransaction(async (tx) => {
    const data = (await tx.get(payoutRef)).data()!;
    if (data.status === 'paid' || data.status === 'needs_review') return null;
    const firstAttempt = data.firstAttemptAt?.toMillis() as number | undefined;
    // Stripe may prune idempotency keys after 24 hours. Never retry an uncertain
    // transfer outside that window. Reconcile it against Stripe before releasing funds.
    if (firstAttempt !== undefined && now - firstAttempt >= 23 * 60 * 60 * 1000) {
      tx.update(payoutRef, { status: 'needs_review' });
      return null;
    }
    if ((data.leaseUntil?.toMillis() ?? 0) > now) return null;
    tx.update(payoutRef, {
      status: 'processing',
      firstAttemptAt: data.firstAttemptAt || new Date(now),
      leaseUntil: new Date(now + 5 * 60 * 1000),
    });
    return data;
  });
  if (!payout) return 'unchanged';
  try {
    const result = await transfer({
      amount: payout.amountCents, destination: payout.stripeAccountId,
      sellerId, payoutId: payoutRef.id, idempotencyKey: `afrobooks-payout-${payoutRef.id}`,
    });
    if (!result.id) throw new Error('Transfer confirmation missing');
    await db.runTransaction(async (tx) => {
      const current = await tx.get(payoutRef);
      const seller = await tx.get(sellerRef);
      if (current.data()?.status === 'paid') return;
      tx.update(payoutRef, {
        stripeTransferId: result.id, status: 'paid',
        paidAt: new Date(), leaseUntil: null,
      });
      if (seller.data()?.activePayoutId === payoutRef.id) tx.update(sellerRef, { activePayoutId: null });
      tx.set(db.collection('notifications').doc(`payout_${payoutRef.id}`), {
        userId: sellerId, type: 'payout', title: 'Payout transferred',
        message: `$${(payout.amountCents / 100).toFixed(2)} has been transferred to your Stripe account.`,
        isRead: false, actionUrl: '/earnings', relatedBookId: null,
        createdAt: new Date(),
      });
    });
    return 'paid';
  } catch {
    // A network error does not establish that Stripe failed to transfer money.
    await db.runTransaction(async (tx) => {
      const current = await tx.get(payoutRef);
      if (current.data()?.status !== 'paid') tx.update(payoutRef, { status: 'pending', leaseUntil: null });
    });
    return 'pending';
  }
}
