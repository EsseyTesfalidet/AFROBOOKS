import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captionSchema, posterMime, publicVideo, uploadSchema, videoAccess, videoDraftSchema, videoDuration } from '../lib/watch/policy';
import type { WatchVideo } from '../types/video';
import { mobileReturnPath } from '../lib/auth/mobileAccess';
import { watchBytes } from '../lib/server/watchHttp';

const video: WatchVideo = { id: 'film', creatorId: 'creator', creatorName: 'Studio', title: 'Test film', description: 'An original documentary about music.', category: 'Documentaries', language: 'Tigrinya', priceCents: 249, currency: 'usd', posterUrl: '', durationSeconds: 300, hasTrailer: true, status: 'published', publishedAt: 10, newsDate: '', updatedAt: 10 };
const draft = { title: video.title, description: video.description, category: video.category, language: video.language, priceCents: 249, newsDate: '', rightsStatement: 'Our studio owns all footage and has licensed the music.', rightsAccepted: true };

test('paid full films stay private while separate trailers are available', () => {
  assert.equal(videoAccess(video, 'viewer', false, false), false);
  assert.equal(videoAccess(video, 'viewer', false, false, true), true);
  assert.equal(videoAccess(video, 'viewer', false, true), true);
  assert.equal(videoAccess(video, 'creator', false, false), true);
  assert.equal(videoAccess({ ...video, priceCents: 0 }, 'viewer', false, false), true);
  assert.equal(videoAccess({ ...video, hasTrailer: false }, 'viewer', false, false, true), false);
});
test('drafts and removed videos do not leak through free, trailer or ownership paths', () => {
  for (const status of ['draft', 'processing', 'in_review', 'removed'] as const) {
    for (const owned of [true, false]) for (const trailer of [true, false]) {
      assert.equal(videoAccess({ ...video, status, priceCents: 0 }, 'viewer', false, owned, trailer), false);
    }
  }
  assert.equal(videoAccess({ ...video, status: 'unlisted' }, 'viewer', false, true), true);
  assert.equal(videoAccess({ ...video, status: 'unlisted', priceCents: 0 }, 'viewer', false, false), false);
  assert.equal(videoAccess({ ...video, status: 'removed' }, 'creator', false, false), false);
  assert.equal(videoAccess({ ...video, status: 'removed' }, 'staff', true, false), true);
});
test('catalog serialization strips private provider credentials and rights evidence', () => {
  const payload = publicVideo({ ...video, full: { uid: 'secret', uploadUrl: 'private' }, rightsStatement: 'evidence', token: 'private' } as WatchVideo);
  assert.deepEqual(payload, video);
  assert.doesNotMatch(JSON.stringify(payload), /secret|private|evidence/);
});
test('draft validation enforces curated categories, whole cents, rights and news dates', () => {
  assert.equal(videoDraftSchema.parse(draft).language, 'Tigrinya');
  for (const change of [{ priceCents: 0.99 }, { priceCents: 1 }, { priceCents: -1 }, { priceCents: 5000 }, { rightsAccepted: false }, { rightsStatement: '' }, { category: 'Reels' }, { category: 'News & interviews', newsDate: '' }, { status: 'published' }, { creatorId: 'someone-else' }]) {
    assert.equal(videoDraftSchema.safeParse({ ...draft, ...change }).success, false, JSON.stringify(change));
  }
  assert.equal(videoDraftSchema.safeParse({ ...draft, priceCents: 0 }).success, true);
});
test('upload bounds prevent oversized uploads and full movies disguised as trailers', () => {
  const input = { id: 'film', kind: 'full', size: 800_000_000, maximumSeconds: 3600 };
  assert.equal(uploadSchema.safeParse(input).success, true);
  for (const patch of [{ size: 0 }, { size: 11 * 1024 ** 3 }, { maximumSeconds: 10801 }, { kind: 'trailer' }, { id: '../secret' }, { uploadUrl: 'https://evil.test' }]) assert.equal(uploadSchema.safeParse({ ...input, ...patch }).success, false);
});
test('subtitle uploads retain Tigrinya UTF-8 and reject scripts/non-VTT files', () => {
  const input = { id: 'film', kind: 'full', language: 'ti', text: 'WEBVTT\n\n00:00:00.000 --> 00:00:03.000\nሰላም ከመይ ኣለኹም\n' };
  assert.deepEqual(captionSchema.parse(input), input);
  assert.equal(captionSchema.safeParse({ ...input, text: '<script>alert(1)</script>' }).success, false);
  assert.equal(captionSchema.safeParse({ ...input, language: '../../token' }).success, false);
});
test('poster validation checks file bytes and does not allow SVG/HTML', () => {
  assert.equal(posterMime(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
  assert.equal(posterMime(Buffer.from('ffd8ffe0', 'hex')), 'image/jpeg');
  assert.equal(posterMime(Buffer.from('<svg onload="alert(1)">')), null);
  assert.equal(posterMime(Buffer.from('<html>')), null);
});
test('watch routes survive mobile sign-in with safe return destinations', () => {
  assert.equal(mobileReturnPath('/watch/film'), '/watch/film');
  assert.equal(mobileReturnPath('/watch/creator/studio'), '/watch/creator/studio');
  assert.equal(mobileReturnPath('/library/videos'), '/library/videos');
  assert.equal(mobileReturnPath('//attacker/watch'), null);
  assert.equal(videoDuration(3721), '1:02:01');
});

test('body limits stop streamed uploads even with absent or misleading content length', async () => {
  for (const declaredLength of [undefined, '1']) {
    let canceled = false;
    const headers = new Headers(declaredLength ? { 'content-length': declaredLength } : {});
    const body = new ReadableStream<Uint8Array<ArrayBuffer>>({ pull(controller) { controller.enqueue(new Uint8Array(600)); }, cancel() { canceled = true; } });
    await assert.rejects(watchBytes({ headers, body }, 1000), /too large/);
    assert.equal(canceled, true);
  }
  assert.equal((await watchBytes({ headers: new Headers(), body: new Response('ሰላም').body }, 100)).toString('utf8'), 'ሰላም');
});
