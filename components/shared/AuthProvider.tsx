'use client';

import { useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { getUserProfile } from '@/lib/firebase/auth';
import { clearAuthSession, setClientAuthHints, syncAuthSession } from '@/lib/firebase/session';
import { useAuthStore } from '@/store/authStore';
import { waitForAuthFlow } from '@/lib/auth/flow';
import { isPhoneSignInProvider } from '@/lib/auth/mobileSignIn';
import { isInstalledApp } from '@/lib/app/installed';

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
        await waitForAuthFlow();
        if (auth.currentUser !== firebaseUser) return;
        if (useAuthStore.getState().firebaseUser?.uid !== firebaseUser?.uid) {
          setLoading(true);
          setUserProfile(null);
          setFirebaseUser(firebaseUser);
        }
        if (firebaseUser) {
          try {
            let signInProvider: string | null;
            try { signInProvider = (await firebaseUser.getIdTokenResult()).signInProvider; }
            catch { await revokeAccess(); return; }
            if (isPhoneSignInProvider(signInProvider)) { await revokeAccess(); return; }
            const profile = await getUserProfile(firebaseUser.uid);
            if (auth.currentUser !== firebaseUser) return;
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
            if (auth.currentUser !== firebaseUser) return;
            await clearAuthSession();
            setFirebaseUser(firebaseUser);
            setUserProfile(null);
          } finally {
            if (auth.currentUser === firebaseUser) setLoading(false);
          }
        } else {
          if (isInstalledApp()) {
            setFirebaseUser(null);
            setUserProfile(null);
            setLoading(true);
          }
          await clearAuthSession();
          if (!auth.currentUser) reset();
        }
      });
    }

    init();

    return () => { unsub?.(); };
  }, [reset, setFirebaseUser, setLoading, setUserProfile]);

  return <>{children}</>;
}
