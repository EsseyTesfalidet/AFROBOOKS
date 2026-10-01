import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { fulfillPayment } from './fulfillPayment';
import { destinationSettlement } from './destinationPayment';

// An authenticated receipt can recover a delayed webhook. Never trust the
// browser's success redirect, amount, buyer ID or payment status.
export async function confirmBookPurchase(db: Firestore, stripe: Stripe, userId: string, orderIds: string[]) {
  const orders = await Promise.all(orderIds.map(id => db.doc(`orders/${id}`).get()));
  if (orders.some(o => !o.exists || o.data()?.buyerId !== userId)) throw new Error('Unauthorized receipt');
  const paymentIds = [...new Set(orders.map(o => o.data()?.stripePaymentIntentId as string | null).filter((id): id is string => !!id))];
  const confirmed: string[] = [];
  for (const paymentId of paymentIds) {
    const payment = await stripe.paymentIntents.retrieve(paymentId, { expand: ['latest_charge'] });
    if (payment.metadata.userId !== userId) throw new Error('Unauthorized receipt');
    if (payment.status !== 'succeeded') continue;
    const charge = payment.latest_charge;
    if (!charge || typeof charge === 'string' || !charge.paid || charge.amount_refunded > 0 || charge.disputed) throw new Error('Payment requires review');
    const destination = payment.transfer_data?.destination ? await destinationSettlement(stripe, payment) : undefined;
    await fulfillPayment(db, { ...payment, destinationSettlement: destination });
    confirmed.push(paymentId);
  }
  return confirmed;
}
