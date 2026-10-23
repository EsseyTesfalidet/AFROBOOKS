export const PUBLIC_COLLECTIONS = [
  {
    slug: 'tigrinya-books', kind: 'book' as const,
    title: 'Tigrinya Books & Stories',
    description: 'Explore Tigrinya-language books and stories by independent authors on AfroNarra. Discover each title, meet its author and read available free samples.',
    introduction: 'Find published books listed in Tigrinya, also known as Tigrigna or ትግርኛ. Explore the original titles and author descriptions below. Where an author has enabled a sample, you can start reading on the book page before creating an account.',
    heading: 'Books and stories in Tigrinya',
  },
  {
    slug: 'african-documentaries', kind: 'video' as const,
    title: 'African Documentaries & Documentary Films',
    description: 'Discover African documentaries from independent filmmakers on AfroNarra. Explore real stories, filmmaker descriptions, languages and available official trailers.',
    introduction: 'Explore documentary releases from African creators. Open a title to learn about its subject, filmmaker and language. Creator-provided trailers play on the release page when available; full playback and purchases continue in the AfroNarra app.',
    heading: 'Documentary films and stories',
  },
];

export function matchesPublicCollection(slug: string, item: { language?: unknown; category?: unknown }) {
  if (slug === 'tigrinya-books') return typeof item.language === 'string' && ['tigrinya', 'tigrigna', 'tigrina', 'ትግርኛ', 'ti', 'tir'].includes(item.language.normalize('NFKC').trim().toLowerCase());
  if (slug === 'african-documentaries') return typeof item.category === 'string' && item.category.trim().toLowerCase() === 'documentaries';
  return false;
}
