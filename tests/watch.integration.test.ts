import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { initializeTestEnvironment, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createWatchUpload, getWatchCatalog, getWatchDetail, getWatchHostingStatus, getWatchLibrary, getWatchStudio, saveWatchDraft, setWatchCaptions, setWatchPoster, watchAction, watchPlayback } from '../lib/server/watch';
import type { AuthenticatedRequestUser } from '../lib/server/auth';
import { processWatchSubmissions } from '../lib/server/watchProcessing';

assert.match(process.env.FIRESTORE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Watch tests require the local emulator.');
const projectId = 'demo-afrobooks-watch';
assert.match(process.env.FIREBASE_STORAGE_EMULATOR_HOST || '', /^(127\.0\.0\.1|localhost):\d+$/, 'Watch tests require the local storage emulator.');
const app = initializeApp({ projectId, storageBucket: `${projectId}.appspot.com` });
const db = getFirestore(app);
let env: RulesTestEnvironment;
const realFetch = globalThis.fetch;
let providerCalls: { url: string; init?: RequestInit }[] = [];
let sequence = 0; let providerFailure = false; let signed = true;
let thumbnailReady = false;
let processingReady = true;
let rejectionStatus = 0;
let orphan: Record<string, unknown> | null = null;
let deleteFails = false;
const thumbnail = Buffer.from('89504e470d0a1a0a', 'hex');
const actor = (uid: string, role: AuthenticatedRequestUser['role'] = 'buyer'): AuthenticatedRequestUser => ({ uid, role, status: 'active', email: `${uid}@example.test` });
const creator = actor('creator', 'seller'); const staff = actor('staff', 'admin'); const reader = actor('reader');
const draft = { title: 'Music across generations', description: 'An original film about music and memories in Eritrea.', category: 'Documentaries', language: 'Tigrinya', priceCents: 249, newsDate: '', rightsStatement: 'Our studio owns the film and all music is licensed for distribution.', rightsAccepted: true };
const action = (who: AuthenticatedRequestUser, name: string, data: unknown) => watchAction(who, { action: name, data });
async function newVideo(priceCents = 249) { return (await saveWatchDraft(creator, { ...draft, priceCents })).id; }
test('orphan recovery protects completed and unrelated files and releases quota exactly once after deletion', async () => {
  const id = await newVideo(); const uid = 'f'.repeat(32); const data = { id, uid, kind: 'full' };
  await db.doc(`watchPrivate/${id}`).update({ fullPending: true });
  await db.doc('watchCreators/creator').update({ reservedSeconds: 360 });
  orphan = { creator: creator.uid, created: new Date(Date.now() - 600000).toISOString(), readyToStream: false, duration: 0, maxDurationSeconds: 360, status: { state: 'pendingupload' } };
  await assert.rejects(action(creator, 'admin_recover_upload', data), /Administrator/);
  orphan.readyToStream = true;
  await assert.rejects(action(staff, 'admin_recover_upload', data), /unused upload/);
  orphan.readyToStream = false; orphan.creator = 'other';
  await assert.rejects(action(staff, 'admin_recover_upload', data), /not an orphaned/);
  orphan.creator = creator.uid;
  await db.doc('watchPrivate/another').set({ full: { uid } });
  await assert.rejects(action(staff, 'admin_recover_upload', data), /attached/);
  await db.doc('watchPrivate/another').delete();
  await db.doc('watchCreators/creator').update({ reservedSeconds: 720 });
  await assert.rejects(action(staff, 'admin_recover_upload', data), /reconciliation/);
  await db.doc('watchCreators/creator').update({ reservedSeconds: 360 });
  deleteFails = true;
  await assert.rejects(action(staff, 'admin_recover_upload', data), /reservation has been kept/);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.fullPending, true);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 360);
  deleteFails = false;
  await action(staff, 'admin_recover_upload', data);
  await action(staff, 'admin_recover_upload', data);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.fullPending, false);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 0);
  assert.equal((await db.collection('watchAudit').where('action', '==', 'admin_recover_upload').get()).size, 1);
});
async function readyVideo(priceCents = 249) {
  const id = await newVideo(priceCents);
  await createWatchUpload(creator, { id, kind: 'full', size: 1000000, maximumSeconds: 600 });
  await db.doc(`watchVideos/${id}`).update({ posterUrl: 'https://example.test/cover.jpg' });
  await action(creator, 'submit', { id });
  await action(staff, 'admin_review', { id, decision: 'published', note: 'Rights reviewed.' });
  return id;
}
before(async () => {
  env = await initializeTestEnvironment({ projectId, firestore: { rules: readFileSync('firestore.rules', 'utf8') } });
  process.env.CLOUDFLARE_STREAM_ACCOUNT_ID = 'a'.repeat(32);
  process.env.CLOUDFLARE_STREAM_API_TOKEN = 'TEST-ONLY-FAKE-TOKEN';
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.startsWith('https://upload.videodelivery.net/') && init?.method === 'HEAD') return new Response(null, { headers: { 'upload-offset': '0' } });
    if (url.startsWith('https://videodelivery.net/')) return thumbnailReady ? new Response(thumbnail) : new Response(null, { status: 503 });
    if (!url.startsWith('https://api.cloudflare.com/')) return realFetch(input, init);
    providerCalls.push({ url, init });
    if (orphan && !url.includes('?') && !url.endsWith('/storage-usage')) {
      if (init?.method === 'DELETE') return new Response(null, { status: deleteFails ? 503 : 200 });
      return Response.json({ success: true, result: orphan });
    }
    if (providerFailure) throw new Error('Simulated ambiguous timeout');
    if (rejectionStatus) return Response.json({ errors: [{ code: 10000, message: 'PRIVATE-PROVIDER-DETAILS' }] }, { status: rejectionStatus });
    if (url.endsWith('?limit=20')) return Response.json({ success: true, result: [] });
    if (url.endsWith('/storage-usage')) return Response.json({ success: true, result: { totalStorageMinutes: 0, totalStorageMinutesLimit: 1000, videoCount: 0 } });
    if (url.endsWith('?direct_user=true')) {
      const uid = (++sequence).toString(16).padStart(32, '0');
      return new Response(null, { status: 201, headers: { 'stream-media-id': uid, location: `https://upload.videodelivery.net/tus/${uid}` } });
    }
    if (url.endsWith('/token')) return Response.json({ success: true, result: { token: 'TEST-PLAYBACK-TOKEN' } });
    if (url.includes('/captions/')) return Response.json({ success: true, result: { status: 'ready' } });
    return Response.json({ success: true, result: { requireSignedURLs: signed, readyToStream: processingReady, duration: 120, status: { state: processingReady ? 'ready' : 'inprogress', pctComplete: processingReady ? '100' : '42.5' } } });
  };
});
beforeEach(async () => {
  await env.clearFirestore(); providerCalls = []; sequence = 0; providerFailure = false; rejectionStatus = 0; signed = true; thumbnailReady = false; processingReady = true; orphan = null; deleteFails = false;
  for (const person of [creator, staff, reader, actor('other', 'seller')]) await db.doc(`users/${person.uid}`).set(person);
  await action(creator, 'apply', { name: 'Original Studio' });
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'approved', allowanceSeconds: 1800 });
});
after(async () => { globalThis.fetch = realFetch; delete process.env.CLOUDFLARE_STREAM_ACCOUNT_ID; delete process.env.CLOUDFLARE_STREAM_API_TOKEN; await env.cleanup(); await deleteApp(app); });

test('creators cannot impersonate another creator, self-approve or inject paid access', async () => {
  await assert.rejects(action(reader, 'apply', { name: 'Impostor' }), /author workspace/);
  await assert.rejects(action(creator, 'admin_creator', { uid: 'creator', status: 'approved', allowanceSeconds: 36000 }), /Administrator/);
  const id = await newVideo();
  await assert.rejects(saveWatchDraft(actor('other', 'seller'), draft, id), /approval/);
  await assert.rejects(getWatchStudio(reader), /author workspace/);
  await assert.rejects(action(reader, 'purchase', { id, paid: true }), /Unknown/);
  await assert.rejects(getWatchDetail(reader, id), /unavailable/);
});
test('concurrent uploads reserve once and never exceed creator capacity', async () => {
  const id = await newVideo();
  const results = await Promise.allSettled(Array.from({ length: 5 }, () => createWatchUpload(creator, { id, kind: 'full', size: 500000, maximumSeconds: 1200 })));
  assert.ok(results.some(result => result.status === 'fulfilled'));
  assert.equal(providerCalls.filter(call => call.url.endsWith('?direct_user=true')).length, 1);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 1200);
  const second = await newVideo();
  await assert.rejects(createWatchUpload(creator, { id: second, kind: 'full', size: 90000, maximumSeconds: 700 }), /allowance/);
  const retry = await createWatchUpload(creator, { id, kind: 'full', size: 500000, maximumSeconds: 1200 });
  assert.match(retry.uploadUrl, /^https:\/\/upload.videodelivery.net\//);
  const headers = providerCalls[0].init?.headers as Record<string, string>;
  assert.match(headers['Upload-Metadata'], /requiresignedurls/);
  assert.equal(headers['Upload-Creator'], 'creator');
});

test('retrying a new draft with its stable ID creates one record and consumes one catalog slot', async () => {
  const id = 'stable-client-draft-id';
  const results = await Promise.all([saveWatchDraft(creator, draft, id), saveWatchDraft(creator, draft, id)]);
  assert.deepEqual(results, [{ id }, { id }]);
  assert.equal((await db.collection('watchVideos').get()).size, 1);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.draftCount, 1);
  await saveWatchDraft(creator, { ...draft, title: 'Updated draft title' }, id);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.title, 'Updated draft title');
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.draftCount, 1);
});
test('provider timeout preserves its reservation instead of creating duplicate billable uploads', async () => {
  const id = await newVideo(); providerFailure = true;
  await assert.rejects(createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 }), /timeout/);
  providerFailure = false;
  await assert.rejects(createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 }), /already reserved/);
  assert.equal(providerCalls.length, 1);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 600);
});

test('explicit upload rejection releases only its failed reservation and allows a safe retry', async () => {
  const id = await newVideo(); rejectionStatus = 403;
  await assert.rejects(createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 }), /denied video hosting access/);
  const failed = (await db.doc(`watchPrivate/${id}`).get()).data()!;
  assert.equal(failed.fullPending, false);
  assert.doesNotMatch(failed.processingError, /PRIVATE-PROVIDER-DETAILS|TEST-ONLY/);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 0);
  rejectionStatus = 0;
  await createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 });
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 600);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.processingError, '');
});

test('hosting diagnostics require admin access and server errors retain ambiguous upload reservations', async () => {
  await assert.rejects(getWatchHostingStatus(reader), /Administrator/);
  await assert.rejects(getWatchHostingStatus(creator), /Administrator/);
  const hosting = await getWatchHostingStatus(staff);
  assert.equal(hosting.connected, true); assert.equal(hosting.storage.limitMinutes, 1000);
  await assert.rejects(action(creator, 'admin_test_upload', {}), /Administrator/);
  await action(staff, 'admin_test_upload', {});
  assert.equal(providerCalls.at(-1)?.init?.method, 'DELETE');
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 0);
  const id = await newVideo(); rejectionStatus = 503;
  await assert.rejects(createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 }), /HTTP 503/);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.fullPending, true);
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, 600);
});

test('pausing a creator blocks draft, artwork, video and subtitle writes at the server', async () => {
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 });
  await action(creator, 'refresh', { id });
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'paused', allowanceSeconds: 1800 });
  const calls = providerCalls.length;
  await assert.rejects(saveWatchDraft(creator, draft, id), /approval/);
  await assert.rejects(createWatchUpload(creator, { id, kind: 'trailer', size: 2000, maximumSeconds: 120 }), /paused/);
  await assert.rejects(setWatchPoster(creator, id, Buffer.from('89504e470d0a1a0a', 'hex')), /paused/);
  await assert.rejects(setWatchCaptions(creator, { id, kind: 'full', language: 'ti', text: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nሰላም\n' }), /paused/);
  assert.equal(providerCalls.length, calls);
  assert.equal((await getWatchStudio(creator)).videos.length, 1, 'Paused creators can still inspect their catalog');
});
test('review requires ready private media and approval before catalog publication', async () => {
  const id = await newVideo();
  await assert.rejects(action(creator, 'submit', { id }), /main video/);
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 600 });
  await db.doc(`watchVideos/${id}`).update({ posterUrl: 'https://example.test/image.jpg' });
  signed = false;
  await action(creator, 'submit', { id });
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'processing');
  await assert.rejects(action(staff, 'admin_review', { id, decision: 'published', note: '' }), /private playback/);
  assert.equal((await getWatchCatalog(reader, null, null)).videos.length, 0);
  signed = true;
  await action(creator, 'submit', { id });
  await assert.rejects(saveWatchDraft(creator, draft, id), /own drafts/);
  await assert.rejects(action(creator, 'admin_review', { id, decision: 'published', note: '' }), /Administrator/);
  await action(staff, 'admin_review', { id, decision: 'published', note: 'Reviewed rights and media.' });
  const catalog = await getWatchCatalog(reader, null, 'creator');
  assert.equal(catalog.videos[0].id, id); assert.equal(catalog.channel?.name, 'Original Studio');
  assert.doesNotMatch(JSON.stringify(catalog), /uploadUrl|rightsStatement|TEST-ONLY|stream-media/);
});

test('one main clip can publish without a cover or trailer when automatic artwork is unavailable', async () => {
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
  const result = await action(creator, 'refresh', { id });
  assert.match(JSON.stringify(result), /automatic cover could not be created/);
  await action(creator, 'submit', { id });
  await action(staff, 'admin_review', { id, decision: 'published', note: 'Clip and rights reviewed.' });
  const video = (await getWatchCatalog(reader, null, null)).videos.find(video => video.id === id)!;
  assert.equal(video.posterUrl, '');
  assert.equal(video.hasTrailer, false);
  assert.equal(video.status, 'published');
  await assert.rejects(watchPlayback(reader, id, false), /Purchase access/);
});

test('a trailer alone cannot replace the required main clip', async () => {
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'trailer', size: 9999, maximumSeconds: 120 });
  await assert.rejects(action(creator, 'submit', { id }), /main video/);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'draft');
});

test('submission waits durably for processing and the background worker advances it without publishing', async () => {
  processingReady = false;
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
  await action(creator, 'submit', { id });
  await action(creator, 'submit', { id }); // Safe retry after a lost response.
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'processing');
  await assert.rejects(saveWatchDraft(creator, draft, id), /own drafts/);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.full.processingPercent, 42.5);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.full.processingState, 'inprogress');
  await assert.rejects(action(staff, 'admin_review', { id, decision: 'published', note: '' }), /processed video/);
  providerFailure = true;
  assert.equal((await processWatchSubmissions(db)).failed, 1);
  assert.match((await db.doc(`watchPrivate/${id}`).get()).data()?.processingError, /retry automatically/);
  providerFailure = false; processingReady = true;
  await processWatchSubmissions(db);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'in_review');
  assert.equal((await getWatchCatalog(reader, null, null)).videos.length, 0);
});

test('cancelled, paused and suspended submissions cannot be advanced by the worker', async () => {
  processingReady = false;
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
  await action(creator, 'submit', { id });
  await assert.rejects(action(actor('other', 'seller'), 'cancel_submission', { id }), /your preparing video/);
  await action(creator, 'cancel_submission', { id });
  processingReady = true; await processWatchSubmissions(db);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'draft');
  processingReady = false; await action(creator, 'submit', { id }); processingReady = true;
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'paused', allowanceSeconds: 1800 });
  await processWatchSubmissions(db);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'processing');
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'approved', allowanceSeconds: 1800 });
  await db.doc('users/creator').update({ status: 'suspended' });
  await processWatchSubmissions(db);
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'processing');
});

test('processing worker respects its lease and cycles past an unready upload', async () => {
  processingReady = false;
  for (let i = 0; i < 4; i++) {
    const id = await newVideo();
    await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
    await action(creator, 'submit', { id });
  }
  const ref = db.doc('watchSystem/processing');
  await ref.set({ leaseUntil: Date.now() + 60000 });
  assert.equal((await processWatchSubmissions(db)).busy, true);
  await ref.set({ leaseUntil: 0 });
  assert.equal((await processWatchSubmissions(db)).checked, 3);
  assert.ok((await ref.get()).data()?.cursor);
  assert.equal((await processWatchSubmissions(db)).checked, 1);
  assert.equal((await ref.get()).data()?.cursor, '');
});

test('processed clips receive durable artwork without exposing video access tokens or replacing a custom cover', async () => {
  thumbnailReady = true;
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
  await action(creator, 'refresh', { id });
  const poster = (await db.doc(`watchVideos/${id}`).get()).data()?.posterUrl;
  assert.match(poster, /^https:\/\/firebasestorage.googleapis.com\//);
  assert.doesNotMatch(poster, /TEST-PLAYBACK-TOKEN|videodelivery/);
  const path = decodeURIComponent(new URL(poster).pathname.split('/o/')[1]);
  const [bytes] = await getStorage(app).bucket().file(path).download();
  assert.deepEqual(bytes, thumbnail);
  const custom = await setWatchPoster(creator, id, thumbnail);
  await setWatchPoster(creator, id, thumbnail, true);
  await action(creator, 'refresh', { id });
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.posterUrl, custom.posterUrl);
});
test('full-video access requires free, ownership or creator access; refunds revoke new playback', async () => {
  const id = await readyVideo();
  await assert.rejects(watchPlayback(reader, id, false), /Purchase access/);
  await assert.rejects(watchPlayback(reader, id, true), /Purchase access/);
  const grant = db.doc(`watchEntitlements/reader/videos/${id}`);
  await grant.set({ status: 'active' });
  assert.equal((await watchPlayback(reader, id, false)).token, 'TEST-PLAYBACK-TOKEN');
  assert.equal((await getWatchLibrary(reader)).entries[0].state.owned, true);
  await grant.update({ status: 'refunded' });
  await assert.rejects(watchPlayback(reader, id, false), /Purchase access/);
  assert.equal((await getWatchLibrary(reader)).entries.length, 0);
  assert.equal((await watchPlayback(creator, id, false)).token, 'TEST-PLAYBACK-TOKEN');
  const free = await readyVideo(0);
  assert.equal((await watchPlayback(reader, free, false)).token, 'TEST-PLAYBACK-TOKEN');
  await action(staff, 'admin_review', { id: free, decision: 'removed', note: 'Removed after a rights report.' });
  await assert.rejects(watchPlayback(reader, free, false), /unavailable/);
});

test('only the creator and admins can privately preview a ready unpublished video and trailer', async () => {
  const id = await newVideo();
  for (const kind of ['full', 'trailer']) await createWatchUpload(creator, { id, kind, size: 5000, maximumSeconds: 120 });
  await assert.rejects(watchPlayback(creator, id, false), /not ready/);
  await action(creator, 'refresh', { id });
  for (const reviewer of [creator, staff]) {
    for (const trailer of [false, true]) assert.equal((await watchPlayback(reviewer, id, trailer)).token, 'TEST-PLAYBACK-TOKEN');
  }
  for (const outsider of [reader, actor('other', 'seller')]) {
    await assert.rejects(watchPlayback(outsider, id, false), /unavailable/);
    await assert.rejects(watchPlayback(outsider, id, true), /unavailable/);
  }
  assert.equal((await getWatchCatalog(reader, null, null)).videos.length, 0);
});
test('saved videos, progress and follows persist only for the acting viewer', async () => {
  const id = await readyVideo(0);
  await action(reader, 'save', { id, saved: true });
  await action(reader, 'progress', { id, seconds: 80 });
  await action(reader, 'follow', { creatorId: 'creator', following: true });
  const detail = await getWatchDetail(reader, id);
  assert.deepEqual(detail.state, { owned: false, seconds: 80, saved: true, following: true });
  assert.equal((await getWatchLibrary(actor('other'))).entries.length, 0);
  await action(reader, 'save', { id, saved: false });
  await action(reader, 'follow', { creatorId: 'creator', following: false });
  assert.equal((await getWatchDetail(reader, id)).state.saved, false);
  assert.equal((await getWatchDetail(reader, id)).state.following, false);
  await action(reader, 'report', { id, reason: 'The creator may not own the music used in this film.' });
  await assert.rejects(action(reader, 'admin_resolve', { id: `reader_${id}` }), /Administrator/);
  await action(staff, 'admin_resolve', { id: `reader_${id}` });
  assert.equal((await db.doc(`watchReports/reader_${id}`).get()).data()?.status, 'resolved');
});
test('Tigrinya subtitles use the private creator asset; review locks prevent later edits', async () => {
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 5000, maximumSeconds: 600 });
  await action(creator, 'refresh', { id });
  const captions = { id, kind: 'full', language: 'ti', text: 'WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nሰላም\n' };
  await setWatchCaptions(creator, captions);
  assert.deepEqual((await db.doc(`watchPrivate/${id}`).get()).data()?.full.captions, ['ti']);
  assert.equal((providerCalls.find(call => call.url.endsWith('/captions/ti'))?.init?.body as FormData).get('file') instanceof Blob, true);
  await assert.rejects(setWatchCaptions(actor('other', 'seller'), captions), /another creator/);
  await db.doc(`watchVideos/${id}`).update({ posterUrl: 'https://example.test/cover.jpg' });
  await action(creator, 'submit', { id });
  await assert.rejects(setWatchCaptions(creator, captions), /Only drafts/);
});
test('all Watch collections deny direct client access, including forged entitlements', async () => {
  const id = await newVideo();
  for (const uid of ['creator', 'reader', 'staff']) {
    const client = env.authenticatedContext(uid).firestore();
    for (const path of [`watchVideos/${id}`, `watchPrivate/${id}`, 'watchCreators/creator', `watchEntitlements/${uid}/videos/${id}`, `watchStates/${uid}/videos/${id}`, 'watchAudit/test']) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { status: 'active', role: 'admin', uid }));
    }
  }
});

test('creator revisions are private, idempotent and cannot edit another creator or self-approve', async () => {
  const id = await readyVideo();
  const change = { id, revisionId: 'revision-one', draft: { ...draft, title: 'A corrected title' } };
  await assert.rejects(action(reader, 'creator_revision', change), /Creator access/);
  await assert.rejects(action(actor('other', 'seller'), 'creator_revision', change), /own videos/);
  await assert.rejects(action(actor('other', 'seller'), 'creator_remove', { id }), /own videos/);
  await action(creator, 'creator_revision', change);
  await action(creator, 'creator_revision', change);
  assert.equal((await db.collection('watchAudit').where('action', '==', 'creator_revision').get()).size, 1);
  const publicDetail = await getWatchDetail(reader, id);
  assert.equal(publicDetail.video.title, draft.title);
  assert.doesNotMatch(JSON.stringify(publicDetail), /pendingRevision|corrected title/);
  await assert.rejects(action(creator, 'admin_revision', { id, revisionId: 'revision-one', decision: 'approve', note: '' }), /Administrator/);
  await assert.rejects(action(creator, 'creator_revision', { ...change, revisionId: 'revision-two' }), /previous changes/);
  await assert.rejects(action(creator, 'creator_revision', { ...change, draft: { ...change.draft, title: 'Reusing an old request' } }), /already been submitted/);
  await action(staff, 'admin_revision', { id, revisionId: 'revision-one', decision: 'approve', note: '' });
  assert.equal((await getWatchDetail(reader, id)).video.title, change.draft.title);
  assert.equal((await getWatchDetail(reader, id)).video.status, 'published');
  await action(creator, 'creator_revision', change);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.pendingRevision, null, 'A retried resolved request cannot reopen review');
});

test('withdrawal, rejection and stale reviews cannot apply unreviewed creator edits', async () => {
  const id = await readyVideo();
  const change = { id, revisionId: 'revision-one', draft: { ...draft, title: 'First edit' } };
  await action(creator, 'creator_revision', change);
  await assert.rejects(action(actor('other', 'seller'), 'creator_withdraw_revision', { id, revisionId: change.revisionId }), /own videos/);
  await action(creator, 'creator_withdraw_revision', { id, revisionId: change.revisionId });
  await action(creator, 'creator_revision', { ...change, revisionId: 'revision-two', draft: { ...draft, title: 'Second edit' } });
  await assert.rejects(action(staff, 'admin_revision', { id, revisionId: 'revision-one', decision: 'approve', note: '' }), /already been reviewed/);
  await assert.rejects(action(staff, 'admin_revision', { id, revisionId: 'revision-two', decision: 'reject', note: '' }), /Explain/);
  await action(staff, 'admin_revision', { id, revisionId: 'revision-two', decision: 'reject', note: 'Please correct the title and resubmit.' });
  assert.equal((await getWatchDetail(reader, id)).video.title, draft.title);
  assert.match((await db.doc(`watchPrivate/${id}`).get()).data()?.revisionReviewNote, /correct the title/);
});

test('creator removal hides a paid video while preserving purchases, media, earnings and upload reservations', async () => {
  const id = await readyVideo();
  await db.doc(`watchEntitlements/reader/videos/${id}`).set({ status: 'active' });
  await db.doc('watchPlayEarnings/existing').set({ videoId: id, status: 'accrued' });
  const before = (await db.doc('watchCreators/creator').get()).data()?.reservedSeconds;
  const uid = (await db.doc(`watchPrivate/${id}`).get()).data()?.full.uid;
  await action(creator, 'creator_revision', { id, revisionId: 'remove-pending-edit', draft: { ...draft, title: 'Pending change' } });
  await action(creator, 'creator_remove', { id }); await action(creator, 'creator_remove', { id });
  assert.equal((await db.doc(`watchVideos/${id}`).get()).data()?.status, 'unlisted');
  assert.equal((await getWatchCatalog(reader, null, null)).videos.length, 0);
  assert.equal((await getWatchLibrary(reader)).entries[0].video.id, id);
  assert.equal((await watchPlayback(reader, id, false)).token, 'TEST-PLAYBACK-TOKEN');
  await assert.rejects(watchPlayback(actor('other'), id, false), /unavailable|Purchase access/);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.full.uid, uid);
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.pendingRevision, null);
  assert.equal((await db.doc('watchPlayEarnings/existing').get()).data()?.status, 'accrued');
  assert.equal((await db.doc('watchCreators/creator').get()).data()?.reservedSeconds, before);
  assert.equal((await db.collection('watchAudit').where('action', '==', 'creator_remove').get()).size, 1);
});

test('removed drafts cannot publish, pending submissions can return to editing, and creator removal cannot weaken an admin block', async () => {
  const id = await newVideo();
  await createWatchUpload(creator, { id, kind: 'full', size: 9999, maximumSeconds: 120 });
  await action(creator, 'submit', { id });
  await action(creator, 'cancel_submission', { id });
  await saveWatchDraft(creator, { ...draft, title: 'Edited before publication' }, id);
  await action(creator, 'creator_remove', { id });
  await assert.rejects(action(creator, 'submit', { id }), /cannot be submitted/);
  await assert.rejects(saveWatchDraft(creator, draft, id), /own drafts/);
  await assert.rejects(action(creator, 'cancel_submission', { id }), /Only your preparing/);
  const published = await readyVideo();
  await action(staff, 'admin_review', { id: published, decision: 'removed', note: 'Distribution rights were withdrawn.' });
  await action(creator, 'creator_remove', { id: published });
  assert.equal((await db.doc(`watchVideos/${published}`).get()).data()?.status, 'removed');
  await assert.rejects(action(creator, 'creator_revision', { id: published, revisionId: 'cannot-edit-removed', draft }), /Only published/);
});

test('price revisions pause new store checkout and keep existing purchases valid without publishing unlisted videos', async () => {
  const id = await readyVideo();
  await db.doc(`watchPrivate/${id}`).update({ playProductId: 'afrobooks_fixture', playTestEnabled: true, playLiveEnabled: true });
  await db.doc('watchPlayProducts/afrobooks_fixture').set({ videoId: id, enabled: true, liveEnabled: true });
  await db.doc(`watchEntitlements/reader/videos/${id}`).set({ status: 'active' });
  await action(creator, 'creator_remove', { id });
  await action(creator, 'creator_revision', { id, revisionId: 'price-edit', draft: { ...draft, priceCents: 199 } });
  await action(staff, 'admin_revision', { id, revisionId: 'price-edit', decision: 'approve', note: '' });
  const video = (await getWatchDetail(reader, id)).video;
  assert.equal(video.priceCents, 199); assert.equal(video.status, 'unlisted');
  const media = (await db.doc(`watchPrivate/${id}`).get()).data();
  assert.equal(media?.playTestEnabled, false); assert.equal(media?.playLiveEnabled, false);
  const product = (await db.doc('watchPlayProducts/afrobooks_fixture').get()).data();
  assert.equal(product?.enabled, false); assert.equal(product?.liveEnabled, false);
  assert.equal((await watchPlayback(reader, id, false)).token, 'TEST-PLAYBACK-TOKEN');
});

test('paused creators and suspended accounts cannot approve revisions, and moderation clears pending edits', async () => {
  const id = await readyVideo();
  const change = { id, revisionId: 'safety-edit', draft: { ...draft, title: 'Waiting for review' } };
  await action(creator, 'creator_revision', change);
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'paused', allowanceSeconds: 1800 });
  await assert.rejects(action(creator, 'creator_revision', { ...change, revisionId: 'new-edit' }), /paused/);
  await assert.rejects(action(staff, 'admin_revision', { id, revisionId: change.revisionId, decision: 'approve', note: '' }), /no longer eligible/);
  await action(staff, 'admin_creator', { uid: creator.uid, status: 'approved', allowanceSeconds: 1800 });
  await db.doc('users/creator').update({ status: 'suspended' });
  await assert.rejects(action(staff, 'admin_revision', { id, revisionId: change.revisionId, decision: 'approve', note: '' }), /no longer eligible/);
  await action(staff, 'admin_review', { id, decision: 'removed', note: 'Removed after a rights report.' });
  assert.equal((await db.doc(`watchPrivate/${id}`).get()).data()?.pendingRevision, null);
});
