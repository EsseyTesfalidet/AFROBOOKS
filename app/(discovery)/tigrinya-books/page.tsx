import CuratedCollection, { publicCollectionMetadata } from '@/components/discovery/CuratedCollection';

export const revalidate = 900;
export const generateMetadata = () => publicCollectionMetadata('tigrinya-books');
export default function TigrinyaBooksPage() { return <CuratedCollection slug="tigrinya-books" />; }
