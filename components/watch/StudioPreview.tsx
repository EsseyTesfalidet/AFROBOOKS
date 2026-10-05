'use client';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { Film, Play } from 'lucide-react';
import { authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import type { WatchPlayback } from './WatchPlayer';
import { WatchFeedback } from './WatchUI';
import type { WatchAsset } from '@/types/video';
import { videoReadiness } from '@/lib/watch/readiness';
import './watch-studio.css';

const WatchPlayer = dynamic(() => import('./WatchPlayer'), { ssr: false });
interface Props { id: string; title: string; poster?: string; ready: boolean; asset?: WatchAsset; pending?: boolean; processingError?: string; trailer?: boolean }

export default function StudioPreview(props: Props) {
  const uid = useAuthStore(state => state.firebaseUser?.uid);
  return <PreviewSession key={`${uid}:${props.id}:${props.trailer}`} {...props} uid={uid} />;
}

function PreviewSession({ id, title, poster, ready, asset, pending, processingError, trailer = false, uid }: Props & { uid?: string }) {
  const readiness = videoReadiness(asset, pending, processingError);
  const [playback, setPlayback] = useState<WatchPlayback | null>(null);
  const panel = useRef<HTMLElement>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => {
    const containers: HTMLDetailsElement[] = [];
    let parent = panel.current?.closest('details');
    while (parent) { containers.push(parent); parent = parent.parentElement?.closest('details') || null; }
    const stopWhenClosed = () => { if (containers.some(container => !container.open)) setPlayback(null); };
    containers.forEach(container => container.addEventListener('toggle', stopWhenClosed));
    return () => containers.forEach(container => container.removeEventListener('toggle', stopWhenClosed));
  }, []);
  async function open() {
    if (busy || !ready || !uid) return;
    setBusy(true); setError('');
    try {
      const result = await authenticatedPost<WatchPlayback>('/api/watch/playback', { id, trailer });
      if (useAuthStore.getState().firebaseUser?.uid === uid && panel.current && !panel.current.closest('details:not([open])')) setPlayback(result);
    } catch (failure) { setError((failure as Error).message); }
    finally { setBusy(false); }
  }
  return <section ref={panel} className="watch-studio-preview" aria-label={trailer ? 'Trailer preview' : 'Video preview'}>
    <h3>{trailer ? 'Trailer preview' : 'Video preview'}</h3>
    {playback ? <><WatchPlayer id={id} title={title} poster={poster} playback={playback} trailer={trailer} preview /><button type="button" className="watch-button" onClick={() => setPlayback(null)}>Close {trailer ? 'trailer' : 'video'} preview</button></> : <div className="watch-preview-poster" aria-busy={busy} data-keep-colors>
      {poster ? <img src={poster} alt="" loading="lazy" /> : <Film size={42} aria-hidden="true" />}
      <button type="button" className="watch-preview-play" disabled={busy || !ready || !uid} onClick={() => void open()}><Play size={22} aria-hidden="true" />{busy ? 'Opening…' : ready ? trailer ? 'Preview trailer' : 'Preview video' : readiness.label}</button>
    </div>}
    <p className="watch-muted">{ready ? 'Private preview · use fullscreen, seek, speed and available subtitles to check your video.' : readiness.message}</p>
    <WatchFeedback error={error} />
  </section>;
}
