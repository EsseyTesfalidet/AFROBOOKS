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
            <h2 className="text-[22px] font-semibold tracking-tight text-[#f5f2eb]">{title}</h2>
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
            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: '#a8a49c' }}>
              {subtitle}
            </p>
          ) : null}
        </div>
        {actionHref ? (
          <Link
            href={actionHref}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-[12px] transition-colors hover:text-white"
            style={{ color: '#b4b1a9' }}
          >
            {actionLabel} <ChevronRight size={12} />
          </Link>
        ) : null}
      </div>

      {books.length === 0 ? (
        <div
          className="empty-state-card rounded-2xl px-4 py-6 text-sm"
          style={{ color: '#7a7a84' }}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          className="flex gap-4 overflow-x-auto py-2 snap-x snap-mandatory"
          tabIndex={0}
          role="region"
          aria-label={title}
          style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
        >
          {books.map((book) => (
            <div key={book.id} className="w-[148px] flex-shrink-0 snap-start sm:w-[176px]">
              <BookCard book={book} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
