import WatchDetail from '@/components/watch/WatchDetail';
export default async function WatchVideoPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <WatchDetail id={id} />; }
