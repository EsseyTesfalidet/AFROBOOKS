import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getMetadata, deleteObject } from 'firebase/storage';
import { PDFDocument } from 'pdf-lib';
import type { Bucket } from '@google-cloud/storage';
import { inspectMagazinePdf, verifyMagazinePdf, authorizedMagazineFile } from '../lib/server/magazinePdf';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fulfillPayment } from '../lib/server/fulfillPayment';
import { prepareBookGift, attachGiftPayment, findBookGift, claimBookGift, reviewGiftPayment } from '../lib/server/bookGifts';
import { deliverBookGift } from '../lib/server/giftEmail';
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
import { findOrCreateAuthorAccount } from '../lib/server/authorConnect';
import { connectFixture } from './connect-fixture';
import { recordLegalAgreement } from '../lib/server/legalAgreement';
import { LEGAL_VERSION, hasCurrentAgreement } from '../lib/legal';
import { submitPromotion, reviewPromotion, promotionCandidates, recordPromotionEvent, savePromotionSettings } from '../lib/server/promotions';
import { preparePromotionCheckout, createPromotionCheckout, fulfillPromotionCheckout, reviewPromotionCharge, expirePromotionCheckout, resolvePromotionPayment, reconcilePromotionRefund } from '../lib/server/promotionPayments';
import { PROMOTION_TERMS_VERSION } from '../lib/promotions';
import { FOLLOWUP_DELAY, processAuthorPayoutReminder, type ReminderGateway } from '../functions/src/notifications/authorPayoutReminders';
import type { ConnectedAccount } from '../functions/src/stripe/accountReadiness';
import type { ReminderEmail } from '../functions/src/notifications/payoutReminderEmail';
import type { Promotion } from '../types/promotion';
import { promotionFixture, promotionStripeFixture, author as promotionAuthor, admin as promotionAdmin } from './promotion-fixture';

const projectId = 'demo-afrobooks-security';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Integration tests require the local Firestore emulator');
let env: RulesTestEnvironment;
const adminApp = initializeApp({ projectId }, 'integration');
const db = getFirestore(adminApp);
const profile = { uid: 'reader', role: 'buyer', status: 'active', subscriptionStatus: 'none', subscriptionPlan: 'none', subscriptionId: null, stripeCustomerId: null, referralCredits: 0 };

test('notification deletion is limited to its owner and admins and never deletes an order', async () => {
  await db.doc('notifications/notice').set({ userId: 'reader', title: 'Purchase', isRead: false });
  await db.doc('orders/purchase').set({ buyerId: 'reader', status: 'completed' });
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), 'notifications/notice')));
  await assertFails(deleteDoc(doc(env.authenticatedContext('author').firestore(), 'notifications/notice')));
  const reader = env.authenticatedContext('reader').firestore();
  await assertFails(updateDoc(doc(reader, 'notifications/notice'), { userId: 'author' }));
  await assertSucceeds(deleteDoc(doc(reader, 'notifications/notice')));
  assert.equal((await db.doc('notifications/notice').get()).exists, false);
  assert.equal((await db.doc('orders/purchase').get()).data()?.status, 'completed');
  await db.doc('notifications/notice').set({ userId: 'reader', title: 'Purchase', isRead: false });
  await db.doc('users/reader').update({ status: 'suspended' });
  await assertFails(deleteDoc(doc(reader, 'notifications/notice')));
  await assertSucceeds(deleteDoc(doc(env.authenticatedContext('admin').firestore(), 'notifications/notice')));
});

test('suspended accounts lose paid content, profile writes and uploads even with an existing token', async () => {
  await db.doc('library/reader_book').set({ userId: 'reader', bookId: 'book' });
  const reader = env.authenticatedContext('reader').firestore();
  await assertSucceeds(getDoc(doc(reader, 'books/book/chapters/locked')));
  await db.doc('users/reader').update({ status: 'suspended' });
  await assertFails(getDoc(doc(reader, 'books/book/chapters/locked')));
  await assertFails(getDoc(doc(reader, 'library/reader_book')));
  await assertFails(updateDoc(doc(reader, 'users/reader'), { firstName: 'Changed' }));
  await assertFails(uploadBytes(ref(env.authenticatedContext('reader').storage(), 'avatars/reader/blocked.png'), new Uint8Array([1]), { contentType: 'image/png' }));
  await db.doc('users/reader').update({ status: 'warned' });
  await assertSucceeds(getDoc(doc(reader, 'books/book/chapters/locked')));
});

test('database role changes override stale admin claims in Firestore and Storage', async () => {
  const staleAdmin = env.authenticatedContext('reader', { role: 'admin' });
  await assertFails(getDoc(doc(staleAdmin.firestore(), 'users/author')));
  const path = `verification/author/${Date.now()}.pdf`;
  await assertSucceeds(uploadBytes(ref(env.authenticatedContext('author').storage(), path), new Uint8Array([1]), { contentType: 'application/pdf' }));
  await assertFails(getMetadata(ref(staleAdmin.storage(), path)));
  const admin = env.authenticatedContext('admin', { role: 'admin' });
  await assertSucceeds(getMetadata(ref(admin.storage(), path)));
  await db.doc('users/admin').update({ role: 'buyer' });
  await assertFails(getMetadata(ref(admin.storage(), path)));
  await assertFails(getDoc(doc(admin.firestore(), 'users/author')));
});

test('PDF issues validate uploads, publish, and grant private file access only after purchase', async () => {
  const document = await PDFDocument.create(); document.addPage().drawText('Magazine with original layout'); document.addPage();
  const bytes = await document.save();
  assert.equal(await inspectMagazinePdf(bytes), 2);
  await assert.rejects(inspectMagazinePdf(new Uint8Array([1, 2, 3])));
  await db.doc('books/issue').set({ sellerId: 'author', title: 'Culture Review', authorName: 'Community Press', genre: 'History', publicationType: 'magazine', contentFormat: 'pdf', issueLabel: 'October', status: 'draft', price: 299, chapterCount: 0, copyrightBasis: 'original', copyrightAttestationAccepted: true });
  await assert.rejects(publishBook(db, 'issue', 'author'), /verify/);
  const path = 'magazines/author/issue/test.pdf';
  const bucket = { file: () => ({ getMetadata: async () => [{ contentType: 'application/pdf', size: bytes.length, generation: '123' }], download: async () => [bytes] }) } as unknown as Bucket;
  await assert.rejects(verifyMagazinePdf(db, bucket, 'issue', 'reader', path), /Invalid/);
  await assert.rejects(verifyMagazinePdf(db, bucket, 'issue', 'author', 'magazines/author/other/test.pdf'), /Invalid/);
  await verifyMagazinePdf(db, bucket, 'issue', 'author', path);
  assert.equal(await publishBook(db, 'issue', 'author'), 'in_review');
  await db.doc('books/issue').update({ status: 'live' });
  await assert.rejects(authorizedMagazineFile(db, 'issue', { uid: 'reader', role: 'buyer' }), /access/);
  const buyer = env.authenticatedContext('reader').firestore();
  await assertFails(getDoc(doc(buyer, 'publicationFiles/issue')));
  await assertFails(setDoc(doc(env.authenticatedContext('author').firestore(), 'publicationFiles/issue'), { path: 'fake' }));
  await db.doc('orders/issue-order').set({ buyerId: 'reader', bookId: 'issue', bookTitle: 'Culture Review — October', sellerId: 'author', finalPrice: 299, sellerEarnings: 220, status: 'pending', stripePaymentIntentId: 'pi_issue' });
  await fulfillPayment(db, { id: 'pi_issue', amount_received: 299, currency: 'usd', metadata: { userId: 'reader' } });
  assert.equal((await authorizedMagazineFile(db, 'issue', { uid: 'reader', role: 'buyer' })).path, path);
  await assert.rejects(authorizedMagazineFile(db, 'issue', { uid: 'other', role: 'buyer' }), /access/);
  await db.doc('bookDeletions/issue').set({ status: 'pending' });
  await assert.rejects(authorizedMagazineFile(db, 'issue', { uid: 'reader', role: 'buyer' }), /access/);
});

test('PDF Storage uploads require an owned magazine draft and cannot be read, replaced or deleted by clients', async () => {
  await db.doc('books/pdf-issue').set({ sellerId: 'author', publicationType: 'magazine', contentFormat: 'pdf', status: 'draft' });
  const uploadPath = `magazines/author/pdf-issue/${Date.now()}.pdf`;
  const authorFile = ref(env.authenticatedContext('author').storage(), uploadPath);
  const bytes = new Uint8Array([37, 80, 68, 70, 45]);
  await assertFails(uploadBytes(ref(env.authenticatedContext('reader').storage(), 'magazines/author/pdf-issue/other.pdf'), bytes, { contentType: 'application/pdf' }));
  await assertSucceeds(uploadBytes(authorFile, bytes, { contentType: 'application/pdf' }));
  await assertFails(uploadBytes(authorFile, bytes, { contentType: 'application/pdf' }));
  await assertFails(getMetadata(authorFile));
  await assertFails(getMetadata(ref(env.unauthenticatedContext().storage(), uploadPath)));
  await assertFails(deleteObject(authorFile));
  await db.doc('books/pdf-issue').update({ status: 'live' });
  await assertFails(uploadBytes(ref(env.authenticatedContext('author').storage(), 'magazines/author/pdf-issue/new.pdf'), bytes, { contentType: 'application/pdf' }));
});

test('short stories can publish at ten cents while ordinary books retain their price minimum', async () => {
  await db.doc('books/story').set({ sellerId: 'author', title: 'A brief story', authorName: 'Author', genre: 'Fiction', publicationType: 'short_story', contentFormat: 'text', status: 'draft', price: 10, chapterCount: 1, copyrightBasis: 'original', copyrightAttestationAccepted: true });
  await db.doc('books/story/chapters/one').set({ chapterNumber: 1, content: '<p>A complete short story.</p>' });
  assert.equal(await publishBook(db, 'story', 'author'), 'in_review');
  await db.doc('books/story').update({ status: 'draft', publicationType: 'book' });
  await assert.rejects(publishBook(db, 'story', 'author'), /0.50/);
});

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

const giftRecipient = { uid: 'recipient', email: 'friend@example.test', emailVerified: true };
const giftInput = {
  senderId: 'reader', senderName: 'Alex', recipientEmail: giftRecipient.email, message: 'Enjoy this story!',
  attemptId: 'e85c20fc-031a-43ba-a289-383c25ae1823',
  order: { buyerId: 'reader', buyerEmail: 'sender@example.test', bookId: 'book', bookTitle: 'Story', sellerId: 'author', finalPrice: 1000, sellerEarnings: 800, status: 'pending' },
};
async function giftFixture(paid = true) {
  await db.doc('books/book').update({ chapterCount: 2 });
  await db.doc('users/recipient').set({ ...profile, uid: 'recipient', email: giftRecipient.email });
  const prepared = await prepareBookGift(db, giftInput);
  await attachGiftPayment(db, prepared.id, 'pi_gift');
  const payment = { id: 'pi_gift', amount_received: 1000, currency: 'usd', metadata: { userId: 'reader', bookIds: 'book', purchaseType: 'books', giftId: prepared.id } };
  if (paid) await fulfillPayment(db, payment);
  const gift = await db.doc(`bookGifts/${prepared.id}`).get();
  return { ...prepared, ref: gift.ref, token: gift.data()!.claimToken, payment, confirmed: { ...payment, status: 'succeeded', refunded: false, disputed: false } };
}

test('concurrent gift checkout preparation saves one immutable private order and retry token', async () => {
  const results = await Promise.all([prepareBookGift(db, giftInput), prepareBookGift(db, giftInput)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await db.collection('bookGifts').get()).size, 1);
  assert.equal((await db.collection('orders').get()).size, 1);
  await assert.rejects(prepareBookGift(db, { ...giftInput, recipientEmail: 'different@example.test' }), /details or book price changed/);
  await assert.rejects(prepareBookGift(db, { ...giftInput, order: { ...giftInput.order, finalPrice: 2000 } }), /details or book price changed/);
  await attachGiftPayment(db, results[0].id, 'pi_gift');
  assert.equal((await prepareBookGift(db, giftInput)).paymentIntentId, 'pi_gift');
  await assert.rejects(attachGiftPayment(db, results[0].id, 'pi_duplicate'), /mismatch/);
  const order = (await db.doc(`orders/${results[0].orderId}`).get()).data()!;
  assert.equal(order.recipientEmail, undefined); assert.equal(order.message, undefined); assert.equal(order.claimToken, undefined);
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('reader'), env.authenticatedContext('author'), env.authenticatedContext('admin')]) {
    const client = context.firestore();
    await assertFails(getDoc(doc(client, `bookGifts/${results[0].id}`)));
    await assertFails(setDoc(doc(client, `bookGifts/${results[0].id}`), { status: 'claimed' }));
  }
});

test('gift fulfillment retries credit the author once and never grant sender access', async () => {
  const gift = await giftFixture(false);
  await Promise.all([fulfillPayment(db, gift.payment), fulfillPayment(db, gift.payment)]);
  assert.equal((await gift.ref.get()).data()?.status, 'available');
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  assert.equal((await db.doc('books/book').get()).data()?.totalSales, 1);
  assert.equal((await db.collection('library').get()).size, 0);
  await assertFails(getDoc(doc(env.authenticatedContext('reader').firestore(), 'books/book/chapters/locked')));
});

test('concurrent gift claims grant one entitlement and notify sender once', async () => {
  const gift = await giftFixture();
  assert.equal((await findBookGift(db, gift.token)).id, gift.id);
  await assert.rejects(findBookGift(db, 'f'.repeat(64)), /invalid/);
  const results = await Promise.all([claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), claimBookGift(db, gift.ref, giftRecipient, gift.confirmed)]);
  assert.ok(results.every(result => result.claimed));
  assert.equal((await db.collection('library').get()).size, 1);
  assert.equal((await gift.ref.get()).data()?.recipientId, 'recipient');
  assert.equal((await db.doc('library/recipient_book').get()).data()?.orderId, gift.orderId);
  assert.equal((await db.doc('notifications/' + gift.id + '_claimed_sender').get()).data()?.userId, 'reader');
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 800);
  await assertSucceeds(getDoc(doc(env.authenticatedContext('recipient').firestore(), 'books/book/chapters/locked')));
  await assertFails(getDoc(doc(env.authenticatedContext('reader').firestore(), 'books/book/chapters/locked')));
  await assert.rejects(claimBookGift(db, gift.ref, { ...giftRecipient, uid: 'new-account' }, gift.confirmed), /not available/);
});

test('gift claims reject wrong or unverified identities and unpaid or mismatched payments', async () => {
  const gift = await giftFixture(false);
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /not available/);
  await fulfillPayment(db, gift.payment);
  await assert.rejects(claimBookGift(db, gift.ref, { ...giftRecipient, email: 'other@example.test' }, gift.confirmed), /Sign in/);
  await assert.rejects(claimBookGift(db, gift.ref, { ...giftRecipient, emailVerified: false }, gift.confirmed), /Verify/);
  for (const change of [{ refunded: true }, { disputed: true }, { status: 'processing' }, { amount_received: 500 }, { currency: 'eur' }, { id: 'pi_other' }]) await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, { ...gift.confirmed, ...change }), /payment.*review/);
  assert.equal((await db.collection('library').get()).size, 0);
  assert.equal((await gift.ref.get()).data()?.status, 'available');
});

test('an owned book leaves a gift unclaimed but a subscription copy can become a gift purchase', async () => {
  const gift = await giftFixture();
  await db.doc('library/recipient_book').set({ userId: 'recipient', bookId: 'book', purchaseType: 'bought', orderId: 'other' });
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /already own/);
  assert.equal((await gift.ref.get()).data()?.status, 'available');
  assert.equal((await db.doc('library/recipient_book').get()).data()?.orderId, 'other');
  await db.doc('library/recipient_book').update({ purchaseType: 'subscription' });
  await claimBookGift(db, gift.ref, giftRecipient, gift.confirmed);
  assert.equal((await db.doc('library/recipient_book').get()).data()?.purchaseType, 'bought');
});

test('gifts cannot unlock removed or incomplete books or suspended recipients', async () => {
  const gift = await giftFixture();
  await db.doc('users/recipient').update({ status: 'suspended' });
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /account/);
  await db.doc('users/recipient').update({ status: 'active' });
  await db.doc('books/book').update({ chapterCount: 3 });
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /unavailable/);
  await db.doc('books/book').update({ chapterCount: 2 });
  await db.doc('bookDeletions/book').set({ status: 'pending' });
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /unavailable/);
  assert.equal((await db.collection('library').get()).size, 0);
});

test('gift refund review revokes the gift copy and is safe against stale success webhooks', async () => {
  const gift = await giftFixture();
  await claimBookGift(db, gift.ref, giftRecipient, gift.confirmed);
  await reviewGiftPayment(db, gift.confirmed.id);
  await fulfillPayment(db, gift.payment);
  assert.equal((await gift.ref.get()).data()?.status, 'needs_review');
  assert.equal((await db.doc('library/recipient_book').get()).exists, false);
  await assert.rejects(claimBookGift(db, gift.ref, giftRecipient, gift.confirmed), /not available/);
  await db.doc('library/recipient_book').set({ orderId: 'separate_purchase', purchaseType: 'bought' });
  await reviewGiftPayment(db, gift.confirmed.id);
  assert.equal((await db.doc('library/recipient_book').get()).data()?.orderId, 'separate_purchase');
});

test('gift review before a delayed success event prevents fulfillment and author credit', async () => {
  const gift = await giftFixture(false);
  await reviewGiftPayment(db, gift.confirmed.id);
  await fulfillPayment(db, gift.payment);
  assert.equal((await db.doc(`orders/${gift.orderId}`).get()).data()?.status, 'needs_review');
  assert.equal((await db.doc('sellers/author').get()).data()?.pendingBalance, 0);
  assert.equal((await gift.ref.get()).data()?.status, 'needs_review');
});

test('gift email retries preserve the provider key and exact payload after a lost response', async () => {
  const gift = await giftFixture();
  const config = { appUrl: 'https://example.test', apiKey: 'test', from: 'AfroBooks <gift@example.test>' };
  const calls: { email: ReminderEmail; key: string }[] = [];
  const send = async (_apiKey: string, email: ReminderEmail, key: string) => {
    calls.push({ email, key });
    if (calls.length === 1) throw new Error('Response lost');
    return 'email_1';
  };
  await assert.rejects(deliverBookGift(db, gift.id, { config, send }), /not been confirmed/);
  assert.equal((await gift.ref.get()).data()?.emailStatus, 'failed');
  await deliverBookGift(db, gift.id, { config: { ...config, appUrl: 'https://new.example.test' }, send });
  assert.deepEqual(calls[0], calls[1]);
  assert.equal((await gift.ref.get()).data()?.emailStatus, 'sent');
  await deliverBookGift(db, gift.id, { config, send });
  assert.equal(calls.length, 2);
});

test('gift email uses a lease under concurrency and stops ambiguous attempts outside idempotency window', async () => {
  const gift = await giftFixture();
  const config = { appUrl: 'https://example.test', apiKey: 'test', from: 'gift@example.test' };
  let calls = 0;
  const send = async () => { calls++; return 'email_1'; };
  await Promise.allSettled([deliverBookGift(db, gift.id, { config, send }), deliverBookGift(db, gift.id, { config, send })]);
  assert.equal(calls, 1);
  await gift.ref.update({ emailStatus: 'failed', emailStartedAt: Date.now() - 24 * 60 * 60 * 1000 });
  await deliverBookGift(db, gift.id, { config, send });
  assert.equal(calls, 1);
  assert.equal((await gift.ref.get()).data()?.emailStatus, 'needs_review');
});

test('legal acceptance is server-stamped, versioned, idempotent and private to the account', async () => {
  const input = { termsAccepted: true, privacyAcknowledged: true, version: LEGAL_VERSION };
  const first = await recordLegalAgreement(db, 'reader', input);
  const second = await recordLegalAgreement(db, 'reader', input);
  assert.deepEqual(second, first);
  assert.ok(first.acceptedAt > 0);
  assert.equal(hasCurrentAgreement((await db.doc('users/reader').get()).data()), true);
  const receipt = `legalAgreements/reader/versions/${LEGAL_VERSION}`;
  assert.equal((await db.collection('legalAgreements/reader/versions').get()).size, 1);
  await assertSucceeds(getDoc(doc(env.authenticatedContext('reader').firestore(), receipt)));
  await assertFails(getDoc(doc(env.authenticatedContext('author').firestore(), receipt)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), receipt)));
  await assertFails(updateDoc(doc(env.authenticatedContext('reader').firestore(), receipt), { acceptedAt: 1 }));
  await assertFails(updateDoc(doc(env.authenticatedContext('reader').firestore(), 'users/reader'), { legalAgreement: { ...first, acceptedAt: 1 } }));
});

test('legal acceptance rejects unchecked, outdated or forged requests without recording agreement', async () => {
  for (const input of [null, { termsAccepted: false, privacyAcknowledged: true, version: LEGAL_VERSION }, { termsAccepted: true, privacyAcknowledged: false, version: LEGAL_VERSION }, { termsAccepted: true, privacyAcknowledged: true, version: 'old' }, { termsAccepted: true, privacyAcknowledged: true, version: LEGAL_VERSION, acceptedAt: 1 }]) {
    await assert.rejects(recordLegalAgreement(db, 'reader', input));
  }
  assert.equal(hasCurrentAgreement((await db.doc('users/reader').get()).data()), false);
  assert.equal((await db.collection('legalAgreements/reader/versions').get()).empty, true);
  const fresh = env.authenticatedContext('new-reader').firestore();
  await assertFails(setDoc(doc(fresh, 'users/new-reader'), { ...profile, uid: 'new-reader', legalAgreement: { termsVersion: LEGAL_VERSION, privacyVersion: LEGAL_VERSION, acceptedAt: Date.now() } }));
  await assertSucceeds(setDoc(doc(fresh, 'users/new-reader'), { ...profile, uid: 'new-reader' }));
});

test('agreement recording cannot recreate deleted accounts or accept for suspended accounts', async () => {
  const input = { termsAccepted: true, privacyAcknowledged: true, version: LEGAL_VERSION };
  await db.doc('users/reader').delete();
  await assert.rejects(recordLegalAgreement(db, 'reader', input), /Unauthorized/);
  assert.equal((await db.doc('users/reader').get()).exists, false);
  await db.doc('users/author').update({ status: 'suspended' });
  await assert.rejects(recordLegalAgreement(db, 'author', input), /Unauthorized/);
  assert.equal((await db.collection('legalAgreements/author/versions').get()).empty, true);
});

test('author Connect creates and saves one owned v2 account, then reuses it without country selection', async () => {
  const fixture = connectFixture();
  const user = { uid: 'author', email: 'author@example.test' };
  const first = await findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user, 'US');
  const second = await findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user);
  assert.equal(first.account.id, second.account.id);
  assert.equal(second.version, 'v2');
  assert.equal(fixture.state.creates.length, 1);
  assert.equal((await db.doc('sellers/author').get()).data()?.stripeAccountApiVersion, 'v2');
  fixture.state.ownerOverride = 'other';
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user), /ownership review/);
});

test('author Connect recovers lost account links and rejects ambiguous ownership without creating another account', async () => {
  const fixture = connectFixture();
  const user = { uid: 'author', email: null };
  fixture.state.accounts.push({ id: 'acct_recovered', metadata: { userId: 'author' }, version: 'v2' });
  const recovered = await findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user);
  assert.equal(recovered.account.id, 'acct_recovered');
  assert.equal(recovered.version, 'v2');
  assert.equal(fixture.state.creates.length, 0);
  await db.doc('sellers/author').set({});
  fixture.state.accounts.push({ id: 'acct_legacy', metadata: { userId: 'author' }, version: 'v1' });
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user, 'US'), /Multiple Stripe accounts/);
  assert.equal((await db.doc('sellers/author').get()).data()?.stripeAccountId, undefined);
  fixture.state.accounts.shift();
  const legacy = await findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user);
  assert.equal(legacy.version, 'v1');
  assert.equal(fixture.state.creates.length, 0);
});

test('author Connect refuses invalid countries, missing sellers and failed recovery scans', async () => {
  const fixture = connectFixture();
  const user = { uid: 'author', email: null };
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user), /Choose the country/);
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user, 'XX'), /supported by Stripe/);
  fixture.state.legacyListError = new Error('Recovery scan unavailable');
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user, 'US'), /Recovery scan unavailable/);
  await db.doc('sellers/author').delete();
  await assert.rejects(findOrCreateAuthorAccount(db, fixture.stripe, fixture.connect, user, 'US'), /author account is required/);
  assert.equal(fixture.state.creates.length, 0);
});

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

test('deleting a book preserves completed campaign history without a new refund review', async () => {
  const then = Date.now() - 8 * 86400000;
  const id = await promotionFixture(db, 900, then);
  await preparePromotionCheckout(db, promotionAuthor, id, then);
  const fixture = promotionStripeFixture(id);
  await fulfillPromotionCheckout(db, fixture.session, fixture.paid(), true, then);
  await deleteBookRecords(db, 'book', { deleteFiles: async () => {} });
  const item = (await db.doc(`bookPromotions/${id}`).get()).data() as Promotion;
  assert.equal(item.status, 'active');
  assert.ok(item.endsAt < Date.now());
  assert.equal((await promotionCandidates(db)).length, 0);
  assert.equal((await db.doc('books/book').get()).exists, false);
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
  assert.deepEqual(fileCalls, [['covers/author/book/', 'manuscripts/author/book/', 'magazines/author/book/']]);
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

function reminderFixture() {
  const state = {
    account: { id: 'acct_author', metadata: { userId: 'author' }, details_submitted: false } as ConnectedAccount,
    accountCalls: 0, loseResponse: false,
    accepted: new Map<string, ReminderEmail>(), calls: [] as string[],
  };
  const gateway: ReminderGateway = {
    appUrl: 'https://afrobs.com', from: 'AfroBooks <noreply@example.test>',
    account: async () => { state.accountCalls++; return state.account; },
    sendEmail: async (email, key) => {
      state.calls.push(key);
      state.accepted.set(key, email);
      if (state.loseResponse) { state.loseResponse = false; throw new Error('Provider response lost'); }
      return `email_${state.accepted.size}`;
    },
  };
  return { gateway, state };
}

test('payout reminders create one private notification and one email under concurrent runs, then one seven-day follow-up', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await Promise.all(Array.from({ length: 4 }, () => processAuthorPayoutReminder(db, 'author', gateway, now)));
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal(state.calls.length, 1);
  assert.equal(state.accountCalls, 0);
  const notification = await db.doc('notifications/payout_setup_author_initial').get();
  assert.equal(notification.data()?.actionUrl, '/dashboard?profile=payout');
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY - 1);
  assert.equal(state.calls.length, 1);
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY);
  assert.equal(state.calls.length, 2);
  assert.equal((await db.collection('notifications').get()).size, 2);
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY * 4);
  assert.equal(state.calls.length, 2);
  const authorDb = env.authenticatedContext('author').firestore();
  await assertSucceeds(getDoc(doc(authorDb, notification.ref.path)));
  await assertFails(getDoc(doc(env.authenticatedContext('reader').firestore(), notification.ref.path)));
  await assertFails(getDoc(doc(authorDb, 'authorPayoutReminders/author')));
  await assertFails(getDoc(doc(authorDb, 'authorPayoutReminders/author/emails/initial')));
  await assertFails(setDoc(doc(authorDb, 'authorPayoutReminders/author'), { initialAt: 0 }));
  await assertFails(updateDoc(doc(authorDb, notification.ref.path), { actionUrl: 'https://attacker.test' }));
});

test('fresh Stripe readiness cancels queued reminders and marks old setup messages read', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await processAuthorPayoutReminder(db, 'author', { ...gateway, sendEmail: undefined }, now);
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author', stripeAccountStatus: 'pending' });
  state.account = { ...state.account, details_submitted: true, payouts_enabled: true, capabilities: { transfers: 'active' } };
  assert.equal(await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY), 'ready');
  assert.equal(state.calls.length, 0);
  assert.equal((await db.doc('authorPayoutReminders/author/emails/initial').get()).data()?.status, 'cancelled');
  assert.equal((await db.doc('sellers/author').get()).data()?.stripeAccountStatus, 'active');
  assert.equal((await db.doc('notifications/payout_setup_author_initial').get()).data()?.isRead, true);
  assert.equal((await db.doc('notifications/payout_setup_author_followup').get()).exists, false);
});

test('Stripe review produces one distinct in-app status and no setup emails until action is required', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author' });
  state.account = { ...state.account, requirements: { currently_due: ['identity'], pending_verification: ['identity'] } };
  await processAuthorPayoutReminder(db, 'author', gateway, now);
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY);
  assert.equal(state.calls.length, 0);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.match((await db.doc('notifications/payout_setup_author_review').get()).data()?.message, /reviewing/);
  state.account.requirements = { currently_due: ['external_account'], pending_verification: [] };
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY + 1);
  assert.equal(state.calls.length, 1);
  assert.ok(state.calls[0].endsWith('/initial'));
  assert.equal((await db.doc('notifications/payout_setup_author_review').get()).data()?.isRead, true);
});

test('queued email retries use an identical payload and key after a lost response without duplicating notifications', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  state.loseResponse = true;
  await assert.rejects(processAuthorPayoutReminder(db, 'author', gateway, now), /response lost/);
  assert.equal((await db.doc('authorPayoutReminders/author/emails/initial').get()).data()?.status, 'sending');
  await processAuthorPayoutReminder(db, 'author', gateway, now + 1000);
  assert.equal(state.calls.length, 1, 'Lease prevents an immediate concurrent resend');
  const original = state.accepted.values().next().value;
  await processAuthorPayoutReminder(db, 'author', { ...gateway, from: 'Changed <new@example.test>' }, now + 3600000);
  assert.equal(state.calls.length, 2);
  assert.equal(state.accepted.size, 1);
  assert.deepEqual(state.accepted.values().next().value, original);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal((await db.doc('authorPayoutReminders/author/emails/initial').get()).data()?.status, 'sent');
});

test('old ambiguous email attempts require review instead of resending outside provider deduplication window', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  state.loseResponse = true;
  await assert.rejects(processAuthorPayoutReminder(db, 'author', gateway, now));
  await processAuthorPayoutReminder(db, 'author', gateway, now + 24 * 3600000);
  assert.equal(state.calls.length, 1);
  assert.equal((await db.doc('authorPayoutReminders/author/emails/initial').get()).data()?.status, 'needs_review');
});

test('in-app reminders work without email configuration and late activation sends only the current follow-up', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await processAuthorPayoutReminder(db, 'author', { ...gateway, sendEmail: undefined }, now);
  assert.equal((await db.collection('notifications').get()).size, 1);
  assert.equal((await db.doc('authorPayoutReminders/author/emails/initial').get()).data()?.status, 'pending');
  await processAuthorPayoutReminder(db, 'author', gateway, now + FOLLOWUP_DELAY);
  assert.equal(state.calls.length, 1);
  assert.ok(state.calls[0].endsWith('/followup'));
});

test('reminders skip removed, suspended, buyer-only and held accounts and reject mismatched Stripe ownership', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await db.doc('users/author').update({ status: 'suspended' });
  await processAuthorPayoutReminder(db, 'author', gateway, now);
  await db.doc('users/author').update({ status: 'active', role: 'buyer' });
  await processAuthorPayoutReminder(db, 'author', gateway, now);
  await db.doc('users/author').update({ role: 'seller' });
  await db.doc('sellers/author').update({ payoutHoldReason: 'payment_review' });
  await processAuthorPayoutReminder(db, 'author', gateway, now);
  await db.doc('sellers/author').update({ payoutHoldReason: null, stripeAccountId: 'acct_author' });
  state.account.metadata = { userId: 'someone_else' };
  await assert.rejects(processAuthorPayoutReminder(db, 'author', gateway, now), /ownership/);
  await db.doc('users/author').delete();
  await processAuthorPayoutReminder(db, 'author', gateway, now);
  assert.equal(state.calls.length, 0);
  assert.equal((await db.collection('notifications').get()).size, 0);
});

test('a newer readiness check wins when onboarding completes during reminder preparation', async () => {
  const { gateway, state } = reminderFixture();
  const now = Date.now();
  await db.doc('sellers/author').update({ stripeAccountId: 'acct_author' });
  gateway.account = async () => {
    await db.doc('sellers/author').update({ stripeAccountStatus: 'active', stripeAccountCheckedAt: new Date(now + 1) });
    return state.account;
  };
  assert.equal(await processAuthorPayoutReminder(db, 'author', gateway, now), 'skipped');
  assert.equal(state.calls.length, 0);
  assert.equal((await db.collection('notifications').get()).size, 0);
});
