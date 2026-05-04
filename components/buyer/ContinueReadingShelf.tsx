'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { getActiveReadingProgress, getBook } from '@/lib/firebase/firestore';
import type { ReadingProgress } from '@/types/order';
import type { Book } from '@/types/book';

interface ShelfItem {
  progress: ReadingProgress;
  book: Book;
}

export default function ContinueReadingShelf({ userId }: { userId: string }) {
  const [items, setItems] = useState<ShelfItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    getActiveReadingProgress(userId).then(async (progresses) => {
      if (progresses.length === 0) { setLoaded(true); return; }
      const books = await Promise.all(progresses.map((p) => getBook(p.bookId)));
      const merged: ShelfItem[] = progresses
        .map((p, i) => ({ progress: p, book: books[i]! }))
        .filter((x) => x.book !== null);
      setItems(merged);
      setLoaded(true);
    });
  }, [userId]);

  if (!loaded || items.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium text-white">Continue Reading</p>
        <Link href="/library" className="text-xs transition-colors hover:text-white" style={{ color: '#555' }}>
          View all
        </Link>
      </div>
      <div
        className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
        style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {items.map(({ progress, book }) => (
          <Link
            key={book.id}
            href={`/read/${book.id}`}
            className="flex-shrink-0 snap-start rounded-xl overflow-hidden border"
            style={{ width: 200, background: '#111', borderColor: '#1a1a1a' }}
          >
            <div className="flex gap-3 p-3">
              {/* Cover thumbnail */}
              <div
                className="flex-shrink-0 rounded-lg overflow-hidden relative"
                style={{ width: 48, height: 68, background: book.coverBgColor || '#1a1a1a' }}
              >
                <div className="absolute top-0 left-0 right-0 h-0.5" style={{ background: book.coverAccentColor || '#f5b800' }} />
                {book.coverUrl
                  ? <img src={book.coverUrl} alt={book.title} className="absolute inset-0 w-full h-full object-cover" />
                  : <span className="absolute inset-0 flex items-center justify-center text-lg font-bold" style={{ color: book.coverAccentColor || '#f5b800' }}>{book.title.charAt(0)}</span>
                }
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0 flex flex-col justify-between">
                <div>
                  <p className="text-xs font-medium text-white truncate">{book.title}</p>
                  <p className="text-xs truncate mt-0.5" style={{ color: '#666' }}>{book.authorName}</p>
                </div>

                {/* Progress bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs" style={{ color: '#555' }}>
                      {progress.percentComplete > 0 ? `${Math.round(progress.percentComplete)}%` : 'Just started'}
                    </span>
                    <span className="flex items-center gap-0.5 text-xs" style={{ color: '#e8442a' }}>
                      <BookOpen size={9} /> Continue
                    </span>
                  </div>
                  <div className="h-1 rounded-full" style={{ background: '#222' }}>
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(3, progress.percentComplete)}%`, background: '#e8442a' }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
