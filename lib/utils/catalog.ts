import type { Book } from '@/types/book';

export function newestBooks(books: Book[]): Book[] {
  return [...books].sort((a, b) => {
    const date = (book: Book) => book.publishedAt?.toMillis?.() ?? book.createdAt?.toMillis?.() ?? 0;
    return date(b) - date(a) || a.id.localeCompare(b.id);
  });
}

export function catalogShelves(books: Book[], favoriteGenre?: string) {
  const latest = newestBooks(books);
  const popular = [...latest].filter(book => (book.totalSales ?? 0) > 0)
    .sort((a, b) => (b.totalSales ?? 0) - (a.totalSales ?? 0));
  const rated = [...latest].filter(book => book.averageRating >= 4.5 && book.reviewCount > 0 && book.reviewCount < 10)
    .sort((a, b) => b.averageRating - a.averageRating);
  const genre = favoriteGenre ? latest.filter(book => (book.genre ?? '').toLocaleLowerCase() === favoriteGenre.toLocaleLowerCase()) : [];
  const preferred = [...genre, ...latest.filter(book => book.isFeatured), ...popular, ...latest];
  const unique = Array.from(new Map(preferred.map(book => [book.id, book])).values());
  return { recommended: unique.slice(0, 8), genre: genre.slice(0, 8), popular: popular.slice(0, 8), latest: latest.slice(0, 8), featured: latest.filter(book => book.isFeatured).slice(0, 8), hidden: rated.slice(0, 8) };
}
