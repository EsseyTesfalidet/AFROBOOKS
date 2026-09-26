import { FieldValue, type Firestore } from 'firebase-admin/firestore';

export interface SuccessfulPayment {
  id: string;
  amount_received: number;
  currency: string;
  metadata: Record<string, string>;
}

export async function fulfillPayment(db: Firestore, payment: SuccessfulPayment) {
  const userId = payment.metadata.userId;
  if (!userId) throw new Error('Missing payment owner');
  // Payment ID deduplicates both event redelivery and distinct success events.
  const fulfillmentRef = db.collection('paymentFulfillments').doc(payment.id);
  return db.runTransaction(async (tx) => {
    const previous = await tx.get(fulfillmentRef);
    if (previous.exists) return false;
    const orders = await tx.get(db.collection('orders').where('stripePaymentIntentId', '==', payment.id));
    if (orders.empty) throw new Error('Payment has no orders');
    const total = orders.docs.reduce((sum, doc) => sum + doc.data().finalPrice, 0);
    if (payment.currency !== 'usd' || total !== payment.amount_received) throw new Error('Payment amount mismatch');
    if (orders.docs.some((doc) => doc.data().buyerId !== userId || !['pending', 'completed'].includes(doc.data().status))) {
      throw new Error('Invalid order ownership or status');
    }
    const pending = orders.docs.filter((doc) => doc.data().status === 'pending');
    const bookIds = [...new Set(pending.map(doc => doc.data().bookId as string))];
    const books = await Promise.all(bookIds.map(id => tx.get(db.collection('books').doc(id))));
    const deletions = await Promise.all(bookIds.map(id => tx.get(db.collection('bookDeletions').doc(id))));
    const unavailable = books.filter((book, index) => !book.exists || book.data()?.deletionPending === true || book.data()?.status === 'removed' || deletions[index].exists);
    if (unavailable.length) {
      // Record the received payment for staff review. Never reconstruct a book,
      // grant a dead entitlement, or credit earnings for unavailable content.
      for (const order of pending) tx.update(order.ref, { status: 'needs_review', reviewReason: 'book_unavailable', paymentReceivedAt: new Date() });
      tx.set(db.collection('notifications').doc(`${payment.id}_review`), {
        userId, type: 'system', title: 'Payment needs review',
        message: 'A book became unavailable while your payment was processing. Your payment has been recorded for review. Please do not pay again.',
        isRead: false, actionUrl: `/checkout/receipt?orders=${orders.docs.map(doc => doc.id).join(',')}`, relatedBookId: null, createdAt: new Date(),
      });
      tx.create(fulfillmentRef, { userId, amount: total, status: 'needs_review', unavailableBookIds: unavailable.map(book => book.id), createdAt: new Date() });
      return false;
    }
    const sellerIds = [...new Set(pending.map((doc) => doc.data().sellerId as string))];
    const sellers = await Promise.all(sellerIds.map((id) => tx.get(db.collection('sellers').doc(id))));
    const promoId = payment.metadata.promoId;
    const promo = promoId ? await tx.get(db.collection('promoCodes').doc(promoId)) : null;
    // All financial and entitlement writes commit together, or none do.
    for (const orderDoc of pending) {
      const order = orderDoc.data();
      tx.update(orderDoc.ref, { status: 'completed', fulfilledAt: new Date() });
      tx.set(db.collection('library').doc(`${userId}_${order.bookId}`), {
        id: `${userId}_${order.bookId}`, userId, bookId: order.bookId,
        purchaseType: 'bought', orderId: orderDoc.id, addedAt: new Date(),
      }, { merge: true });
      tx.update(db.collection('books').doc(order.bookId), { totalSales: FieldValue.increment(1), updatedAt: new Date() });
      for (const [recipient, type, title, actionUrl] of [
        [userId, 'purchase', 'Purchase Successful', `/read/${order.bookId}`],
        [order.sellerId, 'sale', 'New Sale', '/dashboard'],
      ]) {
        tx.set(db.collection('notifications').doc(`${orderDoc.id}_${type}`), {
          userId: recipient, type, title, message: `"${order.bookTitle}" was purchased.`,
          isRead: false, actionUrl, relatedBookId: order.bookId, createdAt: new Date(),
        });
      }
    }
    for (const seller of sellers) {
      const lines = pending.filter((doc) => doc.data().sellerId === seller.id);
      const earnings = lines.reduce((sum, doc) => sum + doc.data().sellerEarnings, 0);
      tx.set(seller.ref, {
        pendingBalance: FieldValue.increment(earnings), totalEarnings: FieldValue.increment(earnings),
        totalSales: FieldValue.increment(lines.length), updatedAt: new Date(),
      }, { merge: true });
    }
    if (promo?.exists && pending.length) {
      tx.update(promo.ref, { currentUses: FieldValue.increment(1), totalRevenue: FieldValue.increment(total) });
    }
    tx.create(fulfillmentRef, { userId, amount: total, completedAt: new Date() });
    return true;
  });
}
