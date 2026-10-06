import { randomUUID } from 'node:crypto';
import { getAdminBucket, getAdminDb } from '@/lib/firebase/admin';
import { AUDIO_PREVIEW_MAX_BYTES, AUDIO_PREVIEW_MAX_SECONDS } from '@/lib/audio/policy';
import { audioRecord } from './audio';
import type { AuthenticatedRequestUser as Actor } from './auth';
import { WatchError } from './watchErrors';

export const SAMPLE_INPUT_BYTES = 4 * 1024 * 1024;

export function mp3AudioOffset(header: Uint8Array, size: number) {
  if (header[0] !== 73 || header[1] !== 68 || header[2] !== 51) return 0;
  if (header.length < 10 || header.slice(6, 10).some(byte => byte > 127)) throw new Error('Invalid MP3 metadata.');
  const offset = 10 + header.slice(6, 10).reduce((value, byte) => value * 128 + byte, 0);
  if (offset >= size) throw new Error('This file has no readable audio after its metadata.');
  return offset;
}

// Decode bounded chunks and encode only the first minute. No browser receives
// the original paid recording, and no full-size PCM recording is held in RAM.
export async function firstMinuteSample(input: Uint8Array) {
  if (input.length > SAMPLE_INPUT_BYTES) throw new Error('Sample input is too large.');
  const [{ MPEGDecoder }, { Mp3Encoder }] = await Promise.all([import('mpg123-decoder'), import('@breezystack/lamejs')]);
  const decoder = new MPEGDecoder(); await decoder.ready;
  let encoder: InstanceType<typeof Mp3Encoder> | undefined;
  let sampleRate = 0, channels = 0, samples = 0, bytes = 0;
  const output: Buffer[] = []; const started = Date.now();
  const append = (chunk: Uint8Array) => { bytes += chunk.length; if (bytes > AUDIO_PREVIEW_MAX_BYTES) throw new Error('The sample exceeded its limit.'); output.push(Buffer.from(chunk)); };
  try {
    for (let offset = 0; offset < input.length; offset += 16384) {
      if (Date.now() - started > 20000) throw new Error('Sample processing timed out.');
      const decoded = decoder.decode(input.subarray(offset, offset + 16384));
      if (!decoded.samplesDecoded) continue;
      if (!encoder) {
        sampleRate = decoded.sampleRate; channels = decoded.channelData.length;
        if (![8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000].includes(sampleRate) || channels < 1 || channels > 2) throw new Error('Unsupported MP3 recording.');
        encoder = new Mp3Encoder(channels, sampleRate, 128);
      }
      if (sampleRate !== decoded.sampleRate || channels !== decoded.channelData.length) throw new Error('The recording changes audio format. Export a new MP3.');
      const take = Math.min(decoded.samplesDecoded, AUDIO_PREVIEW_MAX_SECONDS * sampleRate - samples);
      for (let start = 0; start < take; start += 1152) {
        const end = Math.min(take, start + 1152);
        const pcm = decoded.channelData.map(channel => Int16Array.from(channel.subarray(start, end), sample => Math.round(Math.max(-1, Math.min(1, sample)) * (sample < 0 ? 32768 : 32767))));
        append(encoder.encodeBuffer(pcm[0], pcm[1]));
      }
      samples += take;
      if (samples >= AUDIO_PREVIEW_MAX_SECONDS * sampleRate) break;
    }
    if (!encoder || samples < sampleRate / 10) throw new Error('No readable MP3 audio was found.');
    append(encoder.flush());
    return { bytes: Buffer.concat(output, bytes), seconds: samples / sampleRate };
  } finally { decoder.free(); }
}

export async function generateAudioSample(actor: Actor, id: string) {
  const title = await audioRecord(id);
  if (actor.uid !== title.creatorId && actor.role !== 'admin') throw new WatchError(403, 'This audio belongs to another creator.');
  if (!title.ready) throw new WatchError(409, 'Finish uploading the first recording first.');
  if (title.previewReady) return { ok: true, seconds: title.previewSeconds || 0 };
  const db = await getAdminDb(); const lease = db.doc(`audioPrivate/${id}`); const token = randomUUID();
  const existing = await db.runTransaction(async tx => {
    const [lock, record] = await tx.getAll(lease, db.doc(`audioTitles/${id}`));
    if (!record.exists || record.data()?.status === 'removed') throw new WatchError(404, 'This audio is unavailable.');
    if (record.data()?.previewReady) return record.data()!.previewSeconds as number;
    const current = lock.data();
    if (current?.sampleLeaseUntil > Date.now()) throw new WatchError(409, 'The sample is being prepared. Try again shortly.');
    tx.set(lease, { sampleLeaseToken: token, sampleLeaseUntil: Date.now() + 90000 }, { merge: true });
    return null;
  });
  if (existing !== null) return { ok: true, seconds: existing };
  const bucket = await getAdminBucket(); const output = bucket.file(`audio/${title.creatorId}/${id}/preview-${token}.mp3`);
  try {
    const original = bucket.file(`audio/${title.creatorId}/${id}/playback.mp3`); const [metadata] = await original.getMetadata();
    const [header] = await original.download({ start: 0, end: 9 }); const start = mp3AudioOffset(header, Number(metadata.size));
    const [bytes] = await original.download({ start, end: Math.min(Number(metadata.size) - 1, start + SAMPLE_INPUT_BYTES - 1) });
    const sample = await firstMinuteSample(bytes);
    await output.save(sample.bytes, { resumable: false, contentType: 'audio/mpeg', metadata: { cacheControl: 'private, no-store', metadata: { afrobooksPrivate: 'true' } } });
    await db.runTransaction(async tx => {
      const ref = db.doc(`audioTitles/${id}`); const [fresh, lock] = await tx.getAll(ref, lease);
      if (!fresh.exists || fresh.data()?.status === 'removed' || lock.data()?.sampleLeaseToken !== token) throw new WatchError(409, 'This audio changed. Refresh the studio.');
      tx.update(ref, { previewReady: true, previewVersion: token, previewSeconds: sample.seconds, updatedAt: Date.now() });
      tx.set(lease, { sampleLeaseToken: null, sampleLeaseUntil: 0 }, { merge: true });
    }); return { ok: true, seconds: sample.seconds };
  } catch (error) {
    await output.delete({ ignoreNotFound: true }).catch(() => undefined);
    await db.runTransaction(async tx => { if ((await tx.get(lease)).data()?.sampleLeaseToken === token) tx.set(lease, { sampleLeaseToken: null, sampleLeaseUntil: 0 }, { merge: true }); });
    if (error instanceof WatchError) throw error;
    throw new WatchError(422, 'Your recording is saved, but its sample could not be prepared. Retry the sample or export a new MP3 if the file is damaged.');
  }
}
