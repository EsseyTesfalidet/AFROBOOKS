'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import { getTrendingBooks, getFeaturedBooks, getNewReleases, getBooksByGenre, getLiveBooks } from '@/lib/firebase/firestore';
import { where } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import type { Book } from '@/types/book';

interface Section {
  id: string;
  title: string;
  badge: string;
  badgeBg: string;
  books: Book[];
  cardBadge?: (i: number) => { label: string; color: string; bg: string } | undefined;
}

export default function DiscoverPage() {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const favGenre = userProfile?.favoriteGenre || 'Fiction';

    Promise.all([
      getTrendingBooks(8),
      getFeaturedBooks(8),
      getNewReleases(8),
      getLiveBooks([where('averageRating', '>=', 4.5)]),
      getBooksByGenre(favGenre, 8),
    ]).then(([trending, featured, newReleases, hidden, genreTop]) => {
      setSections([
        {
          id: 'trending', title: 'Trending Now', badge: 'LIVE', badgeBg: '#e8442a',
          books: trending,
          cardBadge: (i) => i < 3 ? { label: `#${i + 1}`, color: '#fff', bg: '#e8442a' } : undefined,
        },
        {
          id: 'new', title: 'New Releases', badge: 'This Week', badgeBg: '#4ade80',
          books: newReleases,
          cardBadge: () => ({ label: 'NEW', color: '#000', bg: '#4ade80' }),
        },
        {
          id: 'featured', title: 'Staff Picks', badge: 'Curated', badgeBg: '#f5b800',
          books: featured,
        },
        {
          id: 'hidden', title: 'Hidden Gems', badge: 'Underrated', badgeBg: '#0ea5e9',
          books: hidden.filter((b) => b.reviewCount < 10).slice(0, 8),
        },
        {
          id: 'genre', title: `Top in ${favGenre}`, badge: favGenre, badgeBg: '#7c3aed',
          books: genreTop.sort((a, b) => b.averageRating - a.averageRating).slice(0, 5),
        },
      ]);
      setLoading(false);
    });
  }, [userProfile?.uid]);

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <div className="flex justify-center pt-24"><LoadingSpinner size={36} /></div>
    </div>
  );

  const firstName = userProfile?.firstName || 'Reader';

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* Hero */}
        <div className="rounded-xl p-7 space-y-3" style={{ background: '#111', border: '1px solid #1a1a1a' }}>
          <p className="text-xs font-medium uppercase tracking-widest" style={{ color: '#7c3aed' }}>
            Picked for you today
          </p>
          <h1 className="font-display text-display-xl text-white leading-none">
            Your Next<br />Great Read
          </h1>
          <p className="text-sm" style={{ color: '#888' }}>
            Hey {firstName}, here's what we think you'll love next.
          </p>
          <div className="flex gap-3 pt-1">
            <a href="#trending" className="px-5 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
              Explore Feed
            </a>
          </div>
        </div>

        {/* Taste chips */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <span className="text-xs text-[#555] flex-shrink-0">Your taste:</span>
          {['Fiction', 'Biography', 'Poetry', 'Self-Help', 'History'].map((g) => {
            const active = g === (userProfile?.favoriteGenre || 'Fiction');
            return (
              <span key={g} className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: active ? '#1f0e0c' : '#1a1a1a',
                  border: `1px solid ${active ? '#e8442a' : '#2a2a2a'}`,
                  color: active ? '#fff' : '#888',
                }}>
                {g}
              </span>
            );
          })}
        </div>

        {/* Feed Sections */}
        {sections.map((section) => (
          <div key={section.id} id={section.id}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-display-sm text-white">{section.title}</h2>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ background: section.badgeBg, color: section.badgeBg === '#f5b800' ? '#000' : '#fff', fontSize: 10 }}>
                  {section.badge}
                </span>
              </div>
              <button type="button" className="flex items-center gap-1 text-xs text-[#555] hover:text-[#aaa]">
                See all <ChevronRight size={12} />
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2">
              {section.books.map((book, i) => (
                <div key={book.id} className="flex-shrink-0 w-[140px]">
                  <BookCard book={book} badge={section.cardBadge?.(i)} />
                </div>
              ))}
              {section.books.length === 0 && (
                <p className="text-sm text-[#444] py-4">Nothing here yet.</p>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
