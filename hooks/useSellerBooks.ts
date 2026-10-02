'use client';

import { useCallback, useEffect, useState } from 'react';
import { getSellerBooks } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';

export function useSellerBooks() {
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ uid?: string; books: Book[]; loading: boolean; error: string }>({ books: [], loading: true, error: '' });
  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  useConnectionRecovery(() => { if (result.error) retry(); });

  useEffect(() => {
    if (!uid) return;
    let active = true;
    setResult({ uid, books: [], loading: true, error: '' });
    getSellerBooks(uid).then((books) => {
      if (!active) return;
      books.sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0));
      setResult({ uid, books, loading: false, error: '' });
    }).catch(() => {
      if (active) setResult({ uid, books: [], loading: false, error: 'Your books could not be loaded. Please try again.' });
    });
    return () => { active = false; };
  }, [uid, attempt]);

  function removeLocalBook(id: string) {
    setResult((current) => current.uid === uid ? { ...current, books: current.books.filter((book) => book.id !== id) } : current);
  }

  return { books: result.uid === uid ? result.books : [], loading: !uid || result.uid !== uid || result.loading, error: result.uid === uid ? result.error : '', retry, removeLocalBook };
}
