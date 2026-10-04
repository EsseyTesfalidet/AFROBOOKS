'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { getChapters, getPreviewChapters, getReadingProgress, saveReadingProgress } from '@/lib/firebase/firestore';
import { calculateReadingProgress } from '@/lib/utils/readingProgress';
import { captureReaderPosition, chapterPercent, localReaderPosition, newestReaderPosition, restoreReaderPosition, storeReaderPosition, readerPageMetrics, type ReaderPosition } from '@/lib/utils/readerPosition';
import type { Chapter } from '@/types/book';
import type { ReadingProgress } from '@/types/order';
import { appHaptic } from '@/lib/app/haptics';

export function useReaderSession(bookId: string, userId: string | null, hasAccess: boolean, layoutKey: string) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapter, setChapter] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [percent, setPercent] = useState(0);
  const [pagination, setPagination] = useState({ page: 0, count: 1 });
  const scrollerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef<Partial<ReaderPosition> | null>(null);
  const pendingRef = useRef<Partial<ReadingProgress> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const writeQueue = useRef(Promise.resolve());
  const writeVersion = useRef(0);
  const restoring = useRef(false);
  const mounted = useRef(true);

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const progress = pendingRef.current;
    if (!progress) return;
    const savedLocally = storeReaderPosition(bookId, userId, hasAccess, progress as ReaderPosition);
    if (!userId || !hasAccess) {
      if (savedLocally) pendingRef.current = null;
      if (mounted.current) setSaveError(savedLocally ? '' : 'Your reading position could not be saved on this device.');
      return;
    }
    pendingRef.current = null;
    const version = ++writeVersion.current;
    // Serialize writes so an older chapter cannot finish saving after a new one.
    writeQueue.current = writeQueue.current.then(() => saveReadingProgress(userId, bookId, progress)).then(() => {
      if (mounted.current && version === writeVersion.current) setSaveError('');
    }).catch(() => {
      // A failed older write must never replace a newer queued reading position.
      if (version !== writeVersion.current) return;
      if (!pendingRef.current) pendingRef.current = progress;
      if (mounted.current) setSaveError(savedLocally ? 'Your position is kept on this device. Account sync is unavailable.' : 'Your reading position could not be saved. You can keep reading and retry.');
    });
  }, [bookId, userId, hasAccess]);

  useEffect(() => {
    mounted.current = true;
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      mounted.current = false;
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [flush]);

  useEffect(() => {
    let active = true;
    Promise.all([
      hasAccess ? getChapters(bookId) : getPreviewChapters(bookId),
      userId && hasAccess ? getReadingProgress(userId, bookId).catch(() => {
        if (active) setSaveError('Account sync is unavailable. You can keep reading.');
        return null;
      }) : Promise.resolve(null),
    ]).then(([items, remote]) => {
      if (!active) return;
      const readable = (items as Chapter[]).filter(item => hasAccess || item.isPreview).sort((a, b) => a.chapterNumber - b.chapterNumber);
      const saved = newestReaderPosition(localReaderPosition(bookId, userId, hasAccess), remote);
      const current = readable.find(item => item.chapterNumber === saved?.currentChapter) ?? readable[0];
      positionRef.current = current && current.chapterNumber === saved?.currentChapter ? saved : { currentChapter: current?.chapterNumber ?? 1, scrollPosition: 0 };
      setChapters(readable); setChapter(current?.chapterNumber ?? 1);
    }).catch(() => { if (active) setLoadError('This chapter could not be loaded. Check your connection and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId, userId, hasAccess, attempt]);

  const measure = useCallback((save = true) => {
    const scroller = scrollerRef.current; const body = bodyRef.current;
    if (!scroller || !body || loading || loadError) return;
    const position = captureReaderPosition(scroller, body, chapter);
    const chapterProgress = chapterPercent(scroller, body);
    positionRef.current = position; setPercent(chapterProgress);
    if (scroller.dataset.readingMode === 'pages') {
      const { page, count } = readerPageMetrics(scroller);
      setPagination(current => current.page === page && current.count === count ? current : { page, count });
    }
    if (!save) return;
    pendingRef.current = { ...position, ...calculateReadingProgress(chapters.findIndex(item => item.chapterNumber === chapter), chapters.length, chapterProgress, hasAccess) };
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, 450);
  }, [chapter, chapters, loading, loadError, hasAccess, flush]);

  useLayoutEffect(() => {
    const scroller = scrollerRef.current; const body = bodyRef.current;
    if (loading || loadError || !scroller || !body) return;
    let frame = 0; let active = true;
    const restore = () => {
      if (!active) return;
      restoring.current = true;
      if (positionRef.current) restoreReaderPosition(scroller, body, positionRef.current);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { restoring.current = false; measure(); });
    };
    restore();
    let previous = `${scroller.clientWidth}:${scroller.clientHeight}:${body.offsetHeight}`;
    const observer = new ResizeObserver(() => {
      const size = `${scroller.clientWidth}:${scroller.clientHeight}:${body.offsetHeight}`;
      if (size !== previous) { previous = size; restore(); }
    });
    observer.observe(scroller); observer.observe(body);
    void document.fonts?.ready.then(() => { if (active) restore(); });
    return () => { active = false; observer.disconnect(); cancelAnimationFrame(frame); restoring.current = false; };
  }, [chapter, loading, loadError, layoutKey, measure]);

  function changeChapter(number: number, end = false) {
    if (!chapters.some(item => item.chapterNumber === number) || number === chapter) return;
    flush();
    positionRef.current = { currentChapter: number, scrollPosition: 0, scrollFraction: end ? 1 : 0 };
    setChapter(number); setPercent(0);
    appHaptic();
  }

  function turnPage(direction: -1 | 1) {
    const scroller = scrollerRef.current;
    if (!scroller || restoring.current) return;
    const { page, count, stride } = readerPageMetrics(scroller);
    const target = page + direction;
    if (target >= 0 && target < count) { scroller.scrollLeft = target * stride; measure(); appHaptic(); }
    else {
      const index = chapters.findIndex(item => item.chapterNumber === chapter);
      const adjacent = chapters[index + direction];
      if (adjacent) changeChapter(adjacent.chapterNumber, direction === -1);
    }
  }

  return { chapters, chapter, loading, loadError, saveError, percent, pagination, turnPage, scrollerRef, bodyRef, changeChapter,
    onScroll: () => { if (restoring.current) return false; measure(); return true; }, retry: () => { setLoading(true); setLoadError(''); setAttempt(value => value + 1); }, retrySave: flush,
  };
}
