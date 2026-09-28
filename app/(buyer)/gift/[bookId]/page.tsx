'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Gift } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getBook } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import { authenticatedPost } from '@/lib/firebase/request';
import { giftTokenSchema, type GiftResume } from '@/lib/gifts';

const CheckoutPaymentPanel = dynamic(() => import('@/components/buyer/CheckoutPaymentPanel'), { ssr: false, loading: () => <LoadingSpinner /> });

export default function GiftCheckoutPage() {
  const { bookId } = useParams<{ bookId: string }>();
  const { firebaseUser, loading: authLoading } = useAuthStore();
  const [book, setBook] = useState<Book | null>(null);
  const [loading, setLoading] = useState(true);
  const [now] = useState(() => Date.now());
  const [resume, setResume] = useState<GiftResume>();
  const [resumeId, setResumeId] = useState<string | null>(null);
  const [resumeReady, setResumeReady] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const id = new URLSearchParams(window.location.search).get('resume');
    setResumeId(id);
    if (!id || !firebaseUser) { setResumeReady(true); return; }
    if (!giftTokenSchema.safeParse(id).success) { setError('Invalid checkout link. Open My gifts to continue.'); setResumeReady(true); return; }
    setResumeReady(false);
    authenticatedPost<{ gift: GiftResume }>('/api/gifts', { action: 'resume', giftId: id }).then(data => {
      if (!active) return;
      if (data.gift.bookId !== bookId) setError('This gift belongs to a different book. Open My gifts to continue.');
      else setResume(data.gift);
    }).catch(() => { if (active) setError('Unable to resume this gift. Open My gifts and try again.'); })
      .finally(() => { if (active) setResumeReady(true); });
    return () => { active = false; };
  }, [firebaseUser, bookId]);
  useEffect(() => {
    let active = true;
    getBook(bookId).then(value => { if (active) setBook(value); }).catch(() => { if (active) setBook(null); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookId]);
  const unavailable = !book || book.status !== 'live' || book.price < 50 || (book.isPreorder && (!book.releaseDate || book.releaseDate.toMillis() > now));
  const returnPath = encodeURIComponent(`/gift/${bookId}${resumeId ? `?resume=${resumeId}` : ''}`);
  return <div className="min-h-screen bg-[#0e0e0e]">
    <BuyerHeader />
    <main className="max-w-lg mx-auto px-4 py-8 space-y-6">
      <Link href={`/book/${bookId}`} className="text-sm text-[#aaa] underline">Back to book</Link>
      <div><Gift className="text-[#f5b800] mb-3" size={30} /><h1 className="font-display text-3xl text-white">Gift a book</h1><p className="text-sm text-[#aaa] mt-2">Send a story and a personal note to someone you care about.</p></div>
      {loading || authLoading || !resumeReady ? <LoadingSpinner /> : error ? <p role="alert" className="text-red-300">{error} <Link href="/gifts" className="underline">My gifts</Link></p> : unavailable ? <p role="status" className="text-[#aaa]">This book is currently unavailable to gift.</p> : <>
        <div className="rounded-xl border border-[#292929] p-5"><h2 className="text-xl text-white">{book!.title}</h2><p className="text-sm text-[#aaa] mt-1">{book!.authorName}</p><p className="text-[#f5b800] mt-3">{centsToDisplay(book!.price)}</p><p className="text-xs text-[#888] mt-2">One digital copy, read in AfroBooks. The recipient pays nothing to claim it.</p></div>
        {firebaseUser ? <CheckoutPaymentPanel key={resume?.attemptId ?? bookId} gift={{ bookId, price: book!.price, resume }} /> : <div className="space-y-4 text-sm text-[#aaa]"><p>Sign in to purchase and track your gift.</p><Link className="button-primary inline-block rounded-xl px-5 py-3" href={`/login?redirect=${returnPath}`}>Sign in</Link><Link className="ml-4 text-[#f5b800] underline" href={`/signup?redirect=${returnPath}`}>Create account</Link></div>}
      </>}
    </main>
  </div>;
}
