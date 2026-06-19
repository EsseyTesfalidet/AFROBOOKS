'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile } from '@/lib/firebase/auth';
import { clearAuthSession, setClientAuthHints, syncAuthSession } from '@/lib/firebase/session';
import { useAuthStore } from '@/store/authStore';

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setFirebaseUser, setUserProfile, setLoading, reset } = useAuthStore();

  useEffect(() => {
    let unsub: (() => void) | undefined;

    async function revokeAccess() {
      await clearAuthSession();
      await auth.signOut().catch(() => undefined);
      reset();

      if (
        typeof window !== 'undefined' &&
        !window.location.pathname.startsWith('/login') &&
        !window.location.pathname.startsWith('/signup')
      ) {
        window.location.replace('/login');
      }
    }

    async function init() {
      unsub = onAuthStateChanged(auth, async (firebaseUser) => {
        if (firebaseUser) {
          try {
            const profile = await getUserProfile(firebaseUser.uid);
            if (!profile || profile.status === 'suspended' || profile.status === 'banned') {
              await revokeAccess();
              return;
            }

            setFirebaseUser(firebaseUser);
            setUserProfile(profile);
            setClientAuthHints(firebaseUser.uid, profile.role ?? 'buyer');

            const token = await firebaseUser.getIdToken();
            await syncAuthSession(token, firebaseUser.uid);
          } catch {
            await clearAuthSession();
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
