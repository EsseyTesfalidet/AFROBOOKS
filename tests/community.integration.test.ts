import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { communityFeed, communityThread, mutateCommunity } from '../lib/server/community';

assert.match(process.env.FIRESTORE_EMULATOR_HOST ?? '', /^(127\.0\.0\.1|localhost):\d+$/, 'Use the local Firestore emulator.');
// Keep this suite isolated when it runs alongside the core rules tests.
const projectId = 'demo-afrobooks-community';
const app = initializeApp({ projectId }, 'community-tests');
const db = getFirestore(app);
let env: RulesTestEnvironment;
const now = 1800000000000;
const memory = () => ({ action: 'create', kind: 'memory', title: 'A childhood story about a clever bird', body: 'I heard this from my grandmother in the village.', country: 'Eritrea', language: 'Tigrinya', attemptId: randomUUID() });
async function create(uid = 'reader', input = memory(), time = now) {
  const result = await mutateCommunity(db, uid, input, time);
  assert.ok(result.id);
  return result.id;
}
async function reply(postId: string, uid = 'helper', time = now, parentReplyId: string | null = null) {
  const result = await mutateCommunity(db, uid, { action: 'reply', postId, parentReplyId, body: 'I remember that story too. Here is a lead.', attemptId: randomUUID() }, time);
  assert.ok(result.id);
  return result.id;
}

before(async () => { env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } }); });
beforeEach(async () => {
  await env.clearFirestore();
  for (const uid of ['reader', 'helper', 'stranger', 'admin', 'blocked']) {
    await db.doc(`users/${uid}`).set({ uid, role: uid === 'admin' ? 'admin' : 'buyer', status: uid === 'blocked' ? 'suspended' : 'active', firstName: uid, email: `${uid}@private.test`, phone: 'private' });
  }
});
after(async () => { await env?.cleanup(); await deleteApp(app); });

test('only active accounts participate and only admins publish or feature questions', async () => {
  for (const uid of ['blocked', 'missing']) await assert.rejects(create(uid), /account/);
  await assert.rejects(create('reader', { ...memory(), kind: 'weekly' }), /Administrator/);
  const first = await create('admin', { ...memory(), kind: 'weekly' });
  const second = await create('admin', { ...memory(), kind: 'weekly', title: 'What did your family cook on special occasions?' }, now + 31000);
  let feed = await communityFeed(db, 'weekly', null);
  assert.equal(feed.featured?.id, second);
  assert.equal(feed.posts.length, 2);
  await assert.rejects(mutateCommunity(db, 'reader', { action: 'feature', postId: first }), /Administrator/);
  await mutateCommunity(db, 'admin', { action: 'feature', postId: first });
  feed = await communityFeed(db, 'weekly', null);
  assert.equal(feed.featured?.id, first);
  await mutateCommunity(db, 'admin', { action: 'moderate', postId: first, hidden: true });
  assert.equal((await communityFeed(db, 'weekly', null)).featured, null);
  await assert.rejects(mutateCommunity(db, 'helper', { action: 'reply', postId: first, body: 'My experience', attemptId: randomUUID() }), /no longer available/);
});

test('retries and concurrent submissions publish once, count once, and notify each recipient once', async () => {
  const input = memory();
  const posts = await Promise.all([create('reader', input), create('reader', input)]);
  assert.equal(posts[0], posts[1]);
  const postId = posts[0];
  const action = { action: 'reply', attemptId: randomUUID(), postId, body: 'Here is the version I remember.' };
  const results = await Promise.all([mutateCommunity(db, 'helper', action, now), mutateCommunity(db, 'helper', action, now)]);
  assert.equal(results[0].id, results[1].id);
  assert.equal((await communityThread(db, postId, null)).post.replyCount, 1);
  assert.equal((await db.collection('notifications').get()).size, 1);
  await reply(postId, 'stranger', now, results[0].id!);
  assert.equal((await db.collection('notifications').get()).size, 3);
  await reply(postId, 'reader');
  assert.equal((await db.collection('notifications').get()).size, 3, 'Authors are not notified about their own replies');
  const thread = await communityThread(db, postId, null);
  assert.equal(JSON.stringify(thread).includes('@private.test'), false);
  assert.equal(JSON.stringify(thread).includes('phone'), false);
  await assert.rejects(create('reader', memory(), now + 1000), /wait/);
  await assert.rejects(reply(postId, 'helper', now + 1000), /wait/);
});

test('only the request author marks a real reply, moderation clears found state and maintains counts', async () => {
  const postId = await create();
  const replyId = await reply(postId);
  const ownReply = await reply(postId, 'reader');
  await assert.rejects(mutateCommunity(db, 'stranger', { action: 'accept', postId, replyId }), /Only the person/);
  await assert.rejects(mutateCommunity(db, 'reader', { action: 'accept', postId, replyId: ownReply }), /another member/);
  const other = await create('stranger');
  await assert.rejects(mutateCommunity(db, 'reader', { action: 'accept', postId: other, replyId }), /Only the person/);
  await assert.rejects(mutateCommunity(db, 'stranger', { action: 'accept', postId: other, replyId }), /no longer available/);
  await mutateCommunity(db, 'reader', { action: 'accept', postId, replyId });
  assert.equal((await communityThread(db, postId, null)).acceptedReply?.id, replyId);
  await assert.rejects(mutateCommunity(db, 'helper', { action: 'moderate', postId, replyId, hidden: true }), /Administrator/);
  for (let i = 0; i < 2; i++) await mutateCommunity(db, 'admin', { action: 'moderate', postId, replyId, hidden: true });
  let thread = await communityThread(db, postId, null);
  assert.equal(thread.post.replyCount, 1);
  assert.equal(thread.acceptedReply, null);
  assert.equal(thread.post.acceptedReplyId, null);
  assert.equal(thread.replies.find(item => item.id === replyId)?.body, '');
  assert.ok((await communityThread(db, postId, null, true)).replies.find(item => item.id === replyId)?.body);
  await mutateCommunity(db, 'admin', { action: 'moderate', postId, replyId, hidden: false });
  thread = await communityThread(db, postId, null);
  assert.equal(thread.post.replyCount, 2);
  await assert.rejects(mutateCommunity(db, 'stranger', { action: 'remove', postId, replyId }), /own contribution/);
  await mutateCommunity(db, 'helper', { action: 'remove', postId, replyId });
  assert.equal((await db.doc(`communityPosts/${postId}/replies/${replyId}`).get()).data()?.body, '');
  await assert.rejects(mutateCommunity(db, 'admin', { action: 'moderate', postId, replyId, hidden: false }), /removed/);
  await mutateCommunity(db, 'reader', { action: 'remove', postId });
  await assert.rejects(communityThread(db, postId, null), /no longer available/);
  assert.equal((await communityFeed(db, 'memory', null)).posts.some(post => post.id === postId), false);
});

test('reports are deduplicated, admin-only, and direct Firestore access is denied', async () => {
  const postId = await create();
  const replyId = await reply(postId);
  const input = { action: 'report', postId, replyId, reason: 'This includes someone’s private information.' };
  await Promise.all([mutateCommunity(db, 'reader', input, now), mutateCommunity(db, 'reader', input, now)]);
  const reports = await db.collection('communityReports').get();
  assert.equal(reports.size, 1);
  await assert.rejects(mutateCommunity(db, 'reader', { action: 'dismissReport', reportId: reports.docs[0].id }), /Administrator/);
  await mutateCommunity(db, 'admin', { action: 'dismissReport', reportId: reports.docs[0].id });
  assert.equal((await reports.docs[0].ref.get()).data()?.status, 'resolved');
  for (const context of [env.unauthenticatedContext(), env.authenticatedContext('reader'), env.authenticatedContext('admin')]) {
    const client = context.firestore();
    for (const path of [`communityPosts/${postId}`, `communityPosts/${postId}/replies/${replyId}`, `communityReports/${reports.docs[0].id}`, 'communitySettings/weekly', 'communityLimits/example']) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { status: 'active', authorId: 'admin' }));
    }
  }
});

test('pagination preserves ties and admins can open a reported reply beyond the first page', async () => {
  const postId = await create();
  const sample = (await db.doc(`communityPosts/${postId}`).get()).data()!;
  const batch = db.batch();
  for (let i = 0; i < 25; i++) {
    batch.set(db.doc(`communityPosts/${i.toString(16).padStart(40, '0')}`), { ...sample, createdAt: now });
    batch.set(db.doc(`communityPosts/${postId}/replies/${i.toString(16).padStart(40, '0')}`), { authorId: 'helper', authorName: 'Helper', body: `Reply ${i}`, createdAt: now, status: 'active', country: '', language: '' });
  }
  await batch.commit();
  const first = await communityFeed(db, 'memory', null);
  const second = await communityFeed(db, 'memory', first.nextCursor);
  assert.equal(first.posts.length, 20);
  assert.equal(new Set([...first.posts, ...second.posts].map(item => item.id)).size, 26);
  assert.equal(second.nextCursor, null);
  const replies = await communityThread(db, postId, null);
  const next = await communityThread(db, postId, replies.nextCursor);
  assert.equal(new Set([...replies.replies, ...next.replies].map(item => item.id)).size, 25);
  const reportId = (24).toString(16).padStart(40, '0');
  const focused = await communityThread(db, postId, null, true, reportId);
  assert.equal(focused.focusedReply?.body, 'Reply 24');
  assert.equal((await communityThread(db, postId, null, false, reportId)).focusedReply, null);
});
