'use client';

import Link from 'next/link';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

interface BookCardProps {
  book: Book;
  rank?: number;
  badge?: { label: string; color: string; bg: string };
}

export default function BookCard({ book, rank, badge }: BookCardProps) {
  return (
    <Link
      href={`/book/${book.id}`}
      className="block rounded-xl overflow-hidden border transition-all hover:-translate-y-0.5 group"
      style={{ border: '1px solid #222', background: '#111' }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#444')}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = '#222')}
    >
      {/* Cover */}
      <div
        className="relative"
        style={{
          height: 160,
          background: book.coverBgColor || '#1a1040',
          overflow: 'hidden',
        }}
      >
        {/* Top accent stripe */}
        <div
          className="absolute top-0 left-0 right-0"
          style={{ height: 5, background: book.coverAccentColor || '#7c3aed' }}
        />

        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85))' }}
        />

        {/* SUB tag — top left */}
        {book.inSubscription && (
          <span
            className="absolute top-2 left-2 px-1.5 py-0.5 rounded text-xs font-bold"
            style={{ background: '#7c3aed', color: '#fff', fontSize: 8 }}
          >
            SUB
          </span>
        )}

        {/* EBOOK tag — top right */}
        <span
          className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-xs font-bold"
          style={{ background: '#f5b800', color: '#000', fontSize: 8 }}
        >
          EBOOK
        </span>

        {/* Rank badge */}
        {rank && (
          <span
            className="absolute top-7 left-2 w-5 h-5 flex items-center justify-center rounded-full font-display text-xs"
            style={{ background: '#e8442a', color: '#fff' }}
          >
            {rank}
          </span>
        )}

        {/* Custom badge (e.g. NEW) */}
        {badge && (
          <span
            className="absolute top-7 right-2 px-1.5 py-0.5 rounded text-xs font-bold"
            style={{ background: badge.bg, color: badge.color, fontSize: 9 }}
          >
            {badge.label}
          </span>
        )}

        {/* Bottom text */}
        <div className="absolute bottom-0 left-0 right-0 p-2">
          <p
            className="text-xs uppercase tracking-wider font-medium mb-0.5"
            style={{ color: book.coverAccentColor || '#7c3aed', fontSize: 9 }}
          >
            {book.genre}
          </p>
          <p
            className="font-display leading-tight text-white"
            style={{ fontSize: 15 }}
          >
            {book.title}
          </p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)', fontSize: 10 }}>
            {book.authorName}
          </p>
        </div>
      </div>

      {/* Info */}
      <div className="px-2.5 pb-2.5 pt-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium" style={{ color: '#f5b800' }}>
            {centsToDisplay(book.price)}
          </span>
          {book.averageRating > 0 && (
            <span className="text-xs" style={{ color: '#888' }}>
              <span style={{ color: '#f5b800' }}>★</span> {book.averageRating.toFixed(1)}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
