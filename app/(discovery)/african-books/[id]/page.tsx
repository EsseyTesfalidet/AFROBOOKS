import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicRelease, JsonLd } from '@/components/discovery/PublicDiscovery';
import { discoveryDescription, getPublicDiscoveryItem, getPublicDiscoveryItems, getPublicBookSample } from '@/lib/server/discoveryPages';
import { relatedReleases } from '@/lib/seo/discovery';

type Props = { params: Promise<{ id: string }> };
// Recheck publication and preview permission on each public sample request.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const item = await getPublicDiscoveryItem('book', id);
    if (!item) return { title: 'Book unavailable', robots: { index: false, follow: false } };
    const description = discoveryDescription(item.description);
    return { title: `${item.title} by ${item.creator}`, description, alternates: { canonical: item.href }, openGraph: { type: 'website', title: `${item.title} — ${item.creator}`, description, url: item.href, ...(item.image ? { images: [{ url: item.image, alt: item.title }] } : {}) }, twitter: { card: item.image ? 'summary_large_image' : 'summary', title: item.title, description, ...(item.image ? { images: [item.image] } : {}) } };
  } catch { return { title: 'Book unavailable', robots: { index: false, follow: false } }; }
}

export default async function PublicBookPage({ params }: Props) {
  const { id } = await params;
  const item = await getPublicDiscoveryItem('book', id);
  if (!item) notFound();
  const [sample, candidates] = await Promise.all([
    getPublicBookSample(id).catch(() => null), getPublicDiscoveryItems('book').catch(() => []),
  ]);
  const jsonLd = { '@context': 'https://schema.org', '@type': 'Book', name: item.title, description: item.description, author: { '@type': 'Person', name: item.creator }, inLanguage: item.language, url: `https://afrobs.com${item.href}`, ...(item.image ? { image: item.image } : {}) };
  return <><JsonLd data={jsonLd} /><PublicRelease item={item} bookSample={sample} related={relatedReleases(item, candidates)} action={{ href: `/book/${encodeURIComponent(id)}`, label: 'View full book details' }} /></>;
}
