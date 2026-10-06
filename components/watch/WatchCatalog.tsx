'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Search, Bookmark, Clapperboard, X } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { authenticatedGet } from '@/lib/firebase/request';
import { appHaptic } from '@/lib/app/haptics';
import { useAuthStore } from '@/store/authStore';
import { VIDEO_CATEGORIES, type WatchVideo } from '@/types/video';
import { useWatchResource, WatchAppGate, WatchEmpty, WatchFeedback, watchActionRequest } from './WatchUI';

import WatchFeed from './WatchFeed';
import { useWatchHeaderOffset } from './useWatchHeaderOffset';

interface Catalog { videos: WatchVideo[]; next: string | null; channel: { uid: string; name: string; following: boolean } | null }
function CatalogContent({ creatorId }: { creatorId?: string }) {
  const main = useWatchHeaderOffset();
  const path = `/api/watch${creatorId ? `?creator=${encodeURIComponent(creatorId)}` : ''}`;
  const resource = useWatchResource<Catalog>(path);
  const [extra, setExtra] = useState<WatchVideo[]>([]);
  const [cursor, setCursor] = useState<string | null | undefined>(undefined);
  const [category, setCategory] = useState('All'); const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const [following, setFollowing] = useState<boolean | null>(null);
  const videos = resource.data ? [...resource.data.videos, ...extra] : [];
  const next = cursor === undefined ? resource.data?.next : cursor;
  const filtered = videos.filter(video => (category === 'All' || video.category === category) && `${video.title} ${video.creatorName} ${video.language}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  async function more() {
    if (!next || busy) return; setBusy(true); setError('');
    try { const page = await authenticatedGet<Catalog>(`${path}${creatorId ? '&' : '?'}after=${encodeURIComponent(next)}`); setExtra(old => [...old, ...page.videos].filter((item, index, all) => all.findIndex(value => value.id === item.id) === index)); setCursor(page.next); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  async function follow() {
    if (!resource.data?.channel || busy) return; setBusy(true); setError('');
    const value = !(following ?? resource.data.channel.following);
    try { await watchActionRequest('follow', { creatorId, following: value }); setFollowing(value); appHaptic(); }
    catch (failure) { setError((failure as Error).message); } finally { setBusy(false); }
  }
  return <><BuyerHeader /><main ref={main} className="app-page watch-page watch-discovery">
    {creatorId && <Link className="watch-back" href="/watch"><ArrowLeft size={18} /> Watch</Link>}
    {creatorId ? <header className="watch-channel-header"><div className="watch-channel-banner" aria-hidden="true"><Clapperboard size={90} strokeWidth={.8} /></div><div className="watch-channel-identity"><span className="watch-channel-avatar" aria-hidden="true">{(resource.data?.channel?.name || 'C').slice(0, 1)}</span><div><p className="watch-eyebrow">Creator channel</p><h1 dir="auto">{resource.data?.channel?.name || 'Creator videos'}</h1></div></div><div className="watch-channel-about"><p>Original voices. Stories worth staying for.</p>{resource.data?.channel && <button className="watch-button watch-follow" aria-pressed={following ?? resource.data.channel.following} disabled={busy} onClick={follow}>{(following ?? resource.data.channel.following) ? 'Following' : 'Follow · free'}</button>}</div></header>
    : <header className="watch-intro watch-discovery-intro"><div className="watch-discovery-heading"><span className="watch-screen-mark" aria-hidden="true"><Clapperboard size={23} /></span><div><p className="watch-eyebrow">AfroBooks</p><h1>Watch</h1></div></div><Link className="watch-icon watch-saved-link" href="/library/videos" aria-label="Saved videos"><Bookmark size={20} /></Link></header>}
    <div className="watch-discovery-controls"><div className="watch-search"><Search size={19} aria-hidden="true" /><input id="watch-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search this collection" aria-label="Search loaded videos by title, creator or language" />{search && <button type="button" aria-label="Clear video search" onClick={() => { setSearch(''); main.current?.querySelector<HTMLInputElement>('#watch-search')?.focus(); }}><X size={18} /></button>}</div>
    <div className="watch-chips" aria-label="Video categories">{['All', ...VIDEO_CATEGORIES].map(item => <button key={item} aria-pressed={category === item} onClick={event => { setCategory(item); appHaptic(); event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' }); }}>{item === 'Documentaries' ? 'Doc' : item}</button>)}</div></div>
    <WatchFeedback loading={resource.loading} error={resource.error || error} retry={() => { setExtra([]); setCursor(undefined); setError(''); resource.retry(); }} />
    {resource.data && <>{filtered.length ? <WatchFeed videos={filtered} /> : <WatchEmpty title={videos.length ? 'No matching videos' : 'A new home for African stories'} text={videos.length ? 'Try another category or search. You can load more titles below.' : 'Films, documentaries, music and meaningful stories are on their way. Approved releases will appear here.'} />}{next && <div className="watch-actions"><button className="watch-button" disabled={busy} onClick={more}>{busy ? 'Loading…' : 'Load more videos'}</button><span className="watch-muted">Search filters the titles loaded so far.</span></div>}</>}
  </main></>;
}
export default function WatchCatalog({ creatorId }: { creatorId?: string }) {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  return <WatchAppGate><CatalogContent key={`${uid}:${creatorId || 'all'}`} creatorId={creatorId} /></WatchAppGate>;
}
