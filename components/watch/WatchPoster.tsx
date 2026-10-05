'use client';

import { useEffect, useRef, useState } from 'react';
import { authenticatedGet } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import type { WatchVideo } from '@/types/video';

export function useVideoPoster(video: Pick<WatchVideo, 'id' | 'posterUrl'> | undefined, enabled = true) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const id = video?.id, original = video?.posterUrl || '';
  const key = `${uid}:${id}`;
  const [resolved, setResolved] = useState({ key: '', url: '' });
  useEffect(() => {
    if (!uid || !id || original || !enabled) return;
    let active = true, attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      let url = '';
      try {
        if (document.visibilityState !== 'hidden' && navigator.onLine) {
          const result = await authenticatedGet<{ posterUrl: string }>(`/api/watch/poster?id=${encodeURIComponent(id!)}`);
          url = result.posterUrl;
        }
      } catch { /* The durable repair job also retries provider failures. */ }
      if (!active) return;
      if (url) setResolved({ key, url });
      else if (++attempts < 5) timer = setTimeout(() => void load(), 30_000);
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [uid, id, original, enabled, key]);
  return original || (resolved.key === key ? resolved.url : '');
}

export default function WatchPoster({ video }: { video: WatchVideo }) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const url = useVideoPoster(video, visible);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '250px' });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, []);
  return <span ref={element} className="watch-poster">{url
    ? <img src={url} alt="" loading="lazy" decoding="async" />
    : <span className="watch-poster-loading" role="status">Loading video image…</span>}</span>;
}
