import { z } from 'zod';
import { AUDIO_CATEGORIES, type AudioTitle } from '@/types/audio';
export const AUDIO_MAX_BYTES = 250 * 1024 * 1024;
export const AUDIO_PREVIEW_MAX_BYTES = 2 * 1024 * 1024;
export const AUDIO_PREVIEW_MAX_SECONDS = 60;
export const AUDIO_TITLE_MAX_BYTES = 1024 * 1024 * 1024;
export const AUDIO_MAX_PARTS = 50;
export const audioChapters = z.array(z.object({
  title: z.string().trim().min(1).max(120), startSeconds: z.number().finite().int().min(0).max(172799),
})).max(100).superRefine((chapters, context) => {
  if (chapters.length && chapters[0].startSeconds !== 0) context.addIssue({ code: 'custom', message: 'The first chapter must start at 0:00.' });
  for (let i = 1; i < chapters.length; i++) if (chapters[i].startSeconds <= chapters[i - 1].startSeconds) context.addIssue({ code: 'custom', message: 'Chapter times must increase without duplicates.' });
});
export function validateChapterDuration(chapters: { startSeconds: number }[], duration: number) {
  if (duration > 0 && chapters.some(chapter => chapter.startSeconds >= duration)) throw new Error('Each chapter must start before the recording ends.');
}
export function parseAudioTime(value: string) {
  const parts = value.trim().split(':');
  if (parts.length < 2 || parts.length > 3 || parts.some(part => !/^\d{1,3}$/.test(part)) || parts.slice(1).some(part => Number(part) > 59)) return null;
  return parts.reduce((total, part) => total * 60 + Number(part), 0);
}
export const audioId = z.string().uuid();
export const audioDraft = z.object({
  title: z.string().trim().min(2).max(160), description: z.string().trim().min(10).max(4000),
  category: z.enum(AUDIO_CATEGORIES), language: z.string().trim().min(2).max(60),
  rightsAccepted: z.literal(true),
  priceCents: z.number().int().min(0).max(9999).refine(value => value === 0 || value >= 99, 'Choose free or at least $0.99.'),
  musicSubscription: z.boolean().default(false),
  chapters: audioChapters.default([]),
  mainTitle: z.string().trim().min(1).max(120).default('Part 1'),
  partTitles: z.array(z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120) })).max(AUDIO_MAX_PARTS - 1).optional(),
}).superRefine((value, context) => {
  if (value.musicSubscription && value.category !== 'Music') context.addIssue({ code: 'custom', message: 'The music subscription is for music recordings.' });
  if (value.category === 'Music' && value.priceCents !== 0) context.addIssue({ code: 'custom', message: 'Choose free music or include it in the music subscription.' });
});
export function mp3Signature(bytes: Uint8Array) {
  return bytes.length >= 3 && ((bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) ||
    (bytes[0] === 255 && (bytes[1] & 224) === 224 && (bytes[1] & 6) !== 0 && (bytes[2] & 240) !== 240));
}
export function audioTime(seconds: number) {
  const value = Math.max(0, Math.floor(seconds || 0));
  return value >= 3600 ? `${Math.floor(value / 3600)}:${String(Math.floor(value / 60) % 60).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}` : `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}
export function audioTracks(title: AudioTitle) {
  let start = 0;
  return [{ id: 'main', title: title.mainTitle || 'Part 1', durationSeconds: title.mainDurationSeconds ?? title.durationSeconds, ready: title.ready }, ...(title.parts || [])]
    .filter(part => part.ready).map(part => { const result = { ...part, startSeconds: start }; start += part.durationSeconds; return result; });
}
export function audioTrackAt(title: AudioTitle, seconds: number) {
  const tracks = audioTracks(title);
  return tracks.find((track, index) => seconds < track.startSeconds + track.durationSeconds || index === tracks.length - 1);
}
