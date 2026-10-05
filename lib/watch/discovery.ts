import type { WatchVideo } from '@/types/video';

export function relatedVideos(current: WatchVideo, candidates: WatchVideo[], limit = 8) {
  const score = (video: WatchVideo) => Number(video.creatorId === current.creatorId) * 4
    + Number(video.category === current.category) * 3 + Number(video.language === current.language) * 2;
  return candidates.filter(video => video.id !== current.id && video.status === 'published')
    .sort((a, b) => score(b) - score(a) || (b.publishedAt || 0) - (a.publishedAt || 0) || a.id.localeCompare(b.id))
    .slice(0, limit);
}
