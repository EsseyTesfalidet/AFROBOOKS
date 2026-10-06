'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowDown, Check, LoaderCircle } from 'lucide-react';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { appHaptic } from '@/lib/app/haptics';
import { pullRefreshDistance, shouldPullRefresh } from '@/lib/app/pullRefresh';

export default function MobilePullToRefresh({ onRefresh }: { onRefresh: () => void | Promise<void> }) {
  const installed = useInstalledApp();
  const [distance, setDistance] = useState(0);
  const [state, setState] = useState<'idle' | 'refreshing' | 'updated' | 'failed'>('idle');
  const callback = useRef(onRefresh);
  const refreshing = useRef(false);
  const mounted = useRef(false);
  const messageTimer = useRef<number | null>(null);
  useEffect(() => { callback.current = onRefresh; }, [onRefresh]);

  useEffect(() => {
    if (!installed) return;
    const viewport = document.querySelector<HTMLElement>('.mobile-app-viewport');
    if (!viewport) return;
    mounted.current = true;
    let origin: { x: number; y: number } | null = null;
    let pull = 0;
    const ignored = 'a,button,input,select,textarea,video,audio,[role="button"],[contenteditable="true"],[data-no-pull-refresh],.app-swipe-shelf,.app-shelf-viewport';
    function start(event: TouchEvent) {
      if (refreshing.current) return;
      if (event.touches.length !== 1 || viewport!.scrollTop > 1) { origin = null; pull = 0; setDistance(0); return; }
      const target = event.target;
      if (target instanceof Element && target.closest(ignored)) { origin = null; return; }
      origin = { x: event.touches[0].clientX, y: event.touches[0].clientY };
      pull = 0;
    }
    function move(event: TouchEvent) {
      if (!origin || refreshing.current) return;
      if (event.touches.length !== 1) { cancel(); return; }
      const touch = event.touches[0];
      const deltaX = touch.clientX - origin.x;
      const deltaY = touch.clientY - origin.y;
      if (deltaY < 0 || (Math.abs(deltaX) > Math.abs(deltaY) * 0.75 && Math.abs(deltaX) > 12)) {
        origin = null; pull = 0; setDistance(0); return;
      }
      pull = pullRefreshDistance(deltaX, deltaY);
      if (pull > 0) setDistance(pull);
      if (deltaY > 12 && pull > 0 && event.cancelable) event.preventDefault();
    }
    function cancel() { origin = null; pull = 0; if (!refreshing.current) setDistance(0); }
    async function finish() {
      origin = null;
      if (!shouldPullRefresh(pull) || refreshing.current) { pull = 0; setDistance(0); return; }
      pull = 0; refreshing.current = true; setDistance(60); setState('refreshing'); appHaptic();
      try {
        await callback.current();
        await new Promise(resolve => window.setTimeout(resolve, 500));
        if (!mounted.current) return;
        setState('updated');
      } catch {
        if (!mounted.current) return;
        setState('failed');
      } finally {
        refreshing.current = false;
        if (!mounted.current) return;
        setDistance(60);
        if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
        messageTimer.current = window.setTimeout(() => { setState('idle'); setDistance(0); messageTimer.current = null; }, 1200);
      }
    }
    viewport.addEventListener('touchstart', start, { passive: true });
    viewport.addEventListener('touchmove', move, { passive: false });
    viewport.addEventListener('touchend', finish, { passive: true });
    viewport.addEventListener('touchcancel', cancel, { passive: true });
    return () => {
      mounted.current = false;
      viewport.removeEventListener('touchstart', start);
      viewport.removeEventListener('touchmove', move);
      viewport.removeEventListener('touchend', finish);
      viewport.removeEventListener('touchcancel', cancel);
      if (messageTimer.current !== null) window.clearTimeout(messageTimer.current);
    };
  }, [installed]);

  if (!installed) return null;
  const label = state === 'refreshing' ? 'Refreshing' : state === 'updated' ? 'Updated' : state === 'failed' ? 'Refresh failed' : shouldPullRefresh(distance) ? 'Release to refresh' : 'Pull to refresh';
  return <div className="app-pull-refresh" data-active={distance > 0 || state !== 'idle'} data-refreshing={state === 'refreshing'} style={{ '--pull-distance': `${distance}px` } as React.CSSProperties} role="status" aria-live="polite" aria-hidden={distance === 0 && state === 'idle'}>
    {state === 'refreshing' ? <LoaderCircle className="app-pull-refresh-icon" size={18} aria-hidden="true" /> : state === 'updated' ? <Check size={18} aria-hidden="true" /> : <ArrowDown className="app-pull-refresh-arrow" size={18} aria-hidden="true" />}
    <span>{label}</span>
  </div>;
}
