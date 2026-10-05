import WatchCatalog from '@/components/watch/WatchCatalog';
export default async function CreatorPage({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <WatchCatalog creatorId={id} />; }
