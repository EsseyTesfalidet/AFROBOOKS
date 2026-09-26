'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import BookList from '@/components/seller/BookList';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { useSellerBooks } from '@/hooks/useSellerBooks';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Seller } from '@/types/user';

export default function SellerDashboardPage() {
  const userProfile = useAuthStore((state) => state.userProfile);
  const { books, loading, error, retry } = useSellerBooks();
  const [account, setAccount] = useState<{ uid: string; seller: Seller | null; error: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const uid = userProfile?.uid;

  useEffect(() => {
    if (!uid) return;
    let active = true;
    setAccount(null);
    getDoc(doc(db, 'sellers', uid)).then((snapshot) => {
      if (active) setAccount({ uid, seller: snapshot.exists() ? snapshot.data() as Seller : null, error: !snapshot.exists() });
    }).catch(() => { if (active) setAccount({ uid, seller: null, error: true }); });
    return () => { active = false; };
  }, [uid, attempt]);

  const seller = account?.uid === uid ? account?.seller : null;
  const accountError = account?.uid === uid && account?.error;
  const live = books.filter((book) => book.status === 'live').length;
  const drafts = books.filter((book) => book.status === 'draft').length;
  const attention = books.filter((book) => book.status === 'flagged' || book.status === 'removed').length;

  return (
    <div className="min-h-screen bg-[#10100f]">
      <SellerHeader />
      <main className="mx-auto max-w-6xl px-5 py-8 sm:px-8 sm:py-12">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a56a]">Author studio</p>
        <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-[#f5f2eb] sm:text-[36px]">Welcome back{userProfile?.firstName ? `, ${userProfile.firstName}` : ''}.</h1>
            <p className="mt-3 text-[14px] leading-relaxed text-[#a8a49c]">A home for your books and the readers they reach.</p>
          </div>
          <Link href="/publish" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#ed6647] px-4 text-[14px] font-semibold text-[#160e0b] hover:bg-[#ff8b6f]"><Plus size={17} /> New book</Link>
        </div>
        <dl className="my-9 grid grid-cols-2 gap-x-6 gap-y-7 border-y border-white/10 py-7 lg:grid-cols-4">
          {[
            { label: 'Published books', value: loading || error ? '—' : String(live), note: loading || error ? 'Your catalog' : `${drafts} ${drafts === 1 ? 'draft' : 'drafts'} in progress` },
            { label: 'Copies sold', value: loading || error ? '—' : books.reduce((sum, book) => sum + (book.totalSales ?? 0), 0).toLocaleString(), note: 'Across your catalog' },
            { label: 'Lifetime earnings', value: seller ? centsToDisplay(seller.totalEarnings ?? 0) : '—', note: 'Recorded author earnings' },
            { label: 'Unpaid balance', value: seller ? centsToDisplay(seller.pendingBalance ?? 0) : '—', note: 'Subject to payout review' },
          ].map((stat) => <div key={stat.label} className="min-w-0">
            <dt className="text-[12px] text-[#b4b1a9]">{stat.label}</dt>
            <dd className="mt-2 break-words text-[26px] font-semibold tracking-tight text-[#f5f2eb] sm:text-[32px]">{stat.value}</dd>
            <p className="mt-1 text-[11px] text-[#96938b]">{stat.note}</p>
          </div>)}
        </dl>
        {accountError && <div role="alert" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[14px] text-[#ffc2ad]">Earnings could not be loaded.<button type="button" onClick={() => setAttempt((value) => value + 1)} className="min-h-11 underline">Try again</button></div>}
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_260px] lg:gap-12">
          <section aria-labelledby="recent-books-title" className="min-w-0">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-4">
              <h2 id="recent-books-title" className="text-[20px] font-semibold">Recent books</h2>
              <Link href="/listings" className="inline-flex min-h-11 items-center gap-1 text-[13px] text-[#b4b1a9] hover:text-white">All books <ArrowUpRight size={15} /></Link>
            </div>
            {loading ? <div role="status" className="flex items-center gap-3 py-12 text-[14px] text-[#b4b1a9]"><LoadingSpinner size={22} /> Loading your books…</div>
              : error ? <div role="alert" className="py-8 text-[14px]"><p className="text-[#ffc2ad]">{error}</p><button type="button" onClick={retry} className="mt-3 min-h-11 text-[#ff9e83] underline">Try again</button></div>
              : books.length ? <BookList books={books.slice(0, 5)} />
              : <div className="py-12"><h3 className="text-[20px] font-medium">Your first story starts here.</h3><p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#a8a49c]">Use New book to begin a private draft. Add your manuscript and cover, then publish when you’re ready.</p></div>}
          </section>
          <aside className="border-t border-white/10 pt-6 lg:border-l lg:border-t-0 lg:pl-7 lg:pt-0">
            <h2 className="text-[16px] font-semibold">Your workspace</h2>
            <p className="mt-3 text-[13px] leading-relaxed text-[#a8a49c]">Manage your catalog, follow your sales, and keep your author details up to date.</p>
            <div className="mt-5 divide-y divide-white/10 text-[14px]">
              <Link href="/listings" className="flex min-h-14 items-center justify-between gap-3 hover:text-[#ff9e83]">Manage books <ArrowUpRight size={16} /></Link>
              <Link href="/analytics" className="flex min-h-14 items-center justify-between gap-3 hover:text-[#ff9e83]">Sales & earnings <ArrowUpRight size={16} /></Link>
              <Link href="/seller/profile/identity" className="flex min-h-14 items-center justify-between gap-3 hover:text-[#ff9e83]">Author profile <ArrowUpRight size={16} /></Link>
            </div>
            {!loading && !error && attention > 0 && <p className="mt-6 text-[13px] leading-relaxed text-amber-200">{attention} {attention === 1 ? 'book needs' : 'books need'} attention. Open your books to see the feedback.</p>}
          </aside>
        </div>
      </main>
    </div>
  );
}
