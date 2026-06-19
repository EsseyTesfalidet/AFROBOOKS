'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Play, X } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { getActiveReadingProgress, getBook } from '@/lib/firebase/firestore';
import { getBuyerRouteState } from '@/components/buyer/buyerNavigation';
import type { Book } from '@/types/book';
import type { ReadingProgress } from '@/types/order';

interface ResumeState {
  progress: ReadingProgress;
  book: Book;
}

export default function ReaderResumeBar() {
  const pathname = usePathname();
  const userProfile = useAuthStore((state) => state.userProfile);
  const routeState = getBuyerRouteState(pathname);
  const [resumeState, setResumeState] = useState<ResumeState | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  useEffect(() => {
    const userId = userProfile?.uid;

    if (!userId || pathname.startsWith('/read')) {
      setResumeState(null);
      return;
    }

    const resolvedUserId = userId;
    let active = true;

    async function load() {
      const [topProgress] = await getActiveReadingProgress(resolvedUserId);
      if (!topProgress) {
        if (active) setResumeState(null);
        return;
      }

      const book = await getBook(topProgress.bookId);
      if (!active) return;
      if (!book) {
        setResumeState(null);
        return;
      }

      setResumeState({ progress: topProgress, book });
      if (dismissedId && dismissedId !== topProgress.bookId) {
        setDismissedId(null);
      }
    }

    load();

    const handleFocus = () => {
      load();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [dismissedId, pathname, userProfile?.uid]);

  const shouldHide = useMemo(() => {
    return (
      !resumeState ||
      pathname.startsWith('/read') ||
      pathname.startsWith('/book') ||
      pathname.startsWith('/sample') ||
      pathname.startsWith('/checkout') ||
      pathname.startsWith('/subscription') ||
      dismissedId === resumeState.book.id
    );
  }, [dismissedId, pathname, resumeState]);

  if (shouldHide || !routeState.showDrawer || !resumeState) {
    return null;
  }

  const { book, progress } = resumeState;
  const bottomOffset = routeState.showBottomNav ? 90 : 16;

  return (
    <div className="sm:hidden fixed inset-x-0 z-40 px-3" style={{ bottom: bottomOffset }}>
      <div
        className="mx-auto max-w-md rounded-2xl border p-3 shadow-2xl"
        style={{
          background: 'rgba(17,17,17,0.96)',
          borderColor: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <div className="flex items-center gap-3">
          <div
            className="h-12 w-10 flex-shrink-0 overflow-hidden rounded-xl"
            style={{ background: book.coverBgColor || '#1a1a1a' }}
          >
            {book.coverUrl ? (
              <img src={book.coverUrl} alt={book.title} className="h-full w-full object-cover" />
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">{book.title}</p>
            <p className="mt-0.5 text-xs" style={{ color: '#666' }}>
              {Math.max(1, Math.round(progress.percentComplete))}% · Chapter {progress.currentChapter}
            </p>
          </div>

          <Link
            href={`/read/${book.id}`}
            className="flex items-center gap-1 rounded-xl px-3 py-2 text-sm font-medium"
            style={{ background: '#e8442a', color: '#fff' }}
          >
            <Play size={14} />
            Resume
          </Link>

          <button
            type="button"
            onClick={() => setDismissedId(book.id)}
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{ color: '#666' }}
            aria-label="Dismiss reader resume bar"
          >
            <X size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
