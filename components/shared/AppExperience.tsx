'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useInstalledApp } from '@/hooks/useInstalledApp';

export default function AppExperience() {
  const installed = useInstalledApp();
  const path = usePathname();
  const router = useRouter();
  useEffect(() => {
    document.documentElement.dataset.appMode = installed ? 'installed' : 'browser';
    // The installed PWA starts at /. Open its catalog without altering the
    // website landing page or a deliberate visit to its About anchor.
    if (installed && path === '/' && !window.location.hash) router.replace('/browse');
  }, [installed, path, router]);
  return null;
}
