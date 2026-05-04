import type { Metadata } from 'next';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

function str(val: Record<string, unknown> | undefined): string {
  if (!val) return '';
  if ('stringValue' in val) return val.stringValue as string;
  return '';
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  try {
    const res = await fetch(
      `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/books/${id}?key=${apiKey}`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) throw new Error('not found');
    const data = await res.json();
    const f = data.fields ?? {};
    const title = str(f.title) || 'Book';
    const author = str(f.authorName) || 'Unknown Author';
    const desc = str(f.description);
    const cover = str(f.coverUrl);
    const snippet = desc ? (desc.length > 160 ? desc.slice(0, 157) + '…' : desc) : `Read "${title}" by ${author} on AfroBooks.`;
    return {
      title,
      description: snippet,
      openGraph: {
        title: `${title} — ${author}`,
        description: snippet,
        ...(cover ? { images: [{ url: cover, alt: title }] } : {}),
      },
      twitter: {
        card: cover ? 'summary_large_image' : 'summary',
        title: `${title} — ${author}`,
        description: snippet,
        ...(cover ? { images: [cover] } : {}),
      },
    };
  } catch {
    return { title: 'Book — AfroBooks' };
  }
}

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
