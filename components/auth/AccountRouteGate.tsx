'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { accountPageAccess, protectedPage } from '@/lib/auth/routeAccess';
import { isSeparateAccount, tabAccountStorageAvailable } from '@/lib/auth/tabAccount';

const subscribe = () => () => {};
const storageBlocked = () => isSeparateAccount() && !tabAccountStorageAvailable();

export default function AccountRouteGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { firebaseUser, userProfile, loading } = useAuthStore();
  const blockedStorage = useSyncExternalStore(subscribe, storageBlocked, () => false);
  const access = accountPageAccess(path, firebaseUser?.uid, userProfile);
  const pending = protectedPage(path) && loading;
  useEffect(() => {
    if (pending || blockedStorage || access === 'allow') return;
    router.replace(access === 'denied' ? '/browse' : `/login?redirect=${encodeURIComponent(path + window.location.search)}`);
  }, [access, blockedStorage, pending, path, router]);
  if (blockedStorage) return <main className="grid min-h-dvh place-items-center p-6"><p role="alert">Enable browser storage to sign in to a separate account, or use a private browser window.</p></main>;
  if (pending || access !== 'allow') return <main className="grid min-h-dvh place-items-center p-6"><p role="status">{pending ? 'Opening your account…' : 'Opening sign-in…'}</p></main>;
  return <>{children}</>;
}
