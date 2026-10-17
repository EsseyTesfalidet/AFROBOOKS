import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 1800;
export const metadata: Metadata = discoveryMetadata('African Films & Documentaries', 'Watch African films, documentaries, short films, news, and cultural stories from independent creators on AfroBooks.', '/african-films');

export default async function AfricanFilmsPage() {
  const items = await getPublicDiscoveryItems('video');
  return <PublicDiscovery path="/african-films" title="African films and documentaries" description="Discover meaningful African films, documentaries, short films, music videos, and cultural stories from independent filmmakers and video creators." sections={[{ title: 'Films, documentaries & video stories', items }]} />;
}
