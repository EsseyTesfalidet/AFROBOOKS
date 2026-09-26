import { getPublicAuthor } from '@/lib/server/publicAuthor';
import type { Metadata } from 'next';

type Props = { params: Promise<{ id: string }>; children: React.ReactNode };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  try {
    const profile = await getPublicAuthor(id);
    const name = profile?.seller.penName || [profile?.author.firstName, profile?.author.lastName].filter(Boolean).join(' ') || 'Author';
    const bio = profile?.author.bio;
    const avatar = profile?.author.avatarUrl;
    const desc = bio
      ? (bio.length > 160 ? bio.slice(0, 157) + '…' : bio)
      : `Discover books by ${name} on AfroBooks.`;
    return {
      title: name,
      description: desc,
      openGraph: {
        title: `${name} — AfroBooks`,
        description: desc,
        ...(avatar ? { images: [{ url: avatar, alt: name }] } : {}),
      },
      twitter: {
        card: avatar ? 'summary_large_image' : 'summary',
        title: `${name} — AfroBooks`,
        description: desc,
        ...(avatar ? { images: [avatar] } : {}),
      },
    };
  } catch {
    return { title: 'Author — AfroBooks' };
  }
}

export default function AuthorLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
