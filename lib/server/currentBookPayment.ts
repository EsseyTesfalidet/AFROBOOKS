import type Stripe from 'stripe';
import { destinationSettlement } from './destinationPayment';
import type { SuccessfulPayment } from './fulfillPayment';

// Stripe events may arrive out of order. Only the retrieved, current charge
// determines whether a book sale can be fulfilled or must be reviewed.
export async function currentBookPayment(stripe: Stripe, payment: Stripe.PaymentIntent): Promise<SuccessfulPayment> {
  const charge = payment.latest_charge;
  if (payment.status !== 'succeeded' || !charge || typeof charge === 'string' || !charge.paid) throw new Error('Successful book charge unavailable');
  if (charge.amount_refunded > 0 || charge.disputed) return { ...payment, reviewReason: 'payment_review' };
  const destination = payment.transfer_data?.destination ? await destinationSettlement(stripe, payment) : undefined;
  return { ...payment, destinationSettlement: destination };
}
