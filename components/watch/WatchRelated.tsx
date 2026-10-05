'use client';
import type { WatchVideo } from '@/types/video';
import { useWatchResource, WatchCard, WatchFeedback } from './WatchUI';

export default function WatchRelated({ id }: { id: string }) {
  const related = useWatchResource<{ videos: WatchVideo[] }>(`/api/watch?view=related&id=${encodeURIComponent(id)}`);
  if (!related.loading && !related.error && !related.data?.videos.length) return null;
  return <section className="watch-related" aria-labelledby="watch-related-title"><h2 id="watch-related-title">More to watch</h2>
    <WatchFeedback loading={related.loading} error={related.error} retry={related.retry} />
    <div className="watch-grid">{related.data?.videos.map(video => <WatchCard key={video.id} video={video} />)}</div>
  </section>;
}
