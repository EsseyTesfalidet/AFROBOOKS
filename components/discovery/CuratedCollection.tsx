import { getPublicDiscoveryItems } from '@/lib/server/discoveryPages';
import { PUBLIC_COLLECTIONS, matchesPublicCollection } from '@/lib/seo/collections';
import { discoveryMetadata } from '@/lib/seo/discoveryMetadata';
import { PublicDiscovery } from './PublicDiscovery';

export async function publicCollectionMetadata(slug: string) {
  const collection = PUBLIC_COLLECTIONS.find(entry => entry.slug === slug)!;
  const items = (await getPublicDiscoveryItems(collection.kind)).filter(item => matchesPublicCollection(slug, item));
  return { ...discoveryMetadata(collection.title, collection.description, `/${slug}`), ...(!items.length ? { robots: { index: false, follow: true } } : {}) };
}

export default async function CuratedCollection({ slug }: { slug: string }) {
  const collection = PUBLIC_COLLECTIONS.find(entry => entry.slug === slug)!;
  const items = (await getPublicDiscoveryItems(collection.kind)).filter(item => matchesPublicCollection(slug, item));
  return <PublicDiscovery path={`/${slug}`} title={collection.title} description={collection.introduction} sections={[{ title: collection.heading, items, empty: 'There are no published releases in this collection yet. Explore the other categories above.' }]} />;
}
