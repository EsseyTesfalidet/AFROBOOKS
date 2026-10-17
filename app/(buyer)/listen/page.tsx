import type { Metadata } from 'next';
import { getAdminDb } from '@/lib/firebase/admin';
import ListenCatalog from '@/components/listen/ListenCatalog';

type Props = { searchParams: Promise<{ title?: string | string[] }> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { title: queryTitle } = await searchParams;
  const id = Array.isArray(queryTitle) ? queryTitle[0] : queryTitle;
  if (!id) {
    return {
      title: 'Listen to African Music, Podcasts & Audiobooks',
      description: 'Explore African music, podcasts and audiobooks from independent creators on AfroBooks.',
      alternates: { canonical: '/listen' },
    };
  }

  try {
    const db = await getAdminDb();
    const audio = (await db.doc(`audioTitles/${id}`).get()).data();
    if (!audio || audio.status !== 'published' || audio.ready !== true) {
      return { title: 'Audio unavailable', robots: { index: false, follow: false } };
    }
    const title = typeof audio.title === 'string' && audio.title.trim() ? audio.title.trim() : 'Audio';
    const creator = typeof audio.creatorName === 'string' ? audio.creatorName.trim() : '';
    const rawDescription = typeof audio.description === 'string' ? audio.description.trim() : '';
    const description = rawDescription
      ? rawDescription.length > 160 ? `${rawDescription.slice(0, 157).trimEnd()}…` : rawDescription
      : `Listen to ${title}${creator ? ` by ${creator}` : ''} on AfroBooks.`;
    const image = typeof audio.coverUrl === 'string' && audio.coverUrl.startsWith('https://') ? audio.coverUrl : undefined;
    const pageTitle = creator ? `${title} by ${creator}` : title;
    const canonical = `/listen?title=${encodeURIComponent(id)}`;
    return {
      title: pageTitle,
      description,
      alternates: { canonical },
      openGraph: { type: 'music.song', title: pageTitle, description, url: canonical, ...(image ? { images: [{ url: image, alt: title }] } : {}) },
      twitter: { card: image ? 'summary_large_image' : 'summary', title: pageTitle, description, ...(image ? { images: [image] } : {}) },
    };
  } catch {
    return { title: 'Audio unavailable', robots: { index: false, follow: false } };
  }
}

export default function ListenPage() { return <ListenCatalog />; }
