'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Bookmark, CheckCircle2, History, LibraryBig, Play, Search, X } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { useAuthStore } from '@/store/authStore';
import { videoDuration } from '@/lib/watch/policy';
import { appHaptic } from '@/lib/app/haptics';
import { RestoreVideoPurchases } from './WatchPlayPurchase';
import type { WatchState, WatchVideo } from '@/types/video';
import { LibraryFormatTabs, useWatchResource, WatchAppGate, WatchCard, WatchEmpty, WatchFeedback } from './WatchUI';
import WatchPoster from './WatchPoster';
type Entry = { video: WatchVideo; state: WatchState };
const unfinished = ({ video, state }: Entry) => state.seconds > 0 && state.seconds < video.durationSeconds - Math.min(5, video.durationSeconds * .05);
const filters = [{ label: 'Saved', icon: Bookmark }, { label: 'Continue watching', icon: History }, { label: 'Purchased', icon: CheckCircle2 }];
function LibraryContent() {
  const resource = useWatchResource<{ entries: Entry[]; limited: boolean }>('/api/watch?view=library');
  const [filter, setFilter] = useState('Saved');
  const [search, setSearch] = useState('');
  const all = resource.data?.entries || [];
  const matches = (entry: Entry, name: string) => name === 'Purchased' ? entry.state.owned : name === 'Continue watching' ? unfinished(entry) : entry.state.saved;
  const entries = all.filter(entry => matches(entry, filter) && `${entry.video.title} ${entry.video.creatorName} ${entry.video.language}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const resume = all.find(unfinished);
  return <><BuyerHeader /><main className="app-page watch-page watch-library">
    <header className="watch-intro"><div className="watch-discovery-heading"><span className="watch-screen-mark" aria-hidden="true"><LibraryBig size={23} /></span><div><p className="watch-eyebrow">Made for your moments</p><h1>My Library</h1></div></div></header>
    <LibraryFormatTabs active="videos" />
    {resume && filter !== 'Continue watching' && !search && <section className="watch-resume-section" aria-label="Pick up where you left off"><p className="watch-eyebrow">Pick up where you left off</p><Link href={`/watch/${resume.video.id}`} className="watch-resume-card"><div className="watch-art"><WatchPoster video={resume.video} /><span className="watch-play"><Play size={18} fill="currentColor" /></span><span className="watch-progress" aria-hidden="true"><i style={{ width: `${Math.min(100, resume.state.seconds / resume.video.durationSeconds * 100)}%` }} /></span></div><div><strong dir="auto">{resume.video.title}</strong><p>{videoDuration(resume.video.durationSeconds - resume.state.seconds)} left</p><span>Resume watching</span></div></Link></section>}
    <div className="watch-library-filters" aria-label="Video library filter">{filters.map(({ label, icon: Icon }) => <button key={label} aria-label={label} aria-pressed={label === filter} onClick={() => { setFilter(label); appHaptic(); }}><span><Icon size={18} /><b aria-hidden="true">{all.filter(entry => matches(entry, label)).length}</b></span><span>{label}</span></button>)}</div>
    {!!all.length && <div className="watch-search watch-library-search"><Search size={18} aria-hidden="true" /><input type="search" aria-label="Search your videos" placeholder="Search your videos" value={search} onChange={event => setSearch(event.target.value)} />{search && <button aria-label="Clear library search" onClick={() => setSearch('')}><X size={18} /></button>}</div>}
    <WatchFeedback loading={resource.loading} error={resource.error} retry={resource.retry} />
    {resource.data && (entries.length ? <div className="watch-video-list">{entries.map(entry => <WatchCard key={entry.video.id} {...entry} compact />)}</div> : <WatchEmpty title={search ? 'No matching videos' : filter === 'Purchased' ? 'Your video collection starts here' : filter === 'Saved' ? 'Keep something for later' : 'Pick up where you left off'} text={search ? 'Try a different title, creator or language.' : filter === 'Purchased' ? 'Purchased videos will stay here, ready to watch again.' : filter === 'Saved' ? 'Save films and stories from Watch to find them here.' : 'Start watching a video and return here to continue.'} action={<Link className="watch-button watch-primary" href="/watch">Explore Watch</Link>} />)}
    <div className="watch-library-restore"><RestoreVideoPurchases onRestored={resource.retry} /></div>
    {resource.data?.limited && <p className="watch-muted">Showing your 100 most recent saved or watched videos and up to 100 purchases.</p>}
  </main></>;
}
export default function WatchLibrary() {
  const uid = useAuthStore(s => s.firebaseUser?.uid);
  return <WatchAppGate><LibraryContent key={uid || 'signed-out'} /></WatchAppGate>;
}
