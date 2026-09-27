// Read-only production build check. Never log credentials or create a payment.
const Stripe = require('stripe');
async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (
    !/^(sk|rk)_live_/.test(secret || '') ||
    !/^pk_live_/.test(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || '') ||
    !/^whsec_/.test(process.env.STRIPE_WEBHOOK_SECRET || '')
  )
    throw new Error('Live payment configuration incomplete');
  const base = new URL(process.env.NEXT_PUBLIC_APP_URL);
  if (base.origin !== 'https://afrobs.com') throw new Error('Unexpected production return address');
  const stripe = new Stripe(secret, {
    apiVersion: '2024-04-10',
    timeout: 15000,
    maxNetworkRetries: 1,
  });
  const [account, endpoints] = await Promise.all([
    stripe.accounts.retrieve(),
    stripe.webhookEndpoints.list({ limit: 100 }),
  ]);
  const required = [
    'checkout.session.completed',
    'checkout.session.expired',
    'charge.refunded',
    'charge.dispute.created',
    'charge.dispute.updated',
    'refund.created',
    'refund.updated',
    'refund.failed',
  ];
  const endpoint = endpoints.data.find(
    (item) =>
      item.url === `${base.origin}/api/stripe/webhook` &&
      item.status === 'enabled' &&
      item.livemode,
  );
  const missing = required.filter(
    (event) =>
      !endpoint ||
      (!endpoint.enabled_events.includes('*') && !endpoint.enabled_events.includes(event)),
  );
  console.log(
    'PROMOTION_PAYMENT_READINESS ' +
      JSON.stringify({
        chargesEnabled: account.charges_enabled,
        webhookEnabled: !!endpoint,
        missingEvents: missing,
        liveKeys: true,
      }),
  );
  if (!account.charges_enabled || missing.length)
    throw new Error('Promotion payment readiness failed');
}
main().catch((error) => {
  console.error('PROMOTION_READINESS_FAILED', error.type || error.message || 'Unavailable');
  process.exitCode = 1;
});
