'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getBook } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { isBookReleased } from '@/lib/utils/bookAccess';
import InAppReader from './InAppReader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { Book } from '@/types/book';

/** Always load only public preview chapters, including for owners and admins. */
export default function BookSampleReader({ bookId }: { bookId: string }) {
  const user = useAuthStore(state => state.firebaseUser);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ id: string; book: Book | null; failed?: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    getBook(bookId).then(book => { if (active) setResult({ id: bookId, book }); })
      .catch(() => { if (active) setResult({ id: bookId, book: null, failed: true }); });
    return () => { active = false; };
  }, [bookId, attempt]);

  if (result?.id !== bookId) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]"><LoadingSpinner size={36} /></div>;
  const book = result.book;
  if (!book) return <main className="mx-auto max-w-lg space-y-4 p-6"><p role="status">{result.failed ? 'The sample could not be loaded. Check your connection and try again.' : 'This book is unavailable or could not be loaded.'}</p><button className="min-h-11 underline" onClick={() => { setResult(null); setAttempt(value => value + 1); }}>Try again</button><Link href="/browse" className="block underline">Back to catalog</Link></main>;
  if (!isBookReleased(book) || book.contentFormat === 'pdf') return <main className="mx-auto max-w-lg space-y-4 p-6"><h1 className="text-2xl">{book.title}</h1><p>{book.contentFormat === 'pdf' ? 'This PDF issue does not have a free text sample.' : 'This book is not available to read yet.'}</p><Link href={`/book/${bookId}`} className="block underline">Back to book</Link></main>;
  return <InAppReader key={`${book.id}:sample:${user?.uid ?? 'guest'}`} book={book} userId={user?.uid ?? null} hasAccess={false} />;
}
