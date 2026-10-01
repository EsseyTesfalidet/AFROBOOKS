'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { getBook, isBookInLibrary } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import InAppReader from '@/components/reader/InAppReader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import dynamic from 'next/dynamic';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { useCatalog } from '@/hooks/useCatalog';
import type { Book } from '@/types/book';
import { isBookReleased, canReadWithSubscription } from '@/lib/utils/bookAccess';

const MagazinePdfReader = dynamic(() => import('@/components/reader/MagazinePdfReader'), { ssr: false, loading: () => <div className="p-8">Opening magazine…</div> });

export default function ReadPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const userProfile = useAuthStore((s) => s.userProfile);
  const firebaseUser = useAuthStore((s) => s.firebaseUser);
  const authLoading = useAuthStore((s) => s.loading);
  const catalog = useCatalog();

  const [error, setError] = useState('');
  const [book, setBook] = useState<Book | null>(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    setLoading(true);
    setError('');
    setBook(null);
    setHasAccess(false);

    Promise.all([
      getBook(id),
      firebaseUser ? isBookInLibrary(firebaseUser.uid, id) : Promise.resolve(false),
    ]).then(([b, owned]) => {
      if (!active) return;
      if (!b) { router.replace('/browse'); return; }
      if (!isBookReleased(b) && firebaseUser?.uid !== b.sellerId && userProfile?.role !== 'admin') { router.replace(`/book/${id}`); return; }
      setBook(b);

      const canSubRead = canReadWithSubscription(b, userProfile);
      const isAuthor = firebaseUser?.uid === b.sellerId;
      setHasAccess(!!firebaseUser && (owned || canSubRead || isAuthor || userProfile?.role === 'admin'));

      setLoading(false);
    }).catch(() => {
      if (active) { setError('Unable to load this book. Please try again.'); setLoading(false); }
    });
    return () => { active = false; };
  }, [id, authLoading, firebaseUser?.uid, userProfile?.subscriptionStatus, userProfile?.subscriptionPlan, userProfile?.role, router]);

  if (loading || catalog.loading) return <div className="min-h-screen flex items-center justify-center bg-[#0e0e0e]"><LoadingSpinner size={36} /></div>;
  if (catalog.error || !catalog.books.some(item => item.id === id)) return <div className="p-8"><p role="status">{catalog.error || 'This book is no longer available.'}</p><Link href="/browse">Back to catalog</Link></div>;
  if (error) return <div className="p-8"><p role="alert">{error}</p><Link href={`/book/${id}`}>Back to book</Link></div>;
  if (!book) return null;
  if (book.publicationType === 'magazine' && book.contentFormat === 'pdf') return hasAccess ? <MagazinePdfReader key={`${book.id}:${firebaseUser?.uid}`} book={book} /> : <main className="mx-auto max-w-lg space-y-5 p-6"><h1 className="text-2xl">{book.title}</h1><p>{book.description}</p><p className="text-sm text-[#aaa]">{book.pdfPageCount} pages · PDF issue. Purchase this issue to read its pages and keep it in your library.</p><Link href={`/book/${book.id}`} className="block rounded-xl bg-[#e8442a] p-4 text-center text-white">View issue · {centsToDisplay(book.price)}</Link><Link href="/browse" className="block underline">Back to catalog</Link></main>;

  return (
    <InAppReader
      key={`${book.id}:${firebaseUser?.uid ?? 'guest'}:${hasAccess}`}
      book={book}
      userId={firebaseUser?.uid ?? null}
      hasAccess={hasAccess}
    />
  );
}
