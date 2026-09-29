import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import CommunityComposer from '@/components/community/CommunityComposer';

export default function NewMemoryPage() {
  return <div className="min-h-screen bg-[#10100f]"><BuyerHeader /><main className="community community-shell">
    <Link href="/community?tab=memory" className="community-link mb-5">← Find a Memory</Link>
    <p className="community-kicker">Find a Memory</p><h1>Start with what you remember.</h1>
    <p className="community-muted mt-4 mb-7">Someone else might know the missing piece.</p>
    <div className="community-card"><CommunityComposer /></div>
  </main></div>;
}
