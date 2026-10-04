'use client';

import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const isAndroid = () => /Android/i.test(navigator.userAgent);

export function useAndroidDevice() {
  return useSyncExternalStore(subscribe, isAndroid, () => false);
}
