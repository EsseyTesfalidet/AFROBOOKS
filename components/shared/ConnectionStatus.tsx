'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { CONNECTION_FAILED, CONNECTION_RESTORED } from '@/lib/network';

export default function ConnectionStatus() {
  const [state, setState] = useState<'hidden' | 'offline' | 'checking' | 'restored'>('hidden');
  const checking = useRef(false);
  const mounted = useRef(false);
  const retry = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setState('checking');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch('/api/connectivity', { cache: 'no-store', signal: controller.signal });
      if (!response.ok || (await response.json()).connected !== true) throw new Error('Unavailable');
      if (mounted.current) {
        setState('restored');
        window.dispatchEvent(new Event(CONNECTION_RESTORED));
      }
    } catch { if (mounted.current) setState('offline'); }
    finally { clearTimeout(timer); checking.current = false; }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const offline = () => setState('offline');
    const online = () => { void retry(); };
    if (!navigator.onLine) offline();
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    window.addEventListener(CONNECTION_FAILED, offline);
    return () => {
      mounted.current = false;
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
      window.removeEventListener(CONNECTION_FAILED, offline);
    };
  }, [retry]);
  useEffect(() => {
    if (state !== 'restored') return;
    const timer = setTimeout(() => setState('hidden'), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  if (state === 'hidden') return null;
  return <aside className="connection-status fixed inset-x-3 top-[max(8px,env(safe-area-inset-top))] z-[150] mx-auto flex max-w-lg items-center justify-between gap-3 rounded-xl border border-white/20 bg-[#24211b] px-4 py-2 text-sm text-white shadow-xl">
    <p role="status">{state === 'restored' ? 'Connection restored.' : state === 'checking' ? 'Checking connection…' : 'Connection interrupted. Keep this screen open to retain your work.'}</p>
    {state !== 'restored' && <button type="button" onClick={() => void retry()} disabled={state === 'checking'} className="min-h-11 shrink-0 px-2 text-[#f5b800] disabled:opacity-60">Retry</button>}
  </aside>;
}
