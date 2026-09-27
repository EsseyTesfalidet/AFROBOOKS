// Read-only check for a production build. Never create live connected accounts.
const Stripe = require('stripe');
const StripeConnect = require('stripe-connect');
async function main() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!/^(sk|rk)_live_/.test(secret || '')) throw new Error('Live Stripe key required');
  if (new URL(process.env.NEXT_PUBLIC_APP_URL).origin !== 'https://afrobs.com')
    throw new Error('Unexpected production return address');
  const stripe = new Stripe(secret, {
    apiVersion: '2024-04-10',
    timeout: 15000,
    maxNetworkRetries: 1,
  });
  const connect = new StripeConnect(secret, {
    apiVersion: '2026-08-26.dahlia',
    timeout: 15000,
    maxNetworkRetries: 1,
  });
  const [accounts, countries] = await Promise.all([
    connect.v2.core.accounts.list({ limit: 1 }),
    stripe.countrySpecs.list({ limit: 100 }),
  ]);
  if (!Array.isArray(accounts.data) || !countries.data.length)
    throw new Error('Connect readiness failed');
  console.log(
    'AUTHOR_CONNECT_READINESS ' +
      JSON.stringify({
        liveKeys: true,
        accountsV2Accessible: true,
        countryCount: countries.data.length,
      }),
  );
}
main().catch((error) => {
  console.error('AUTHOR_CONNECT_READINESS_FAILED', error.type || error.message || 'Unavailable');
  process.exitCode = 1;
});
