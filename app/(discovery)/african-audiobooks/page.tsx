import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('African Audiobooks & Spoken Stories', 'Listen to African audiobooks and spoken stories from African authors and narrators on AfroBooks.', '/african-audiobooks');

export default async function AfricanAudiobooksPage() {
  const items = await getPublicDiscoveryItems('audio', 'Audiobooks');
  return <PublicDiscovery path="/african-audiobooks" title="African audiobooks and spoken stories" description="Listen to audiobooks by African authors, hear stories in African languages, and support independent narrators and storytellers." sections={[{ title: 'Audiobooks', items }]} />;
}
