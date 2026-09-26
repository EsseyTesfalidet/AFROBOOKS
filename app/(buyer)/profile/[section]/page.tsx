import { redirect } from 'next/navigation';
export default async function ProfilePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === 'library' || section === 'stats') redirect('/library');
  redirect(`/browse?profile=${encodeURIComponent(section)}`);
}
