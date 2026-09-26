'use client';

import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

const statuses: Record<Book['status'], { label: string; color: string; note: string }> = {
  live: { label: 'Published', color: 'text-emerald-300', note: 'Available to readers' },
  draft: { label: 'Draft', color: 'text-[#b4b1a9]', note: 'Private until you publish' },
  in_review: { label: 'In review', color: 'text-sky-300', note: 'Waiting for staff approval' },
  flagged: { label: 'Needs attention', color: 'text-amber-300', note: 'Review the feedback before publishing again' },
  removed: { label: 'Removed', color: 'text-red-300', note: 'Unavailable to readers' },
};

export default function BookList({ books, onRemove, removingId }: {
  books: Book[];
  onRemove?: (book: Book) => void;
  removingId?: string | null;
}) {
  return (
    <ul className="divide-y divide-white/10">
      {books.map((book) => {
        const status = statuses[book.status] ?? statuses.draft;
        return (
          <li key={book.id} className="flex gap-4 py-5 sm:gap-5 sm:py-6">
            <div className="flex h-[88px] w-[60px] shrink-0 items-center justify-center overflow-hidden rounded-md border border-white/10 sm:h-[104px] sm:w-[72px]" style={{ background: book.coverBgColor || '#282421' }}>
              {book.coverUrl ? <img src={book.coverUrl} alt="" className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = 'none'; }} /> : <BookOpen size={24} className="text-white/40" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
                <div className="min-w-0">
                  <Link href={`/publish?edit=${encodeURIComponent(book.id)}`} className="break-words text-[16px] font-semibold leading-snug text-[#f5f2eb] hover:underline sm:text-[18px]">{book.title || 'Untitled book'}</Link>
                  <p className="mt-1 text-[12px] text-[#a8a49c]">{book.genre || 'No genre selected'} · {centsToDisplay(book.price ?? 0)} · {book.totalSales ?? 0} sales</p>
                </div>
                <span className={`shrink-0 text-[12px] font-medium ${status.color}`}>{status.label}</span>
              </div>
              <p className="mt-2 text-[12px] leading-relaxed text-[#a8a49c]">{book.flagReason && (book.status === 'flagged' || book.status === 'removed') ? book.flagReason : status.note}</p>
              <div className="mt-2 flex flex-wrap items-center gap-x-5 text-[13px]">
                <Link href={`/publish?edit=${encodeURIComponent(book.id)}`} aria-label={`Edit ${book.title || 'untitled book'}`} className="inline-flex min-h-11 items-center text-[#ff9e83] hover:underline">{book.status === 'draft' ? 'Continue draft' : 'Edit book'}</Link>
                {book.status === 'live' && <Link href={`/book/${encodeURIComponent(book.id)}`} className="inline-flex min-h-11 items-center text-[#b4b1a9] hover:text-white">View book</Link>}
                {onRemove && <details className="relative ml-auto">
                  <summary aria-label={`More options for ${book.title || 'untitled book'}`} className="flex min-h-11 cursor-pointer list-none items-center px-2 text-[#a8a49c] hover:text-white">More <span aria-hidden="true" className="ml-1">···</span></summary>
                  <div className="absolute right-0 top-full z-10 w-40 rounded-lg border border-white/15 bg-[#201d1a] p-1 shadow-xl">
                    <button type="button" disabled={!!removingId} onClick={() => onRemove(book)} className="min-h-11 w-full rounded px-3 text-left text-[13px] text-red-300 hover:bg-white/5 disabled:opacity-50">{removingId === book.id ? 'Removing…' : 'Remove book'}</button>
                  </div>
                </details>}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
