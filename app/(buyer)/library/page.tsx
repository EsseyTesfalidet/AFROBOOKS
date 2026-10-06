'use client';
import { publicationTitle, publicationLabel } from '@/lib/utils/publication';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, PlayCircle } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import { LibraryFormatTabs } from '@/components/watch/WatchUI';
import BookCover from '@/components/shared/BookCover';
import SwipeShelf from '@/components/shared/SwipeShelf';
import ProgressBar from '@/components/shared/ProgressBar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { subscribeUserLibrary, getUserLibrary, getBook, getReadingProgress } from '@/lib/firebase/firestore';
import { syncPurchasedLibrary } from '@/lib/firebase/syncLibrary';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';
import type { LibraryItem } from '@/types/order';

interface LibraryEntry {
  bookId: string;
  book: Book | null;
  progress: number;
  currentChapter: number;
}

export default function LibraryPage() {
  const user = useAuthStore((s) => s.firebaseUser);
  const authLoading = useAuthStore((s) => s.loading);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loadedUid, setLoadedUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState('');
  const [pendingOrders, setPendingOrders] = useState<string[]>([]);

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    let revision = 0;
    setLoading(true); setError(''); setEntries([]); setLoadedUid(user.uid);
    setSyncing(true); setSyncError(''); setPendingOrders([]);
    const populate = async (items: LibraryItem[]) => {
      const current = ++revision;
      try {
      const populated: LibraryEntry[] = await Promise.all(
        items.map(async (item) => {
          const [book, prog] = await Promise.all([
            getBook(item.bookId),
            getReadingProgress(user.uid, item.bookId),
          ]);
          return {
            bookId: item.bookId,
            book,
            progress: prog?.percentComplete ?? 0,
            currentChapter: prog?.currentChapter ?? 1,
          };
        })
      );
      if (!active || current !== revision) return;
      setEntries(populated);
      setError('');
      setLoading(false);
      } catch { if (active && current === revision) { setError('Your library could not be loaded. Please try again.'); setLoading(false); } }
    };
    const unsubscribe = subscribeUserLibrary(user.uid, populate, () => { if (active) { setError('Your library could not be loaded. Please try again.'); setLoading(false); } });
    void syncPurchasedLibrary(user.uid).then(async result => {
      if (!active) return;
      setPendingOrders(result.pendingOrderIds);
      await populate(await getUserLibrary(user.uid));
    }).catch(() => {
      if (active) setSyncError('We could not check for recent purchases. Your saved books are below. Please try again before paying for a missing book.');
    }).finally(() => { if (active) setSyncing(false); });
    return () => { active = false; unsubscribe(); };
  }, [user?.uid, authLoading, attempt]);

  if (!authLoading && !user) return <main className="p-8"><Link href="/login" className="underline">Sign in to open your library</Link></main>;
  if (authLoading || loading || syncing || loadedUid !== user?.uid) return (
    <div className="app-canvas min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );

  if (error) return <div role="alert" className="p-8 text-[14px] text-red-300">{error}<button type="button" className="ml-4 min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;

  return (
    <div className="app-canvas min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="app-page app-library max-w-4xl mx-auto px-4 py-8">
        <LibraryFormatTabs active="books" />
        <div className="flex items-center justify-between gap-4 mb-6">
          <h1 className="font-display text-display-lg text-white">My Library</h1>
          <Link href="/gifts" className="text-sm text-[#f5b800] underline">My gifts</Link>
        </div>
        {syncError && <div role="alert" className="mb-6 rounded-xl border border-amber-800 p-4 text-sm text-amber-200">{syncError}<button className="ml-3 min-h-11 underline" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>}
        {pendingOrders.length > 0 && <div role="status" className="mb-6 rounded-xl border border-amber-800 p-4 text-sm text-amber-200">A previous payment needs checking. Please review your receipt before paying again. <Link className="underline" href={`/checkout/receipt?orders=${pendingOrders.slice(0, 20).map(encodeURIComponent).join(',')}`}>View receipt</Link></div>}

        {/* Continue Reading — swipe carousel */}
        {(() => {
          const inProgress = entries.filter((e) => e.book && e.progress > 0 && e.progress < 95);
          if (inProgress.length === 0) return null;
          return (
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-3">
                <PlayCircle size={14} style={{ color: 'var(--app-accent, #e8442a)' }} />
                <p className="text-sm font-medium text-white">Continue Reading</p>
              </div>
              <SwipeShelf label="Continue reading in your library"
                className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                {inProgress.map(({ bookId, book, progress, currentChapter }) => (
                  <Link
                    key={bookId}
                    href={`/read/${bookId}`}
                    className="app-library-reading-card flex-shrink-0 rounded-xl overflow-hidden snap-start border"
                    style={{ width: 150, background: 'var(--app-surface, #111)', borderColor: 'var(--app-line, #1a1a1a)' }}
                  >
                    {book && <BookCover book={book} />}
                    <p className="px-2 pt-2 text-[12px] font-medium text-white line-clamp-2">{book?.title ?? bookId}</p>
                    <div className="px-2.5 pt-2 pb-2.5 space-y-1">
                      <ProgressBar value={progress} color="var(--app-action, #e8442a)" height={3} />
                      <p className="text-xs" style={{ color: 'var(--app-muted, #555)' }}>{progress}% · Ch. {currentChapter}</p>
                    </div>
                  </Link>
                ))}
              </SwipeShelf>
            </div>
          );
        })()}

        {entries.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={48} style={{ color: 'var(--app-line, #2a2a2a)' }} className="mx-auto mb-4" />
            <p className="text-[#555] mb-4">Your library is empty.</p>
            <Link href="/browse" className="px-5 py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--app-action, #e8442a)', color: 'var(--app-on-action, #fff)' }}>
              Browse Books
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(({ bookId, book, progress, currentChapter }) => (
              <div key={bookId} className="app-library-item app-panel flex items-center gap-4 p-4 rounded-xl border" style={{ background: 'var(--app-surface, #111)', borderColor: 'var(--app-line, #1a1a1a)' }}>
                {/* Cover */}
                <div className="app-library-cover w-12 shrink-0">{book && <BookCover book={book} compact />}</div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="app-library-title text-sm font-medium text-white truncate">{book ? publicationTitle(book) : bookId}</p>
                  {book?.publicationType === 'magazine' && <p className="text-xs text-[#dec18e]">{publicationLabel(book)}</p>}
                  <p className="text-xs text-[#666] mb-2">{book?.authorName}</p>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={progress} color="var(--app-action, #e8442a)" height={3} />
                    <span className="text-xs text-[#555] flex-shrink-0">{progress}%</span>
                  </div>
                  {progress > 0 && (
                    <p className="text-xs text-[#555] mt-1">Chapter {currentChapter}</p>
                  )}
                </div>

                {/* Action */}
                {book ? <Link
                  href={`/read/${bookId}`}
                  className="app-library-action px-4 py-2 rounded-lg text-xs font-medium flex-shrink-0"
                  style={{ background: progress > 0 ? 'var(--app-field, #1a1a1a)' : 'var(--app-action, #e8442a)', color: progress > 0 ? 'var(--app-muted, #aaa)' : 'var(--app-on-action, #fff)', border: progress > 0 ? '1px solid var(--app-line, #333)' : 'none' }}
                >
                  {progress >= 95 ? 'Re-read' : progress > 0 ? 'Continue' : 'Read'}
                </Link> : <span className="text-xs text-[#aaa]">Currently unavailable</span>}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
