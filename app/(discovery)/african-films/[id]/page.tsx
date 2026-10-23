import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PublicRelease } from '@/components/discovery/PublicDiscovery';
import { discoveryDescription, getPublicDiscoveryItem, isoDuration } from '@/lib/server/discoveryPages';

type Props = { params: Promise<{ id: string }> };
export const revalidate = 900;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const { id } = await params;
    const item = await getPublicDiscoveryItem('video', id);
    if (!item) return { title: 'Video unavailable', robots: { index: false, follow: false } };
    const description = discoveryDescription(item.description);
    return { title: `${item.title} by ${item.creator}`, description, alternates: { canonical: item.href }, openGraph: { type: 'video.other', title: `${item.title} — ${item.creator}`, description, url: item.href, ...(item.image ? { images: [{ url: item.image, alt: item.title }] } : {}) }, twitter: { card: item.image ? 'summary_large_image' : 'summary', title: item.title, description, ...(item.image ? { images: [item.image] } : {}) } };
  } catch { return { title: 'Video unavailable', robots: { index: false, follow: false } }; }
}

export default async function PublicVideoPage({ params }: Props) {
  const { id } = await params;
  const item = await getPublicDiscoveryItem('video', id);
  if (!item) notFound();
  const embedUrl = item.hasTrailer ? `https://afrobs.com/api/watch/public-preview?id=${encodeURIComponent(id)}` : undefined;
  const jsonLd = item.hasTrailer && item.image ? {
    '@context': 'https://schema.org', '@type': 'VideoObject', name: item.title, description: item.description,
    thumbnailUrl: item.image ? [item.image] : undefined,
    uploadDate: item.publishedAt || undefined,
    duration: item.durationSeconds > 0 ? isoDuration(item.durationSeconds) : undefined,
    embedUrl,
    inLanguage: item.language,
    publisher: { '@type': 'Organization', name: item.creator },
    mainEntityOfPage: `https://afrobs.com${item.href}`,
  } : undefined;
  return <PublicRelease item={item} trailerUrl={embedUrl} jsonLd={jsonLd} action={{ href: `/watch/${encodeURIComponent(id)}`, label: 'Open AfroNarra Watch' }} />;
}
