'use client';

import { useEffect } from 'react';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAppAppearanceStore } from '@/store/appAppearanceStore';
import { resolveAppTheme } from '@/lib/app/appearance';

export default function AppAppearance() {
  const installed = useInstalledApp();
  const mode = useAppAppearanceStore(state => state.themeMode);
  useEffect(() => {
    const root = document.documentElement;
    const chrome = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const originalChrome = chrome?.content;
    const update = () => {
      if (installed) {
        root.dataset.appTheme = resolveAppTheme(mode);
        if (chrome) chrome.content = root.dataset.appTheme === 'light' ? '#f7f5f1' : '#101114';
      }
      else delete root.dataset.appTheme;
      window.dispatchEvent(new Event('afrobooks:theme'));
    };
    update();
    if (!installed) return;
    // Re-evaluate after sleep, clock/time-zone changes and at the minute boundary.
    let timer: ReturnType<typeof setTimeout>;
    function tick() { update(); timer = setTimeout(tick, 60000 - Date.now() % 60000); }
    timer = setTimeout(tick, 60000 - Date.now() % 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearTimeout(timer); window.removeEventListener('focus', update); document.removeEventListener('visibilitychange', update);
      if (chrome && originalChrome !== undefined) chrome.content = originalChrome;
    };
  }, [installed, mode]);
  return null;
}
