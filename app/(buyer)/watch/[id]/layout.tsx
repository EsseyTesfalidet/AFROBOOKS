import type { Metadata } from 'next';
import { getAdminDb } from '@/lib/firebase/admin';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

function snippet(value: unknown, fallback: string) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return fallback;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const db = await getAdminDb();
    const video = (await db.doc(`watchVideos/${id}`).get()).data();
    if (!video || video.status !== 'published') {
      return { title: 'Video unavailable', robots: { index: false, follow: false } };
    }
    const title = typeof video.title === 'string' && video.title.trim() ? video.title.trim() : 'Video';
    const creator = typeof video.creatorName === 'string' ? video.creatorName.trim() : '';
    const description = snippet(video.description, `Watch ${title}${creator ? ` by ${creator}` : ''} on AfroNarra.`);
    const image = typeof video.posterUrl === 'string' && video.posterUrl.startsWith('https://') ? video.posterUrl : undefined;
    const pageTitle = creator ? `${title} by ${creator}` : title;
    return {
      title: pageTitle,
      description,
      alternates: { canonical: `/african-films/${encodeURIComponent(id)}` },
      openGraph: { type: 'website', title: pageTitle, description, ...(image ? { images: [{ url: image, alt: title }] } : {}) },
      twitter: { card: image ? 'summary_large_image' : 'summary', title: pageTitle, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return { title: 'Video unavailable', robots: { index: false, follow: false } };
  }
}

export default function WatchVideoLayout({ children }: Props) { return children; }
