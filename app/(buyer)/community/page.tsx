import BuyerHeader from '@/components/buyer/BuyerHeader';
import CommunityHome from '@/components/community/CommunityHome';

export default async function CommunityPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const kind = (await searchParams).tab === 'memory' ? 'memory' : 'weekly';
  return <div className="min-h-screen bg-[#10100f]"><BuyerHeader /><CommunityHome key={kind} kind={kind} /></div>;
}
