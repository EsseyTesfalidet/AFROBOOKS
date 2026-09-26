'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import BookRail from '@/components/buyer/BookRail';
import ContinueReadingShelf from '@/components/buyer/ContinueReadingShelf';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getFollowedSellerIds } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import { useRecentlyViewedStore } from '@/store/recentlyViewedStore';
import { useCatalog } from '@/hooks/useCatalog';
import { catalogShelves } from '@/lib/utils/catalog';
import type { Book } from '@/types/book';

export default function BrowsePage() {
  const userProfile = useAuthStore(state => state.userProfile);
  const recentBookIds = useRecentlyViewedStore(state => state.bookIds);
  const { books: allBooks, loading, error, retry } = useCatalog();
  const [followed, setFollowed] = useState<{ uid: string; ids: string[] } | null>(null);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');

  useEffect(() => {
    const uid = userProfile?.uid;
    if (!uid) return;
    let active = true;
    getFollowedSellerIds(uid, 50).then(ids => { if (active) setFollowed({ uid, ids }); }).catch(() => { if (active) setFollowed({ uid, ids: [] }); });
    return () => { active = false; };
  }, [userProfile?.uid]);

  const genres = useMemo(() => Array.from(new Set(allBooks.map(book => book.genre).filter(Boolean))).sort(), [allBooks]);
  const shelves = useMemo(() => catalogShelves(allBooks, userProfile?.favoriteGenre), [allBooks, userProfile?.favoriteGenre]);
  const filteredBooks = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    return allBooks.filter(book => (genre === 'All' || book.genre === genre) && `${book.title ?? ''} ${book.authorName ?? ''} ${book.genre ?? ''}`.toLocaleLowerCase().includes(term));
  }, [allBooks, genre, search]);
  const recentlyViewed = recentBookIds.map(id => allBooks.find(book => book.id === id)).filter((book): book is Book => !!book).slice(0, 8);
  const followedBooks = followed?.uid === userProfile?.uid ? allBooks.filter(book => followed?.ids.includes(book.sellerId)).slice(0, 8) : [];
  const filtering = !!search.trim() || genre !== 'All';

  return <div className="min-h-screen bg-[#10100f]">
    <BuyerHeader />
    <main className="mx-auto max-w-6xl space-y-9 px-5 py-7 sm:px-8 sm:py-10">
      <header><p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a56a]">The AfroBooks collection</p><h1 className="mt-3 text-[30px] font-semibold leading-tight tracking-tight sm:text-[40px]">Stories to get lost in.</h1><p className="mt-3 text-[14px] text-[#a8a49c]">Explore books, discover authors, and open your next read.</p></header>
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_210px]">
        <div><label htmlFor="catalog-search" className="sr-only">Search the catalog</label><div className="relative"><Search size={18} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[#96938b]" /><input id="catalog-search" type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search title, author, or genre" className="min-h-11 w-full rounded-lg border border-white/15 bg-white/[0.03] pl-10 pr-3 text-[16px] placeholder:text-[#96938b]" /></div></div>
        <div><label htmlFor="catalog-genre" className="sr-only">Filter by genre</label><select id="catalog-genre" value={genre} onChange={event=>setGenre(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/15 bg-[#181816] px-3 text-[16px]"><option value="All">All genres</option>{genres.map(item=><option key={item}>{item}</option>)}</select></div>
      </div>
      {loading ? <div role="status" className="flex items-center gap-3 py-12 text-[14px] text-[#a8a49c]"><LoadingSpinner size={24} /> Loading the catalog…</div>
        : error ? <div role="alert" className="py-8"><p className="text-[14px] text-[#ffc2ad]">{error}</p><button type="button" onClick={retry} className="mt-3 min-h-11 text-[14px] text-[#ffad91] underline">Try again</button></div>
        : allBooks.length === 0 ? <div className="border-t border-white/10 py-10"><h2 className="text-[22px] font-semibold">New stories are on the way.</h2><p className="mt-3 text-[14px] text-[#a8a49c]">There are no published books in the catalog yet.</p></div>
        : <>
          {!filtering && <BookRail title={shelves.genre.length ? 'Recommended for you' : 'Discover a new favorite'} subtitle={shelves.genre.length ? `Based on your interest in ${userProfile?.favoriteGenre}.` : 'A few stories to start exploring.'} books={shelves.recommended} actionHref="/discover" actionLabel="Discover more" />}
          {!filtering && userProfile && <ContinueReadingShelf key={userProfile.uid} userId={userProfile.uid} />}
          {!filtering && followedBooks.length > 0 && <BookRail title="Authors you follow" books={followedBooks} />}
          <section className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-[22px] font-semibold">{filtering ? 'Search results' : 'All books'}</h2><p role="status" className="mt-2 text-[13px] text-[#a8a49c]">{filteredBooks.length} {filteredBooks.length === 1 ? 'title' : 'titles'}</p></div><Link href="/search" className="min-h-11 py-3 text-[13px] text-[#b4b1a9] hover:text-white">More filters →</Link></div>
            {filteredBooks.length ? <div className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">{filteredBooks.map((book,index)=><BookCard key={book.id} book={book} eager={index<5} />)}</div>
              : <div className="py-8"><p className="text-[14px] text-[#a8a49c]">No books match your search.</p><button type="button" onClick={()=>{setSearch('');setGenre('All');}} className="mt-2 min-h-11 text-[14px] text-[#ffad91] underline">Clear filters</button></div>}
          </section>
          {!filtering && recentlyViewed.length > 0 && <BookRail title="Recently viewed" books={recentlyViewed} />}
        </>}
    </main>
  </div>;
}
