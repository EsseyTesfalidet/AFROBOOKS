'use client';

import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useInstalledApp } from '@/hooks/useInstalledApp';

export default function MobileAppShell({ children }: { children: ReactNode }) {
  const installed = useInstalledApp();
  const path = usePathname();
  const viewport = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, number>());

  useLayoutEffect(() => {
    const scroller = viewport.current;
    const inner = content.current;
    if (!installed || !scroller || !inner) return;
    const desired = positions.current.get(path) ?? 0;
    let restoring = true;
    const observer = new ResizeObserver(restore);
    function remember() {
      if (!restoring) positions.current.set(path, scroller!.scrollTop);
    }
    function stopRestoring() {
      restoring = false;
      observer.disconnect();
      remember();
    }
    function restore() {
      scroller!.scrollTo({ top: desired, behavior: 'instant' });
      if (scroller!.scrollHeight - scroller!.clientHeight >= desired) stopRestoring();
    }
    // Catalog/library content arrives asynchronously. Restore a saved position
    // when it fits, but always yield immediately to a user's scroll gesture.
    observer.observe(inner);
    restore();
    scroller.addEventListener('scroll', remember, { passive: true });
    scroller.addEventListener('wheel', stopRestoring, { passive: true });
    scroller.addEventListener('touchstart', stopRestoring, { passive: true });
    scroller.addEventListener('pointerdown', stopRestoring, { passive: true });
    scroller.addEventListener('keydown', stopRestoring);
    return () => {
      observer.disconnect();
      scroller.removeEventListener('scroll', remember);
      scroller.removeEventListener('wheel', stopRestoring);
      scroller.removeEventListener('touchstart', stopRestoring);
      scroller.removeEventListener('pointerdown', stopRestoring);
      scroller.removeEventListener('keydown', stopRestoring);
    };
  }, [installed, path]);

  return <div ref={viewport} className="mobile-app-viewport" role={installed ? 'region' : undefined}
    aria-label={installed ? 'App content' : undefined} tabIndex={installed ? 0 : undefined}>
    <div ref={content} className="mobile-app-content">{children}</div>
  </div>;
}
