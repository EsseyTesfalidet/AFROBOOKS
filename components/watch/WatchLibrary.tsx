'use client';
import { useState } from 'react';
import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { RestoreVideoPurchases } from './WatchPlayPurchase';
import type { WatchState, WatchVideo } from '@/types/video';
import { LibraryFormatTabs, useWatchResource, WatchAppGate, WatchCard, WatchEmpty, WatchFeedback } from './WatchUI';
function LibraryContent() {
  const resource = useWatchResource<{ entries: { video: WatchVideo; state: WatchState }[]; limited: boolean }>('/api/watch?view=library');
  const [filter, setFilter] = useState('Saved');
  const entries = resource.data?.entries.filter(({ state }) => filter === 'Purchased' ? state.owned : filter === 'Continue watching' ? state.seconds > 0 : state.saved) || [];
  return <><BuyerHeader /><main className="app-page watch-page"><header className="watch-intro"><div><p className="watch-eyebrow">Your collection</p><h1>My Library</h1></div></header><LibraryFormatTabs active="videos" /><div className="watch-chips" aria-label="Video library filter">{['Saved', 'Continue watching', 'Purchased'].map(value => <button key={value} aria-pressed={value === filter} onClick={() => setFilter(value)}>{value}</button>)}</div><WatchFeedback loading={resource.loading} error={resource.error} retry={resource.retry} />
    {resource.data && (entries.length ? <div className="watch-grid">{entries.map(entry => <WatchCard key={entry.video.id} {...entry} />)}</div> : <WatchEmpty title={filter === 'Purchased' ? 'Your video collection starts here' : filter === 'Saved' ? 'Keep something for later' : 'Pick up where you left off'} text={filter === 'Purchased' ? 'Purchased videos will stay here, ready to watch again.' : filter === 'Saved' ? 'Save films and stories from Screen to find them here.' : 'Start watching a video and return here to continue.'} action={<Link className="watch-button watch-primary" href="/watch">Explore Screen</Link>} />)}
    <RestoreVideoPurchases onRestored={resource.retry} />
    {resource.data?.limited && <p className="watch-muted">Showing your 100 most recent saved or watched videos and up to 100 purchases.</p>}
  </main></>;
}
export default function WatchLibrary() { return <WatchAppGate><LibraryContent /></WatchAppGate>; }
