import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

/** Synchronize existing refunds only. Never refund a payment or reverse a transfer. */
export async function reconcileBookRefunds(db: Firestore, stripe: Stripe, paymentId: string) {
  return db.runTransaction(async tx => {
    const markerRef = db.doc(`paymentFulfillments/${paymentId}`);
    const marker = await tx.get(markerRef);
    const orders = await tx.get(db.collection('orders').where('stripePaymentIntentId', '==', paymentId));
    if (orders.empty) return { status: 'unrelated', orders: 0 };
    // Retrieve inside the transaction: a conflict retries with fresh Stripe state,
    // rather than committing an older webhook's refund snapshot over a newer one.
    const payment = await stripe.paymentIntents.retrieve(paymentId);
    const refunds = [];
    for await (const refund of stripe.refunds.list({ payment_intent: paymentId, limit: 100 })) refunds.push(refund);
    if (!refunds.length) return { status: 'unchanged', orders: 0 };
    const total = orders.docs.reduce((sum, doc) => sum + doc.data().finalPrice, 0);
    if (payment.status !== 'succeeded' || payment.currency !== 'usd' || payment.amount_received !== total || total <= 0 ||
        orders.docs.some(doc => doc.data().buyerId !== payment.metadata.userId)) throw new Error('Refund payment does not match orders');
    const refunded = refunds.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + r.amount, 0);
    const full = refunded === total;
    if (refunded > total) throw new Error('Refund amount exceeds order total');
    const refundStatus = full ? 'full' : refunded > 0 ? 'partial' : refunds.some(r => ['pending', 'requires_action'].includes(r.status ?? '')) ? 'pending' : 'failed';
    const gifts = await Promise.all(orders.docs.map(o => o.data().giftId ? tx.get(db.doc(`bookGifts/${o.data().giftId}`)) : Promise.resolve(null)));
    const entries = await Promise.all(orders.docs.map((o, i) => {
      const owner = o.data().giftId ? gifts[i]?.data()?.recipientId : o.data().buyerId;
      return owner ? tx.get(db.doc(`library/${owner}_${o.data().bookId}`)) : Promise.resolve(null);
    }));
    // Preserve another completed purchase even when this refunded order happens
    // to be the one referenced by the single canonical library document.
    const alternatives = await Promise.all(entries.map(entry => entry?.exists && full
      ? tx.get(db.collection('orders').where('buyerId', '==', entry.data()!.userId)) : Promise.resolve(null)));
    const locks = await Promise.all(orders.docs.map(o => !o.data().giftId && o.data().bookCheckoutId
      ? tx.get(db.doc(`bookPurchaseLocks/${o.data().buyerId}_${o.data().bookId}`)) : Promise.resolve(null)));
    const sellerIds = [...new Set(orders.docs.map(o => o.data().sellerId as string))];
    const sellers = await Promise.all(sellerIds.map(id => tx.get(db.doc(`sellers/${id}`))));
    const now = new Date();
    for (const [i, doc] of orders.docs.entries()) {
      const order = doc.data();
      const status = full ? 'refunded' : refundStatus === 'failed' && order.status === 'completed' ? 'completed' : 'needs_review';
      tx.update(doc.ref, {
        status, refundStatus, paymentRefundedAmount: refunded, refundCheckedAt: now,
        reviewReason: full ? 'payment_refunded' : `refund_${refundStatus}`,
        ...(full ? { refundedAt: order.refundedAt ?? now } : {}),
      });
      const entry = entries[i];
      if (full && entry?.data()?.purchaseType === 'bought' && entry.data()?.orderId === doc.id) {
        const replacement = alternatives[i]?.docs.find(candidate => {
          const data = candidate.data();
          return data.status === 'completed' && !data.giftId && data.bookId === order.bookId && data.stripePaymentIntentId !== paymentId;
        });
        if (replacement) tx.update(entry.ref, { orderId: replacement.id, giftId: null });
        else tx.delete(entry.ref);
      }
      if (full && gifts[i]?.exists) tx.update(gifts[i]!.ref, { status: 'needs_review', reviewReason: 'payment_refunded', reviewedAt: now });
      if (full && locks[i]?.data()?.checkoutId === order.bookCheckoutId && order.bookCheckoutId) tx.delete(locks[i]!.ref);
      if (full && order.status !== 'refunded') for (const [userId, kind, title] of [[order.buyerId, 'purchase', 'Purchase refunded'], [order.sellerId, 'sale', 'Sale refunded']]) {
        tx.set(db.doc(`notifications/${doc.id}_${kind}`), {
          userId, type: 'system', title, message: `The payment for "${order.bookTitle}" was refunded.`,
          actionUrl: kind === 'purchase' ? `/checkout/receipt?orders=${doc.id}` : '/dashboard',
          relatedBookId: order.bookId, isRead: false, createdAt: order.refundedAt ?? now,
        });
      }
    }
    // Hold royalties for financial reconciliation; already transferred money is
    // not silently reversed or treated as recovered by a database status change.
    for (const seller of sellers) {
      if (seller.exists) tx.update(seller.ref, { payoutHoldReason: 'payment_review', payoutHoldAt: now });
      tx.set(db.doc(`payoutReviews/${seller.id}`), { sellerId: seller.id, reason: 'payment_review', status: 'open', updatedAt: now }, { merge: true });
    }
    tx.set(markerRef, {
      ...(!marker.exists ? { userId: payment.metadata.userId, amount: total, createdAt: now } : {}),
      refundStatus, refundCheckedAt: now,
      ...(full ? { status: 'refunded' } : { status: 'needs_review' }),
    }, { merge: true });
    return { status: refundStatus, orders: orders.size };
  });
}
