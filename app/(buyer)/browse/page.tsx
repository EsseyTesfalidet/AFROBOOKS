'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Compass, Search, Sparkles, Users } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import BookRail from '@/components/buyer/BookRail';
import ContinueReadingShelf from '@/components/buyer/ContinueReadingShelf';
import ReaderMomentum from '@/components/buyer/ReaderMomentum';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import {
  getBooksByGenre,
  getBooksBySellerIds,
  getFollowedSellerIds,
  getLiveBooks,
  getUserLibrary,
} from '@/lib/firebase/firestore';
import { orderBy, limit } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { Book } from '@/types/book';

const GENRES = ['All', 'Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];

export default function BrowsePage() {
  const userProfile = useAuthStore((state) => state.userProfile);
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [trendingBooks, setTrendingBooks] = useState<Book[]>([]);
  const [favoriteGenreBooks, setFavoriteGenreBooks] = useState<Book[]>([]);
  const [followedAuthorBooks, setFollowedAuthorBooks] = useState<Book[]>([]);
  const [followingCount, setFollowingCount] = useState(0);
  const [libraryCount, setLibraryCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');

  useEffect(() => {
    let active = true;

    async function loadHome() {
      setLoading(true);

      const favoriteGenre = userProfile?.favoriteGenre || 'Fiction';
      const [books, trending, genreBooks, libraryItems, followedIds] = await Promise.all([
        getLiveBooks([orderBy('publishedAt', 'desc')]),
        getLiveBooks([orderBy('totalSales', 'desc'), limit(12)]),
        getBooksByGenre(favoriteGenre, 8),
        userProfile?.uid ? getUserLibrary(userProfile.uid) : Promise.resolve([]),
        userProfile?.uid ? getFollowedSellerIds(userProfile.uid, 8) : Promise.resolve([]),
      ]);

      const followedBooks =
        followedIds.length > 0 ? await getBooksBySellerIds(followedIds, 8) : [];

      if (!active) return;

      setAllBooks(books);
      setTrendingBooks(trending.filter((book) => book.totalSales > 0));
      setFavoriteGenreBooks(genreBooks);
      setFollowedAuthorBooks(followedBooks);
      setFollowingCount(followedIds.length);
      setLibraryCount(libraryItems.length);
      setLoading(false);
    }

    loadHome();

    return () => {
      active = false;
    };
  }, [userProfile?.favoriteGenre, userProfile?.uid]);

  const filteredBooks = useMemo(() => {
    let next = allBooks;

    if (genre !== 'All') {
      next = next.filter((book) => book.genre === genre);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      next = next.filter(
        (book) =>
          book.title.toLowerCase().includes(query) ||
          book.authorName.toLowerCase().includes(query) ||
          book.genre.toLowerCase().includes(query)
      );
    }

    return next;
  }, [allBooks, genre, search]);

  const subscriptionPicks = useMemo(
    () => allBooks.filter((book) => book.inSubscription).slice(0, 10),
    [allBooks]
  );

  const newArrivals = useMemo(() => allBooks.slice(0, 10), [allBooks]);

  const firstName = userProfile?.firstName || 'Reader';
  const favoriteGenre = userProfile?.favoriteGenre || 'Fiction';
  const showingFilteredFeed = search.trim().length > 0 || genre !== 'All';

  return (
    <div className="min-h-screen" style={{ background: '#0e0e0e' }}>
      <BuyerHeader />

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-8">
        <section
          className="overflow-hidden rounded-[28px] border p-6 sm:p-7"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(124,58,237,0.22), transparent 34%), linear-gradient(180deg, #151515 0%, #101010 100%)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div className="max-w-2xl">
              <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: '#777' }}>
                Personalized home
              </p>
              <h1 className="mt-2 font-display text-5xl leading-none text-white sm:text-6xl">
                Welcome back,
                <br />
                <span style={{ color: '#f5b800' }}>{firstName}.</span>
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed sm:text-base" style={{ color: '#888' }}>
                Your buyer experience now centers around momentum: resume reading, new drops from authors you follow, and faster discovery in {favoriteGenre}.
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <Link
                  href="/search"
                  className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-medium"
                  style={{ background: '#e8442a', color: '#fff' }}
                >
                  <Search size={16} />
                  Search the catalog
                </Link>
                <Link
                  href="/library"
                  className="inline-flex items-center gap-2 rounded-2xl border px-4 py-2.5 text-sm font-medium"
                  style={{ borderColor: '#2a2a2a', color: '#ddd', background: '#141414' }}
                >
                  <BookOpen size={16} />
                  Open library
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:w-[320px]">
              {[
                { label: 'In Library', value: libraryCount, icon: BookOpen, accent: '#e8442a' },
                { label: 'Following', value: followingCount, icon: Users, accent: '#0ea5e9' },
                { label: 'Focus Genre', value: favoriteGenre, icon: Compass, accent: '#7c3aed' },
              ].map(({ label, value, icon: Icon, accent }) => (
                <div
                  key={label}
                  className="rounded-2xl border p-3"
                  style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.08)' }}
                >
                  <Icon size={16} style={{ color: accent }} />
                  <p className="mt-3 text-lg font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs" style={{ color: '#666' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {userProfile ? (
          <>
            <ReaderMomentum
              userId={userProfile.uid}
              favoriteGenre={favoriteGenre}
              subscriptionActive={userProfile.subscriptionStatus === 'active'}
            />
            <ContinueReadingShelf userId={userProfile.uid} />
          </>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-col gap-3 rounded-3xl border p-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <div className="flex items-center gap-2">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-2xl"
                style={{ background: 'rgba(232,68,42,0.15)', color: '#e8442a' }}
              >
                <Sparkles size={18} />
              </div>
              <div>
                <p className="text-sm font-medium text-white">Search, filter, or browse all</p>
                <p className="text-xs" style={{ color: '#666' }}>
                  Quick refinement without leaving the home feed.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" size={16} />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by title, author, or genre..."
                  className="w-full rounded-2xl border py-3 pl-10 pr-4 text-sm"
                  style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
                />
              </div>

              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                {GENRES.map((item) => {
                  const active = genre === item;
                  return (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setGenre(item)}
                      className="flex-shrink-0 rounded-full px-3.5 py-2 text-sm font-medium transition-all"
                      style={{
                        background: active ? '#f5f2eb' : '#171717',
                        color: active ? '#000' : '#aaa',
                        border: `1px solid ${active ? '#f5f2eb' : '#2a2a2a'}`,
                      }}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {!showingFilteredFeed ? (
          <>
            <BookRail
              title={`Because you like ${favoriteGenre}`}
              subtitle="A personalized shelf based on your favorite genre."
              badge="Personal"
              actionHref="/search"
              books={favoriteGenreBooks}
              emptyMessage="Set a favorite genre in your profile to unlock more tailored picks."
            />

            {followedAuthorBooks.length > 0 ? (
              <BookRail
                title="New from authors you follow"
                subtitle="Fresh releases from writers already on your radar."
                badge="Followed"
                actionHref="/notifications"
                books={followedAuthorBooks}
              />
            ) : null}

            <BookRail
              title="Subscription picks"
              subtitle="Titles that feel great for an unlimited reading session."
              badge={userProfile?.subscriptionStatus === 'active' ? 'Included' : 'Upgrade'}
              actionHref="/subscription"
              actionLabel={userProfile?.subscriptionStatus === 'active' ? 'Browse plans' : 'See plans'}
              books={subscriptionPicks}
              emptyMessage="Subscription titles will appear here as more authors opt in."
            />

            <BookRail
              title="Trending now"
              subtitle="The titles readers are buying the most right now."
              badge="Hot"
              books={trendingBooks}
            />

            <BookRail
              title="New arrivals"
              subtitle="Fresh drops from across the catalog."
              badge="Latest"
              books={newArrivals}
            />
          </>
        ) : null}

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-display-sm text-white">
                {showingFilteredFeed ? 'Filtered results' : 'All books'}
              </h2>
              <p className="text-sm" style={{ color: '#666' }}>
                {filteredBooks.length} title{filteredBooks.length === 1 ? '' : 's'} ready to explore.
              </p>
            </div>
            <Link href="/search" className="text-xs transition-colors hover:text-white" style={{ color: '#666' }}>
              Advanced search →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : filteredBooks.length === 0 ? (
            <div
              className="rounded-3xl border px-4 py-14 text-center"
              style={{ background: '#111', borderColor: '#1a1a1a' }}
            >
              <p className="text-sm" style={{ color: '#666' }}>
                No books match that filter. Try another genre or use the search page.
              </p>
            </div>
          ) : (
            <div
              className="grid gap-3.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {filteredBooks.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
