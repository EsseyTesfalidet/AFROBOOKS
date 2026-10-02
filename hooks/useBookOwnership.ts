'use client';

import { useEffect, useState } from 'react';
import { doc, getDocFromServer, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { syncPurchasedLibrary } from '@/lib/firebase/syncLibrary';
import { useAuthStore } from '@/store/authStore';
import { useConnectionRecovery } from '@/hooks/useConnectionRecovery';

export function useBookOwnership(bookId: string) {
  const user = useAuthStore(s => s.firebaseUser);
  const authLoading = useAuthStore(s => s.loading);
  const [state, setState] = useState<{ key: string; owned: boolean; checking: boolean; error: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useConnectionRecovery(() => { if (state?.error || state?.checking) setAttempt(value => value + 1); });
  const key = JSON.stringify([user?.uid ?? null, bookId]);
  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    let attempted = false;
    let recovering = false;
    let latestOwned = false;
    let revision = 0;
    let recoveryError = '';
    const ref = doc(db, 'library', `${user.uid}_${bookId}`);
    const owns = (data: { userId?: string; bookId?: string; purchaseType?: string } | undefined) => data?.userId === user.uid && data.bookId === bookId && ['bought', 'free_copy'].includes(data.purchaseType ?? '');
    const update = (owned: boolean, checking = false, error = '') => { if (active) setState({ key, owned, checking, error }); };
    const unsubscribe = onSnapshot(ref, { includeMetadataChanges: true }, snapshot => {
      const owned = owns(snapshot.data());
      revision++;
      latestOwned = owned;
      if (owned) { recoveryError = ''; update(true); return; }
      if (snapshot.metadata.fromCache || recovering) return;
      if (attempted) { update(false, false, recoveryError); return; }
      attempted = true; recovering = true; update(false, true);
      void syncPurchasedLibrary(user.uid, bookId).then(async result => {
        const beforeRead = revision;
        const refreshed = await getDocFromServer(ref);
        if (revision === beforeRead) latestOwned = owns(refreshed.data());
        recovering = false;
        recoveryError = !latestOwned && result.pendingOrderIds.length ? 'A previous payment needs checking. Open your library and receipt before paying again.' : '';
        update(latestOwned, false, recoveryError);
      }).catch(() => {
        recovering = false;
        recoveryError = latestOwned ? '' : 'Your purchase status could not be checked. Open your library or try again before paying.';
        update(latestOwned, false, recoveryError);
      });
    }, () => update(false, false, 'Your library could not be checked. Please try again before paying.'));
    return () => { active = false; unsubscribe(); };
  }, [key, user?.uid, authLoading, bookId, attempt]);
  if (authLoading) return { owned: false, checking: true, error: '' };
  if (!user) return { owned: false, checking: false, error: '' };
  if (state?.key !== key) return { owned: false, checking: true, error: '' };
  return state;
}
