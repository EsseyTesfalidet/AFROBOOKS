'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useCartStore } from '@/store/cartStore';

// Keep paid books out of checkout, including purchases in another tab/device.
// The server independently enforces ownership and concurrent payment locking.
export function useOwnedCart() {
  const user = useAuthStore(s => s.firebaseUser);
  const authLoading = useAuthStore(s => s.loading);
  const items = useCartStore(s => s.items);
  const removeItem = useCartStore(s => s.removeItem);
  const [state, setState] = useState<{ uid: string; owned: string[]; error: boolean } | null>(null);
  useEffect(() => {
    setState(null);
    if (!user) return;
    return onSnapshot(query(collection(db, 'library'), where('userId', '==', user.uid)), snapshot => {
      setState({ uid: user.uid, owned: snapshot.docs.filter(d => ['bought', 'free_copy'].includes(d.data().purchaseType)).map(d => d.data().bookId), error: false });
    }, () => setState({ uid: user.uid, owned: [], error: true }));
  }, [user?.uid]);
  const owned = state?.uid === user?.uid ? state?.owned ?? [] : [];
  const stale = items.filter(item => owned.includes(item.bookId));
  useEffect(() => { stale.forEach(item => removeItem(item.bookId)); }, [items, state, removeItem]);
  return { loading: authLoading || (!!user && state?.uid !== user.uid) || stale.length > 0, error: state?.uid === user?.uid && state?.error ? 'Your library could not be checked. Please refresh before paying.' : '' };
}
