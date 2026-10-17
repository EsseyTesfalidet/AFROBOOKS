import { getAdminDb } from '@/lib/firebase/admin';
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
  const description = string(value, fallback).replace(/\s+/g, ' ');
  return description.length > 1000 ? `${description.slice(0, 997).trimEnd()}…` : description;
}

function itemFromBook(id: string, book: Partial<Book> & Record<string, unknown>): DiscoveryItem {
  const title = string(book.title, 'African book');
  const creator = string(book.authorName || book.sellerName, 'AfroBooks author');
  return {
    id, kind: 'book', title, creator,
    description: clipDescription(book.description, `Discover ${title} by ${creator} on AfroBooks.`),
    category: string(book.genre, 'Books'), language: string(book.language, 'Unknown language'),
    image: publicImage(book.coverUrl), href: `/african-books/${encodeURIComponent(id)}`,
    publishedAt: isoDate(book.publishedAt || book.updatedAt), durationSeconds: 0, hasTrailer: false,
  };
}

function itemFromVideo(id: string, video: Partial<WatchVideo> & Record<string, unknown>): DiscoveryItem {
  const title = string(video.title, 'African film');
  const creator = string(video.creatorName, 'AfroBooks creator');
  return {
    id, kind: 'video', title, creator,
    description: clipDescription(video.description, `Watch ${title} by ${creator} on AfroBooks.`),
    category: string(video.category, 'Film'), language: string(video.language, 'Unknown language'),
    image: publicImage(video.posterUrl), href: `/african-films/${encodeURIComponent(id)}`,
    publishedAt: isoDate(video.publishedAt || video.updatedAt),
    durationSeconds: typeof video.durationSeconds === 'number' ? Math.max(0, video.durationSeconds) : 0,
    hasTrailer: video.hasTrailer === true,
  };
}

function itemFromAudio(id: string, audio: Partial<AudioTitle> & Record<string, unknown>): DiscoveryItem {
  const title = string(audio.title, 'African audio');
  const creator = string(audio.creatorName, 'AfroBooks creator');
  return {
    id, kind: 'audio', title, creator,
    description: clipDescription(audio.description, `Listen to ${title} by ${creator} on AfroBooks.`),
    category: string(audio.category, 'Audio'), language: string(audio.language, 'Unknown language'),
    image: publicImage(audio.coverUrl), href: `/african-audio/${encodeURIComponent(id)}`,
    publishedAt: isoDate(audio.updatedAt),
    durationSeconds: typeof audio.durationSeconds === 'number' ? Math.max(0, audio.durationSeconds) : 0,
    hasTrailer: audio.previewReady === true,
  };
}

export async function getPublicDiscoveryItems(kind: DiscoveryKind, category?: string, creatorId?: string): Promise<DiscoveryItem[]> {
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
}

export async function getPublicDiscoveryItem(kind: DiscoveryKind, id: string): Promise<DiscoveryItem | null> {
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
}

export async function getPublicVideoCreator(id: string) {
  if (!validPublicId(id)) return null;
  const db = await getAdminDb();
  const row = await db.doc(`watchCreators/${id}`).get();
  const data = row.data();
  if (!row.exists || data?.status !== 'approved') return null;
  return { id: row.id, name: string(data.name, 'AfroBooks creator'), description: clipDescription(data.description, `Films and documentaries from ${string(data.name, 'an African creator')} on AfroBooks.`) };
}

export async function getPublicVideoCreators(limit = 24) {
  const db = await getAdminDb();
  const videos = await db.collection('watchVideos').where('status', '==', 'published').limit(MAX_ITEMS * 3).get();
  const ids = [...new Set(videos.docs.map(row => row.data().creatorId).filter((id): id is string => typeof id === 'string' && id.length > 0))].slice(0, limit);
  if (!ids.length) return [];
  const creators = await db.getAll(...ids.map(id => db.doc(`watchCreators/${id}`)));
  return creators.flatMap(row => {
    const data = row.data();
    return data?.status === 'approved' ? [{ id: row.id, name: string(data.name, 'AfroBooks creator'), href: `/african-creators/${encodeURIComponent(row.id)}` }] : [];
  });
}

export function discoveryDescription(text: string, max = 160) {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

export function isoDuration(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${remainder ? `${remainder}S` : ''}` || 'PT0S';
}
