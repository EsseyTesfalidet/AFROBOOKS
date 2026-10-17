import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicDiscovery, JsonLd } from '@/components/discovery/PublicDiscovery';
import { getPublicDiscoveryItems, getPublicVideoCreator } from '@/lib/server/discoveryPages';

type Props = { params: Promise<{ id: string }> };
export const revalidate = 1800;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const creator = await getPublicVideoCreator(id);
    if (!creator) return { title: 'Creator unavailable', robots: { index: false, follow: false } };
    const title = `${creator.name} — African films and video stories`;
    return { title, description: creator.description, alternates: { canonical: `/african-creators/${encodeURIComponent(id)}` }, openGraph: { type: 'profile', title, description: creator.description } };
  } catch { return { title: 'Creator unavailable', robots: { index: false, follow: false } }; }
}

export default async function PublicVideoCreatorPage({ params }: Props) {
  const { id } = await params;
  const creator = await getPublicVideoCreator(id);
  if (!creator) notFound();
  const videos = await getPublicDiscoveryItems('video', undefined, id);
  return <><JsonLd data={{ '@context': 'https://schema.org', '@type': 'ProfilePage', name: creator.name, description: creator.description, url: `https://afrobs.com/african-creators/${encodeURIComponent(id)}`, mainEntity: { '@type': 'Person', name: creator.name } }} /><PublicDiscovery path={`/african-creators/${encodeURIComponent(id)}`} title={`${creator.name} on AfroBooks`} description={creator.description} sections={[{ title: 'Published films and video stories', items: videos, empty: 'This creator has no published videos yet.' }]} /></>;
}
