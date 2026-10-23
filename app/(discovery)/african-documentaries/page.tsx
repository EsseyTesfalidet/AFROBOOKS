import CuratedCollection, { publicCollectionMetadata } from '@/components/discovery/CuratedCollection';

export const revalidate = 900;
export const generateMetadata = () => publicCollectionMetadata('african-documentaries');
export default function AfricanDocumentariesPage() { return <CuratedCollection slug="african-documentaries" />; }
