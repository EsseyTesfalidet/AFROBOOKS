'use client';

import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';

export function useAdminCollection<T>(name: string) {
  const [state, setState] = useState<{
    data: (T & { id: string })[];
    loading: boolean;
    error: string;
  }>({ data: [], loading: true, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(
    () =>
      onSnapshot(
        collection(db, name),
        (snapshot) =>
          setState({
            data: snapshot.docs.map(
              (item) => ({ ...item.data(), id: item.id }) as T & { id: string },
            ),
            loading: false,
            error: '',
          }),
        () =>
          setState((previous) => ({
            ...previous,
            loading: false,
            error: 'Unable to load these records. Check your connection and try again.',
          })),
      ),
    [name, attempt],
  );
  return {
    ...state,
    retry: () => {
      setState((previous) => ({ ...previous, loading: true, error: '' }));
      setAttempt((value) => value + 1);
    },
  };
}
