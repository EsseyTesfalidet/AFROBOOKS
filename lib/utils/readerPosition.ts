import type { ReadingProgress } from '@/types/order';

export interface ReaderPosition {
  currentChapter: number;
  scrollPosition: number;
  scrollFraction: number;
  positionAnchor: { block: number; fraction: number } | null;
  positionUpdatedAt: number;
}

const STORAGE_KEY = 'afrobooks-reading-positions';
const BLOCKS = 'p, h1, h2, h3, h4, h5, h6, li, blockquote, pre';
const READING_LINE = 88;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
type CachedPosition = { bookId: string; owner: string | null; full: boolean; position: ReaderPosition };

function cache(): CachedPosition[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter(item => item && typeof item.bookId === 'string' && Number.isFinite(item.position?.positionUpdatedAt) && Number.isInteger(item.position?.currentChapter)) : [];
  } catch { return []; }
}

export function localReaderPosition(bookId: string, owner: string | null, full: boolean) {
  return cache().find(item => item.bookId === bookId && item.owner === owner && item.full === full)?.position ?? null;
}

export function storeReaderPosition(bookId: string, owner: string | null, full: boolean, position: ReaderPosition) {
  try {
    const items = cache().filter(item => !(item.bookId === bookId && item.owner === owner && item.full === full));
    localStorage.setItem(STORAGE_KEY, JSON.stringify([{ bookId, owner, full, position }, ...items].slice(0, 100)));
    return true;
  } catch { return false; }
}

export function retainReaderPositions(bookIds: string[]) {
  try {
    const items = cache();
    const retained = items.filter(item => bookIds.includes(item.bookId));
    if (retained.length !== items.length) localStorage.setItem(STORAGE_KEY, JSON.stringify(retained));
  } catch { /* Device storage is optional. */ }
}

export function newestReaderPosition(local: ReaderPosition | null, remote: ReadingProgress | null) {
  const remoteTime = remote?.positionUpdatedAt ?? remote?.lastReadAt?.toMillis?.() ?? 0;
  return local && (!remote || local.positionUpdatedAt >= remoteTime) ? local : remote;
}

function blocks(body: HTMLElement) {
  return Array.from(body.querySelectorAll<HTMLElement>(BLOCKS)).filter(node => !node.querySelector(BLOCKS));
}

export function chapterPercent(scroller: HTMLElement, body: HTMLElement) {
  // The purchase prompt and navigation are outside the chapter's reading area.
  const end = body.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight;
  return end <= 0 ? 100 : Math.round(clamp(scroller.scrollTop / end) * 100);
}

export function captureReaderPosition(scroller: HTMLElement, body: HTMLElement, chapter: number): ReaderPosition {
  const nodes = blocks(body);
  const line = scroller.getBoundingClientRect().top + READING_LINE;
  const index = nodes.findIndex(node => node.getBoundingClientRect().bottom > line);
  const rect = nodes[index]?.getBoundingClientRect();
  return {
    currentChapter: chapter,
    scrollPosition: scroller.scrollTop,
    scrollFraction: clamp(scroller.scrollTop / Math.max(1, scroller.scrollHeight - scroller.clientHeight)),
    positionAnchor: scroller.scrollTop > 4 && rect ? { block: index, fraction: clamp((line - rect.top) / Math.max(1, rect.height)) } : null,
    positionUpdatedAt: Date.now(),
  };
}

export function restoreReaderPosition(scroller: HTMLElement, body: HTMLElement, position: Partial<ReaderPosition>) {
  const anchor = position.positionAnchor;
  const node = anchor && Number.isInteger(anchor.block) && anchor.block >= 0 ? blocks(body)[anchor.block] : null;
  if (node && anchor && Number.isFinite(anchor.fraction)) {
    const rect = node.getBoundingClientRect();
    scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top + rect.height * clamp(anchor.fraction) - READING_LINE;
  } else if (Number.isFinite(position.scrollFraction)) {
    scroller.scrollTop = clamp(position.scrollFraction!) * (scroller.scrollHeight - scroller.clientHeight);
  } else {
    scroller.scrollTop = Number.isFinite(position.scrollPosition) ? Math.max(0, position.scrollPosition!) : 0;
  }
}
