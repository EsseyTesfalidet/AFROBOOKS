'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile, handleGoogleRedirectResult } from '@/lib/firebase/auth';
import { useAuthStore } from '@/store/authStore';

function setSessionCookie(token: string) {
  const maxAge = 60 * 60 * 24 * 7;
  document.cookie = `__session=${token}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

function clearSessionCookie() {
  document.cookie = '__session=; path=/; max-age=0';
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setUserProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      try {
        await handleGoogleRedirectResult();
      } catch {
        // ignore — not a redirect or redirect failed
      }

      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken();
            setSessionCookie(token);
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
          clearSessionCookie();
          reset();
        }
      });
    }

    init();

    return () => { unsub?.(); };
  }, []);

  return <>{children}</>;
}
