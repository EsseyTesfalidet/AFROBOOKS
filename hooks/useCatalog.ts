'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { subscribeLiveBooks } from '@/lib/firebase/firestore';
import { newestBooks } from '@/lib/utils/catalog';
import type { Book } from '@/types/book';

const useCatalogState = create<{ books: Book[]; loading: boolean; error: string }>(() => ({ books: [], loading: true, error: '' }));
let consumers = 0;
let generation = 0;
let unsubscribe: (() => void) | undefined;

function connect() {
  unsubscribe?.();
  const current = ++generation;
  useCatalogState.setState({ books: [], loading: true, error: '' });
  unsubscribe = subscribeLiveBooks(books => {
    if (current === generation) useCatalogState.setState({ books: newestBooks(books), loading: false, error: '' });
  }, () => {
    if (current === generation) useCatalogState.setState({ books: [], loading: false, error: 'The catalog could not be loaded. Check your connection and try again.' });
  });
}

export function useCatalog() {
  const state = useCatalogState();
  useEffect(() => {
    if (consumers++ === 0) connect();
    return () => {
      if (--consumers === 0) {
        generation++;
        unsubscribe?.(); unsubscribe = undefined;
        useCatalogState.setState({ books: [], loading: true, error: '' });
      }
    };
  }, []);
  return { ...state, retry: connect };
}
