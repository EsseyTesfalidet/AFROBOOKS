'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookRail from '@/components/buyer/BookRail';
import SponsoredBook from '@/components/buyer/SponsoredBook';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { useCatalog } from '@/hooks/useCatalog';
import { catalogShelves } from '@/lib/utils/catalog';

export default function DiscoverPage() {
  const favoriteGenre = useAuthStore(state => state.userProfile?.favoriteGenre);
  const { books, loading, error, retry } = useCatalog();
  const shelves = useMemo(() => catalogShelves(books, favoriteGenre), [books, favoriteGenre]);
  const hasDifferentLatest = shelves.latest.some(book => !shelves.recommended.some(pick => pick.id === book.id));
  return <div className="min-h-screen bg-[#10100f]">
    <BuyerHeader />
    <main className="mx-auto max-w-6xl space-y-9 px-5 py-7 sm:px-8 sm:py-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a56a]">Discover</p><h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Find your next great read.</h1><p className="mt-3 text-[14px] text-[#a8a49c]">New voices, familiar favorites, and stories worth opening.</p></div>
        <Link href="/browse" className="inline-flex min-h-11 items-center gap-2 text-[14px] text-[#d8c2a2]">Browse all books <ArrowUpRight size={16} /></Link>
      </header>
      {loading ? <div role="status" className="space-y-6"><span className="flex items-center gap-3 text-[14px] text-[#a8a49c]"><LoadingSpinner size={22} /> Finding your next read…</span><div aria-hidden="true" className="grid grid-cols-2 gap-4 sm:grid-cols-4">{[0,1,2,3].map(index=><div key={index} className="aspect-[2/3] animate-pulse rounded-lg bg-white/5" />)}</div></div>
        : error ? <div role="alert" className="border-y border-white/10 py-8"><p className="text-[14px] text-[#ffc2ad]">{error}</p><button type="button" onClick={retry} className="mt-3 min-h-11 text-[14px] text-[#ffad91] underline">Try again</button></div>
        : books.length === 0 ? <div className="border-t border-white/10 py-10"><h2 className="text-[22px] font-semibold">New stories are on the way.</h2><p className="mt-3 text-[14px] text-[#a8a49c]">There are no published books in the catalog yet. Check back for new releases.</p></div>
        : <>
          <BookRail title={shelves.genre.length ? 'Recommended for you' : 'Start with these stories'} subtitle={shelves.genre.length ? `Picks from ${favoriteGenre}, with more stories to explore.` : 'A selection from the available catalog. No reading history needed.'} books={shelves.recommended} />
          <SponsoredBook books={books} />
          {shelves.popular.length > 0 && <BookRail title="Popular with readers" subtitle="Ordered by copies sold across the catalog." books={shelves.popular} actionHref="/search?collection=trending" />}
          {hasDifferentLatest && <BookRail title="Latest releases" subtitle="Recently published stories, ready to read." books={shelves.latest} actionHref="/search?collection=new" />}
          {shelves.featured.length > 0 && <BookRail title="Staff picks" subtitle="Selected by the AfroBooks team." books={shelves.featured} actionHref="/search?collection=featured" />}
          {shelves.hidden.length > 0 && <BookRail title="Readers recommend" subtitle="Highly rated books with a small but growing readership." books={shelves.hidden} actionHref="/search?collection=hidden" />}
        </>}
    </main>
  </div>;
}
