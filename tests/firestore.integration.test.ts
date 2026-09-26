import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, getDocs } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { fulfillPayment } from '../lib/server/fulfillPayment';
import { updateFollow, createPurchaseReview } from '../lib/server/social';

const projectId = 'demo-afrobooks-security';
assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Integration tests require the local Firestore emulator');
let env: RulesTestEnvironment;
const adminApp = initializeApp({ projectId }, 'integration');
const db = getFirestore(adminApp);
const profile = { uid: 'reader', role: 'buyer', status: 'active', subscriptionStatus: 'none', subscriptionPlan: 'none', subscriptionId: null, stripeCustomerId: null, referralCredits: 0 };

before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
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
