import { notFound } from 'next/navigation';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import CommunityThread from '@/components/community/CommunityThread';
import { communityId } from '@/lib/community';

export default async function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!communityId.safeParse(id).success) notFound();
  return <div className="min-h-screen bg-[#10100f]"><BuyerHeader /><CommunityThread postId={id} /></div>;
}
