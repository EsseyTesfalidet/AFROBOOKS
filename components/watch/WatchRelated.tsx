'use client';
import type { WatchVideo } from '@/types/video';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useWatchResource, WatchCard, WatchFeedback } from './WatchUI';

export default function WatchRelated({ id }: { id: string }) {
  const related = useWatchResource<{ videos: WatchVideo[] }>(`/api/watch?view=related&id=${encodeURIComponent(id)}`);
  if (!related.loading && !related.error && !related.data?.videos.length) return null;
  return <section className="watch-related" aria-labelledby="watch-related-title"><header className="watch-section-heading"><h2 id="watch-related-title">More to watch</h2><Link href="/watch" aria-label="Explore all videos">Explore<ArrowUpRight size={16} /></Link></header>
    <WatchFeedback loading={related.loading} error={related.error} retry={related.retry} />
    <div className="watch-video-list">{related.data?.videos.map(video => <WatchCard key={video.id} video={video} compact />)}</div>
  </section>;
}
