import { getAdminDb } from '@/lib/firebase/admin';
import { cache } from 'react';
import { bookSampleAllowed, bookSampleText, publicAudioSamplePath } from '@/lib/seo/publicSamples';
import type { Book } from '@/types/book';
import type { AudioTitle } from '@/types/audio';
import type { WatchVideo } from '@/types/video';

export type DiscoveryKind = 'book' | 'video' | 'audio';
export type DiscoveryItem = {
  id: string;
  kind: DiscoveryKind;
  title: string;
  creator: string;
  description: string;
  category: string;
  language: string;
  image: string;
  href: string;
  publishedAt: string;
  durationSeconds: number;
  hasTrailer: boolean;
  creatorHref?: string;
  format?: string;
  tags?: string[];
};

const MAX_ITEMS = 36;
const ID_MAX = 1500;

export function validPublicId(id: string) {
  return typeof id === 'string' && id.length > 0 && id.length <= ID_MAX && !id.includes('/') && id !== '.' && id !== '..';
}

function string(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function publicImage(value: unknown): string {
  const image = string(value);
  try { return new URL(image).protocol === 'https:' ? image : ''; }
  catch { return ''; }
}

function isoDate(value: unknown): string {
  const date = value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : value instanceof Date ? value : typeof value === 'number' || typeof value === 'string' ? new Date(value) : null;
  return date instanceof Date && Number.isFinite(date.getTime()) ? date.toISOString() : '';
}

function clipDescription(value: unknown, fallback: string): string {
  const description = string(value, fallback).replace(/\r\n?/g, '\n').trim() || fallback;
  return description.length > 6000 ? `${description.slice(0, 5997).trimEnd()}…` : description;
}

function itemFromBook(id: string, book: Partial<Book> & Record<string, unknown>): DiscoveryItem {
  const title = string(book.title, 'African book');
  const creator = string(book.authorName || book.sellerName, 'AfroNarra author');
  return {
    id, kind: 'book', title, creator,
    description: clipDescription(book.description, `Discover ${title} by ${creator} on AfroNarra.`),
    category: string(book.genre, 'Books'), language: string(book.language, 'Unknown language'),
    image: publicImage(book.coverUrl), href: `/african-books/${encodeURIComponent(id)}`,
    publishedAt: isoDate(book.publishedAt || book.updatedAt), durationSeconds: 0, hasTrailer: false,
    creatorHref: validPublicId(string(book.sellerId)) ? `/author/${encodeURIComponent(string(book.sellerId))}` : undefined,
    format: book.publicationType === 'magazine' ? 'Magazine' : book.publicationType === 'short_story' ? 'Short story' : 'Book',
    tags: Array.isArray(book.tags) ? book.tags.filter((tag): tag is string => typeof tag === 'string').map(tag => tag.trim().slice(0, 60)).filter(Boolean).slice(0, 8) : [],
  };
}

function itemFromVideo(id: string, video: Partial<WatchVideo> & Record<string, unknown>): DiscoveryItem {
  const title = string(video.title, 'African film');
  const creator = string(video.creatorName, 'AfroNarra creator');
  return {
    id, kind: 'video', title, creator,
    description: clipDescription(video.description, `Watch ${title} by ${creator} on AfroNarra.`),
    category: string(video.category, 'Film'), language: string(video.language, 'Unknown language'),
    image: publicImage(video.posterUrl), href: `/african-films/${encodeURIComponent(id)}`,
    publishedAt: isoDate(video.publishedAt || video.updatedAt),
    durationSeconds: typeof video.durationSeconds === 'number' ? Math.max(0, video.durationSeconds) : 0,
    hasTrailer: video.hasTrailer === true,
    creatorHref: validPublicId(string(video.creatorId)) ? `/african-creators/${encodeURIComponent(string(video.creatorId))}` : undefined,
    format: string(video.category, 'Film & video'),
  };
}

function itemFromAudio(id: string, audio: Partial<AudioTitle> & Record<string, unknown>): DiscoveryItem {
  const title = string(audio.title, 'African audio');
  const creator = string(audio.creatorName, 'AfroNarra creator');
  return {
    id, kind: 'audio', title, creator,
    description: clipDescription(audio.description, `Listen to ${title} by ${creator} on AfroNarra.`),
    category: string(audio.category, 'Audio'), language: string(audio.language, 'Unknown language'),
    image: publicImage(audio.coverUrl), href: `/african-audio/${encodeURIComponent(id)}`,
    publishedAt: isoDate(audio.updatedAt),
    durationSeconds: typeof audio.durationSeconds === 'number' ? Math.max(0, audio.durationSeconds) : 0,
    hasTrailer: publicAudioSamplePath({ ...audio, id }) !== null,
    format: string(audio.category, 'Audio'),
  };
}

export const getPublicDiscoveryItems = cache(async (kind: DiscoveryKind, category?: string, creatorId?: string): Promise<DiscoveryItem[]> => {
  const db = await getAdminDb();
  const collection = kind === 'book' ? 'books' : kind === 'video' ? 'watchVideos' : 'audioTitles';
  const status = kind === 'book' ? 'live' : 'published';
  let query = db.collection(collection).where('status', '==', status);
  if (creatorId && kind === 'video') query = query.where('creatorId', '==', creatorId);
  const rows = await query.limit(MAX_ITEMS * 3).get();
  const items = rows.docs.flatMap((row) => {
    const data = row.data();
    if (kind === 'book') {
      if (data.deletionPending === true) return [];
      return [itemFromBook(row.id, data as Partial<Book> & Record<string, unknown>)];
    }
    if (kind === 'video') return [itemFromVideo(row.id, data as Partial<WatchVideo> & Record<string, unknown>)];
    if (data.ready !== true || data.status === 'removed') return [];
    return [itemFromAudio(row.id, data as Partial<AudioTitle> & Record<string, unknown>)];
  }).filter((item) => !category || item.category.toLowerCase() === category.toLowerCase());
  return items.sort((a, b) => (b.publishedAt || '').localeCompare(a.publishedAt || '')).slice(0, MAX_ITEMS);
});

export const getPublicDiscoveryItem = cache(async (kind: DiscoveryKind, id: string): Promise<DiscoveryItem | null> => {
  if (!validPublicId(id)) return null;
  const db = await getAdminDb();
  const collection = kind === 'book' ? 'books' : kind === 'video' ? 'watchVideos' : 'audioTitles';
  const row = await db.collection(collection).doc(id).get();
  if (!row.exists) return null;
  const data = row.data()!;
  if (kind === 'book') {
    if (data.status !== 'live' || data.deletionPending === true) return null;
    return itemFromBook(row.id, data as Partial<Book> & Record<string, unknown>);
  }
  if (kind === 'video') {
    if (data.status !== 'published') return null;
    return itemFromVideo(row.id, data as Partial<WatchVideo> & Record<string, unknown>);
  }
  if (data.status !== 'published' || data.ready !== true) return null;
  return itemFromAudio(row.id, data as Partial<AudioTitle> & Record<string, unknown>);
});

export async function getPublicBookSample(id: string): Promise<{ title: string; text: string } | null> {
  if (!validPublicId(id)) return null;
  const db = await getAdminDb();
  const book = await db.doc(`books/${id}`).get();
  if (!book.exists || !bookSampleAllowed(book.data()!)) return null;
  // Only chapters explicitly marked as public may enter the page response.
  const chapters = await book.ref.collection('chapters').where('isPreview', '==', true).limit(12).get();
  const chapter = chapters.docs.map(row => row.data()).sort((a, b) => (a.chapterNumber || 0) - (b.chapterNumber || 0))[0];
  if (!chapter || chapter.isPreview !== true || typeof chapter.content !== 'string') return null;
  const text = bookSampleText(chapter.content);
  return text ? { title: string(chapter.title, 'Book sample'), text } : null;
}

export async function getPublicVideoCreator(id: string) {
  if (!validPublicId(id)) return null;
  const db = await getAdminDb();
  const row = await db.doc(`watchCreators/${id}`).get();
  const data = row.data();
  if (!row.exists || data?.status !== 'approved') return null;
  return { id: row.id, name: string(data.name, 'AfroNarra creator'), description: clipDescription(data.description, `Films and documentaries from ${string(data.name, 'an African creator')} on AfroNarra.`) };
}

export async function getPublicVideoCreators(limit = 24) {
  const db = await getAdminDb();
  const videos = await db.collection('watchVideos').where('status', '==', 'published').limit(MAX_ITEMS * 3).get();
  const ids = [...new Set(videos.docs.map(row => row.data().creatorId).filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, limit);
  if (!ids.length) return [];
  const creators = await db.getAll(...ids.map(id => db.doc(`watchCreators/${id}`)));
  return creators.flatMap(row => {
    const data = row.data();
    return data?.status === 'approved' ? [{ id: row.id, name: string(data.name, 'AfroNarra creator'), href: `/african-creators/${encodeURIComponent(row.id)}` }] : [];
  });
}

export function discoveryDescription(text: string, max = 160) {
  const description = text.replace(/\s+/g, ' ').trim();
  const characters = Array.from(description);
  return characters.length <= max ? description : `${characters.slice(0, max - 1).join('').trimEnd()}…`;
}

export function isoDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remainder ? `${remainder}S` : ''}` || 'PT0S';
}
