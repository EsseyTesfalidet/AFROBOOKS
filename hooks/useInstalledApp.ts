'use client';

import { useSyncExternalStore } from 'react';
import { APP_DISPLAY, isInstalledApp } from '@/lib/app/installed';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(APP_DISPLAY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

// Presentation only. Never use display mode to authorize access or payments.
export function useInstalledApp() {
  return useSyncExternalStore(subscribe, isInstalledApp, () => false);
}
