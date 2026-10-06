'use client';

import { useEffect } from 'react';
import { create } from 'zustand';
import { subscribeLiveBooks } from '@/lib/firebase/firestore';
import { newestBooks } from '@/lib/utils/catalog';
import type { Book } from '@/types/book';
import { CONNECTION_RESTORED } from '@/lib/network';

const useCatalogState = create<{ books: Book[]; loading: boolean; error: string }>(() => ({ books: [], loading: true, error: '' }));
let consumers = 0;
let generation = 0;
let unsubscribe: (() => void) | undefined;
const reconnect = () => { if (useCatalogState.getState().error) connect(); };

function connect(onSettled?: (error?: unknown) => void, retain = false) {
  unsubscribe?.();
  const current = ++generation;
  const previous = useCatalogState.getState();
  useCatalogState.setState(retain ? { ...previous, loading: previous.books.length === 0, error: '' } : { books: [], loading: true, error: '' });
  let settled = false;
  const finish = (error?: unknown) => { if (!settled) { settled = true; onSettled?.(error); } };
  try {
    unsubscribe = subscribeLiveBooks(books => {
      if (current === generation) useCatalogState.setState({ books: newestBooks(books), loading: false, error: '' });
      finish();
    }, () => {
      if (current === generation) useCatalogState.setState({ books: retain ? previous.books : [], loading: false, error: 'The catalog could not be loaded. Check your connection and try again.' });
      finish(new Error('The catalog could not be loaded. Check your connection and try again.'));
    });
  } catch (error) {
    if (current === generation) useCatalogState.setState({ books: retain ? previous.books : [], loading: false, error: 'The catalog could not be loaded. Check your connection and try again.' });
    finish(error);
  }
}

export function useCatalog() {
  const state = useCatalogState();
  useEffect(() => {
    if (consumers++ === 0) { connect(); window.addEventListener(CONNECTION_RESTORED, reconnect); }
    return () => {
      if (--consumers === 0) {
        window.removeEventListener(CONNECTION_RESTORED, reconnect);
        generation++;
        unsubscribe?.(); unsubscribe = undefined;
        useCatalogState.setState({ books: [], loading: true, error: '' });
      }
    };
  }, []);
  return { ...state, retry: () => connect(), refresh: () => new Promise<void>((resolve, reject) => connect(error => error ? reject(error) : resolve(), true)) };
}
