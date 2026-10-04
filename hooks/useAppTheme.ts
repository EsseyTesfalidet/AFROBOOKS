'use client';

import { useSyncExternalStore } from 'react';
import type { AppTheme } from '@/lib/app/appearance';

function subscribe(listener: () => void) {
  window.addEventListener('afrobooks:theme', listener);
  return () => window.removeEventListener('afrobooks:theme', listener);
}
function snapshot(): AppTheme { return document.documentElement.dataset.appTheme === 'light' ? 'light' : 'dark'; }
export function useAppTheme() { return useSyncExternalStore(subscribe, snapshot, (): AppTheme => 'dark'); }
