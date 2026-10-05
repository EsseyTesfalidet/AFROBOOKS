import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Impersonated, JWT } from 'google-auth-library';
import { classifyPlayPurchase, playAccountId, playPurchaseId } from '../lib/server/watchPlay';
import { getPlayAuthClient, googlePlay, playConfigured, type PlayPurchase } from '../lib/server/watchPlayClient';
import { PLAY_PRODUCT_PATTERN, playPrice } from '../lib/watch/play';
import { playOrderEarnings } from '../lib/server/watchEarnings';
import type { PlayOrder } from '../lib/server/watchPlayClient';
import { NextRequest } from 'next/server';
import { POST as playAction } from '../app/api/watch/play/route';
import { POST as playNotification } from '../app/api/watch/play/notifications/route';
import { POST as watchJob } from '../app/api/watch/jobs/route';

const valid = (): PlayPurchase => ({ productLineItem: [{ productId: 'afrobooks_video_test', productOfferDetails: { quantity: 1, refundableQuantity: 1, consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }], purchaseStateContext: { purchaseState: 'PURCHASED' }, testPurchaseContext: { fopType: 'TEST' } });
const credentialVariables = ['GOOGLE_PLAY_SERVICE_ACCOUNT', 'GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', 'FIREBASE_ADMIN_SERVICE_ACCOUNT'] as const;
async function withBillingEnvironment(run: () => void | Promise<void>) {
  const old = credentialVariables.map(key => process.env[key]);
  for (const key of credentialVariables) delete process.env[key];
  try { await run(); }
  finally { credentialVariables.forEach((key, index) => { if (old[index] === undefined) delete process.env[key]; else process.env[key] = old[index]; }); }
}
test('billing credentials require an explicit target or dedicated key and never fall back after invalid configuration', async () => {
  await withBillingEnvironment(() => {
    const source = JSON.stringify({ client_email: 'source@example.test', private_key: 'unit-test-placeholder' });
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT = source;
    assert.equal(playConfigured(), false);
    assert.throws(() => getPlayAuthClient(), /not configured yet/);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'billing-account@sample-project.iam.gserviceaccount.com';
    assert.equal(playConfigured(), true);
    const client = getPlayAuthClient();
    assert.ok(client instanceof Impersonated);
    assert.equal(client.getTargetPrincipal(), process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL);
    assert.equal(getPlayAuthClient(), client);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'other-account@sample-project.iam.gserviceaccount.com';
    assert.notEqual(getPlayAuthClient(), client, 'Changing the target must discard the old credential cache.');
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'https://evil.example/credentials';
    assert.throws(() => getPlayAuthClient(), /not configured correctly/);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'billing-account@sample-project.iam.gserviceaccount.com';
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = '{broken';
    assert.throws(() => getPlayAuthClient(), /not configured correctly/);
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = source;
    const direct = getPlayAuthClient();
    assert.ok(direct instanceof JWT);
    assert.deepEqual(direct.scopes, ['https://www.googleapis.com/auth/androidpublisher']);
  });
});
test('temporary billing credential failures are sanitized and never retry as another identity', async context => {
  await withBillingEnvironment(async () => {
    process.env.FIREBASE_ADMIN_SERVICE_ACCOUNT = JSON.stringify({ client_email: 'source@example.test', private_key: 'unit-test-placeholder' });
    process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'billing-account@sample-project.iam.gserviceaccount.com';
    const direct = context.mock.method(JWT.prototype, 'request', async () => { assert.fail('Must not fall back to the source identity.'); });
    const impersonated = context.mock.method(Impersonated.prototype, 'request', async () => { throw new Error('Private purchase token and credential details'); });
    await assert.rejects(googlePlay.purchase('TEST-PURCHASE-TOKEN'), error => error instanceof Error && error.message === 'Google Play could not verify this purchase. Please restore purchases or try again shortly.');
    assert.equal(impersonated.mock.callCount(), 1);
    assert.equal(direct.mock.callCount(), 0);
  });
});
test('Play acceptance requires a confirmed, unconsumed Google test purchase', () => {
  assert.equal(classifyPlayPurchase(valid()), 'active');
  for (const state of ['PENDING', 'CANCELLED']) {
    const purchase = valid(); purchase.purchaseStateContext = { purchaseState: state };
    assert.equal(classifyPlayPurchase(purchase), state === 'PENDING' ? 'pending' : 'revoked');
  }
  const refund = valid(); refund.productLineItem![0].productOfferDetails!.refundableQuantity = 0;
  assert.equal(classifyPlayPurchase(refund), 'revoked');
  const pending = valid(); pending.purchaseStateContext = { purchaseState: 'PENDING' };
  pending.productLineItem![0].productOfferDetails!.refundableQuantity = 0;
  assert.equal(classifyPlayPurchase(pending), 'pending', 'Unpaid pending quantity must not be treated as a terminal refund.');
  pending.purchaseStateContext = {};
  assert.throws(() => classifyPlayPurchase(pending), /not ready/);
  const live = valid(); delete live.testPurchaseContext;
  assert.throws(() => classifyPlayPurchase(live), /Real-money/);
  const consumed = valid(); consumed.productLineItem![0].productOfferDetails!.consumptionState = 'CONSUMPTION_STATE_CONSUMED';
  assert.throws(() => classifyPlayPurchase(consumed), /not ready/);
});
test('bundled, unknown, rental and multi-quantity products cannot grant permanent video access', () => {
  for (const modify of [
    (p: PlayPurchase) => { p.productLineItem!.push(p.productLineItem![0]); },
    (p: PlayPurchase) => { p.productLineItem![0].productId = 'book_product'; },
    (p: PlayPurchase) => { p.productLineItem![0].productOfferDetails!.quantity = 2; },
    (p: PlayPurchase) => { p.productLineItem![0].productOfferDetails!.rentOfferDetails = {}; },
    (p: PlayPurchase) => { p.productLineItem![0].productOfferDetails!.preorderOfferDetails = {}; },
    (p: PlayPurchase) => { p.purchaseStateContext = {}; },
  ]) { const purchase = valid(); modify(purchase); assert.throws(() => classifyPlayPurchase(purchase)); }
});
test('account and purchase identifiers are separate, stable hashes without raw credentials', () => {
  assert.equal(playAccountId('user'), playAccountId('user'));
  assert.notEqual(playAccountId('user'), playAccountId('other'));
  assert.notEqual(playAccountId('user'), playPurchaseId('user'));
  assert.match(playAccountId('user'), /^[a-f0-9]{64}$/);
  assert.equal(PLAY_PRODUCT_PATTERN.test('../../another'), false);
});
test('checkout formats the actual store currency and rejects invalid store prices', () => {
  assert.match(playPrice({ price: { currency: 'EUR', value: '2.49' } }), /2[.,]49/);
  for (const value of ['NaN', '-1', '0', 'Infinity']) assert.throws(() => playPrice({ price: { currency: 'USD', value } }));
});

const order = (): PlayOrder => ({ orderId: 'GPA.example', purchaseToken: 'verified-token', lineItems: [{ productId: 'afrobooks_video_film' }], state: 'PROCESSED', lastEventTime: '2026-10-04T10:00:00Z', developerRevenueInBuyerCurrency: { currencyCode: 'USD', units: '5', nanos: 950000000 } });
const earnings = (value: PlayOrder) => playOrderEarnings(value, 'GPA.example', 'verified-token', 'afrobooks_video_film');
test('video earnings split Google net exactly 80/20, including fractional minor units and currencies', () => {
  const result = earnings(order());
  assert.equal(result.creatorEarningsNanos, '4760000000');
  assert.equal(result.platformEarningsNanos, '1190000000');
  assert.equal(result.status, 'accrued');
  for (const currencyCode of ['JPY', 'KWD', 'USD']) {
    const value = order(); value.developerRevenueInBuyerCurrency = { currencyCode, units: '1', nanos: 3 };
    const actual = earnings(value);
    assert.equal(BigInt(actual.creatorEarningsNanos) + BigInt(actual.platformEarningsNanos), BigInt(actual.googleRevenueNanos));
    assert.equal(actual.currency, currencyCode);
  }
});
test('earnings use updated Google revenue for refunds and never estimate missing financial data', () => {
  const partial = order(); partial.state = 'PARTIALLY_REFUNDED'; partial.developerRevenueInBuyerCurrency!.units = '2';
  assert.equal(earnings(partial).creatorEarningsNanos, '2360000000');
  for (const state of ['REFUNDED', 'CANCELED']) {
    const value = order(); value.state = state;
    assert.equal(earnings(value).creatorEarningsNanos, '0'); assert.equal(earnings(value).status, 'reversed');
  }
  const negative = order(); negative.developerRevenueInBuyerCurrency = { currencyCode: 'USD', units: '-1', nanos: -1 };
  assert.equal(earnings(negative).creatorEarningsNanos, '0');
  for (const modify of [
    (o: PlayOrder) => { o.orderId = 'wrong'; },
    (o: PlayOrder) => { o.purchaseToken = 'wrong'; },
    (o: PlayOrder) => { o.lineItems = [{ productId: 'wrong' }]; },
    (o: PlayOrder) => { delete o.developerRevenueInBuyerCurrency; },
    (o: PlayOrder) => { o.developerRevenueInBuyerCurrency!.nanos = -1; },
    (o: PlayOrder) => { o.developerRevenueInBuyerCurrency!.nanos = 1000000000; },
    (o: PlayOrder) => { o.lastEventTime = 'invalid'; },
    (o: PlayOrder) => { o.state = 'unknown'; },
  ]) { const value = order(); modify(value); assert.throws(() => earnings(value)); }
});
test('Play verification rejects cross-site requests and forged notification bodies before database access', async () => {
  assert.equal((await playAction(new NextRequest('https://afrobs.com/api/watch/play', { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' }))).status, 403);
  process.env.GOOGLE_PLAY_RTDN_AUDIENCE = 'https://afrobs.com/api/watch/play/notifications';
  process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL = 'pubsub@example.test';
  try {
    assert.equal((await playNotification(new NextRequest('https://afrobs.com/api/watch/play/notifications', { method: 'POST', body: '{"status":"PURCHASED"}' }))).status, 401);
  } finally { delete process.env.GOOGLE_PLAY_RTDN_AUDIENCE; delete process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL; }
});

test('scheduled payment work rejects unauthenticated calls before touching balances', async () => {
  process.env.GOOGLE_PLAY_JOBS_AUDIENCE = 'https://afrobs.com/api/watch/jobs';
  process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL = 'pubsub@example.test';
  try {
    const result = await watchJob(new NextRequest('https://afrobs.com/api/watch/jobs', { method: 'POST', body: '{}' }));
    assert.equal(result.status, 401);
  } finally { delete process.env.GOOGLE_PLAY_JOBS_AUDIENCE; delete process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL; }
});
