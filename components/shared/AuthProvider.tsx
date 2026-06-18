'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile } from '@/lib/firebase/auth';
import { clearAuthSession, syncAuthSession } from '@/lib/firebase/session';
import { useAuthStore } from '@/store/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setUserProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function init() {
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken();
            await syncAuthSession(token, firebaseUser.uid);
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
          await clearAuthSession();
          reset();
        }
      });
    }

    init();

    return () => { unsub?.(); };
  }, []);

  return <>{children}</>;
}
