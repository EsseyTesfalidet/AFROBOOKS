import { notFound } from 'next/navigation';
import CommunityThread from '@/components/community/CommunityThread';
import { communityId } from '@/lib/community';

export default async function AdminConversationPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ reply?: string }> }) {
  const { id } = await params;
  if (!communityId.safeParse(id).success) notFound();
  const { reply } = await searchParams;
  if (reply && !communityId.safeParse(reply).success) notFound();
  return <div className="admin-page"><CommunityThread key={`${id}:${reply ?? ''}`} postId={id} admin focusReply={reply} /></div>;
}
