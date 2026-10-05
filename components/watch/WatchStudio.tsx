'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Plus, Pencil, Search } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import { type WatchCreator, type WatchPrivate, type WatchVideo } from '@/types/video';
import { useWatchResource, WatchFeedback, watchActionRequest } from './WatchUI';
import WatchEarnings from './WatchEarnings';
import type { VideoEarning } from '@/lib/watch/play';
import type { VideoPayoutOverview } from '@/lib/watch/payouts';
import WatchPayouts from '@/components/watch/WatchPayouts';
import VideoEditor from './VideoEditor';
import './watch-studio.css';

export interface StudioEntry { video: WatchVideo; private: WatchPrivate }
export interface StudioData { creator: WatchCreator | null; videos: StudioEntry[]; hostingReady: boolean; purchasesReady: boolean; earnings?: VideoEarning[]; payouts?: VideoPayoutOverview }

export default function WatchStudio() {
  const resource = useWatchResource<StudioData>('/api/watch?view=studio', true);
  const [editing, setEditing] = useState<string | null>(null); const [name, setName] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); const [search, setSearch] = useState(''); const [status, setStatus] = useState('all');
  const creator = resource.data?.creator;
  const [removedIds, setRemovedIds] = useState<string[]>([]);
  const visibleEntries = (resource.data?.videos || []).filter(({ video, private: media }) => video.status !== 'removed' && !media?.creatorRemovedAt && !removedIds.includes(video.id));
  const refreshStudio = resource.retry;
  const processingIds = visibleEntries.filter(({ video, private: media }) => video.status === 'processing' || (video.status === 'draft' && ((media?.full && !media.full.ready) || (media?.trailer && !media.trailer.ready)))).map(({ video }) => video.id).sort().join(',');
  useEffect(() => {
    if (!processingIds || creator?.status !== 'approved') return;
    let stopped = false; let pending = false; let offset = 0;
    const ids = processingIds.split(',');
    const tick = async () => {
      if (stopped || pending || document.visibilityState === 'hidden' || !navigator.onLine) return;
      pending = true;
      const id = ids[offset++ % ids.length];
      try { await watchActionRequest('refresh', { id }); } catch { /* Scheduled checks continue after leaving. */ }
      finally { pending = false; if (!stopped) refreshStudio(); }
    };
    const timer = setInterval(() => void tick(), 12000);
    return () => { stopped = true; clearInterval(timer); };
  }, [processingIds, creator?.status, refreshStudio]);
  const videos = visibleEntries.filter(({ video }) => (status === 'all' || status === video.status) && `${video.title} ${video.language}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => b.video.updatedAt - a.video.updatedAt);
  return <div className="watch-surface"><SellerHeader /><main className="watch-page watch-studio"><header className="watch-intro"><div><p className="watch-eyebrow">Author studio · video</p><h1>Your videos</h1><p>Films, documentaries, music and meaningful stories.</p></div>{creator?.status === 'approved' && editing === null && <button className="watch-button watch-primary" onClick={() => setEditing('new')}><Plus size={18} />New video</button>}</header><WatchFeedback loading={resource.loading} error={resource.error || error} retry={resource.retry} />
    {notice && <p className="watch-notice" role="status">{notice}</p>}
    {resource.data && <>{!creator ? <section className="watch-editor"><h2>Become a video creator</h2><p className="watch-muted">Use your existing author account. Video creators are reviewed before uploading. Reels and unlicensed uploads are not accepted.</p><form onSubmit={async event => { event.preventDefault(); if (busy) return; setBusy(true); setError(''); try { await watchActionRequest('apply', { name }); resource.retry(); setNotice('Creator application received. Your status will appear here after review.'); } catch (failure) { setError((failure as Error).message); } finally { setBusy(false); } }}><label>Creator or organization name<input required minLength={2} maxLength={80} value={name} onChange={event => setName(event.target.value)} /></label><button className="watch-button watch-primary" disabled={busy}>Request creator access</button></form></section> : <>
      <p className="watch-notice">{creator.name} · {creator.status === 'approved' ? `${Math.ceil(creator.reservedSeconds / 60)} of ${Math.floor(creator.allowanceSeconds / 60)} upload minutes reserved` : creator.status === 'pending' ? 'Application awaiting review' : 'Uploads paused — contact support'}</p>
      {editing !== null ? (editing !== 'new' && !resource.data.videos.some(item => item.video.id === editing) ? <p role="status">Opening your saved draft…</p> : <VideoEditor key={editing} entry={resource.data.videos.find(item => item.video.id === editing)} hosting={resource.data.hostingReady} approved={creator.status === 'approved'} close={() => { setEditing(null); setNotice(''); resource.retry(); }} onSaved={(id, message) => { setEditing(id); setNotice(message); resource.retry(); }} onRemoved={id => { setRemovedIds(ids => [...ids, id]); setEditing(null); setNotice(''); resource.retry(); }} />) : <>
        {!!visibleEntries.length && <><label className="watch-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search your videos" placeholder="Search by title or language" value={search} onChange={event => setSearch(event.target.value)} /></label><div className="watch-chips" aria-label="Publication status">{[['all', 'All'], ['draft', 'Drafts'], ['processing', 'Preparing'], ['in_review', 'In review'], ['published', 'Published'], ['unlisted', 'Unlisted']].map(([value, label]) => <button key={value} aria-pressed={status === value} onClick={() => setStatus(value)}>{label}</button>)}</div></>}
        <div className="watch-studio-list">{videos.map(({ video, private: media }) => <button key={video.id} onClick={() => { setEditing(video.id); setNotice(''); }}><span><strong dir="auto">{video.title}</strong><small>{video.category} · {video.status === 'processing' ? 'Preparing' : video.status === 'in_review' ? 'Awaiting review' : video.status.replace('_', ' ')}{media?.pendingRevision && ' · Changes awaiting review'}</small></span><Pencil size={18} aria-hidden="true" /></button>)}{!videos.length && <p className="watch-muted">{visibleEntries.length ? 'No videos match this search and status.' : creator.status === 'approved' ? 'Choose New video to start a draft.' : 'Your video catalog will appear here after approval.'}</p>}</div>
      </>}
    </>}{creator && editing === null && <><WatchEarnings entries={resource.data.earnings} refresh={resource.retry} /><WatchPayouts data={resource.data.payouts} refresh={resource.retry} /></>}<p className="watch-muted mt-8">Videos appear in the installed AfroBooks app after approval. <Link href="/listings" className="underline">Manage your books</Link></p></>}
  </main></div>;
}
