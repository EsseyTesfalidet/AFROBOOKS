import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import type { DestinationSettlement } from './destinationPayment';

export interface SuccessfulPayment {
  id: string;
  amount_received: number;
  currency: string;
  metadata: Record<string, string>;
  destinationSettlement?: DestinationSettlement;
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
    const destination = payment.destinationSettlement;
    const destinationOrders = orders.docs.filter(doc => doc.data().chargeRouting === 'destination');
    const destinationEarnings = orders.docs.reduce((sum, doc) => sum + doc.data().sellerEarnings, 0);
    if (destination || destinationOrders.length) {
      if (!destination || destinationOrders.length !== orders.size || pending.length !== orders.size ||
          new Set(orders.docs.map(doc => doc.data().sellerId)).size !== 1 ||
          destination.grossAmount !== total || !Number.isSafeInteger(destinationEarnings) || destinationEarnings < 0 ||
          total - destination.applicationFeeAmount !== destinationEarnings ||
          orders.docs.some(doc => doc.data().destinationAccountId !== destination.accountId || doc.data().applicationFeeAmount !== destination.applicationFeeAmount)) throw new Error('Destination order mismatch');
    }
    const bookIds = [...new Set(pending.map(doc => doc.data().bookId as string))];
    const books = await Promise.all(bookIds.map(id => tx.get(db.collection('books').doc(id))));
    const deletions = await Promise.all(bookIds.map(id => tx.get(db.collection('bookDeletions').doc(id))));
    const giftOrders = pending.filter(doc => !!doc.data().giftId);
    const gifts = await Promise.all(giftOrders.map(doc => tx.get(db.collection('bookGifts').doc(doc.data().giftId))));
    for (const [index, gift] of gifts.entries()) {
      const order = giftOrders[index];
      if (!gift.exists || gift.data()?.orderId !== order.id || gift.data()?.senderId !== userId || gift.data()?.bookId !== order.data().bookId || gift.data()?.paymentIntentId !== payment.id || payment.metadata.giftId !== gift.id) throw new Error('Gift order mismatch');
    }
    const giftNeedsReview = gifts.some(gift => gift.data()?.status !== 'pending');
    const unavailable = books.filter((book, index) => !book.exists || book.data()?.deletionPending === true || book.data()?.status === 'removed' || deletions[index].exists);
    if (unavailable.length || giftNeedsReview) {
      // Record the received payment for staff review. Never reconstruct a book,
      // grant a dead entitlement, or credit earnings for unavailable content.
      for (const order of pending) tx.update(order.ref, { status: 'needs_review', reviewReason: 'book_unavailable', paymentReceivedAt: new Date() });
      for (const gift of gifts) tx.update(gift.ref, { status: 'needs_review' });
      tx.set(db.collection('notifications').doc(`${payment.id}_review`), {
        userId, type: 'system', title: 'Payment needs review',
        message: 'Your payment has been recorded for review. Please check your receipt and do not pay again.',
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
      if (order.giftId) tx.update(db.collection('bookGifts').doc(order.giftId), { status: 'available', paidAt: new Date() });
      else tx.set(db.collection('library').doc(`${userId}_${order.bookId}`), {
        id: `${userId}_${order.bookId}`, userId, bookId: order.bookId,
        purchaseType: 'bought', orderId: orderDoc.id, addedAt: new Date(),
      }, { merge: true });
      tx.update(db.collection('books').doc(order.bookId), { totalSales: FieldValue.increment(1), updatedAt: new Date() });
      for (const [recipient, type, title, actionUrl] of [
        [userId, 'purchase', order.giftId ? 'Gift purchased' : 'Purchase Successful', order.giftId ? '/gifts' : `/read/${order.bookId}`],
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
        pendingBalance: FieldValue.increment(destination ? 0 : earnings), totalEarnings: FieldValue.increment(earnings),
        totalSales: FieldValue.increment(lines.length), updatedAt: new Date(),
      }, { merge: true });
    }
    if (destination) {
      const payoutId = `destination_${payment.id}`;
      tx.create(db.collection('payouts').doc(payoutId), {
        kind: 'book_royalty', chargeRouting: 'destination', sellerId: sellerIds[0],
        sellerName: pending[0].data().sellerName || sellerIds[0],
        orderIds: pending.map(doc => doc.id), stripeAccountId: destination.accountId,
        stripeChargeId: destination.chargeId, stripePaymentIntentId: payment.id,
        stripeTransferId: destination.transferId, grossAmountCents: total,
        applicationFeeAmount: destination.applicationFeeAmount, amountCents: destinationEarnings,
        periodLabel: new Date().toISOString().slice(0, 7), status: 'paid',
        createdAt: new Date(), paidAt: new Date(),
      });
      for (const order of pending) tx.update(order.ref, { royaltyPayoutId: payoutId });
    }
    if (promo?.exists && pending.length) {
      tx.update(promo.ref, { currentUses: FieldValue.increment(1), totalRevenue: FieldValue.increment(total) });
    }
    tx.create(fulfillmentRef, { userId, amount: total, completedAt: new Date() });
    return true;
  });
}
