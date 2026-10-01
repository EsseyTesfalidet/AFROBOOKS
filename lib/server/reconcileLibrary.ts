import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { confirmBookPurchase } from './confirmBookPurchase';

/** Recover only this reader's server-owned receipts. Never create a new charge. */
export async function reconcileLibrary(db: Firestore, stripe: Stripe, userId: string, input: { bookId?: string; cursor?: string } = {}) {
  let query = db.collection('orders').where('buyerId', '==', userId).orderBy(FieldPath.documentId()).limit(20);
  if (input.bookId) query = query.where('bookId', '==', input.bookId);
  if (input.cursor) query = query.startAfter(input.cursor);
  const page = await query.get();
  const confirmed = new Set<string>();
  const pendingOrderIds = new Set<string>();
  const checked = new Set<string>();
  for (const order of page.docs) {
    const data = order.data();
    if (!data.giftId && ['needs_review', 'disputed'].includes(data.status)) pendingOrderIds.add(order.id);
    if (data.giftId || data.status !== 'pending' || !data.stripePaymentIntentId || checked.has(data.stripePaymentIntentId)) continue;
    checked.add(data.stripePaymentIntentId);
    try {
      for (const id of await confirmBookPurchase(db, stripe, userId, [order.id])) confirmed.add(id);
    } catch {
      // An unavailable payment provider or an ineligible charge must never
      // create access. Keep this receipt available for the reader to inspect.
      pendingOrderIds.add(order.id);
    }
  }
  // A fulfillment marker can outlive a missing library document. Rebuild the
  // entitlement from an immutable completed receipt, without crediting a sale twice.
  let restored = 0;
  for (const receipt of page.docs) {
    if (receipt.data().giftId || !['completed', 'pending', 'needs_review'].includes(receipt.data().status)) continue;
    const recovered = await db.runTransaction(async tx => {
      const order = (await tx.get(receipt.ref)).data();
      if (order?.buyerId === userId && !order.giftId && ['needs_review', 'disputed'].includes(order.status)) return -1;
      if (!order || order.buyerId !== userId || order.giftId || order.status !== 'completed' || typeof order.bookId !== 'string' || !order.bookId || order.bookId.includes('/')) return 0;
      const ref = db.doc(`library/${userId}_${order.bookId}`);
      const [entry, book, deletion] = await Promise.all([tx.get(ref), tx.get(db.doc(`books/${order.bookId}`)), tx.get(db.doc(`bookDeletions/${order.bookId}`))]);
      if (['bought', 'free_copy'].includes(entry.data()?.purchaseType) || !book.exists || book.data()?.status !== 'live' || book.data()?.deletionPending || deletion.exists) return 0;
      tx.set(ref, { id: ref.id, userId, bookId: order.bookId, purchaseType: 'bought', orderId: receipt.id, addedAt: order.fulfilledAt ?? order.createdAt ?? new Date() }, { merge: true });
      return 1;
    });
    if (recovered < 0) pendingOrderIds.add(receipt.id);
    else restored += recovered;
  }
  return { restored, confirmed: [...confirmed], pendingOrderIds: [...pendingOrderIds], nextCursor: page.size === 20 ? page.docs[page.size - 1].id : null };
}
