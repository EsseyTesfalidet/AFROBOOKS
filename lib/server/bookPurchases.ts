import type { DocumentData, Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

export class BookPurchaseError extends Error {
  constructor(message: string, public code: string, public bookIds: string[] = [], public orderIds: string[] = []) { super(message); }
}
type Payment = Pick<Stripe.PaymentIntent, 'id' | 'status' | 'amount' | 'client_secret'>;
export interface PurchaseGateway {
  create(params: Stripe.PaymentIntentCreateParams, options: { idempotencyKey: string }): Promise<Payment>;
  retrieve(id: string): Promise<Payment>;
  cancel(id: string): Promise<Payment>;
}
interface Checkout {
  id: string; userId: string; bookIds: string[]; orderIds: string[];
  params: Stripe.PaymentIntentCreateParams; paymentIntentId: string | null;
  createdAt: { toMillis(): number } | Date;
}
const millis = (value: Checkout['createdAt']) => value instanceof Date ? value.getTime() : value.toMillis();

async function reserve(db: Firestore, userId: string, drafts: DocumentData[], params: Stripe.PaymentIntentCreateParams) {
  const bookIds = drafts.map(o => o.bookId as string).sort();
  const ref = db.collection('bookCheckouts').doc();
  return db.runTransaction(async tx => {
    const [library, locks, history] = await Promise.all([
      Promise.all(bookIds.map(id => tx.get(db.doc(`library/${userId}_${id}`)))),
      Promise.all(bookIds.map(id => tx.get(db.doc(`bookPurchaseLocks/${userId}_${id}`)))),
      tx.get(db.collection('orders').where('buyerId', '==', userId)),
    ]);
    const purchases = history.docs.filter(o => !o.data().giftId && bookIds.includes(o.data().bookId));
    const completed = purchases.filter(o => o.data().status === 'completed');
    const owned = [...new Set([...library.filter(d => ['bought', 'free_copy'].includes(d.data()?.purchaseType)).map(d => d.data()!.bookId as string), ...completed.map(o => o.data().bookId as string)])];
    if (owned.length) {
      // Recover a missing entitlement from the durable receipt instead of
      // charging again. Ordinary clients cannot delete library records.
      for (const order of completed) {
        const id = `${userId}_${order.data().bookId}`;
        if (!library.some(d => d.id === id && ['bought', 'free_copy'].includes(d.data()?.purchaseType))) tx.set(db.doc(`library/${id}`), { id, userId, bookId: order.data().bookId, purchaseType: 'bought', orderId: order.id, addedAt: new Date() }, { merge: true });
      }
      return { owned };
    }
    const review = purchases.filter(o => ['needs_review', 'disputed'].includes(o.data().status));
    if (review.length) throw new BookPurchaseError('An earlier payment needs review. Please do not pay again.', 'PAYMENT_PENDING', [], review.map(o => o.id));
    const legacy = purchases.find(o => o.data().status === 'pending' && !o.data().bookCheckoutId);
    if (legacy) {
      const paymentId = legacy.data().stripePaymentIntentId as string | null;
      if (!paymentId) throw new BookPurchaseError('An earlier payment needs review. Please do not pay again.', 'PAYMENT_PENDING', [], [legacy.id]);
      return { legacy: { paymentId, orderIds: history.docs.filter(o => o.data().stripePaymentIntentId === paymentId && !o.data().giftId).map(o => o.id) } };
    }
    const lock = locks.find(d => d.exists);
    if (lock) {
      const existing = await tx.get(db.doc(`bookCheckouts/${lock.data()!.checkoutId}`));
      if (!existing.exists || existing.data()?.userId !== userId) throw new Error('Invalid checkout reservation');
      return { checkout: { ...existing.data(), id: existing.id } as Checkout };
    }
    const orderIds = drafts.map((_, i) => `${ref.id}_${i}`);
    const checkout: Checkout = { id: ref.id, userId, bookIds, orderIds, params, paymentIntentId: null, createdAt: new Date() };
    tx.create(ref, checkout);
    for (const bookId of bookIds) tx.create(db.doc(`bookPurchaseLocks/${userId}_${bookId}`), { userId, bookId, checkoutId: ref.id });
    drafts.forEach((order, i) => tx.create(db.doc(`orders/${orderIds[i]}`), { ...order, bookCheckoutId: ref.id, stripePaymentIntentId: null, createdAt: new Date() }));
    return { checkout };
  });
}

async function clearCancelled(db: Firestore, checkout: Checkout | undefined, orderIds: string[], paymentId: string) {
  await db.runTransaction(async tx => {
    const orders = await Promise.all(orderIds.map(id => tx.get(db.doc(`orders/${id}`))));
    const locks = checkout ? await Promise.all(checkout.bookIds.map(id => tx.get(db.doc(`bookPurchaseLocks/${checkout.userId}_${id}`)))) : [];
    if (orders.some(o => o.data()?.status !== 'pending' || o.data()?.stripePaymentIntentId !== paymentId)) throw new Error('Cancelled checkout changed');
    orders.forEach(o => tx.update(o.ref, { status: 'failed', failureReason: 'checkout_cancelled' }));
    locks.filter(l => l.data()?.checkoutId === checkout?.id).forEach(l => tx.delete(l.ref));
    if (checkout) tx.update(db.doc(`bookCheckouts/${checkout.id}`), { status: 'cancelled' });
  });
}

async function unpaidCancellation(gateway: PurchaseGateway, payment: Payment, orderIds: string[]) {
  if (payment.status === 'canceled') return;
  if (!['requires_payment_method', 'requires_confirmation', 'requires_action'].includes(payment.status)) throw new BookPurchaseError('Your earlier payment is being confirmed. Please do not pay again.', 'PAYMENT_PENDING', [], orderIds);
  // Stripe serializes cancellation against confirmation. A failed/uncertain
  // cancellation never releases the reservation or creates another payment.
  const cancelled = await gateway.cancel(payment.id);
  if (cancelled.status !== 'canceled') throw new Error('Payment cancellation unconfirmed');
}

export async function createBookPurchase(db: Firestore, gateway: PurchaseGateway, userId: string, drafts: DocumentData[], params: Stripe.PaymentIntentCreateParams) {
  if (!drafts.length || drafts.length > 20 || drafts.some(o => o.buyerId !== userId || typeof o.bookId !== 'string' || o.bookId.includes('/') || o.giftId) || new Set(drafts.map(o => o.bookId)).size !== drafts.length) throw new Error('Invalid purchase reservation');
  const requested = drafts.map(o => o.bookId as string).sort();
  for (let attempt = 0; attempt <= requested.length + 1; attempt++) {
    const result = await reserve(db, userId, drafts, params);
    if ('owned' in result && result.owned) throw new BookPurchaseError('You already own this book. Open it from your library; no payment was taken.', 'BOOK_ALREADY_OWNED', result.owned);
    if ('legacy' in result && result.legacy) {
      const payment = await gateway.retrieve(result.legacy.paymentId);
      await unpaidCancellation(gateway, payment, result.legacy.orderIds);
      await clearCancelled(db, undefined, result.legacy.orderIds, payment.id);
      continue;
    }
    const checkout = result.checkout!;
    if (!checkout.paymentIntentId && Date.now() - millis(checkout.createdAt) >= 23 * 3600000) throw new BookPurchaseError('This earlier checkout needs review before another payment can be started.', 'PAYMENT_PENDING', [], checkout.orderIds);
    const payment = checkout.paymentIntentId ? await gateway.retrieve(checkout.paymentIntentId) : await gateway.create(checkout.params, { idempotencyKey: `afrobooks-purchase-${checkout.id}` });
    await db.runTransaction(async tx => {
      const ref = db.doc(`bookCheckouts/${checkout.id}`);
      const current = (await tx.get(ref)).data();
      if (!current || current.status === 'cancelled' || (current.paymentIntentId && current.paymentIntentId !== payment.id)) throw new Error('Checkout changed');
      tx.update(ref, { paymentIntentId: payment.id });
      checkout.orderIds.forEach(id => tx.update(db.doc(`orders/${id}`), { stripePaymentIntentId: payment.id }));
    });
    if (payment.status === 'succeeded' || payment.status === 'processing') return { payment, orderIds: checkout.orderIds };
    const sameCart = JSON.stringify(checkout.bookIds) === JSON.stringify(requested) && payment.amount === params.amount;
    if (sameCart && payment.status !== 'canceled') return { payment, orderIds: checkout.orderIds };
    await unpaidCancellation(gateway, payment, checkout.orderIds);
    await clearCancelled(db, checkout, checkout.orderIds, payment.id);
  }
  throw new BookPurchaseError('Your cart changed in another window. Please try again.', 'CHECKOUT_CHANGED');
}
