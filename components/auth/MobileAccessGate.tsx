'use client';

import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAuthStore } from '@/store/authStore';
import { hasMobileAccount, isPublicMobilePage, mobileLoginHref, saveMobileGiftToken } from '@/lib/auth/mobileAccess';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export default function MobileAccessGate({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const installed = useInstalledApp();
  const hydrated = useSyncExternalStore(subscribe, clientReady, serverReady);
  const auth = useAuthStore();
  const publicPage = isPublicMobilePage(path);
  const blocked = installed && !publicPage && !hasMobileAccount(auth);

  useEffect(() => {
    if (!blocked || auth.loading) return;
    saveMobileGiftToken(path, window.location.hash);
    router.replace(mobileLoginHref(path, window.location.search));
  }, [blocked, auth.loading, path, router]);

  if (blocked) return <main className="flex min-h-dvh items-center justify-center px-6 text-center">
    <div role="status" className="space-y-4 text-sm text-[#a8abb5]">
      <p>{auth.loading ? 'Opening your account…' : 'Sign in to continue to AfroBooks.'}</p>
      {!auth.loading && <Link href={mobileLoginHref(path)} className="inline-flex min-h-11 items-center text-[#ffa18b] underline">Sign in</Link>}
    </div>
  </main>;

  // Preserve website rendering. Installed mode is set before paint by the head
  // script, so this server-rendered content stays hidden until auth is checked.
  return <div className="contents" data-mobile-access={!hydrated && !publicPage ? 'pending' : 'ready'}>{children}</div>;
}
