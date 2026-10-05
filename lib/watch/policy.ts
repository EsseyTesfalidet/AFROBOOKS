import { z } from 'zod';
import { VIDEO_CATEGORIES, type WatchState, type WatchVideo } from '../../types/video';

export const watchId = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);
export const videoDraftSchema = z.object({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().min(20).max(5000),
  category: z.enum(VIDEO_CATEGORIES),
  language: z.string().trim().min(2).max(60),
  priceCents: z.number().int().min(0).max(4999).refine(value => value === 0 || value >= 99, 'Use Free or a price of at least $0.99.'),
  newsDate: z.string().max(10).refine(value => value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value))), 'Use a valid publication date.'),
  rightsStatement: z.string().trim().min(30).max(3000),
  rightsAccepted: z.literal(true),
}).strict().refine(value => value.category !== 'News & interviews' || !!value.newsDate, { message: 'News needs a publication date.', path: ['newsDate'] });

export const uploadSchema = z.object({
  id: watchId,
  kind: z.enum(['full', 'trailer']),
  size: z.number().int().min(1).max(10 * 1024 ** 3),
  maximumSeconds: z.number().int().min(10).max(10800),
}).strict().refine(value => value.kind !== 'trailer' || value.maximumSeconds <= 300, 'Trailers must be five minutes or shorter.');

export const captionSchema = z.object({
  id: watchId, kind: z.enum(['full', 'trailer']),
  // ISO 639-1, including ti (Tigrinya). Provider-supported languages are
  // validated again by Stream; never quietly substitute another language.
  language: z.string().regex(/^[a-z]{2}$/),
  text: z.string().min(8).max(500_000).refine(value => /^\uFEFF?WEBVTT(?:\s|$)/.test(value), 'Upload a UTF-8 WebVTT (.vtt) subtitle file.'),
}).strict();

export function videoAccess(video: WatchVideo, uid: string, admin: boolean, owned: boolean, trailer = false) {
  if (admin) return true;
  if (video.status === 'removed') return false;
  if (video.creatorId === uid) return true;
  if (!['published', 'unlisted'].includes(video.status)) return false;
  if (owned) return true;
  if (video.status !== 'published') return false;
  return trailer ? video.hasTrailer : video.priceCents === 0;
}

export function publicVideo(data: WatchVideo): WatchVideo {
  // Explicit allow-list: adding private fields to a DB document cannot expose
  // them through this API accidentally.
  return {
    id: data.id, creatorId: data.creatorId, creatorName: data.creatorName,
    title: data.title, description: data.description, category: data.category,
    language: data.language, priceCents: data.priceCents, currency: 'usd',
    posterUrl: data.posterUrl, durationSeconds: data.durationSeconds,
    hasTrailer: data.hasTrailer, status: data.status,
    publishedAt: data.publishedAt, newsDate: data.newsDate, updatedAt: data.updatedAt,
  };
}
export const EMPTY_WATCH_STATE: WatchState = { saved: false, owned: false, seconds: 0, following: false };
export function videoDuration(seconds: number) {
  const whole = Math.max(0, Math.floor(seconds));
  return whole >= 3600 ? `${Math.floor(whole / 3600)}:${String(Math.floor(whole / 60) % 60).padStart(2, '0')}:${String(whole % 60).padStart(2, '0')}` : `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}
export function videoPrice(cents: number) { return cents ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100) : 'Free'; }

export function posterMime(bytes: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  const hex = Buffer.from(bytes.subarray(0, 12)).toString('hex');
  if (hex.startsWith('89504e470d0a1a0a')) return 'image/png';
  if (hex.startsWith('ffd8ff')) return 'image/jpeg';
  if (hex.startsWith('52494646') && hex.slice(16, 24) === '57454250') return 'image/webp';
  return null;
}
