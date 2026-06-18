'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import BookCard from '@/components/buyer/BookCard';
import type { Book } from '@/types/book';

interface Props {
  title: string;
  subtitle?: string;
  badge?: string;
  actionHref?: string;
  actionLabel?: string;
  books: Book[];
  emptyMessage?: string;
}

export default function BookRail({
  title,
  subtitle,
  badge,
  actionHref,
  actionLabel = 'See all',
  books,
  emptyMessage = 'Nothing here yet.',
}: Props) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-display-sm text-white">{title}</h2>
            {badge ? (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                style={{ background: '#1f0e0c', color: '#e8442a' }}
              >
                {badge}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <p className="mt-1 text-sm" style={{ color: '#666' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="hidden items-center gap-1 text-xs transition-colors hover:text-white sm:inline-flex"
            style={{ color: '#666' }}
          >
            {actionLabel} <ChevronRight size={12} />
          </Link>
        ) : null}
      </div>

      {books.length === 0 ? (
        <div
          className="rounded-2xl border px-4 py-6 text-sm"
          style={{ background: '#111', borderColor: '#1a1a1a', color: '#555' }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory scrollbar-none"
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {books.map((book) => (
            <div key={book.id} className="w-[152px] flex-shrink-0 snap-start">
              <BookCard book={book} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
