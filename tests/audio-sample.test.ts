import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firstMinuteSample, mp3AudioOffset, SAMPLE_INPUT_BYTES } from '../lib/server/audioSample';
import { audioChapters, audioTrackAt, audioTracks, parseAudioTime, validateChapterDuration } from '../lib/audio/policy';
import type { AudioTitle } from '../types/audio';

import { recording } from './audioFixtures';
test('a real MP3 is encoded into a separate playable first-minute sample, with short-file and malformed-file handling', async () => {
  const source = await recording(70); const sample = await firstMinuteSample(source);
  assert.equal(sample.seconds, 60); assert.ok(sample.bytes.length < source.length);
  const { MPEGDecoder } = await import('mpg123-decoder'); const decoder = new MPEGDecoder(); await decoder.ready;
  try { const decoded = decoder.decode(sample.bytes); assert.ok(decoded.samplesDecoded / decoded.sampleRate >= 59.9); assert.ok(decoded.samplesDecoded / decoded.sampleRate < 60.2); assert.ok(decoded.channelData[0].some(value => Math.abs(value) > .05)); }
  finally { decoder.free(); }
  const short = await firstMinuteSample(await recording(2)); assert.ok(short.seconds > 1.9 && short.seconds < 2.2);
  await assert.rejects(firstMinuteSample(new Uint8Array(128)), /No readable/);
  await assert.rejects(firstMinuteSample(new Uint8Array(SAMPLE_INPUT_BYTES + 1)), /too large/);
  assert.equal(mp3AudioOffset(Buffer.from([73,68,51,4,0,0,0,0,1,0]), 1000), 138);
  assert.equal(mp3AudioOffset(source.subarray(0,10), source.length), 0);
  assert.throws(() => mp3AudioOffset(Buffer.from([73,68,51,4,0,0,255,0,0,0]), 1000), /Invalid/);
  assert.throws(() => mp3AudioOffset(Buffer.from([73,68,51,4,0,0,0,0,1,0]), 100), /no readable/);
});
test('Unicode chapter markers and a global recording timeline validate boundaries', () => {
  assert.equal(parseAudioTime('1:02:03'),3723); assert.equal(parseAudioTime('0:70'),null); assert.equal(parseAudioTime('2.5'),null);
  const chapters = [{ title:'ታሪኽ',startSeconds:0 }, { title:'الحكاية',startSeconds:60 }];
  assert.equal(audioChapters.parse(chapters).length,2);
  assert.equal(audioChapters.safeParse([{title:'Late',startSeconds:3}]).success,false);
  assert.equal(audioChapters.safeParse([...chapters,{title:'Duplicate',startSeconds:60}]).success,false);
  assert.throws(() => validateChapterDuration(chapters,60)); validateChapterDuration(chapters,61);
  const title = { ready:true, mainDurationSeconds:60, durationSeconds:130, parts:[{id:'episode-two',title:'Episode two',durationSeconds:70,ready:true}] } as AudioTitle;
  assert.deepEqual(audioTracks(title).map(part=>part.startSeconds),[0,60]);
  assert.equal(audioTrackAt(title,59.99)?.id,'main'); assert.equal(audioTrackAt(title,60)?.id,'episode-two');
});
