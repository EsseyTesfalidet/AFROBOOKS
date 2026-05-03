'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { getReadingProgress, saveReadingProgress } from '@/lib/firebase/firestore';
import { useReaderStore } from '@/store/readerStore';

export function useReader(userId: string | null, bookId: string) {
  const [percentComplete, setPercentComplete] = useState(0);
  const { currentChapter, setCurrentChapter } = useReaderStore();
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!userId) return;
    getReadingProgress(userId, bookId).then((progress) => {
      if (progress) {
        setCurrentChapter(progress.currentChapter);
        setPercentComplete(progress.percentComplete);
      }
    });
  }, [userId, bookId]);

  const saveProgress = useCallback(
    (scrollPosition: number, percent: number, chapter: number) => {
      if (!userId) return;
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => {
        saveReadingProgress(userId, bookId, {
          currentChapter: chapter,
          scrollPosition,
          percentComplete: percent,
          isFinished: percent >= 95,
        });
        setPercentComplete(percent);
      }, 30000);
    },
    [userId, bookId]
  );

  return {
    currentChapter,
    setCurrentChapter,
    percentComplete,
    saveProgress,
  };
}
