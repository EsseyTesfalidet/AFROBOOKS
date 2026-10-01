// Read-only incident check. Run in the production build environment so sensitive
// credentials stay in Vercel. Never print credentials, event payloads or buyers.
const Stripe = require('stripe');
const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

async function main() {
  const env = process.env;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2024-04-10', timeout: 15000, maxNetworkRetries: 1 });
  const account = await stripe.accounts.retrieve();
  if (account.id !== 'acct_1TS6WdDjnbhpFDjE' || !/^(sk|rk)_live_/.test(env.STRIPE_SECRET_KEY || '')) throw new Error('Unexpected Stripe account or mode');
  const start = Math.floor(Date.parse('2026-09-27T09:00:00Z') / 1000);
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  console.log('STRIPE_INCIDENT_ENDPOINTS', JSON.stringify({ accountId: account.id, chargesEnabled: account.charges_enabled, payoutsEnabled: account.payouts_enabled, endpoints: endpoints.data.map(e => ({ id: e.id, url: e.url, status: e.status, live: e.livemode, apiVersion: e.api_version, events: e.enabled_events })), hasMore: endpoints.has_more }));
  const events = await stripe.events.list({ created: { gte: start }, limit: 100 }).autoPagingToArray({ limit: 1000 });
  console.log('STRIPE_INCIDENT_EVENTS', JSON.stringify({ scanned: events.length, capped: events.length === 1000, types: events.reduce((counts, e) => ({ ...counts, [e.type]: (counts[e.type] || 0) + 1 }), {}), pending: events.filter(e => e.pending_webhooks > 0).map(e => ({ id: e.id, type: e.type, created: e.created, pendingWebhooks: e.pending_webhooks })) }));
  // A deliberately unhandled event only checks transport and verification with
  // the currently configured secret. It does not prove Stripe uses that secret.
  const payload = JSON.stringify({ id: 'evt_afrobooks_readonly_probe', object: 'event', type: 'afrobooks.readonly_probe', data: { object: {} } });
  const signature = stripe.webhooks.generateTestHeaderString({ payload, secret: env.STRIPE_WEBHOOK_SECRET });
  const response = await fetch('https://afrobs.com/api/stripe/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'stripe-signature': signature }, body: payload, redirect: 'manual', signal: AbortSignal.timeout(20000) });
  console.log('STRIPE_INCIDENT_CONFIGURED_SECRET_PROBE', JSON.stringify({ status: response.status, response: (await response.text()).slice(0, 200) }));
  const serviceAccount = JSON.parse(env.FIREBASE_ADMIN_SERVICE_ACCOUNT);
  serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  const db = getFirestore(initializeApp({ credential: cert(serviceAccount) }));
  const payments = await stripe.paymentIntents.list({ created: { gte: start }, limit: 100 }).autoPagingToArray({ limit: 1000 });
  const successful = payments.filter(p => p.status === 'succeeded');
  const results = [];
  for (const p of successful) {
    const orders = await db.collection('orders').where('stripePaymentIntentId', '==', p.id).get();
    const fulfillment = await db.collection('paymentFulfillments').doc(p.id).get();
    let missingLibraryEntries = 0;
    for (const orderDoc of orders.docs) {
      const order = orderDoc.data();
      if (order.status === 'completed' && !order.giftId && !(await db.collection('library').doc(`${order.buyerId}_${order.bookId}`).get()).exists) missingLibraryEntries++;
    }
    results.push({ paymentId: p.id, purchaseType: p.metadata.purchaseType || (p.metadata.bookIds ? 'books' : 'other'), orderCount: orders.size, orderStatuses: orders.docs.map(o => o.data().status), fulfillmentRecorded: fulfillment.exists, missingLibraryEntries });
  }
  console.log('STRIPE_INCIDENT_PAYMENTS', JSON.stringify({ scanned: payments.length, capped: payments.length === 1000, successful: successful.length, results }));
  await db.terminate();
}

main().catch(error => {
  console.error('STRIPE_INCIDENT_ERROR', JSON.stringify({ type: error.type || error.name, code: error.code, status: error.statusCode }));
  process.exitCode = 1;
});
