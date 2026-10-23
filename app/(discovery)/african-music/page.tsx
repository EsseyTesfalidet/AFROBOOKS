import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('African Music & Independent Artists', 'Discover African music and independent artists on AfroNarra. Explore new songs, music videos, and sounds from across the continent and diaspora.', '/african-music');

export default async function AfricanMusicPage() {
  const [audio, videos] = await Promise.all([getPublicDiscoveryItems('audio', 'Music'), getPublicDiscoveryItems('video', 'Music')]);
  return <PublicDiscovery path="/african-music" title="African music and independent artists" description="Listen to African music and discover independent musicians, songs, and music videos from across the continent and diaspora." sections={[{ title: 'Music and audio releases', items: audio }, { title: 'Music videos', items: videos, empty: 'Music videos from African creators will appear here as they are published.' }]} />;
}
