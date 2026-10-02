import type { Firestore } from 'firebase-admin/firestore';
import type Stripe from 'stripe';

// Status only: never create, confirm, cancel or refund a payment here.
export async function recoverBookCheckout(db: Firestore, stripe: Stripe, userId: string, orderIds: string[]) {
  const orders = await Promise.all(orderIds.map(id => db.doc(`orders/${id}`).get()));
  if (orders.some(order => !order.exists || order.data()?.buyerId !== userId)) throw new Error('Unauthorized receipt');
  if (orders.some(order => ['needs_review', 'refunded', 'disputed'].includes(order.data()!.status))) return 'review' as const;
  const paymentIds = [...new Set(orders.map(order => order.data()!.stripePaymentIntentId as string | null))];
  if (paymentIds.some(id => !id)) return 'pending' as const;
  const payments = await Promise.all(paymentIds.map(id => stripe.paymentIntents.retrieve(id!, { expand: ['latest_charge'] })));
  if (payments.some(payment => payment.metadata.userId !== userId)) throw new Error('Unauthorized receipt');
  if (payments.some(payment => {
    const charge = payment.latest_charge;
    return charge && typeof charge !== 'string' && (charge.amount_refunded > 0 || charge.disputed);
  })) return 'review' as const;
  if (payments.some(payment => ['succeeded', 'processing', 'requires_capture'].includes(payment.status))) return 'pending' as const;
  if (orders.some(order => order.data()!.status === 'completed')) return 'review' as const;
  // A retry still goes through the server lock, ownership check and existing intent.
  if (payments.every(payment => ['requires_payment_method', 'requires_confirmation', 'requires_action', 'canceled'].includes(payment.status))) return 'retryable' as const;
  return 'pending' as const;
}
