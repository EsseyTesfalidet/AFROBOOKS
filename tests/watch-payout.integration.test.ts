import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { registerVideoFunding, payVideoCreator, getVideoPayoutOverview, reviewVideoTransferReversal } from '../lib/server/watchPayouts';
import type { VideoPayoutGateway, VideoTransfer } from '../lib/server/watchPayoutGateway';
import type { AuthenticatedRequestUser } from '../lib/server/auth';
import { reconcileAuthor, type RoyaltyGateway } from '../functions/src/stripe/authorRoyalties';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(localhost|127\.0\.0\.1):\d+$/);
const projectId = 'demo-afrobooks-watch'; const app = initializeApp({ projectId }); const db = getFirestore(app);
let env: RulesTestEnvironment;
const actor = (uid: string, role: AuthenticatedRequestUser['role']): AuthenticatedRequestUser => ({ uid, role, status: 'active', email: null });
const admin = actor('admin', 'admin'); const creator = actor('creator', 'seller');
const period = '2026-09'; const budgetId = '2026-09_USD'; const current = Date.UTC(2026, 9, 4);
const account = { id: 'acct_creator', metadata: { userId: 'creator' }, details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' } };
let transfers: VideoTransfer[]; let calls: number; let timeout: boolean; let available: number; let topupAvailable: boolean;
const gateway: VideoPayoutGateway = {
  account: async () => account,
  funding: async id => ({ id, currency: 'USD', net: 10000, available: topupAvailable, live: true }),
  available: async () => available,
  find: async group => transfers.filter(t => t.transfer_group === group),
  retrieve: async id => { const transfer = transfers.find(t => t.id === id); if (!transfer) throw new Error('Unknown transfer'); return transfer; },
  transfer: async p => {
    calls++; const old = transfers.find(t => t.metadata.videoPayoutId === p.id); if (old) return old;
    const result: VideoTransfer = { id: `tr_video${calls}`, amount: p.amount, currency: p.currency.toLowerCase(), destination: p.destination, amount_reversed: 0, livemode: true, transfer_group: `video_${p.id}`, metadata: { integration: 'afrobooks-video', videoPayoutId: p.id, creatorId: p.creatorId } };
    transfers.push(result); if (timeout) throw new Error('Response lost after Stripe accepted transfer'); return result;
  },
};
const pay = (now = current) => payVideoCreator(db, budgetId, creator.uid, gateway, now);
const rows = () => db.collection('watchPayouts').get();
const credits = async (nanos: string, id = 'sale', createdAt = Date.UTC(2026, 8, 20)) => db.doc(`watchPlayEarnings/${id}`).set({ creatorId: 'creator', currency: 'USD', status: 'accrued', creatorEarningsNanos: nanos, createdAt, updatedAt: current, financialVerifiedAt: current });
before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore(); transfers = []; calls = 0; timeout = false; available = 10000; topupAvailable = true;
  await db.doc('watchCreators/creator').set({ status: 'approved' });
  await db.doc('sellers/creator').set({ stripeAccountId: account.id, pendingBalance: 0, totalEarnings: 0 });
  await credits('4769999999');
  await registerVideoFunding(admin, { period, topupId: 'tu_verified', settled: true }, gateway);
});
after(async () => { await env.cleanup(); await deleteApp(app); });

test('funding requires admin, a completed month and an available live top-up; top-ups cannot be double-counted', async () => {
  await assert.rejects(registerVideoFunding(creator, { period, topupId: 'tu_other', settled: true }, gateway), /Administrator/);
  await assert.rejects(registerVideoFunding(admin, { period: '2099-12', topupId: 'tu_other', settled: true }, gateway), /completed months/);
  await registerVideoFunding(admin, { period, topupId: 'tu_verified', settled: true }, gateway);
  assert.equal((await db.doc(`watchPayoutBudgets/${budgetId}`).get()).data()?.creditedMinor, 10000);
  await assert.rejects(registerVideoFunding(admin, { period: '2026-08', topupId: 'tu_verified', settled: true }, gateway), /another month/);
  topupAvailable = false;
  await assert.rejects(registerVideoFunding(admin, { period, topupId: 'tu_other', settled: true }, gateway), /not settled/);
  assert.equal(calls, 0);
});
test('concurrent monthly payout attempts transfer once, preserve fractional carry and create a verified receipt', async () => {
  await Promise.all([pay(), pay(), pay()]);
  assert.equal(transfers.length, 1); assert.equal(transfers[0].amount, 476);
  const payouts = await rows(); assert.equal(payouts.size, 1); assert.equal(payouts.docs[0].data().status, 'paid');
  assert.equal(payouts.docs[0].data().amountNanos, '4760000000');
  const fund = (await db.doc(`watchPayoutBudgets/${budgetId}`).get()).data()!;
  assert.equal(fund.spentMinor, 476); assert.equal(fund.reservedMinor, 0);
  assert.equal((await db.doc(`watchTransferReceipts/${transfers[0].id}`).get()).data()?.creatorId, 'creator');
  await pay(); assert.equal(transfers.length, 1);
});
test('lost Stripe responses are recovered by transfer group without issuing another transfer', async () => {
  timeout = true; assert.equal(await pay(), 'retry'); assert.equal(transfers.length, 1);
  timeout = false; assert.equal(await pay(current + 60_000), 'paid'); assert.equal(calls, 1);
});
test('an ambiguous attempt older than Stripe idempotency retention is held instead of resent', async () => {
  available = 0; await pay(); const ref = (await rows()).docs[0].ref;
  await ref.update({ status: 'processing', attemptStartedAt: current - 25 * 60 * 60_000 });
  available = 10000; assert.equal(await pay(), 'needs_review'); assert.equal(calls, 0);
});
test('unavailable or reversed funding cannot release a transfer', async () => {
  available = 0; assert.equal(await pay(), 'unfunded'); assert.equal(calls, 0);
  available = 10000; topupAvailable = false; assert.equal(await pay(), 'unfunded'); assert.equal(calls, 0);
  topupAvailable = true; assert.equal(await pay(), 'paid'); assert.equal(calls, 1);
});
test('refund before the first transfer releases the reservation without paying', async () => {
  available = 0; await pay();
  await db.doc('watchPlayEarnings/sale').update({ status: 'reversed', creatorEarningsNanos: '0' });
  available = 10000; await pay(); assert.equal(calls, 0);
  assert.equal((await rows()).docs[0].data().status, 'cancelled');
  assert.equal((await db.doc(`watchPayoutBudgets/${budgetId}`).get()).data()?.reservedMinor, 0);
});
test('later refunds offset future earnings and fractional amounts carry forward across months', async () => {
  await pay(); await db.doc('watchPlayEarnings/sale').update({ status: 'reversed', creatorEarningsNanos: '0' });
  const later = Date.UTC(2026, 10, 5);
  await credits('6000000000', 'later', Date.UTC(2026, 9, 20));
  const snapshots = await db.collection('watchPlayEarnings').get(); for (const s of snapshots.docs) await s.ref.update({ financialVerifiedAt: later });
  await db.doc('watchPayoutFunding/tu_later').set({ period: '2026-10', currency: 'USD', netMinor: 10000 });
  await db.doc('watchPayoutBudgets/2026-10_USD').set({ period: '2026-10', currency: 'USD', creditedMinor: 10000, reservedMinor: 0, spentMinor: 0 });
  await payVideoCreator(db, '2026-10_USD', creator.uid, gateway, later);
  assert.equal(transfers.length, 2); assert.equal(transfers[1].amount, 124, 'New $6 earnings minus the earlier $4.76 transfer.');
});
test('pending finances, stale Google confirmation and mismatched account ownership cannot pay', async () => {
  await db.doc('watchPlayEarnings/sale').update({ status: 'pending' }); await pay(); assert.equal(calls, 0);
  await db.doc('watchPlayEarnings/sale').update({ status: 'accrued', financialVerifiedAt: current - 48 * 60 * 60_000 }); await pay(); assert.equal(calls, 0);
  await db.doc('watchPlayEarnings/sale').update({ financialVerifiedAt: current });
  const wrong = { ...gateway, account: async () => ({ ...account, metadata: { userId: 'other' } }) };
  assert.equal(await payVideoCreator(db, budgetId, creator.uid, wrong, current), 'setup_required'); assert.equal(calls, 0);
});
test('different currencies are never paid from the USD funding budget', async () => {
  await db.doc('watchPlayEarnings/sale').update({ currency: 'EUR' }); await pay(); assert.equal(calls, 0);
});
test('a verified video transfer does not flag the creator book royalty account', async () => {
  await pay();
  const royaltyGateway: RoyaltyGateway = {
    account: async () => account,
    transfers: async () => transfers.map(t => ({ ...t, source_transaction: null, reversed: false })),
    payment: async () => { throw new Error('No book charges expected'); }, transfer: async () => { throw new Error('No book transfers expected'); },
  };
  assert.equal(await reconcileAuthor(db, creator.uid, royaltyGateway), true);
  assert.equal((await db.doc('sellers/creator').get()).data()?.payoutHoldReason, undefined);
  transfers[0].amount_reversed = transfers[0].amount;
  await reviewVideoTransferReversal(db, transfers[0].id, gateway);
  assert.equal((await rows()).docs[0].data().status, 'needs_review');
  assert.equal(await reconcileAuthor(db, creator.uid, royaltyGateway), true, 'A video reversal must not freeze unrelated book royalties.');
  await db.doc(`watchTransferReceipts/${transfers[0].id}`).delete();
  assert.equal(await reconcileAuthor(db, creator.uid, royaltyGateway), false);
  assert.equal((await db.doc('sellers/creator').get()).data()?.payoutHoldReason, 'unrecorded_transfer');
});
test('creator payout views exclude other creators and direct ledger writes are denied', async () => {
  await pay(); assert.equal((await getVideoPayoutOverview(creator)).payouts.length, 1);
  assert.equal((await getVideoPayoutOverview(actor('other', 'seller'))).payouts.length, 0);
  const client = env.authenticatedContext('admin').firestore();
  for (const path of ['watchPayouts/forged', 'watchPayoutFunding/forged', 'watchPayoutBudgets/2026-09_USD', 'watchTransferReceipts/forged']) {
    await assertFails(getDoc(doc(client, path))); await assertFails(setDoc(doc(client, path), { status: 'paid' }));
  }
});
