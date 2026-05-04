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
    const [userRes, sellerRes] = await Promise.all([
      fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${id}?key=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
      fetch(
        `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/sellers/${id}?key=${apiKey}`,
        { next: { revalidate: 3600 } }
      ),
    ]);
    const userData = userRes.ok ? await userRes.json() : {};
    const sellerData = sellerRes.ok ? await sellerRes.json() : {};
    const uf = userData.fields ?? {};
    const sf = sellerData.fields ?? {};
    const penName = str(sf.penName);
    const firstName = str(uf.firstName);
    const lastName = str(uf.lastName);
    const name = penName || (firstName ? `${firstName} ${lastName}`.trim() : 'Author');
    const bio = str(uf.bio);
    const avatar = str(uf.avatarUrl);
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
