import Stripe from 'stripe';

let stripeInstance: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-04-10',
    });
  }
  return stripeInstance;
}

export function calculateFees(amountCents: number): {
  stripeFee: number;
  platformFee: number;
  sellerEarnings: number;
} {
  const stripeFee = Math.round(amountCents * 0.029) + 30;
  const afterStripe = amountCents - stripeFee;
  const platformFee = Math.round(afterStripe * 0.15);
  const sellerEarnings = afterStripe - platformFee;
  return { stripeFee, platformFee, sellerEarnings };
}
