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

export function readerPageMetrics(scroller: HTMLElement) {
  const gap = parseFloat(getComputedStyle(scroller).getPropertyValue('--reader-page-gap')) || 32;
  // Columns can have fractional CSS widths on phones. Rounded clientWidth
  // accumulates an offset on every turn and eventually clips the page edges.
  const stride = scroller.getBoundingClientRect().width + gap;
  const count = Math.max(1, Math.round((scroller.scrollWidth + gap) / Math.max(1, stride)));
  return { stride, count, page: Math.max(0, Math.min(count - 1, Math.round(scroller.scrollLeft / Math.max(1, stride)))) };
}

function paged(scroller: HTMLElement) { return scroller.dataset.readingMode === 'pages'; }

export function chapterPercent(scroller: HTMLElement, body: HTMLElement) {
  if (paged(scroller)) {
    const { page, stride } = readerPageMetrics(scroller);
    const last = Array.from(body.getClientRects()).at(-1);
    const endPage = last ? Math.round((last.left - scroller.getBoundingClientRect().left + scroller.scrollLeft) / stride) : 0;
    return endPage <= 0 ? 100 : Math.round(clamp(page / endPage) * 100);
  }
  // The purchase prompt and navigation are outside the chapter's reading area.
  const end = body.getBoundingClientRect().bottom - scroller.getBoundingClientRect().top + scroller.scrollTop - scroller.clientHeight;
  return end <= 0 ? 100 : Math.round(clamp(scroller.scrollTop / end) * 100);
}

export function captureReaderPosition(scroller: HTMLElement, body: HTMLElement, chapter: number): ReaderPosition {
  const nodes = blocks(body);
  const viewport = scroller.getBoundingClientRect();
  const isPaged = paged(scroller);
  const line = viewport.top + (isPaged ? 0 : READING_LINE);
  let fraction = 0;
  const index = nodes.findIndex(node => {
    const rects = Array.from(node.getClientRects());
    const visible = rects.findIndex(rect => rect.bottom > line && (!isPaged || rect.right > viewport.left + 1 && rect.left < viewport.right - 1));
    if (visible < 0) return false;
    const height = rects.reduce((sum, rect) => sum + rect.height, 0);
    fraction = clamp((rects.slice(0, visible).reduce((sum, rect) => sum + rect.height, 0) + Math.max(0, line - rects[visible].top)) / Math.max(1, height));
    return true;
  });
  const metrics = isPaged ? readerPageMetrics(scroller) : null;
  const offset = isPaged ? scroller.scrollLeft : scroller.scrollTop;
  return {
    currentChapter: chapter,
    scrollPosition: offset,
    scrollFraction: metrics ? metrics.page / Math.max(1, metrics.count - 1) : clamp(offset / Math.max(1, scroller.scrollHeight - scroller.clientHeight)),
    positionAnchor: offset > 4 && index >= 0 ? { block: index, fraction } : null,
    positionUpdatedAt: Date.now(),
  };
}

export function restoreReaderPosition(scroller: HTMLElement, body: HTMLElement, position: Partial<ReaderPosition>) {
  const isPaged = paged(scroller);
  const metrics = isPaged ? readerPageMetrics(scroller) : null;
  const anchor = position.positionAnchor;
  const node = anchor && Number.isInteger(anchor.block) && anchor.block >= 0 ? blocks(body)[anchor.block] : null;
  if (node && anchor && Number.isFinite(anchor.fraction)) {
    const rects = Array.from(node.getClientRects());
    let offset = rects.reduce((sum, rect) => sum + rect.height, 0) * clamp(anchor.fraction);
    let rect = rects[0];
    for (const [index, item] of rects.entries()) { rect = item; if (offset < item.height || index === rects.length - 1) break; offset -= item.height; }
    if (!rect) return;
    if (metrics) {
      const left = rect.left - scroller.getBoundingClientRect().left + scroller.scrollLeft;
      scroller.scrollLeft = Math.max(0, Math.min(metrics.count - 1, Math.round(left / metrics.stride))) * metrics.stride;
    } else scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top + offset - READING_LINE;
  } else if (Number.isFinite(position.scrollFraction)) {
    if (metrics) scroller.scrollLeft = Math.round(clamp(position.scrollFraction!) * (metrics.count - 1)) * metrics.stride;
    else scroller.scrollTop = clamp(position.scrollFraction!) * (scroller.scrollHeight - scroller.clientHeight);
  } else {
    const offset = Number.isFinite(position.scrollPosition) ? Math.max(0, position.scrollPosition!) : 0;
    if (metrics) scroller.scrollLeft = Math.min(metrics.count - 1, Math.round(offset / metrics.stride)) * metrics.stride;
    else scroller.scrollTop = offset;
  }
  if (isPaged) scroller.scrollTop = 0;
  else scroller.scrollLeft = 0;
}
