import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicRelease, JsonLd } from '@/components/discovery/PublicDiscovery';
import { discoveryDescription, getPublicDiscoveryItem } from '@/lib/server/discoveryPages';

type Props = { params: Promise<{ id: string }> };
export const revalidate = 1800;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const item = await getPublicDiscoveryItem('audio', id);
    if (!item) return { title: 'Audio unavailable', robots: { index: false, follow: false } };
    const description = discoveryDescription(item.description);
    return { title: `${item.title} by ${item.creator}`, description, alternates: { canonical: item.href }, openGraph: { type: 'music.song', title: `${item.title} — ${item.creator}`, description, url: item.href, ...(item.image ? { images: [{ url: item.image, alt: item.title }] } : {}) }, twitter: { card: item.image ? 'summary_large_image' : 'summary', title: item.title, description, ...(item.image ? { images: [item.image] } : {}) } };
  } catch { return { title: 'Audio unavailable', robots: { index: false, follow: false } }; }
}

export default async function PublicAudioPage({ params }: Props) {
  const { id } = await params;
  const item = await getPublicDiscoveryItem('audio', id);
  if (!item) notFound();
  const jsonLd = { '@context': 'https://schema.org', '@type': 'CreativeWork', name: item.title, description: item.description, creator: { '@type': 'Person', name: item.creator }, inLanguage: item.language, url: `https://afrobs.com${item.href}`, ...(item.image ? { image: item.image } : {}) };
  return <><JsonLd data={jsonLd} /><PublicRelease item={item} action={{ href: `/listen?title=${encodeURIComponent(id)}`, label: 'Listen on AfroNarra' }} /></>;
}
