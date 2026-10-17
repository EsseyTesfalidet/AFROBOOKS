import type { Metadata } from 'next';
import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PublicDiscovery } from '@/components/discovery/PublicDiscovery';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';

export const revalidate = 3600;
export const metadata: Metadata = discoveryMetadata('African Books, Magazines & Short Stories', 'Discover books, magazines, and short stories by African authors. Read new voices and stories from across the continent and its global diaspora.', '/african-books');

export default async function AfricanBooksPage() {
  const items = await getPublicDiscoveryItems('book');
  return <PublicDiscovery path="/african-books" title="African books and stories" description="Explore books, magazines, and short stories by African authors. Find fiction, history, poetry, and fresh perspectives from across Africa and its diaspora." sections={[{ title: 'Books, magazines & short stories', items }]} />;
}
