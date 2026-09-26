'use client';

import { useEffect } from 'react';
import { useCatalog } from '@/hooks/useCatalog';
import { useCartStore } from '@/store/cartStore';
import { useRecentlyViewedStore } from '@/store/recentlyViewedStore';

export default function CatalogSync() {
  const { books, loading, error } = useCatalog();
  const items = useCartStore(state => state.items);
  const recent = useRecentlyViewedStore(state => state.bookIds);
  useEffect(() => {
    if (loading || error) return;
    useCartStore.getState().reconcileBooks(books);
    useRecentlyViewedStore.getState().retainBooks(books.map(book => book.id));
  }, [books, loading, error, items, recent]);
  return null;
}
