'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BookOpen, PlayCircle } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import ProgressBar from '@/components/shared/ProgressBar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getUserLibrary, getBook, getReadingProgress } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';

interface LibraryEntry {
  bookId: string;
  book: Book | null;
  progress: number;
  currentChapter: number;
}

export default function LibraryPage() {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    getUserLibrary(userProfile.uid).then(async (items) => {
      const populated: LibraryEntry[] = await Promise.all(
        items.map(async (item) => {
          const [book, prog] = await Promise.all([
            getBook(item.bookId),
            getReadingProgress(userProfile.uid, item.bookId),
          ]);
          return {
            bookId: item.bookId,
            book,
            progress: prog?.percentComplete ?? 0,
            currentChapter: prog?.currentChapter ?? 1,
          };
        })
      );
      setEntries(populated.filter((entry) => entry.book));
      setLoading(false);
    });
  }, [userProfile?.uid]);

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="font-display text-display-lg text-white mb-6">My Library</h1>

        {/* Continue Reading — swipe carousel */}
        {(() => {
          const inProgress = entries.filter((e) => e.progress > 0 && e.progress < 95);
          if (inProgress.length === 0) return null;
          return (
            <div className="mb-7">
              <div className="flex items-center gap-2 mb-3">
                <PlayCircle size={14} style={{ color: '#e8442a' }} />
                <p className="text-sm font-medium text-white">Continue Reading</p>
              </div>
              <div
                className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
                style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
              >
                {inProgress.map(({ bookId, book, progress, currentChapter }) => (
                  <Link
                    key={bookId}
                    href={`/read/${bookId}`}
                    className="flex-shrink-0 rounded-xl overflow-hidden snap-start border"
                    style={{ width: 150, background: '#111', borderColor: '#1a1a1a' }}
                  >
                    <div className="relative" style={{ height: 90, background: book?.coverBgColor || '#1a1040' }}>
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: book?.coverAccentColor || '#7c3aed' }} />
                      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 30%, rgba(0,0,0,0.85))' }} />
                      <div className="absolute bottom-0 left-0 right-0 p-2">
                        <p className="text-white font-medium truncate" style={{ fontSize: 11 }}>{book?.title ?? bookId}</p>
                      </div>
                    </div>
                    <div className="px-2.5 pt-2 pb-2.5 space-y-1">
                      <ProgressBar value={progress} color="#e8442a" height={3} />
                      <p className="text-xs" style={{ color: '#555' }}>{progress}% · Ch. {currentChapter}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          );
        })()}

        {entries.length === 0 ? (
          <div className="text-center py-20">
            <BookOpen size={48} style={{ color: '#2a2a2a' }} className="mx-auto mb-4" />
            <p className="text-[#555] mb-4">Your library is empty.</p>
            <Link href="/browse" className="px-5 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
              Browse Books
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map(({ bookId, book, progress, currentChapter }) => (
              <div key={bookId} className="flex items-center gap-4 p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                {/* Cover */}
                <div
                  className="rounded-lg flex-shrink-0 relative overflow-hidden"
                  style={{ width: 48, height: 60, background: book?.coverBgColor ?? '#1a1040' }}
                >
                  <div className="absolute top-0 left-0 right-0 h-1" style={{ background: book?.coverAccentColor ?? '#7c3aed' }} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{book?.title ?? bookId}</p>
                  <p className="text-xs text-[#666] mb-2">{book?.authorName}</p>
                  <div className="flex items-center gap-2">
                    <ProgressBar value={progress} color="#e8442a" height={3} />
                    <span className="text-xs text-[#555] flex-shrink-0">{progress}%</span>
                  </div>
                  {progress > 0 && (
                    <p className="text-xs text-[#555] mt-1">Chapter {currentChapter}</p>
                  )}
                </div>

                {/* Action */}
                <Link
                  href={`/read/${bookId}`}
                  className="px-4 py-2 rounded-lg text-xs font-medium flex-shrink-0"
                  style={{ background: progress > 0 ? '#1a1a1a' : '#e8442a', color: progress > 0 ? '#aaa' : '#fff', border: progress > 0 ? '1px solid #333' : 'none' }}
                >
                  {progress >= 95 ? 'Re-read' : progress > 0 ? 'Continue' : 'Read'}
                </Link>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
