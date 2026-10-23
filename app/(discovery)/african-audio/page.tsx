import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('African Audio, Music, Podcasts & Audiobooks', 'Explore African music, podcasts, audiobooks, and spoken stories by independent African creators on AfroNarra.', '/african-audio');

export default async function AfricanAudioPage() {
  const items = await getPublicDiscoveryItems('audio');
  return <PublicDiscovery path="/african-audio" title="African audio, music and spoken stories" description="Listen to music, podcasts, audiobooks, and spoken stories created by African artists and storytellers." sections={[{ title: 'Music, podcasts & audiobooks', items }]} />;
}
