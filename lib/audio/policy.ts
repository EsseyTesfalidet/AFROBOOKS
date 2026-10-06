import { z } from 'zod';
import { AUDIO_CATEGORIES } from '@/types/audio';
export const AUDIO_MAX_BYTES = 250 * 1024 * 1024;
export const audioId = z.string().uuid();
export const audioDraft = z.object({
  title: z.string().trim().min(2).max(160), description: z.string().trim().min(10).max(4000),
  category: z.enum(AUDIO_CATEGORIES), language: z.string().trim().min(2).max(60),
  rightsAccepted: z.literal(true),
  priceCents: z.number().int().min(0).max(9999).refine(value => value === 0 || value >= 99, 'Choose free or at least $0.99.'),
  musicSubscription: z.boolean().default(false),
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
