'use client';
import { useEffect, useRef, useState } from 'react';
import { VolumeX } from 'lucide-react';
import type Hls from 'hls.js';
import { useAuthStore } from '@/store/authStore';
import { useBuyerDrawerStore } from '@/store/profileDrawerStore';
import { authenticatedPost } from '@/lib/firebase/request';
import { streamPlaybackSource } from '@/lib/watch/playback';
import type { WatchVideo } from '@/types/video';
import type { WatchPlayback } from './WatchPlayer';
import { WatchCard } from './WatchUI';

interface PreviewResult { playback: WatchPlayback | null; trailer?: boolean }
type Connection = EventTarget & { saveData?: boolean; effectiveType?: string };

function FeedPreview({ id, cache }: { id: string; cache: Map<string, PreviewResult> }) {
  const media = useRef<HTMLVideoElement>(null);
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const video = media.current;
    if (!video || !uid) return;
    let active = true; let hls: Hls | undefined;
    const current = () => active && useAuthStore.getState().firebaseUser?.uid === uid;
    const stop = () => { video.pause(); hls?.stopLoad(); if (current()) setPlaying(false); };
    const limit = () => { if (video.currentTime >= 20) stop(); };
    const play = () => { if (current()) void video.play().catch(stop); };
    video.muted = true;
    video.addEventListener('timeupdate', limit); video.addEventListener('ended', stop); video.addEventListener('error', stop);
    void (async () => {
      let result = cache.get(id);
      if (!result || (result.playback && result.playback.expiresAt * 1000 < Date.now() + 60000)) {
        result = await authenticatedPost<PreviewResult>('/api/watch/playback', { id, trailer: false, preview: true });
        if (!current()) return;
        if (cache.size >= 32) cache.delete(cache.keys().next().value!);
        cache.set(id, result);
      }
      if (!current() || !result.playback) return;
      const source = streamPlaybackSource(result.playback.token);
      if (video.canPlayType('application/vnd.apple.mpegurl')) { video.src = source; play(); }
      else {
        const { default: HlsPlayer } = await import('hls.js');
        if (!current() || !HlsPlayer.isSupported()) return;
        hls = new HlsPlayer({ capLevelToPlayerSize: true, startLevel: 0, maxBufferLength: 8, maxMaxBufferLength: 12, backBufferLength: 0 });
        hls.on(HlsPlayer.Events.MANIFEST_PARSED, play);
        hls.on(HlsPlayer.Events.ERROR, (_event, data) => { if (data.fatal) stop(); });
        hls.loadSource(source); hls.attachMedia(video);
      }
    })().catch(stop);
    return () => { active = false; video.pause(); hls?.destroy(); video.removeEventListener('timeupdate', limit); video.removeEventListener('ended', stop); video.removeEventListener('error', stop); video.removeAttribute('src'); video.load(); };
  }, [id, uid, cache]);
  return <span className={`watch-feed-preview${playing ? ' is-playing' : ''}`} aria-hidden="true">
    <video ref={media} muted playsInline preload="none" disablePictureInPicture tabIndex={-1} onPlaying={() => setPlaying(true)} />
    {playing && <span className="watch-preview-label"><VolumeX size={14} />Preview</span>}
  </span>;
}

function FeedSession({ videos }: { videos: WatchVideo[] }) {
  const grid = useRef<HTMLDivElement>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [cache] = useState(() => new Map<string, PreviewResult>());
  const [enabled, setEnabled] = useState(true);
  const profileOpen = useBuyerDrawerStore(s => s.isOpen);
  const ids = videos.map(video => video.id).join(':');
  useEffect(() => {
    const root = grid.current;
    if (!root || !enabled || profileOpen || !('IntersectionObserver' in window)) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const connection = (navigator as Navigator & { connection?: Connection }).connection;
    const visible = new Set<Element>();
    let selected: string | null = null; let frame = 0; let timer: ReturnType<typeof setTimeout> | undefined;
    function select() {
      frame = 0;
      const allowed = document.visibilityState === 'visible' && navigator.onLine && !motion.matches && !connection?.saveData && !['slow-2g', '2g'].includes(connection?.effectiveType || '') && !root!.closest('[inert]');
      let best: string | null = null; let distance = Infinity;
      if (allowed) for (const item of visible) {
        const box = item.getBoundingClientRect(); const center = box.top + box.height / 2;
        const delta = Math.abs(center - window.innerHeight / 2);
        if (center > 70 && center < window.innerHeight - 80 && delta < distance) { best = item.getAttribute('data-preview-id'); distance = delta; }
      }
      if (selected === best) return;
      selected = best; clearTimeout(timer); setActiveId(null);
      // Do not start downloads for cards the reader is quickly scrolling past.
      if (best) timer = setTimeout(() => setActiveId(best), 450);
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(select); };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) { if (entry.intersectionRatio >= .65) visible.add(entry.target); else visible.delete(entry.target); }
      schedule();
    }, { threshold: [0, .65, 1], rootMargin: '-64px 0px -76px 0px' });
    root.querySelectorAll('[data-preview-id]').forEach(item => observer.observe(item));
    document.addEventListener('scroll', schedule, true); window.addEventListener('resize', schedule);
    // requestAnimationFrame is suspended in hidden tabs; stop immediately there.
    const environmentChanged = () => { cancelAnimationFrame(frame); select(); };
    document.addEventListener('visibilitychange', environmentChanged); window.addEventListener('online', environmentChanged); window.addEventListener('offline', environmentChanged);
    motion.addEventListener('change', environmentChanged); connection?.addEventListener('change', environmentChanged);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer); setActiveId(null); document.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); document.removeEventListener('visibilitychange', environmentChanged); window.removeEventListener('online', environmentChanged); window.removeEventListener('offline', environmentChanged); motion.removeEventListener('change', environmentChanged); connection?.removeEventListener('change', environmentChanged); };
  }, [ids, enabled, profileOpen]);
  return <><div className="watch-feed-options"><button className="watch-button" aria-pressed={enabled} onClick={() => setEnabled(value => !value)}>Video previews: {enabled ? 'On' : 'Off'}</button><span className="watch-muted">Muted while you browse</span></div>
    <div className="watch-grid" ref={grid}>{videos.map(video => <WatchCard key={video.id} video={video} preview={enabled && !profileOpen && activeId === video.id ? <FeedPreview key={video.id} id={video.id} cache={cache} /> : undefined} />)}</div></>;
}
export default function WatchFeed({ videos }: { videos: WatchVideo[] }) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  return <FeedSession key={uid || 'signed-out'} videos={videos} />;
}
