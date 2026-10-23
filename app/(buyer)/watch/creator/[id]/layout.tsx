import type { Metadata } from 'next';
import { getAdminDb } from '@/lib/firebase/admin';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const db = await getAdminDb();
    const creator = (await db.doc(`watchCreators/${id}`).get()).data();
    if (!creator || creator.status !== 'approved') {
      return { title: 'Creator unavailable', robots: { index: false, follow: false } };
    }
    const name = typeof creator.name === 'string' && creator.name.trim() ? creator.name.trim() : 'AfroNarra creator';
    const description = `Watch films, documentaries, music and stories from ${name} on AfroNarra.`;
    return {
      title: `${name} videos`,
      description,
      alternates: { canonical: `/african-creators/${encodeURIComponent(id)}` },
      openGraph: { type: 'website', title: `${name} videos — AfroNarra`, description },
      twitter: { card: 'summary', title: `${name} videos — AfroNarra`, description },
    };
  } catch {
    return { title: 'Creator unavailable', robots: { index: false, follow: false } };
  }
}

export default function WatchCreatorLayout({ children }: Props) { return children; }
