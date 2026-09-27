import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fulfillPayment } from '../lib/server/fulfillPayment';
import { calculateCartPricing } from '../lib/utils/fees';
import { reviewVerification } from '../lib/admin/reviewVerification';
import { processAuthorRoyalties, reconcileAuthor, payAuthorOrder, holdAuthorPayouts } from '../functions/src/stripe/authorRoyalties';
import { seedRoyalty, royaltyFixture } from './royalty-fixture';
import { updateFollow, createPurchaseReview } from '../lib/server/social';
import { publishBook } from '../lib/server/publishBook';
import { validateBookContent } from '../lib/server/bookContent';
import { paySeller } from '../functions/src/stripe/payoutLedger';
import { syncSubscription } from '../lib/server/syncSubscription';
import { cancelUserSubscription } from '../lib/server/cancelSubscription';
import { deleteBookRecords } from '../lib/server/moderation';
import { bookFilePrefixes } from '../lib/server/bookFiles';
import { Timestamp, FieldValue } from 'firebase-admin/firestore';
import type Stripe from 'stripe';
import { submitPromotion, reviewPromotion, promotionCandidates, recordPromotionEvent, savePromotionSettings } from '../lib/server/promotions';
import { preparePromotionCheckout, createPromotionCheckout, fulfillPromotionCheckout, reviewPromotionCharge, expirePromotionCheckout, resolvePromotionPayment, reconcilePromotionRefund } from '../lib/server/promotionPayments';
import { PROMOTION_TERMS_VERSION } from '../lib/promotions';
import type { Promotion } from '../types/promotion';
import { promotionFixture, promotionStripeFixture, author as promotionAuthor, admin as promotionAdmin } from './promotion-fixture';

const projectId = 'demo-afrobooks-security';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Integration tests require the local Firestore emulator');
let env: RulesTestEnvironment;
const adminApp = initializeApp({ projectId }, 'integration');
const db = getFirestore(adminApp);
const profile = { uid: 'reader', role: 'buyer', status: 'active', subscriptionStatus: 'none', subscriptionPlan: 'none', subscriptionId: null, stripeCustomerId: null, referralCredits: 0 };

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') }, storage: { rules: readFileSync('storage.rules', 'utf8') } });
});
beforeEach(async () => {
  await env.clearFirestore();
  await Promise.all([
    db.doc('users/reader').set(profile),
    db.doc('users/author').set({ ...profile, uid: 'author', role: 'seller', email: 'private@example.test' }),
    db.doc('users/admin').set({ ...profile, uid: 'admin', role: 'admin' }),
    db.doc('books/book').set({ sellerId: 'author', status: 'live', totalSales: 0, inSubscription: true }),
    db.doc('books/book/chapters/locked').set({ chapterNumber: 2, isPreview: false, content: 'paid' }),
    db.doc('books/book/chapters/sample').set({ chapterNumber: 1, isPreview: true, content: 'preview' }),
    db.doc('sellers/author').set({ pendingBalance: 0, totalEarnings: 0, totalSales: 0 }),
  ]);
});
after(async () => { await env?.cleanup(); await deleteApp(adminApp); });

test('promotion ownership, offer price, terms and one-book concurrency are enforced', async () => {
  await db.doc('books/book').update({ coverUrl: 'https://example.test/cover.jpg' });
  await assert.rejects(submitPromotion(db, { uid: 'reader', role: 'buyer' }, 'book', 0, PROMOTION_TERMS_VERSION), /author account/);
  await assert.rejects(submitPromotion(db, { uid: 'reader', role: 'seller' }, 'book', 0, PROMOTION_TERMS_VERSION), /your own published/);
  await assert.rejects(submitPromotion(db, promotionAuthor, 'book', 0, 'old-terms'), /current promotion terms/);
  await assert.rejects(submitPromotion(db, promotionAuthor, 'book', 900, PROMOTION_TERMS_VERSION), /offer changed/);
  const results = await Promise.allSettled([submitPromotion(db, promotionAuthor, 'book', 0, PROMOTION_TERMS_VERSION), submitPromotion(db, promotionAuthor, 'book', 0, PROMOTION_TERMS_VERSION)]);
  assert.equal(results.filter(item => item.status === 'fulfilled').length, 1);
  assert.equal((await db.collection('bookPromotions').get()).size, 1);
  const id = (results.find(item => item.status === 'fulfilled') as PromiseFulfilledResult<string>).value;
  await assert.rejects(reviewPromotion(db, promotionAuthor, id, 'approve', ''), /Administrator/);
  await assert.rejects(reviewPromotion(db, { uid: 'reader', role: 'buyer' }, id, 'stop', ''), /another author/);
  await assert.rejects(savePromotionSettings(db, promotionAuthor, { enabled: true, priceCents: 0, durationDays: 7 }), /Administrator/);
});

test('free promotions start on approval and count one signed-in reader per UTC day', async () => {
  const now = Date.now();
  const id = await promotionFixture(db, 0, now);
  assert.equal((await promotionCandidates(db, now)).length, 1);
  await Promise.all([recordPromotionEvent(db, 'reader', id, 'view', now), recordPromotionEvent(db, 'reader', id, 'view', now), recordPromotionEvent(db, 'author', id, 'view', now)]);
  await Promise.all([recordPromotionEvent(db, 'reader', id, 'click', now), recordPromotionEvent(db, 'reader', id, 'click', now)]);
  let item = (await db.doc(`bookPromotions/${id}`).get()).data() as Promotion;
  assert.equal(item.views, 1); assert.equal(item.clicks, 1);
  await recordPromotionEvent(db, 'reader', id, 'click', now + 86400000);
  await recordPromotionEvent(db, 'reader', id, 'view', now + 86400000);
  item = (await db.doc(`bookPromotions/${id}`).get()).data() as Promotion;
  assert.equal(item.views, 2); assert.equal(item.clicks, 2);
  assert.equal((await promotionCandidates(db, now + 7 * 86400000)).length, 0);
  await recordPromotionEvent(db, 'reader', id, 'click', now + 7 * 86400000);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.clicks, 2);
});

test('changed, flagged, deleted or suspended-author books never serve promotions', async () => {
  await promotionFixture(db);
  await db.doc('books/book').update({ coverUrl: 'https://example.test/different.jpg' });
  assert.equal((await promotionCandidates(db)).length, 0);
  await db.doc('books/book').update({ coverUrl: 'https://example.test/cover.jpg', status: 'flagged' });
  assert.equal((await promotionCandidates(db)).length, 0);
  await db.doc('books/book').update({ status: 'live' });
  await db.doc('users/author').update({ status: 'suspended' });
  assert.equal((await promotionCandidates(db)).length, 0);
  await db.doc('users/author').update({ status: 'active' });
  await db.doc('bookDeletions/book').set({ status: 'pending' });
  assert.equal((await promotionCandidates(db)).length, 0);
});

test('campaign prices survive admin changes; checkout retries recover one immutable session', async () => {
  const id = await promotionFixture(db, 900);
  await savePromotionSettings(db, promotionAdmin, { enabled: true, priceCents: 1900, durationDays: 7 });
  const fixture = promotionStripeFixture(id);
  fixture.state.loseCreateResponse = true;
  await assert.rejects(createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test'), /Lost creation/);
  const firstAttempt = (await db.doc(`bookPromotions/${id}`).get()).data()?.checkoutAttemptAt;
  await createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test');
  await createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test');
  assert.equal(fixture.state.createCalls, 2);
  assert.equal(new Set(fixture.state.createKeys).size, 1);
  assert.equal(fixture.state.request?.line_items?.[0].price_data?.unit_amount, 900);
  assert.equal(fixture.state.request?.payment_intent_data?.metadata?.campaignId, id);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.checkoutAttemptAt, firstAttempt);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'approved');
});

test('verified promotion payment activates once without royalties or book entitlements', async () => {
  const id = await promotionFixture(db, 900);
  await preparePromotionCheckout(db, promotionAuthor, id);
  const fixture = promotionStripeFixture(id);
  const payment = fixture.paid();
  const now = Date.now();
  await Promise.all([fulfillPromotionCheckout(db, fixture.session, payment, true, now), fulfillPromotionCheckout(db, fixture.session, payment, true, now + 100)]);
  const first = (await db.doc(`bookPromotions/${id}`).get()).data() as Promotion;
  await fulfillPromotionCheckout(db, fixture.session, payment, true, now + 999999);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.startsAt, first.startsAt);
  assert.equal(first.endsAt - first.startsAt, 7 * 86400000);
  assert.equal(first.status, 'active');
  assert.equal((await db.collection('orders').get()).size, 0);
  assert.equal((await db.collection('library').get()).size, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
});

test('unpaid redirects, mismatched owners and wrong amounts cannot activate promotions', async () => {
  const id = await promotionFixture(db, 900);
  await preparePromotionCheckout(db, promotionAuthor, id);
  const fixture = promotionStripeFixture(id);
  await fulfillPromotionCheckout(db, fixture.session, { ...fixture.payment, refunded: false, disputed: false }, true);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'approved');
  const payment = fixture.paid();
  await assert.rejects(fulfillPromotionCheckout(db, fixture.session, { ...payment, metadata: { ...payment.metadata, userId: 'reader' } }, true), /ownership/);
  await fulfillPromotionCheckout(db, fixture.session, { ...payment, amount_received: 100 }, true);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'needs_review');
  assert.equal((await promotionCandidates(db)).length, 0);
});

test('test-mode payments cannot activate a production promotion', async () => {
  const id = await promotionFixture(db, 900);
  await preparePromotionCheckout(db, promotionAuthor, id);
  const fixture = promotionStripeFixture(id);
  await fulfillPromotionCheckout(db, fixture.session, { ...fixture.paid(), livemode: false }, true);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'needs_review');
});

test('refunds arriving before completion never resurrect a campaign', async () => {
  const id = await promotionFixture(db, 900);
  await preparePromotionCheckout(db, promotionAuthor, id);
  const fixture = promotionStripeFixture(id);
  await reviewPromotionCharge(db, fixture.payment, true);
  await fulfillPromotionCheckout(db, fixture.session, fixture.paid(), true);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'refunded');
  assert.equal((await promotionCandidates(db)).length, 0);
});

test('book deletion stops ads before file cleanup, including a late successful payment', async () => {
  const id = await promotionFixture(db, 900);
  await preparePromotionCheckout(db, promotionAuthor, id);
  const fixture = promotionStripeFixture(id);
  await assert.rejects(deleteBookRecords(db, 'book', { deleteFiles: async () => { throw new Error('Storage unavailable'); } }), /Storage unavailable/);
  await fulfillPromotionCheckout(db, fixture.session, fixture.paid(), true);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'needs_review');
  assert.equal((await promotionCandidates(db)).length, 0);
  await deleteBookRecords(db, 'book', { deleteFiles: async () => {} });
  assert.equal((await db.doc('books/book').get()).exists, false);
  const campaign = (await db.doc(`bookPromotions/${id}`).get()).data();
  assert.equal(campaign?.paymentIntentId, fixture.payment.id);
  assert.equal(campaign?.title, undefined); assert.equal(campaign?.coverUrl, undefined);
});

test('expired checkout is terminal and unconfirmed old attempts cannot create another charge', async () => {
  const id = await promotionFixture(db, 900);
  const now = Date.now();
  await preparePromotionCheckout(db, promotionAuthor, id, now);
  await assert.rejects(preparePromotionCheckout(db, promotionAuthor, id, now + 23 * 3600000), /payment review/);
  const fixture = promotionStripeFixture(id);
  fixture.session.status = 'expired';
  await expirePromotionCheckout(db, fixture.session);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'stopped');
  await assert.rejects(preparePromotionCheckout(db, promotionAuthor, id), /not awaiting/);
});

test('admin refunds recover from a lost Stripe response without a second refund', async () => {
  const id = await promotionFixture(db, 900);
  const fixture = promotionStripeFixture(id);
  await createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test');
  await fulfillPromotionCheckout(db, fixture.session, fixture.paid(), true);
  await reviewPromotion(db, promotionAuthor, id, 'stop', 'Stopped by author');
  await assert.rejects(resolvePromotionPayment(db, fixture.stripe, promotionAuthor, id), /Administrator/);
  fixture.state.loseRefundResponse = true;
  await assert.rejects(resolvePromotionPayment(db, fixture.stripe, promotionAdmin, id), /Lost refund/);
  await resolvePromotionPayment(db, fixture.stripe, promotionAdmin, id);
  assert.equal(fixture.state.refundCalls, 1);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'refunded');
  assert.equal((await promotionCandidates(db)).length, 0);
});

test('promotion data is private and all client activation, billing and counter writes are denied', async () => {
  const id = await promotionFixture(db);
  const author = env.authenticatedContext('author').firestore();
  const admin = env.authenticatedContext('admin').firestore();
  const reader = env.authenticatedContext('reader').firestore();
  await assertSucceeds(getDoc(doc(author, 'bookPromotions', id)));
  await assertSucceeds(getDoc(doc(admin, 'bookPromotions', id)));
  await assertFails(getDoc(doc(reader, 'bookPromotions', id)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'bookPromotions', id)));
  for (const client of [author, admin, reader]) {
    await assertFails(updateDoc(doc(client, 'bookPromotions', id), { status: 'active', priceCents: 0, clicks: 999 }));
    await assertFails(setDoc(doc(client, 'bookPromotions', id, 'dailyReaders', 'fake'), { click: true }));
    await assertFails(setDoc(doc(client, 'promotionSettings', 'global'), { enabled: true, priceCents: 0 }));
    await assertFails(setDoc(doc(client, 'promotionSlots', 'book'), { campaignId: 'fake' }));
  }
});

test('admin can recover and close a checkout whose creation response was lost', async () => {
  const id = await promotionFixture(db, 900);
  const fixture = promotionStripeFixture(id);
  fixture.state.loseCreateResponse = true;
  await assert.rejects(createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test'), /Lost creation/);
  await reviewPromotion(db, promotionAuthor, id, 'stop', 'Cancel');
  await resolvePromotionPayment(db, fixture.stripe, promotionAdmin, id);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'stopped');
  assert.equal(fixture.state.createCalls, 1);
  assert.equal(fixture.state.refundCalls, 0);
});

test('pending and later failed refunds stay visible for admin review', async () => {
  const id = await promotionFixture(db, 900);
  const fixture = promotionStripeFixture(id);
  await createPromotionCheckout(db, fixture.stripe, promotionAuthor, id, 'https://example.test');
  await fulfillPromotionCheckout(db, fixture.session, fixture.paid(), true);
  fixture.charge.refunded = true;
  fixture.state.refundStatus = 'pending';
  await reconcilePromotionRefund(db, fixture.stripe, fixture.payment);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'needs_review');
  fixture.state.refundStatus = 'succeeded';
  await reconcilePromotionRefund(db, fixture.stripe, fixture.payment);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'refunded');
  fixture.state.refundStatus = 'failed';
  await reconcilePromotionRefund(db, fixture.stripe, fixture.payment);
  assert.equal((await db.doc(`bookPromotions/${id}`).get()).data()?.status, 'needs_review');
  assert.equal((await promotionCandidates(db)).length, 0);
});

test('author identity review commits status, verification and one notification atomically', async () => {
  await db.doc('verificationRequests/request').set({ sellerId: 'author', status: 'pending' });
  const client = env.authenticatedContext('admin').firestore() as unknown as Parameters<typeof reviewVerification>[0];
  const results = await Promise.allSettled([
    reviewVerification(client, 'request', 'admin', 'approved'),
    reviewVerification(client, 'request', 'admin', 'approved'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal((await db.doc('verificationRequests/request').get()).data()?.status, 'approved');
  assert.equal((await db.doc('sellers/author').get()).data()?.verificationStatus.idVerified, true);
  assert.equal((await db.doc('sellers/author').get()).data()?.verificationStatus.emailVerified, false);
  assert.equal((await db.collection('notifications').get()).size, 1);
  await db.doc('verificationRequests/missing').set({ sellerId: 'deleted-author', status: 'pending' });
  await assert.rejects(reviewVerification(client, 'missing', 'admin', 'approved'), /no longer available/);
  assert.equal((await db.doc('verificationRequests/missing').get()).data()?.status, 'pending');
  assert.equal((await db.collection('notifications').get()).size, 1);
});

test('an author cannot approve their own identity request', async () => {
  await db.doc('verificationRequests/request').set({ sellerId: 'author', status: 'pending' });
  const client = env.authenticatedContext('author').firestore() as unknown as Parameters<typeof reviewVerification>[0];
  await assertFails(reviewVerification(client, 'request', 'author', 'approved'));
  assert.equal((await db.doc('verificationRequests/request').get()).data()?.status, 'pending');
  assert.equal((await db.collection('notifications').get()).size, 0);
});

test('subscription tiers, eligibility and preorder dates gate paid chapters', async () => {
  const reader = env.authenticatedContext('reader').firestore();
  const paid = doc(reader, 'books/book/chapters/locked');
  await db.doc('users/reader').update({ subscriptionStatus: 'active', subscriptionPlan: 'basic' });
  await db.doc('books/book').update({ subscriptionTiers: ['premium'] });
  await assertFails(getDoc(paid));
  await db.doc('users/reader').update({ subscriptionPlan: 'premium' });
  await assertSucceeds(getDoc(paid));
  await db.doc('books/book').update({ subscriptionEligibleFrom: Timestamp.fromMillis(Date.now() + 86400000) });
  await assertFails(getDoc(paid));
  await db.doc('library/reader_book').set({ userId: 'reader', bookId: 'book' });
  await assertSucceeds(getDoc(paid));
  await db.doc('books/book').update({ isPreorder: true, releaseDate: Timestamp.fromMillis(Date.now() + 86400000) });
  await assertFails(getDoc(paid));
  await assertSucceeds(getDoc(doc(reader, 'books/book/chapters/sample')));
  await db.doc('books/book').update({ releaseDate: Timestamp.fromMillis(Date.now() - 1000) });
  await assertSucceeds(getDoc(paid));
});

test('private archives stay private; payout and promo client mutations are disabled', async () => {
  const author = env.authenticatedContext('author').firestore();
  await assertSucceeds(setDoc(doc(author, 'privateBooks/book'), { sellerId: 'author', manuscriptPath: 'manuscripts/author/book/file.txt' }));
  await assertSucceeds(getDoc(doc(author, 'privateBooks/book')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'privateBooks/book')));
  await assertFails(getDoc(doc(env.authenticatedContext('reader').firestore(), 'privateBooks/book')));
  await assertFails(setDoc(doc(author, 'privateBooks/other'), { sellerId: 'author', manuscriptPath: 'other' }));
  await assertFails(setDoc(doc(author, 'promoCodes/free'), { sellerId: 'author', discountType: 'free' }));
  await db.doc('payouts/unconfirmed').set({ sellerId: 'author', status: 'pending', amountCents: 100 });
  await assertFails(updateDoc(doc(env.authenticatedContext('admin').firestore(), 'payouts/unconfirmed'), { status: 'paid' }));
});

test('payout reservation survives new sales, concurrent runs and lost transfer responses', async () => {
  await db.doc('sellers/author').update({ pendingBalance: 1000, stripeAccountId: 'acct_test', payoutsReconciledAt: new Date() });
  const transfers = new Map<string, { id: string }>();
  let failOnce = true;
  const transfer: Parameters<typeof paySeller>[3] = async input => {
    if (!transfers.has(input.idempotencyKey)) {
      transfers.set(input.idempotencyKey, { id: 'tr_synthetic' });
      await db.doc('sellers/author').update({ pendingBalance: FieldValue.increment(225) });
    }
    if (failOnce) { failOnce = false; throw new Error('Response lost after transfer'); }
    return transfers.get(input.idempotencyKey)!;
  };
  await Promise.all([paySeller(db, 'author', '2026-09', transfer), paySeller(db, 'author', '2026-09', transfer)]);
  await paySeller(db, 'author', '2026-09', transfer);
  await paySeller(db, 'author', '2026-09', transfer);
  assert.equal(transfers.size, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 225);
  const payout = (await db.doc('payouts/author_2026-09').get()).data();
  assert.equal(payout?.amountCents, 1000);
  assert.equal(payout?.stripeTransferId, 'tr_synthetic');
  assert.equal(payout?.status, 'paid');
  assert.equal((await db.collection('notifications').get()).size, 1);
});

test('old ambiguous payouts hold their funds and never reuse an expired idempotency key', async () => {
  const now = Date.now();
  await db.doc('sellers/author').update({ pendingBalance: 500, stripeAccountId: 'acct_test', payoutsReconciledAt: new Date() });
  let calls = 0;
  const transfer = async () => { calls++; throw new Error('Unknown transfer result'); };
  await paySeller(db, 'author', '2026-09', transfer, now);
  await paySeller(db, 'author', '2026-10', transfer, now + 25 * 3600000);
  assert.equal(calls, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.doc('payouts/author_2026-09').get()).data()?.status, 'needs_review');
  assert.equal((await db.collection('payouts').get()).size, 1);
});

test('royalties wait for activation and verified Stripe payout eligibility', async () => {
  const { gateway, state } = royaltyFixture();
  await seedRoyalty(db);
  await processAuthorRoyalties(db, gateway);
  assert.equal(state.createCalls, 0);
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  state.ready = false;
  await processAuthorRoyalties(db, gateway);
  assert.equal(state.createCalls, 0);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  assert.equal((await db.doc('sellers/author').get()).data()?.stripeAccountStatus, 'pending');
});

test('royalties link to the purchase charge and concurrent retries never duplicate author funds', async () => {
  const { gateway, transfers } = royaltyFixture();
  await seedRoyalty(db);
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  await Promise.all([processAuthorRoyalties(db, gateway), processAuthorRoyalties(db, gateway)]);
  await processAuthorRoyalties(db, gateway);
  assert.equal(transfers.size, 1);
  const transfer = [...transfers.values()][0];
  assert.equal(transfer.amount, 800);
  assert.equal(transfer.source_transaction, 'ch_pi_royalty');
  assert.equal(transfer.destination, 'acct_author');
  const seller = (await db.doc('sellers/author').get()).data();
  assert.equal(seller?.pendingBalance, 0);
  assert.equal(seller?.totalEarnings, 800);
  assert.equal(seller?.payoutHoldReason, undefined);
  assert.equal((await db.doc('payouts/royalty_royalty-order').get()).data()?.status, 'paid');
  assert.equal((await db.collection('notifications').get()).size, 1);
});

test('royalty recovery finds an already-created transfer after its response was lost, even after 24 hours', async () => {
  const { gateway, state, transfers } = royaltyFixture();
  await seedRoyalty(db);
  assert.equal(await reconcileAuthor(db, 'author', gateway), true);
  const now = Date.now();
  state.loseResponse = true;
  assert.equal(await payAuthorOrder(db, 'royalty-order', gateway, now), 'pending');
  assert.equal(await payAuthorOrder(db, 'royalty-order', gateway, now + 25 * 3600000), 'paid');
  assert.equal(transfers.size, 1);
  assert.equal(state.createCalls, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
});

test('unknown old royalty attempts keep reserved funds and require review instead of sending again', async () => {
  const { gateway, state } = royaltyFixture();
  await seedRoyalty(db);
  await reconcileAuthor(db, 'author', gateway);
  const now = Date.now();
  state.failBeforeTransfer = true;
  assert.equal(await payAuthorOrder(db, 'royalty-order', gateway, now), 'pending');
  assert.equal(await payAuthorOrder(db, 'royalty-order', gateway, now + 25 * 3600000), 'needs_review');
  assert.equal(state.createCalls, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.doc('payoutReviews/author').get()).data()?.reason, 'transfer_review');
});

test('mismatched balances and unrecorded transfers cannot pass royalty reconciliation', async () => {
  const { gateway, state, transfers } = royaltyFixture();
  await seedRoyalty(db);
  await db.doc('sellers/author').update({ pendingBalance: 900 });
  assert.equal(await reconcileAuthor(db, 'author', gateway), false);
  assert.equal((await db.doc('payoutReviews/author').get()).data()?.reason, 'balance_mismatch');
  await db.doc('sellers/author').update({ pendingBalance: 800, payoutHoldReason: null });
  transfers.set('unknown', { id: 'tr_unknown', amount: 100, currency: 'usd', destination: 'acct_author', source_transaction: 'ch_unknown', metadata: {}, reversed: false, amount_reversed: 0 });
  assert.equal(await reconcileAuthor(db, 'author', gateway), false);
  assert.equal((await db.doc('payoutReviews/author').get()).data()?.reason, 'unrecorded_transfer');
  assert.equal(state.createCalls, 0);
});

test('refunded, disputed and test-mode payments cannot fund live author transfers', async () => {
  for (const mode of ['refunded', 'disputed', 'test']) {
    const { gateway, state } = royaltyFixture();
    await seedRoyalty(db);
    await db.doc('sellers/author').update({ payoutHoldReason: null });
    await reconcileAuthor(db, 'author', gateway);
    state.refunded = mode === 'refunded'; state.disputed = mode === 'disputed'; state.live = mode !== 'test';
    assert.equal(await payAuthorOrder(db, 'royalty-order', gateway), 'needs_review');
    assert.equal(state.createCalls, 0);
    assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  }
});

test('one unavailable author does not prevent another author from receiving verified royalties', async () => {
  const { gateway, state } = royaltyFixture();
  await seedRoyalty(db);
  await seedRoyalty(db, { sellerId: 'other', orderId: 'other-order', paymentId: 'pi_other' });
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  const account = gateway.account;
  gateway.account = async id => { if (id === 'acct_author') throw new Error('Account unavailable'); return account(id); };
  const result = await processAuthorRoyalties(db, gateway);
  assert.equal(result.paid, 1);
  assert.equal(state.createCalls, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  assert.equal((await db.doc('sellers/other').get()).data()?.pendingBalance, 0);
});

test('a refunded payment review holds further royalties and keeps financial review records private', async () => {
  await seedRoyalty(db);
  await holdAuthorPayouts(db, 'author', 'payment_review');
  await db.doc('platformSettings/global').set({ automatedPayoutsEnabled: true });
  const { gateway, state } = royaltyFixture();
  await processAuthorRoyalties(db, gateway);
  assert.equal(state.createCalls, 0);
  const author = env.authenticatedContext('author').firestore();
  const admin = env.authenticatedContext('admin').firestore();
  await assertFails(getDoc(doc(author, 'payoutReviews/author')));
  await assertSucceeds(getDoc(doc(admin, 'payoutReviews/author')));
  await assertFails(setDoc(doc(admin, 'payoutReviews/author'), { status: 'resolved' }));
});

test('subscription sync preserves newer entitlements and never recreates deleted users', async () => {
  await db.doc('users/reader').update({ stripeCustomerId: 'cus_reader', subscriptionId: 'sub_new', subscriptionStatus: 'active', subscriptionPlan: 'premium' });
  const sub = { id: 'sub_old', customer: 'cus_reader', status: 'canceled', metadata: { userId: 'reader', plan: 'basic' }, items: { data: [{ price: { unit_amount: 499 }, quantity: 1 }] }, start_date: 1700000000, created: 1700000000, current_period_start: 1700000000, current_period_end: 1702592000, cancel_at_period_end: false } as unknown as Stripe.Subscription;
  await syncSubscription(db, sub);
  assert.equal((await db.doc('users/reader').get()).data()?.subscriptionId, 'sub_new');
  assert.equal((await db.doc('subscriptions/sub_old').get()).data()?.status, 'cancelled');
  await syncSubscription(db, { ...sub, id: 'sub_new' });
  assert.equal((await db.doc('users/reader').get()).data()?.subscriptionId, null);
  await db.doc('users/reader').delete();
  await syncSubscription(db, { ...sub, status: 'active' });
  assert.equal((await db.doc('users/reader').get()).exists, false);
});

test('cancellation verifies ownership and cancels billing before account deletion', async () => {
  await db.doc('users/reader').update({ stripeCustomerId: 'cus_reader', subscriptionId: 'sub_reader', subscriptionStatus: 'active', subscriptionPlan: 'basic' });
  const state = { id: 'sub_reader', customer: 'cus_reader', status: 'active', metadata: { userId: 'reader', plan: 'basic' }, items: { data: [] }, start_date: 1700000000, created: 1700000000, current_period_start: 1700000000, current_period_end: 1702592000, cancel_at_period_end: false };
  let cancellations = 0;
  const billing = { subscriptions: {
    retrieve: async () => state,
    update: async (_id: string, params: { cancel_at_period_end: boolean }) => { state.cancel_at_period_end = params.cancel_at_period_end; return state; },
    cancel: async () => { cancellations++; state.status = 'canceled'; return state; },
  } } as unknown as NonNullable<Parameters<typeof cancelUserSubscription>[3]>;
  await cancelUserSubscription(db, 'reader', false, billing);
  assert.equal(state.cancel_at_period_end, true);
  assert.equal((await db.doc('users/reader').get()).data()?.subscriptionStatus, 'active');
  state.customer = 'cus_someone_else';
  await assert.rejects(cancelUserSubscription(db, 'reader', true, billing), /ownership/);
  assert.equal(cancellations, 0);
  state.customer = 'cus_reader';
  await cancelUserSubscription(db, 'reader', true, billing);
  assert.equal(cancellations, 1);
  assert.equal((await db.doc('users/reader').get()).data()?.subscriptionStatus, 'cancelled');
});

test('publication rejects incomplete uploads and protects status transitions', async () => {
  const draft = { sellerId: 'author', status: 'draft', copyrightReviewStatus: 'not_needed', publishedAt: null, totalSales: 0, totalBorrows: 0, reviewCount: 0, averageRating: 0, isFeatured: false, chapterCount: 2, price: 499, title: 'Draft', authorName: 'Author', genre: 'Fiction', copyrightBasis: 'original', copyrightAttestationAccepted: true };
  const author = env.authenticatedContext('author').firestore();
  await assertSucceeds(setDoc(doc(author, 'books/draft'), draft));
  await assertFails(updateDoc(doc(author, 'books/draft'), { status: 'live' }));
  await assertSucceeds(updateDoc(doc(author, 'books/draft'), { title: 'Edited draft' }));
  await assert.rejects(publishBook(db, 'draft', 'author'), /missing chapters/);
  await db.doc('books/draft/chapters/one').set({ chapterNumber: 1, content: '<p>First chapter</p>' });
  await assert.rejects(publishBook(db, 'draft', 'author'), /missing chapters/);
  await db.doc('books/draft/chapters/two').set({ chapterNumber: 2, content: '<p>&nbsp;</p><script>ignored</script>' });
  await assert.rejects(publishBook(db, 'draft', 'author'), /readable text/);
  await db.doc('books/draft/chapters/two').update({ content: '<p>Second chapter</p>' });
  await assert.rejects(publishBook(db, 'draft', 'reader'), /not found/);
  assert.equal(await publishBook(db, 'draft', 'author'), 'in_review');
  await assertFails(updateDoc(doc(author, 'books/draft/chapters/one'), { content: '' }));
  const complete = await db.doc('books/draft').get();
  assert.equal(complete.data()?.title, 'Edited draft');
  assert.equal((await db.collection('books').where('title', '==', 'Edited draft').get()).size, 1);
  const chapters = await db.collection('books/draft/chapters').get();
  assert.doesNotThrow(() => validateBookContent(complete.data()!, chapters.docs));
  assert.throws(() => validateBookContent({ chapterCount: 16 }, []), /missing chapters/);
});

test('reader queries allow guest previews and authorized full books only', async () => {
  const guest = env.unauthenticatedContext().firestore();
  const chapters = (client: typeof guest) => collection(client, 'books/book/chapters');
  const preview = await assertSucceeds(getDocs(query(chapters(guest), where('isPreview', '==', true), orderBy('chapterNumber'))));
  assert.deepEqual(preview.docs.map((chapter) => chapter.data().content), ['preview']);
  await assertFails(getDocs(query(chapters(guest), orderBy('chapterNumber'))));
  const reader = env.authenticatedContext('reader').firestore();
  await assertFails(getDocs(query(chapters(reader), orderBy('chapterNumber'))));
  await db.doc('library/reader_book').set({ userId: 'reader', bookId: 'book' });
  assert.equal((await assertSucceeds(getDocs(query(chapters(reader), orderBy('chapterNumber'))))).size, 2);
  const author = env.authenticatedContext('author').firestore();
  assert.equal((await assertSucceeds(getDocs(query(chapters(author), orderBy('chapterNumber'))))).size, 2);
  await db.doc('users/subscriber').set({ ...profile, uid: 'subscriber', subscriptionStatus: 'active' });
  const subscriber = env.authenticatedContext('subscriber').firestore();
  assert.equal((await assertSucceeds(getDocs(query(chapters(subscriber), orderBy('chapterNumber'))))).size, 2);
});

test('profile edits work but privileged fields and other profiles are protected', async () => {
  const client = env.authenticatedContext('reader').firestore();
  await assertSucceeds(updateDoc(doc(client, 'users/reader'), { firstName: 'Reader', bio: 'Hello' }));
  for (const data of [{ role: 'admin' }, { subscriptionStatus: 'active' }, { referralCredits: 100 }, { stripeCustomerId: 'cus_other' }]) {
    await assertFails(updateDoc(doc(client, 'users/reader'), data));
  }
  await assertFails(getDoc(doc(client, 'users/author')));
  await assertFails(getDoc(doc(client, 'sellers/author')));
  await assertSucceeds(getDoc(doc(env.authenticatedContext('admin').firestore(), 'users/author')));
});

test('signup allows ordinary accounts but rejects admin and paid entitlements', async () => {
  const client = env.authenticatedContext('new').firestore();
  await assertFails(setDoc(doc(client, 'users/new'), { ...profile, uid: 'new', role: 'admin' }));
  await assertFails(setDoc(doc(client, 'users/new'), { ...profile, uid: 'new', subscriptionStatus: 'active' }));
  await assertSucceeds(setDoc(doc(client, 'users/new'), { ...profile, uid: 'new', role: 'seller' }));
});

test('clients cannot forge purchases, library entries, seller balances or verification', async () => {
  const reader = env.authenticatedContext('reader').firestore();
  const author = env.authenticatedContext('author').firestore();
  await assertFails(setDoc(doc(reader, 'orders/fake'), { buyerId: 'reader', status: 'completed' }));
  await assertFails(setDoc(doc(reader, 'library/reader_book'), { userId: 'reader', bookId: 'book' }));
  await assertFails(updateDoc(doc(author, 'sellers/author'), { pendingBalance: 999999 }));
  await assertFails(updateDoc(doc(author, 'sellers/author'), { isVerified: true }));
  await assertFails(getDoc(doc(reader, 'books/book/chapters/locked')));
  await assertSucceeds(getDoc(doc(reader, 'books/book/chapters/sample')));
  await assertSucceeds(getDoc(doc(reader, 'library/reader_missing')));
  await assertSucceeds(getDoc(doc(reader, 'readingProgress/reader_book')));
});

test('follow queries are private and counters cannot be forged', async () => {
  await db.doc('follows/reader_author').set({ followerId: 'reader', sellerId: 'author' });
  const reader = env.authenticatedContext('reader').firestore();
  await assertSucceeds(getDocs(query(collection(reader, 'follows'), where('followerId', '==', 'reader'))));
  await assertFails(setDoc(doc(reader, 'follows/reader_other'), { followerId: 'reader', sellerId: 'other' }));
});

async function seedOrder() {
  await db.doc('orders/order').set({ buyerId: 'reader', sellerId: 'author', bookId: 'book', bookTitle: 'Book', finalPrice: 1000, sellerEarnings: 800, stripePaymentIntentId: 'pi_test', status: 'pending' });
}
const payment = { id: 'pi_test', amount_received: 1000, currency: 'usd', metadata: { userId: 'reader' } };

test('a discounted cart credits each author their allocated proceeds exactly once', async () => {
  const pricing = calculateCartPricing([499, 699, 999]);
  const sellers = ['author', 'second-author', 'author'];
  for (const [index, line] of pricing.lines.entries()) {
    await db.doc(`books/cart-${index}`).set({ sellerId: sellers[index], status: 'live', totalSales: 0 });
    await db.doc(`orders/cart-${index}`).set({ ...line, buyerId: 'reader', sellerId: sellers[index], bookId: `cart-${index}`, bookTitle: `Book ${index}`, stripePaymentIntentId: 'pi_cart', status: 'pending' });
  }
  const paid = { ...payment, id: 'pi_cart', amount_received: pricing.total };
  await Promise.all([fulfillPayment(db, paid), fulfillPayment(db, paid)]);
  for (const seller of new Set(sellers)) {
    const expected = pricing.lines.reduce((sum, line, index) => sum + (sellers[index] === seller ? line.sellerEarnings : 0), 0);
    const account = (await db.doc(`sellers/${seller}`).get()).data();
    assert.equal(account?.pendingBalance, expected);
    assert.equal(account?.totalEarnings, expected);
  }
  const orders = await db.collection('orders').where('stripePaymentIntentId', '==', 'pi_cart').get();
  assert.equal(orders.size, 3);
  assert.ok(orders.docs.every(order => order.data().status === 'completed'));
  assert.equal(orders.docs.reduce((sum, order) => sum + order.data().stripeFee, 0), 91);
  assert.equal(orders.docs.reduce((sum, order) => sum + order.data().platformFee + order.data().sellerEarnings + order.data().stripeFee, 0), pricing.total);
});

test('concurrent webhook deliveries grant access and credit earnings exactly once', async () => {
  await seedOrder();
  await Promise.all([fulfillPayment(db, payment), fulfillPayment(db, payment), fulfillPayment(db, payment)]);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'completed');
  assert.equal((await db.doc('library/reader_book').get()).exists, true);
  await assertSucceeds(getDoc(doc(env.authenticatedContext('reader').firestore(), 'books/book/chapters/locked')));
});

test('mismatched payments leave all fulfillment data unchanged and can be retried', async () => {
  await seedOrder();
  await assert.rejects(fulfillPayment(db, { ...payment, amount_received: 1 }));
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'pending');
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  await fulfillPayment(db, payment);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'completed');
});

test('follow and unfollow retries keep the author count accurate', async () => {
  await Promise.all([updateFollow(db, 'reader', 'author', true), updateFollow(db, 'reader', 'author', true)]);
  assert.equal((await db.doc('sellers/author').get()).data()?.followersCount, 1);
  await Promise.all([updateFollow(db, 'reader', 'author', false), updateFollow(db, 'reader', 'author', false)]);
  assert.equal((await db.doc('sellers/author').get()).data()?.followersCount, 0);
  assert.equal((await db.doc('follows/reader_author').get()).exists, false);
});

test('only a purchaser can submit a verified review and retries do not inflate ratings', async () => {
  const review = { bookId: 'book', title: 'Great book', body: 'A thoughtful and enjoyable story.', stars: 4 };
  await assert.rejects(createPurchaseReview(db, 'reader', review), /Purchase/);
  assert.equal((await db.collection('reviews').get()).size, 0);
  await seedOrder();
  await fulfillPayment(db, payment);
  await createPurchaseReview(db, 'reader', review);
  await assert.rejects(createPurchaseReview(db, 'reader', review), /already reviewed/);
  assert.equal((await db.doc('books/book').get()).data()?.reviewCount, 1);
  assert.equal((await db.doc('books/book').get()).data()?.averageRating, 4);
  assert.equal((await db.doc('reviews/reader_book').get()).data()?.isVerifiedPurchase, true);
});

test('book deletion removes content and references, retaining financial history and unrelated books', async () => {
  const linked: Record<string, object> = {
    'library/reader_book': { userId: 'reader', bookId: 'book' },
    'wishlist/saved': { userId: 'reader', bookId: 'book' },
    'readingProgress/reader_book': { userId: 'reader', bookId: 'book' },
    'borrowRecords/borrow': { bookId: 'book' },
    'notifications/notice': { relatedBookId: 'book' },
    'promoCodes/code': { specificBookId: 'book' },
    'reviews/review': { bookId: 'book' },
    'reports/book-report': { targetType: 'book', targetId: 'book' },
    'reports/review-report': { targetType: 'review', targetId: 'review' },
    'privateBooks/book': { sellerId: 'author', manuscriptPath: 'manuscripts/author/book/raw.txt' },
    'privateBooks/book/archive/original': { text: 'private' },
    'books/book/chapters/locked/notes/nested': { text: 'nested' },
  };
  await Promise.all(Object.entries(linked).map(([path, data]) => db.doc(path).set(data)));
  await Promise.all([
    db.doc('books/keep').set({ sellerId: 'author', status: 'live' }),
    db.doc('wishlist/keep').set({ bookId: 'keep' }),
    db.doc('orders/receipt').set({ bookId: 'book', status: 'completed', finalPrice: 1000 }),
    db.doc('payouts/history').set({ sellerId: 'author', status: 'paid', amountCents: 800 }),
  ]);
  const fileCalls: string[][] = [];
  const deleteFiles = async (sellerId: string, bookId: string) => {
    fileCalls.push(bookFilePrefixes(sellerId, bookId));
    assert.equal((await db.doc('books/book').get()).data()?.status, 'removed');
    assert.equal((await db.doc('bookDeletions/book').get()).data()?.status, 'pending');
  };
  await deleteBookRecords(db, 'book', { deleteFiles });
  assert.deepEqual(fileCalls, [['covers/author/book/', 'manuscripts/author/book/']]);
  for (const path of ['books/book', 'books/book/chapters/locked', 'books/book/chapters/sample', ...Object.keys(linked)]) {
    assert.equal((await db.doc(path).get()).exists, false, path);
  }
  for (const path of ['books/keep', 'wishlist/keep', 'orders/receipt', 'payouts/history']) assert.equal((await db.doc(path).get()).exists, true, path);
  const marker = (await db.doc('bookDeletions/book').get()).data();
  assert.equal(marker?.status, 'complete');
  assert.equal(marker?.title, undefined);
  await deleteBookRecords(db, 'book', { deleteFiles: async () => undefined });
  assert.equal((await db.doc('bookDeletions/book').get()).data()?.status, 'complete');
  assert.throws(() => bookFilePrefixes('author/other', 'book'));
  assert.throws(() => bookFilePrefixes('author', ''));
});

test('interrupted deletion hides the book and blocks stale writes until cleanup resumes', async () => {
  const reader = env.authenticatedContext('reader').firestore();
  const author = env.authenticatedContext('author').firestore();
  await db.doc('library/reader_book').set({ userId: 'reader', bookId: 'book' });
  await assertSucceeds(setDoc(doc(reader, 'reports/before'), { reporterId: 'reader', targetType: 'book', targetId: 'book' }));
  await assertFails(deleteDoc(doc(author, 'books/book')));
  await assert.rejects(deleteBookRecords(db, 'book', { deleteFiles: async () => { throw new Error('Storage unavailable'); } }), /Storage unavailable/);
  assert.equal((await db.doc('bookDeletions/book').get()).data()?.status, 'pending');
  await assertFails(getDoc(doc(reader, 'books/book')));
  await assertFails(getDoc(doc(reader, 'books/book/chapters/locked')));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'books/book/chapters/sample')));
  await assertFails(setDoc(doc(reader, 'wishlist/stale'), { userId: 'reader', bookId: 'book' }));
  await assertFails(setDoc(doc(reader, 'readingProgress/reader_book'), { userId: 'reader', bookId: 'book' }));
  await assertFails(setDoc(doc(reader, 'reports/late'), { reporterId: 'reader', targetType: 'book', targetId: 'book' }));
  await assertFails(updateDoc(doc(author, 'books/book'), { title: 'Restored' }));
  await assert.rejects(publishBook(db, 'book', 'author'), /not found/i);
  await deleteBookRecords(db, 'book', { deleteFiles: async () => undefined });
  const draft = { sellerId: 'author', status: 'draft', copyrightReviewStatus: 'not_needed', publishedAt: null, totalSales: 0, totalBorrows: 0, reviewCount: 0, averageRating: 0, isFeatured: false };
  await assertFails(setDoc(doc(author, 'books/book'), draft));
  await assertFails(setDoc(doc(author, 'privateBooks/book'), { sellerId: 'author', manuscriptPath: 'manuscripts/author/book/raw.txt' }));
  await assertFails(setDoc(doc(author, 'books/book/chapters/stale'), { content: 'Restored' }));
  await assertSucceeds(setDoc(doc(author, 'books/new'), draft));
});

test('late and concurrent payments never resurrect a deleted book or duplicate earnings', async () => {
  await seedOrder();
  await deleteBookRecords(db, 'book', { deleteFiles: async () => undefined });
  await Promise.all([fulfillPayment(db, payment), fulfillPayment(db, payment)]);
  assert.equal((await db.doc('orders/order').get()).data()?.status, 'needs_review');
  assert.equal((await db.doc('books/book').get()).exists, false);
  assert.equal((await db.doc('library/reader_book').get()).exists, false);
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal((await db.doc('paymentFulfillments/pi_test').get()).data()?.status, 'needs_review');

  // Fresh identifier exercises either ordering of payment and deletion.
  await db.doc('books/race').set({ sellerId: 'author', status: 'live', totalSales: 0 });
  await db.doc('orders/race').set({ buyerId: 'reader', sellerId: 'author', bookId: 'race', bookTitle: 'Race', finalPrice: 1000, sellerEarnings: 800, stripePaymentIntentId: 'pi_race', status: 'pending' });
  await Promise.all([fulfillPayment(db, { ...payment, id: 'pi_race' }), deleteBookRecords(db, 'race', { deleteFiles: async () => undefined })]);
  await fulfillPayment(db, { ...payment, id: 'pi_race' });
  assert.equal((await db.doc('books/race').get()).exists, false);
  assert.equal((await db.doc('library/reader_race').get()).exists, false);
  const order = (await db.doc('orders/race').get()).data();
  assert.ok(['completed', 'needs_review'].includes(order?.status));
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, order?.status === 'completed' ? 800 : 0);
});

test('book file uploads require an existing draft owned by the uploader', async () => {
  const storage = env.authenticatedContext('author').storage();
  const file = (bookId: string, folder = 'covers') => ref(storage, `${folder}/author/${bookId}/file`);
  const bytes = new Uint8Array([1, 2, 3]);
  await assertFails(uploadBytes(file('missing'), bytes, { contentType: 'image/png' }));
  await assertFails(uploadBytes(file('book'), bytes, { contentType: 'image/png' }));
  await db.doc('books/upload').set({ sellerId: 'author', status: 'draft' });
  await assertSucceeds(uploadBytes(file('upload'), bytes, { contentType: 'image/png' }));
  await assertSucceeds(uploadBytes(file('upload', 'manuscripts'), bytes, { contentType: 'text/plain' }));
  await assertFails(uploadBytes(ref(env.authenticatedContext('reader').storage(), 'covers/author/upload/other'), bytes, { contentType: 'image/png' }));
  await deleteBookRecords(db, 'upload', { deleteFiles: async () => undefined });
  await assertFails(uploadBytes(file('upload'), bytes, { contentType: 'image/png' }));
  await assertFails(uploadBytes(file('upload', 'manuscripts'), bytes, { contentType: 'text/plain' }));
});
