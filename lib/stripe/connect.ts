import StripeConnect from 'stripe-connect';
import { paymentConfiguration } from './config';

let client: StripeConnect | undefined;
// Accounts v2 uses a dedicated SDK/version; checkout, subscriptions and the
// royalty ledger retain their existing, tested API versions.
export function getStripeConnectServer() {
  if (!paymentConfiguration(process.env).keysReady) throw new Error('Payments are not configured.');
  client ??= new StripeConnect(process.env.STRIPE_SECRET_KEY!, {
    apiVersion: '2026-08-26.dahlia',
    timeout: 20000,
    maxNetworkRetries: 1,
  });
  return client;
}
