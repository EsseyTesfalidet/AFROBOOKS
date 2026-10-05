import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { getPlayOffer, playAccountId, playPurchaseId, preparePlayPurchase, savePlayProduct, syncPlayPurchase, syncPlayVoidedPurchase } from '../lib/server/watchPlay';
import { getWatchLibrary } from '../lib/server/watch';
import type { AuthenticatedRequestUser } from '../lib/server/auth';
import type { PlayClient, PlayPurchase, PlayOrder, PlayProduct } from '../lib/server/watchPlayClient';
import { getVideoEarnings } from '../lib/server/watchEarnings';
import { PLAY_PACKAGE } from '../lib/watch/play';
import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { NextRequest } from 'next/server';
import { POST as playNotification } from '../app/api/watch/play/notifications/route';
import { reconcileVideoPurchases } from '../lib/server/watchJobs';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/);
const projectId = 'demo-afrobooks-watch';
const app = initializeApp({ projectId }); const db = getFirestore(app);
let env: RulesTestEnvironment;
const person = (uid: string, role: AuthenticatedRequestUser['role'] = 'buyer'): AuthenticatedRequestUser => ({ uid, role, status: 'active', email: null });
const reader = person('reader'); const admin = person('admin', 'admin');
const sku = 'afrobooks_video_test'; const token = 'TEST-PURCHASE-TOKEN';
let purchased: PlayPurchase; let acknowledgements = 0; let acknowledgementFailure = false;
const client: PlayClient = {
  purchase: async () => structuredClone(purchased),
  acknowledge: async (productId, value) => { assert.equal(productId, sku); assert.ok(value); acknowledgements++; if (acknowledgementFailure) throw new Error('Simulated acknowledgement timeout'); },
};
const sync = (value = token, uid = reader.uid) => syncPlayPurchase(db, value, uid, sku, client);
before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore(); acknowledgements = 0; acknowledgementFailure = false;
  process.env.GOOGLE_PLAY_SERVICE_ACCOUNT = '{}'; process.env.WATCH_PLAY_TEST_UIDS = reader.uid;
  for (const key of ['GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL', 'WATCH_PLAY_LIVE_ENABLED', 'GOOGLE_PLAY_RTDN_AUDIENCE', 'GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL']) delete process.env[key];
  purchased = { productLineItem: [{ productId: sku, productOfferDetails: { quantity: 1, refundableQuantity: 1, consumptionState: 'CONSUMPTION_STATE_YET_TO_BE_CONSUMED' } }], purchaseStateContext: { purchaseState: 'PURCHASED' }, testPurchaseContext: { fopType: 'TEST' }, obfuscatedExternalAccountId: playAccountId(reader.uid), acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING' };
  await db.doc('watchVideos/film').set({ id: 'film', creatorId: 'creator', creatorName: 'Studio', title: 'Test film', description: 'A test film.', category: 'Films', language: 'Tigrinya', priceCents: 249, currency: 'usd', posterUrl: '', durationSeconds: 120, hasTrailer: false, status: 'published', publishedAt: 1, updatedAt: 1, newsDate: '' });
  await savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: true });
  await preparePlayPurchase(reader, 'film');
});
after(async () => { delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT; delete process.env.WATCH_PLAY_TEST_UIDS; await env.cleanup(); await deleteApp(app); });

test('only admin can map products, mappings cannot be reassigned, and checkout requires the tester allowlist', async () => {
  await assert.rejects(savePlayProduct(reader, { videoId: 'film', productId: sku, enabled: true }), /Administrator/);
  await db.doc('watchVideos/other').set({ creatorId: 'creator', priceCents: 249 });
  await assert.rejects(savePlayProduct(admin, { videoId: 'other', productId: sku, enabled: true }), /reassigned/);
  assert.equal(await getPlayOffer(person('stranger'), 'film'), null);
  delete process.env.GOOGLE_PLAY_SERVICE_ACCOUNT;
  assert.equal(await getPlayOffer(reader, 'film'), null);
});
test('verified purchase is saved exactly once, appears in the library, and cannot be bought again', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => sync()));
  assert.ok(results.every(result => result.status === 'active'));
  assert.equal((await db.collection('watchPlayPurchases').get()).size, 1);
  assert.equal((await getWatchLibrary(reader)).entries[0].state.owned, true);
  assert.equal(await getPlayOffer(reader, 'film'), null);
  await assert.rejects(preparePlayPurchase(reader, 'film'), /Restore purchases/);
  assert.equal((await db.collection('payouts').get()).size, 0, 'Test purchases must never create real creator earnings.');
});
test('pending payments never grant access; confirmation grants it and stale pending cannot remove it', async () => {
  purchased.purchaseStateContext = { purchaseState: 'PENDING' };
  assert.equal((await sync()).status, 'pending');
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).exists, false);
  assert.equal(acknowledgements, 0);
  purchased.purchaseStateContext = { purchaseState: 'PURCHASED' }; await sync();
  purchased.purchaseStateContext = { purchaseState: 'PENDING' };
  assert.equal((await sync()).status, 'active');
});
test('forged account binding, mismatched products and unprepared live transactions cannot grant access', async () => {
  await assert.rejects(sync(token, 'other'), /another AfroBooks/);
  await assert.rejects(syncPlayPurchase(db, token, reader.uid, 'afrobooks_video_other', client), /does not match/);
  delete purchased.obfuscatedExternalAccountId; await assert.rejects(sync(), /not linked/);
  purchased.obfuscatedExternalAccountId = playAccountId(reader.uid); delete purchased.testPurchaseContext;
  await assert.rejects(sync(), /Start this video purchase/);
  assert.equal((await db.collection('watchPlayPurchases').get()).size, 0);
  assert.equal(acknowledgements, 0);
});
test('acknowledgement failure preserves durable ownership and restore retries without another purchase', async () => {
  acknowledgementFailure = true;
  await assert.rejects(sync(), /timeout/);
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.status, 'active');
  acknowledgementFailure = false;
  const restored = await sync();
  assert.equal(restored.acknowledged, true);
  assert.equal((await db.collection('watchPlayPurchases').get()).size, 1);
});
test('refund removes ownership, allows repurchase, and a late old refund cannot revoke the new purchase', async () => {
  await sync(); purchased.purchaseStateContext = { purchaseState: 'CANCELLED' }; await sync();
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.status, 'revoked');
  assert.equal((await getWatchLibrary(reader)).entries[0].state.owned, false);
  assert.ok(await getPlayOffer(reader, 'film'));
  purchased.purchaseStateContext = { purchaseState: 'PURCHASED' };
  assert.equal((await sync()).status, 'revoked', 'Old success cannot reactivate a refunded token.');
  await sync('SECOND-PURCHASE-TOKEN');
  purchased.purchaseStateContext = { purchaseState: 'CANCELLED' }; await sync();
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.purchaseId, playPurchaseId('SECOND-PURCHASE-TOKEN'));
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.status, 'active');
});
test('notifications can finish interrupted checkout and still revoke after testing is disabled', async () => {
  await syncPlayVoidedPurchase(db, 'UNRELATED-BOOK-TOKEN', {
    purchase: async () => { assert.fail('An unrelated refund must not enter video verification.'); },
    acknowledge: async () => { assert.fail('An unknown refund must never acknowledge a purchase.'); },
  });
  const initial = await syncPlayPurchase(db, token, undefined, sku, client);
  assert.equal(initial.status, 'active');
  delete process.env.WATCH_PLAY_TEST_UIDS;
  purchased.productLineItem![0].productOfferDetails!.refundableQuantity = 0;
  await syncPlayVoidedPurchase(db, token, client);
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.status, 'revoked');
});
test('a second token cannot silently overwrite existing ownership', async () => {
  await sync();
  await assert.rejects(sync('DUPLICATE-PURCHASE-TOKEN'), /already owned/);
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.purchaseId, playPurchaseId(token));
});
test('direct client access to payment tokens, product mappings, account bindings and grants is denied', async () => {
  await sync();
  for (const uid of ['reader', 'admin']) {
    const clientDb = env.authenticatedContext(uid).firestore();
    for (const path of [`watchPlayPurchases/${playPurchaseId(token)}`, `watchPlayAccounts/${playAccountId(reader.uid)}`, `watchPlayProducts/${sku}`, `watchPlayCheckouts/${playAccountId(reader.uid)}_${sku}`, `watchPlayEarnings/${playPurchaseId(token)}`, 'watchEntitlements/reader/videos/film']) {
      await assertFails(getDoc(doc(clientDb, path)));
      await assertFails(setDoc(doc(clientDb, path), { status: 'active' }));
    }
  }
});

let financialOrder: PlayOrder;
let activeProduct: PlayProduct;
let financialFailure = false;
const liveClient: PlayClient = {
  ...client,
  product: async () => structuredClone(activeProduct),
  order: async () => { if (financialFailure) throw new Error('Google financial data delayed'); return structuredClone(financialOrder); },
};
async function enableLive() {
  process.env.WATCH_PLAY_LIVE_ENABLED = 'true';
  process.env.GOOGLE_PLAY_RTDN_AUDIENCE = 'https://afrobs.com/api/watch/play/notifications';
  process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL = 'notifications@example.test';
  delete process.env.WATCH_PLAY_TEST_UIDS;
  financialFailure = false;
  activeProduct = { packageName: PLAY_PACKAGE, productId: sku, purchaseOptions: [{ state: 'ACTIVE', buyOption: { multiQuantityEnabled: false } }] };
  await db.doc('watchCreators/creator').set({ status: 'approved' });
  await db.doc('watchSystem/playNotifications').set({ lastTestAt: Date.now() });
  await db.doc('watchPrivate/film').set({ full: { ready: true } }, { merge: true });
  await savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: false, liveEnabled: true }, liveClient);
  assert.equal((await preparePlayPurchase(reader, 'film')).testOnly, false);
  delete purchased.testPurchaseContext; purchased.orderId = 'GPA.live-order';
  financialOrder = { orderId: purchased.orderId, purchaseToken: token, state: 'PROCESSED', lastEventTime: '2026-10-04T10:00:00Z', lineItems: [{ productId: sku }], developerRevenueInBuyerCurrency: { currencyCode: 'USD', units: '5', nanos: 950000000 } };
}
const syncLive = () => syncPlayPurchase(db, token, reader.uid, sku, liveClient);
const earning = async () => (await db.doc(`watchPlayEarnings/${playPurchaseId(token)}`).get()).data();
test('live checkout grants ownership once and records an exact 80/20 share of actual Google net', async () => {
  await enableLive(); await Promise.all([syncLive(), syncLive()]);
  assert.equal((await db.collection('watchPlayEarnings').get()).size, 1);
  const row = await earning();
  assert.equal(row?.creatorEarningsNanos, '4760000000'); assert.equal(row?.platformEarningsNanos, '1190000000');
  assert.equal(row?.status, 'accrued'); assert.equal(row?.payoutStatus, 'unpaid');
  assert.equal((await getWatchLibrary(reader)).entries[0].state.owned, true);
  assert.equal(await getPlayOffer(reader, 'film'), null);
  assert.equal((await getVideoEarnings(person('creator', 'seller'))).length, 1);
  assert.equal((await getVideoEarnings(person('other-creator', 'seller'))).length, 0);
  await assert.rejects(getVideoEarnings(reader), /Creator access/);
  await assert.rejects(syncPlayPurchase(db, token, 'stranger', sku, liveClient), /another AfroBooks/);
});
test('Google license test purchases in live checkout grant access without creating earnings', async () => {
  await enableLive(); purchased.testPurchaseContext = { fopType: 'TEST' }; await syncLive();
  assert.equal((await db.collection('watchPlayEarnings').get()).size, 0);
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.testPurchase, true);
});
test('financial API delays do not lose paid library access; reconciliation fills in pending earnings', async () => {
  await enableLive(); financialFailure = true;
  const paid = await syncLive(); assert.equal(paid.status, 'active'); assert.equal(paid.acknowledged, true);
  assert.equal((await earning())?.status, 'pending'); assert.equal((await earning())?.creatorEarningsNanos, null);
  financialFailure = false; await syncLive(); assert.equal((await earning())?.creatorEarningsNanos, '4760000000');
  await db.doc(`watchPlayEarnings/${playPurchaseId(token)}`).update({ payoutStatus: 'processing', settlementReference: 'retained-reference' });
  await syncLive(); assert.equal((await earning())?.payoutStatus, 'processing'); assert.equal((await earning())?.settlementReference, 'retained-reference');
});
test('partial refunds update the split; old financial responses cannot undo refunds and full refunds revoke access', async () => {
  await enableLive(); await syncLive();
  const original = structuredClone(financialOrder);
  financialOrder.state = 'PARTIALLY_REFUNDED'; financialOrder.lastEventTime = '2026-10-04T11:00:00Z';
  financialOrder.developerRevenueInBuyerCurrency = { currencyCode: 'USD', units: '2', nanos: 500000000 };
  await syncLive(); assert.equal((await earning())?.creatorEarningsNanos, '2000000000');
  financialOrder = original; await syncLive(); assert.equal((await earning())?.creatorEarningsNanos, '2000000000');
  financialOrder.state = 'REFUNDED'; financialOrder.lastEventTime = '2026-10-04T12:00:00Z';
  assert.equal((await syncLive()).status, 'revoked'); assert.equal((await earning())?.creatorEarningsNanos, '0');
  assert.equal((await db.doc('watchEntitlements/reader/videos/film').get()).data()?.status, 'revoked');
  assert.ok(await getPlayOffer(reader, 'film'));
  financialOrder = original; assert.equal((await syncLive()).status, 'revoked'); assert.equal((await earning())?.status, 'reversed');
});
test('live sales require an active single-buy product, a ready published video and an approved creator', async () => {
  await enableLive();
  for (const purchaseOptions of [[], [{ state: 'INACTIVE', buyOption: {} }], [{ state: 'ACTIVE', buyOption: { multiQuantityEnabled: true } }], [{ state: 'ACTIVE', rentOption: {} }]]) {
    activeProduct.purchaseOptions = purchaseOptions;
    await assert.rejects(savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: false, liveEnabled: true }, liveClient), /standard, single-quantity/);
  }
  activeProduct.purchaseOptions = [{ state: 'ACTIVE', buyOption: {} }];
  await db.doc('watchSystem/playNotifications').delete();
  await assert.rejects(savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: false, liveEnabled: true }, liveClient), /successful test notification/);
  await db.doc('watchSystem/playNotifications').set({ lastTestAt: Date.now() });
  await db.doc('watchCreators/creator').update({ status: 'paused' });
  await assert.rejects(savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: false, liveEnabled: true }, liveClient), /approved creator/);
  assert.equal(await getPlayOffer(reader, 'film'), null);
  delete process.env.WATCH_PLAY_LIVE_ENABLED;
  await assert.rejects(savePlayProduct(admin, { videoId: 'film', productId: sku, enabled: false, liveEnabled: true }, liveClient), /purchase notifications/);
});
test('disabling new sales does not prevent known purchases from being restored or refunded', async () => {
  await enableLive(); await syncLive(); delete process.env.WATCH_PLAY_LIVE_ENABLED;
  assert.equal((await syncLive()).status, 'active');
  purchased.purchaseStateContext = { purchaseState: 'CANCELLED' }; await syncLive();
  assert.equal((await earning())?.status, 'reversed');
});

test('authenticated notification probes do not substitute for a Play Console test', async context => {
  process.env.GOOGLE_PLAY_RTDN_AUDIENCE = 'https://afrobs.com/api/watch/play/notifications';
  process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL = 'notifications@example.test';
  context.mock.method(OAuth2Client.prototype, 'verifyIdToken', async () => new LoginTicket('', {
    iss: 'https://accounts.google.com', aud: process.env.GOOGLE_PLAY_RTDN_AUDIENCE!, sub: 'notification-identity',
    iat: 1, exp: 9999999999, email: process.env.GOOGLE_PLAY_RTDN_SERVICE_ACCOUNT_EMAIL!, email_verified: true,
  }));
  const send = (probe: boolean) => playNotification(new NextRequest(process.env.GOOGLE_PLAY_RTDN_AUDIENCE!, {
    method: 'POST', headers: { authorization: 'Bearer test-token', 'content-type': 'application/json' },
    body: JSON.stringify({ message: { messageId: probe ? 'probe' : 'console', data: Buffer.from(JSON.stringify({ packageName: PLAY_PACKAGE, testNotification: { version: '1.0' }, ...(probe ? { afrobooksInfrastructureProbe: true } : {}) })).toString('base64') } }),
  }));
  assert.equal((await send(true)).status, 200);
  assert.equal((await db.doc('watchSystem/playNotifications').get()).data()?.lastTestAt, undefined);
  assert.equal((await send(false)).status, 200);
  assert.equal((await db.doc('watchSystem/playNotifications').get()).data()?.messageId, 'console');
  assert.equal((await db.collection('watchPlayPurchases').get()).size, 0);
});

test('scheduled reconciliation retries interrupted acknowledgement and delayed financial data', async () => {
  await enableLive(); financialFailure = true; acknowledgementFailure = true;
  await assert.rejects(syncLive(), /timeout/);
  financialFailure = false; acknowledgementFailure = false;
  const result = await reconcileVideoPurchases(db, liveClient);
  assert.equal(result.checked, 1); assert.equal(result.failed, 0);
  assert.equal((await earning())?.creatorEarningsNanos, '4760000000');
  assert.equal((await db.doc(`watchPlayPurchases/${playPurchaseId(token)}`).get()).data()?.acknowledged, true);
});
test('reconciliation has a lease, isolates provider failures and wraps its bounded cursor', async () => {
  await sync();
  await db.doc('watchSystem/reconciliation').set({ leaseUntil: 200, cursor: '' });
  assert.equal((await reconcileVideoPurchases(db, client, 100)).busy, true);
  const failureClient: PlayClient = { ...client, purchase: async () => { throw new Error('Simulated provider outage'); } };
  const failed = await reconcileVideoPurchases(db, failureClient, 300);
  assert.equal(failed.failed, 1); assert.equal((await db.doc('watchSystem/reconciliation').get()).data()?.leaseUntil, 0);
  assert.equal((await reconcileVideoPurchases(db, client, 400)).checked, 1);
  await db.doc('watchSystem/reconciliation').update({ cursor: 'z'.repeat(64) });
  assert.equal((await reconcileVideoPurchases(db, client, 500)).checked, 0);
  assert.equal((await db.doc('watchSystem/reconciliation').get()).data()?.cursor, '');
});
