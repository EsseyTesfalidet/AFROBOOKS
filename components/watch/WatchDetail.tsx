'use client';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bookmark, Flag, Play, Share2 } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { authenticatedPost } from '@/lib/firebase/request';
import { useAuthStore } from '@/store/authStore';
import { appHaptic } from '@/lib/app/haptics';
import { videoDuration, videoPrice } from '@/lib/watch/policy';
import type { WatchState, WatchVideo } from '@/types/video';
import type { WatchPlayback } from './WatchPlayer';
import type { PlayOffer } from '@/lib/watch/play';
import { useWatchResource, WatchAppGate, WatchFeedback, WatchSheet, watchActionRequest } from './WatchUI';
import WatchRelated from './WatchRelated';

const WatchPlayer = dynamic(() => import('./WatchPlayer'), { ssr: false, loading: () => <p role="status">Opening player…</p> });
const WatchPlayPurchase = dynamic(() => import('./WatchPlayPurchase'), { ssr: false });
interface Detail { video: WatchVideo; state: WatchState; canPlay: boolean; hostingReady: boolean; purchasesReady: boolean; playOffer?: PlayOffer | null }
function DetailContent({ id }: { id: string }) {
  const resource = useWatchResource<Detail>(`/api/watch?view=detail&id=${encodeURIComponent(id)}`);
  const [playback, setPlayback] = useState<{ data: WatchPlayback; trailer: boolean } | null>(null);
  const playbackRequest = useRef(0);
  const [saved, setSaved] = useState<boolean | null>(null); const [following, setFollowing] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [report, setReport] = useState(false); const [reason, setReason] = useState('');
  const video = resource.data?.video; const state = resource.data?.state;
  const automaticKind = resource.data?.hostingReady ? resource.data.canPlay ? 'full' : video?.hasTrailer ? 'trailer' : null : null;
  useEffect(() => {
    if (!automaticKind) return;
    let active = true;
    const request = ++playbackRequest.current;
    const trailer = automaticKind === 'trailer';
    void authenticatedPost<WatchPlayback>('/api/watch/playback', { id, trailer })
      .then(data => { if (active && request === playbackRequest.current) setPlayback({ data, trailer }); })
      .catch(failure => { if (active && request === playbackRequest.current) setError(failure.message); });
    return () => { active = false; };
  }, [id, automaticKind]);
  async function action(task: () => Promise<void>) {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await task(); appHaptic(); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  function play(trailer: boolean) { void action(async () => { const request = ++playbackRequest.current; const data = await authenticatedPost<WatchPlayback>('/api/watch/playback', { id, trailer }); if (request === playbackRequest.current) setPlayback({ data, trailer }); }); }
  async function share() {
    const url = `${window.location.origin}/watch/${encodeURIComponent(id)}`;
    try { if (navigator.share) await navigator.share({ title: video?.title, url }); else { await navigator.clipboard.writeText(url); setNotice('Link copied.'); } }
    catch (failure) { if ((failure as Error).name !== 'AbortError') setError('The link could not be shared. Please try again.'); }
  }
  return <><BuyerHeader /><main className="app-page watch-page watch-detail"><Link className="watch-back" href="/watch"><ArrowLeft size={18} /> Screen</Link><WatchFeedback loading={resource.loading} error={resource.error} retry={resource.retry} />
    {video && state && <>
      {playback ? <><WatchPlayer key={`${id}-${playback.data.token}`} id={id} playback={playback.data} trailer={playback.trailer} title={video.title} poster={video.posterUrl} autoPlay /><button className="watch-button mt-3" onClick={() => { playbackRequest.current++; setPlayback(null); }}>Close player</button></> : <div className="watch-art">{video.posterUrl && <img src={video.posterUrl} alt={video.title} />}<span className="watch-duration">{videoDuration(video.durationSeconds)}</span>{resource.data?.canPlay && resource.data.hostingReady && <button className="watch-play" aria-label={`Play ${video.title}`} disabled={busy} onClick={() => play(false)}><Play size={20} fill="currentColor" /></button>}</div>}
      <h1 dir="auto">{video.title}</h1><p className="watch-detail-meta">{video.category} · {video.language} · {videoDuration(video.durationSeconds)}{video.newsDate ? ` · Published ${video.newsDate}` : ''}</p>
      <div className="watch-creator"><span className="watch-avatar" aria-hidden="true">{video.creatorName.slice(0, 1)}</span><Link href={`/watch/creator/${video.creatorId}`} dir="auto">{video.creatorName}</Link><button className="watch-button" disabled={busy} aria-pressed={following ?? state.following} onClick={() => void action(async () => { const value = !(following ?? state.following); await watchActionRequest('follow', { creatorId: video.creatorId, following: value }); setFollowing(value); })}>{(following ?? state.following) ? 'Following' : 'Follow · free'}</button></div>
      <div className="watch-actions">{resource.data?.canPlay ? <button className="watch-button watch-primary" disabled={busy || !resource.data.hostingReady} onClick={() => play(false)}><Play size={17} fill="currentColor" />{state.seconds > 0 && state.seconds < video.durationSeconds - 5 ? 'Continue watching' : 'Watch now'}{state.owned ? ' · Purchased' : video.priceCents === 0 ? ' · Free' : ''}</button> : resource.data?.playOffer ? null : <button className="watch-button watch-primary" disabled>{video.status === 'removed' ? 'Currently unavailable' : `Buy ${videoPrice(video.priceCents)} · coming soon`}</button>}
        {video.hasTrailer && <button className="watch-button" disabled={busy || !resource.data?.hostingReady} onClick={() => play(true)}>Watch trailer</button>}
      </div>
      {!resource.data?.canPlay && resource.data?.hostingReady && resource.data?.playOffer && <WatchPlayPurchase key={`${resource.data.playOffer.accountId}:${resource.data.playOffer.productId}:${resource.data.playOffer.testOnly}`} videoId={id} offer={resource.data.playOffer} onPurchased={resource.retry} />}
      {!resource.data?.hostingReady && <p className="watch-muted">Video playback will be available soon.</p>}
      {!resource.data?.canPlay && !resource.data?.playOffer && video.priceCents > 0 && video.status !== 'removed' && <p className="watch-muted">Checkout for this video is being prepared. Save it to find it again in your library.</p>}
      <div className="watch-actions"><button className="watch-button" disabled={busy} aria-pressed={saved ?? state.saved} onClick={() => void action(async () => { const value = !(saved ?? state.saved); await watchActionRequest('save', { id, saved: value }); setSaved(value); setNotice(value ? 'Saved to Library → Videos.' : 'Removed from saved videos.'); })}><Bookmark size={17} fill={(saved ?? state.saved) ? 'currentColor' : 'none'} />{(saved ?? state.saved) ? 'Saved' : 'Save'}</button><button className="watch-button" onClick={share}><Share2 size={17} />Share</button><button className="watch-icon" aria-label="Report this video" onClick={() => setReport(true)}><Flag size={18} /></button></div>
      <WatchFeedback error={error} />{notice && <p className="watch-notice" role="status">{notice}</p>}<p className="watch-description" dir="auto">{video.description}</p>
      <WatchRelated id={id} />
    </>}
    {report && <WatchSheet title="Report this video" close={() => { if (!busy) setReport(false); }}><form onSubmit={event => { event.preventDefault(); void action(async () => { await watchActionRequest('report', { id, reason }); setReport(false); setReason(''); setNotice('Your report has been sent for review.'); }); }}><label htmlFor="watch-report">Tell us about the issue, including rights or misleading content.</label><textarea id="watch-report" required minLength={10} maxLength={2000} value={reason} onChange={event => setReason(event.target.value)} /><WatchFeedback error={error} /><button className="watch-button watch-primary" disabled={busy}>{busy ? 'Sending…' : 'Send report'}</button></form></WatchSheet>}
  </main></>;
}
export default function WatchDetail({ id }: { id: string }) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  return <WatchAppGate><DetailContent key={`${uid}:${id}`} id={id} /></WatchAppGate>;
}
