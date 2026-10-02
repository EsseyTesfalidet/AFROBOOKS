'use client';

import { useSyncExternalStore } from 'react';

const APP_DISPLAY = '(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)';

function subscribe(onChange: () => void) {
  const query = window.matchMedia(APP_DISPLAY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function installed() {
  return window.matchMedia(APP_DISPLAY).matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    /^android-app:\/\/com\.afrobs\.app(?:\/|$)/.test(document.referrer);
}

// Presentation only. Never use display mode to authorize access or payments.
export function useInstalledApp() {
  return useSyncExternalStore(subscribe, installed, () => false);
}
