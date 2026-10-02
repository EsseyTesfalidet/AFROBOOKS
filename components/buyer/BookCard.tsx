'use client';

import Link from 'next/link';
import BookCover from '@/components/shared/BookCover';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import { publicationLabel } from '@/lib/utils/publication';

interface BookCardProps {
  book: Book;
  rank?: number;
  badge?: { label: string; color: string; bg: string };
  eager?: boolean;
}

export default function BookCard({ book, rank, badge, eager }: BookCardProps) {
  const releaseDate = book.releaseDate?.toDate?.() ?? null;
  const isPreorder = book.isPreorder && releaseDate && releaseDate > new Date();
  return (
    <Link href={`/${isPreorder ? 'book' : 'read'}/${encodeURIComponent(book.id)}`} aria-label={`${book.title} by ${book.authorName}`} className="app-book-card group block min-w-0 rounded-lg">
      <div className="app-book-artwork relative transition-transform duration-200 group-hover:-translate-y-1">
        <BookCover book={book} eager={eager} />
        {(rank || badge || isPreorder) && <div className="absolute left-2 top-2 flex flex-wrap gap-1">
          {rank && <span className="rounded bg-black/80 px-2 py-1 text-[11px] font-semibold text-white">#{rank}</span>}
          {badge && <span className="rounded px-2 py-1 text-[11px] font-semibold" style={{background:badge.bg,color:badge.color}}>{badge.label}</span>}
          {isPreorder && <span className="rounded bg-black/80 px-2 py-1 text-[11px] text-white">Pre-order</span>}
        </div>}
      </div>
      <div className="app-book-details pt-3">
        <p className="app-book-title line-clamp-2 text-[14px] font-semibold leading-snug text-[#f5f2eb] group-hover:text-[#ffad91]">{book.title}</p>
        <p className="mt-1 truncate text-[12px] text-[#a8a49c]">{book.authorName}</p>
        {book.publicationType && book.publicationType !== 'book' && <p className="mt-1 line-clamp-2 text-[11px] text-[#dec18e]">{publicationLabel(book)}</p>}
        {book.publicationType === 'short_story' && book.price < 50 && <p className="mt-1 text-[11px] text-[#a8a49c]">Combine titles · $1 cart minimum</p>}
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[12px]">
          <span className="app-book-price font-medium text-[#dec18e]">{centsToDisplay(book.price ?? 0)}</span>
          {book.averageRating > 0 && book.reviewCount > 0 && <span aria-label={`Rated ${book.averageRating.toFixed(1)} out of 5`} className="text-[#b4b1a9]"><span className="text-[#dec18e]" aria-hidden="true">★</span> {book.averageRating.toFixed(1)}</span>}
        </div>
      </div>
    </Link>
  );
}
