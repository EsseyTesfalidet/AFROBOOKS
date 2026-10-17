import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('African Podcasts & Audio Shows', 'Find African podcasts, interviews, conversations, and independent audio shows by creators across Africa and the diaspora.', '/african-podcasts');

export default async function AfricanPodcastsPage() {
  const items = await getPublicDiscoveryItems('audio', 'Podcasts');
  return <PublicDiscovery path="/african-podcasts" title="African podcasts and audio shows" description="Find conversations, interviews, and audio shows from African podcasters and independent creators. Discover voices in African languages and English." sections={[{ title: 'Podcasts from African creators', items }]} />;
}
