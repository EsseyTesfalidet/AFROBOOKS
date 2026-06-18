'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';

async function setSessionCookie(token: string) {
  await fetch('/api/auth/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ idToken: token }),
  });
}

async function clearSessionCookie() {
  await fetch('/api/auth/session', {
    method: 'DELETE',
    credentials: 'include',
  }).catch(() => undefined);
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setUserProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken();
            await setSessionCookie(token);
            setFirebaseUser(firebaseUser);
            const profile = await getUserProfile(firebaseUser.uid);
            setUserProfile(profile);
          } catch {
            setFirebaseUser(firebaseUser);
            setUserProfile(null);
          } finally {
            setLoading(false);
          }
        } else {
          await clearSessionCookie();
          reset();
        }
      });
    }

    init();

    return () => { unsub?.(); };
  }, []);

  return <>{children}</>;
}
