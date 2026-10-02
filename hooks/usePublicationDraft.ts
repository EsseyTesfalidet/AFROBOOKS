'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { readPublicationDraft, writePublicationDraft, deletePublicationDraft, checkpointPublicationDraft, type PublicationDraft } from '@/lib/publishing/localDrafts';

export function usePublicationDraft(key: string | null, ready: boolean, value: PublicationDraft, restore: (draft: PublicationDraft) => void) {
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'unavailable'>('loading');
  const [restored, setRestored] = useState(false);
  const latest = useRef(value);
  const onRestore = useRef(restore);
  const hydrated = useRef(false);
  const cleared = useRef(false);
  const active = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  useLayoutEffect(() => { latest.current = value; onRestore.current = restore; });

  const flush = useCallback((override?: PublicationDraft) => {
    if (!key || !hydrated.current || cleared.current) return Promise.resolve();
    const snapshot = override ?? latest.current;
    if (active.current) setStatus('saving');
    // IndexedDB serializes these read/write transactions in creation order.
    // Start immediately so pagehide can commit the latest edit before unload.
    const save = writePublicationDraft(key, snapshot);
    queue.current = save;
    void save.then(() => { if (active.current && queue.current === save) setStatus('saved'); }, () => { if (active.current) setStatus('unavailable'); });
    return save;
  }, [key]);

  useEffect(() => {
    if (!key || !ready) return;
    let current = true;
    active.current = true;
    void readPublicationDraft(key).then(saved => {
      if (!current) return;
      if (saved) { onRestore.current(saved); latest.current = saved; setRestored(true); }
      hydrated.current = true;
      setStatus('saved');
    }).catch(() => { if (current) setStatus('unavailable'); });
    return () => {
      current = false;
      active.current = false;
      void flush().catch(() => {});
      hydrated.current = false;
    };
  }, [key, ready, flush]);

  useEffect(() => {
    if (!hydrated.current || cleared.current) return;
    setStatus('saving');
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 350);
    return () => clearTimeout(timer);
  }, [value, flush]);

  useEffect(() => {
    const save = () => {
      if (key && hydrated.current && !cleared.current) checkpointPublicationDraft(key, latest.current);
      void flush().catch(() => {});
    };
    const hide = () => { if (document.visibilityState === 'hidden') save(); };
    window.addEventListener('pagehide', save);
    document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('pagehide', save); document.removeEventListener('visibilitychange', hide); };
  }, [flush, key]);

  const clear = useCallback(async () => {
    if (!key) return;
    cleared.current = true;
    await queue.current.catch(() => {});
    try { await deletePublicationDraft(key); }
    catch (error) { cleared.current = false; throw error; }
  }, [key]);
  return { status, restored, flush, clear, ready: status !== 'loading' };
}
