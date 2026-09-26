import { redirect } from 'next/navigation';
export default async function ProfilePage({ params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  if (section === 'earnings') redirect('/analytics');
  redirect(`/dashboard?profile=${encodeURIComponent(section)}`);
}
