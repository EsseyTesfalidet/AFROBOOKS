import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWatchProgress, playbackPosition, playbackStart, streamPlaybackSource, streamScrubThumbnails } from '../lib/watch/playback';

const tick = () => new Promise(resolve => setImmediate(resolve));
test('custom playback uses the signed token on the fixed streaming host', () => {
  assert.equal(streamPlaybackSource('header.payload.signature'), 'https://videodelivery.net/header.payload.signature/manifest/video.m3u8');
  const url = new URL(streamPlaybackSource('token/?host=evil.example'));
  assert.equal(url.hostname, 'videodelivery.net'); assert.equal(url.search, '');
});
test('resume handles short clips, completed films and invalid times', () => {
  assert.equal(playbackStart(120, 900), 120);
  assert.equal(playbackStart(898, 900), 0);
  assert.equal(playbackStart(2, 4), 2);
  assert.equal(playbackStart(4, 4), 0);
  assert.equal(playbackStart(NaN, 900), 0);
  assert.equal(playbackPosition(-10, 900), 0);
  assert.equal(playbackPosition(1000, 900), 900);
});
test('progress serializes a slow save and a rewind back to the previously saved time', async () => {
  const writes: number[] = []; let release!: () => void;
  const progress = createWatchProgress({ initial: 20, duration: 900, isCurrent: () => true, onResult: () => {}, write: async seconds => { writes.push(seconds); if (writes.length === 1) await new Promise<void>(resolve => { release = resolve; }); } });
  progress.record(40); const pending = progress.flush(); await tick();
  progress.record(20); void progress.flush(true); progress.record(21); void progress.flush(true);
  assert.deepEqual(writes, [40]); release(); await pending; await tick();
  assert.deepEqual(writes, [40, 21]);
});
test('background saves throttle, paused saves flush and failures retry without losing the last place', async () => {
  const writes: number[] = []; const results: boolean[] = []; let now = 0; let fail = false;
  const progress = createWatchProgress({ initial: 0, duration: 60, now: () => now, isCurrent: () => true, onResult: saved => results.push(saved), write: async seconds => { writes.push(seconds); if (fail) throw Error('offline'); } });
  await progress.flush(true); assert.deepEqual(writes, [], 'Opening a player does not overwrite progress');
  progress.record(10); await progress.flush();
  progress.record(11); now = 1000; await progress.flush(); assert.deepEqual(writes, [10]);
  fail = true; await progress.flush(true); assert.equal(results.at(-1), false);
  fail = false; await progress.flush(true); assert.equal(results.at(-1), true);
  assert.deepEqual(writes, [10, 11, 11]);
  progress.record(100); await progress.flush(true); assert.equal(writes.at(-1), 60);
});
test('queued progress cannot move to another signed-in account or save trailer time', async () => {
  const writes: number[] = []; let current = true; let release!: () => void;
  const progress = createWatchProgress({ initial: 0, duration: 900, isCurrent: () => current, onResult: () => {}, write: async seconds => { writes.push(seconds); await new Promise<void>(resolve => { release = resolve; }); } });
  progress.record(10); const pending = progress.flush(); await tick();
  progress.record(30); void progress.flush(true); current = false; release(); await pending; await tick();
  assert.deepEqual(writes, [10]);
  const trailer = createWatchProgress({ initial: 0, duration: 900, isCurrent: () => false, onResult: () => {}, write: async () => assert.fail('Trailer must not save full-video progress') });
  trailer.record(30); await trailer.flush(true);
});

test('scrub previews use only the authorized token, bound images and cover the complete duration', () => {
  for (const duration of [.2, 5, 319.63, 720.15, 14400]) {
    const frames = streamScrubThumbnails('signed/token?private', duration);
    assert.ok(frames.length > 0 && frames.length <= 120);
    assert.equal(frames[0].startTime, 0);
    assert.ok(Math.abs(frames.at(-1)!.endTime - duration) < .00001);
    for (const frame of frames) {
      const url = new URL(frame.url);
      assert.equal(url.pathname, '/signed%2Ftoken%3Fprivate/thumbnails/thumbnail.jpg');
      assert.ok(parseFloat(url.searchParams.get('time')!) < duration);
      assert.equal(url.searchParams.get('width'), '320');
    }
  }
  for (const duration of [0, -1, NaN, Infinity]) assert.deepEqual(streamScrubThumbnails('token', duration), []);
  assert.deepEqual(streamScrubThumbnails('', 30), []);
});
