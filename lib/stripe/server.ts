import Stripe from 'stripe';
import { paymentConfiguration } from './config';

let stripeInstance: Stripe | null = null;

export function getStripeServer(): Stripe {
  if (!paymentConfiguration(process.env).keysReady) throw new Error('Payments are not configured.');
  if (!stripeInstance) {
    stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2024-04-10',
    });
  }
  return stripeInstance;
}

export { calculateFees } from '@/lib/utils/fees';
