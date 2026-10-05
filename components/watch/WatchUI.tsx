'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Bookmark, Check, Film, MoreHorizontal, Play, Share2, UserRound, X } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useInstalledApp } from '@/hooks/useInstalledApp';
import { useAuthStore } from '@/store/authStore';
import { authenticatedGet, authenticatedPost } from '@/lib/firebase/request';
import { videoDuration, videoPrice } from '@/lib/watch/policy';
import { appHaptic } from '@/lib/app/haptics';
import type { WatchState, WatchVideo } from '@/types/video';
import WatchPoster from './WatchPoster';
import './watch.css';

export const watchActionRequest = <T,>(action: string, data: unknown) => authenticatedPost<T>('/api/watch/action', { action, data });
export function useWatchResource<T>(path: string, retainDuringRefresh = false) {
  const user = useAuthStore(s => s.firebaseUser);
  const authLoading = useAuthStore(s => s.loading);
  const [state, setState] = useState<{ data: T | null; error: string; key: string }>({ data: null, error: '', key: '' });
  const [attempt, setAttempt] = useState(0);
  const key = `${user?.uid || ''}:${path}:${attempt}`;
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  useEffect(() => {
    let active = true;
    if (user) void authenticatedGet<T>(path).then(data => { if (active) setState({ data, error: '', key }); }).catch(error => { if (active) setState(previous => ({ data: retainDuringRefresh && previous.key.startsWith(`${user.uid}:${path}:`) ? previous.data : null, error: error.message, key })); });
    return () => { active = false; };
  }, [path, user, key, retainDuringRefresh]);
  const sameAccountAndPath = !!user && state.key.startsWith(`${user.uid}:${path}:`);
  return { data: user && (state.key === key || (retainDuringRefresh && sameAccountAndPath)) ? state.data : null, loading: authLoading || (!!user && state.key !== key && !(retainDuringRefresh && sameAccountAndPath)), error: !user && !authLoading ? 'Please sign in to continue.' : state.key === key ? state.error : '', retry };
}
export function WatchAppGate({ children }: { children: ReactNode }) {
  const installed = useInstalledApp();
  if (!installed) return <div className="watch-surface"><BuyerHeader /><main className="watch-page"><WatchEmpty title="AfroBooks Screen is in the app" text="Films, documentaries, music and stories from African creators. Open AfroBooks on your phone and choose Screen." /><Link className="watch-button" href="/browse">Back to books</Link></main></div>;
  return <div className="watch-surface">{children}</div>;
}
export function WatchFeedback({ loading, error, retry }: { loading?: boolean; error?: string; retry?: () => void }) {
  if (loading) return <div role="status" className="watch-loading"><LoadingSpinner size={22} /> Loading videos…</div>;
  return error ? <div className="watch-notice" role="alert"><p>{error}</p>{retry && <button className="watch-button" onClick={retry}>Try again</button>}</div> : null;
}
export function WatchEmpty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <section className="watch-empty"><Film size={34} aria-hidden="true" /><h2>{title}</h2><p>{text}</p>{action && <div className="watch-empty-action">{action}</div>}</section>;
}
export function WatchCard({ video, state, preview, compact = false }: { video: WatchVideo; state?: WatchState; preview?: ReactNode; compact?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  async function save() {
    if (busy) return;
    setBusy(true); setError('');
    try { await watchActionRequest('save', { id: video.id, saved: true }); setSaved(true); setNotice('Saved to Library → Videos.'); appHaptic(); }
    catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  async function share() {
    setError('');
    try {
      const url = `${window.location.origin}/watch/${encodeURIComponent(video.id)}`;
      if (navigator.share) await navigator.share({ title: video.title, url });
      else { await navigator.clipboard.writeText(url); setNotice('Video link copied.'); }
    } catch (failure) { if ((failure as Error).name !== 'AbortError') setError('The link could not be shared. Please try again.'); }
  }
  return <article className={`watch-card${compact ? ' watch-card-compact' : ''}`}><Link href={`/watch/${video.id}`} className="watch-card-link">
    <div className="watch-art" data-preview-id={video.id}><WatchPoster video={video} />{preview}
      <span className="watch-duration">{videoDuration(video.durationSeconds)}</span>
      <span className="watch-play"><Play size={18} fill="currentColor" aria-hidden="true" /></span>
      {state && state.seconds > 0 && <span className="watch-progress" role="progressbar" aria-label="Watch progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(1, state.seconds / Math.max(1, video.durationSeconds)) * 100)}><i style={{ width: `${Math.min(1, state.seconds / Math.max(1, video.durationSeconds)) * 100}%` }} /></span>}
    </div><div className="watch-card-meta"><span className="watch-avatar" aria-hidden="true">{video.creatorName.slice(0, 1)}</span><div><h2 dir="auto">{video.title}</h2><p dir="auto">{video.creatorName}</p><div className="watch-card-tags"><span>{video.category === 'Documentaries' ? 'Doc' : video.category} · {video.language}</span><strong>{state?.owned ? 'Purchased' : videoPrice(video.priceCents)}</strong>{(state?.saved || saved) && <Bookmark size={14} aria-label="Saved" fill="currentColor" />}</div>{state && state.seconds > 0 && <p className="watch-card-resume">{state.seconds >= video.durationSeconds ? 'Watched' : `${videoDuration(Math.max(0, video.durationSeconds - state.seconds))} left`}</p>}</div></div>
  </Link><button type="button" className="watch-card-options" aria-label={`Options for ${video.title}`} aria-haspopup="dialog" aria-expanded={menu} onClick={() => { setMenu(true); setError(''); setNotice(''); appHaptic(); }}><MoreHorizontal size={22} aria-hidden="true" /></button>
    {menu && <WatchSheet title={video.title} close={() => setMenu(false)}><div className="watch-card-menu"><button disabled={busy || saved || state?.saved} onClick={() => void save()}>{saved || state?.saved ? <Check size={20} /> : <Bookmark size={20} />}<span>{saved || state?.saved ? 'Saved in your library' : busy ? 'Saving…' : 'Save to video library'}</span></button><button onClick={() => void share()}><Share2 size={20} /><span>Share video</span></button><Link href={`/watch/creator/${video.creatorId}`} onClick={() => setMenu(false)}><UserRound size={20} /><span>Visit creator channel</span></Link></div><WatchFeedback error={error} />{notice && <p role="status" className="watch-muted">{notice}</p>}</WatchSheet>}
  </article>;
}
export function LibraryFormatTabs({ active }: { active: 'books' | 'videos' }) {
  const installed = useInstalledApp();
  if (!installed) return null;
  return <nav className="watch-format-tabs" aria-label="Library format"><Link href="/library" aria-current={active === 'books' ? 'page' : undefined}>Books</Link><Link href="/library/videos" aria-current={active === 'videos' ? 'page' : undefined}>Videos</Link></nav>;
}
export function WatchSheet({ title, close, children }: { title: string; close: () => void; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = dialog.current; node?.showModal(); return () => node?.close(); }, []);
  return <dialog className="watch-sheet" ref={dialog} aria-labelledby="watch-sheet-title" onCancel={close} onClose={close} onClick={event => { if (event.target === dialog.current) close(); }}><div className="watch-sheet-inner"><button className="watch-icon" aria-label="Close" onClick={close}><X size={20} /></button><h2 id="watch-sheet-title">{title}</h2>{children}</div></dialog>;
}
