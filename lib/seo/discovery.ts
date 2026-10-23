import type { DiscoveryItem } from '@/lib/server/discoveryPages';

export function releaseFormat(item: Pick<DiscoveryItem, 'kind' | 'category' | 'format'>) {
  if (item.format) return item.format;
  if (item.kind === 'book') return 'Book';
  return item.kind === 'video' ? 'Film & video' : 'Audio';
}

export function relatedReleases(item: DiscoveryItem, candidates: DiscoveryItem[], limit = 4) {
  const seen = new Set([`${item.kind}:${item.id}`]);
  return candidates.filter(candidate => {
    const key = `${candidate.kind}:${candidate.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((candidate, index) => ({
    candidate, index,
    score: (candidate.language !== 'Unknown language' && candidate.language === item.language ? 4 : 0)
      + (candidate.category === item.category ? 2 : 0) + (candidate.creator === item.creator ? 1 : 0),
  })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, limit).map(row => row.candidate);
}

export function releaseShareText(item: Pick<DiscoveryItem, 'title' | 'creator' | 'kind' | 'href'>) {
  return `${item.title} by ${item.creator}\n${item.kind === 'book' ? 'Discover this book' : item.kind === 'video' ? 'Discover this film or video' : 'Discover this audio release'} on AfroNarra.\nhttps://afrobs.com${item.href}`;
}
