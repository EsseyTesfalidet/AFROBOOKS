'use client';

import { useEffect, useLayoutEffect, useRef } from 'react';
import { CONNECTION_RESTORED } from '@/lib/network';

export function useConnectionRecovery(recover: () => void) {
  const callback = useRef(recover);
  useLayoutEffect(() => { callback.current = recover; });
  useEffect(() => {
    const retry = () => callback.current();
    window.addEventListener(CONNECTION_RESTORED, retry);
    return () => window.removeEventListener(CONNECTION_RESTORED, retry);
  }, []);
}
