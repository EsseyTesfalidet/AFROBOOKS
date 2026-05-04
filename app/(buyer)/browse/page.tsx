'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import Link from 'next/link';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getLiveBooks } from '@/lib/firebase/firestore';
import { orderBy } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

const GENRES = ['All', 'Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];

export default function BrowsePage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [filtered, setFiltered] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [genre, setGenre] = useState('All');

  useEffect(() => {
    getLiveBooks([orderBy('publishedAt', 'desc')]).then((data) => {
      setBooks(data);
      setFiltered(data);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let result = books;
    if (genre !== 'All') result = result.filter((b) => b.genre === genre);
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (b) => b.title.toLowerCase().includes(q) || b.authorName.toLowerCase().includes(q)
      );
    }
    setFiltered(result);
  }, [search, genre, books]);

  return (
    <div className="min-h-screen" style={{ background: '#0e0e0e' }}>
      <BuyerHeader />

      <main className="max-w-5xl mx-auto px-4 py-6">
        {/* Hero Banner */}
        <div
          className="rounded-xl p-7 mb-6 flex items-center justify-between overflow-hidden"
          style={{ background: '#1a1a1a' }}
        >
          <div>
            <h1 className="font-display text-display-lg text-white leading-none">
              GREAT READS,
            </h1>
            <h1 className="font-display text-display-lg leading-none mb-3" style={{ color: '#e8442a' }}>
              BOLD PRICES.
            </h1>
            <p className="text-sm mb-5" style={{ color: '#bbb' }}>
              Discover ebooks by Africa's most brilliant authors.
            </p>
            <a
              href="#books"
              className="inline-block px-5 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: '#e8442a', color: '#fff' }}
            >
              Explore Now
            </a>
          </div>
          <div className="hidden sm:flex flex-col gap-2 opacity-60">
            {[['#e8442a', 90], ['#f5b800', 72], ['#f5f2eb', 84]].map(([c, w], i) => (
              <div
                key={i}
                className="rounded-md"
                style={{ width: w as number, height: 14, background: c as string }}
              />
            ))}
          </div>
        </div>

        {/* New Arrivals — swipe carousel (hidden when searching/filtering) */}
        {!loading && books.length > 0 && !search && genre === 'All' && (
          <div className="mb-6">
            <p className="text-sm font-medium text-white mb-3">New Arrivals</p>
            <div
              className="-mx-4 px-4 flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-none"
              style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            >
              {books.slice(0, 14).map((book) => (
                <Link
                  key={book.id}
                  href={`/book/${book.id}`}
                  className="flex-shrink-0 rounded-xl overflow-hidden snap-start"
                  style={{ width: 118 }}
                >
                  <div className="relative" style={{ height: 158, background: book.coverBgColor || '#1a1040' }}>
                    <div className="absolute top-0 left-0 right-0 h-1" style={{ background: book.coverAccentColor || '#7c3aed' }} />
                    <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent 35%, rgba(0,0,0,0.88))' }} />
                    <div className="absolute bottom-0 left-0 right-0 p-2">
                      <p className="text-white font-medium truncate" style={{ fontSize: 11 }}>{book.title}</p>
                      <p className="truncate" style={{ fontSize: 9, color: 'rgba(255,255,255,0.55)' }}>{book.authorName}</p>
                    </div>
                  </div>
                  <div className="px-2 py-1.5" style={{ background: '#111' }}>
                    <p className="text-xs font-medium" style={{ color: '#f5b800' }}>{centsToDisplay(book.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Search + Genre Filters */}
        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" size={16} />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title or author..."
              className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm transition-colors"
              style={{ background: '#1a1a1a', borderColor: '#444', color: '#f5f2eb' }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#e8442a')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#444')}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {GENRES.map((g) => {
              const active = genre === g;
              return (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenre(g)}
                  className="flex-shrink-0 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: active ? '#fff' : '#1a1a1a',
                    color: active ? '#000' : '#ccc',
                    border: active ? 'none' : '1px solid #444',
                  }}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        {/* Books Grid */}
        <div id="books">
          {loading ? (
            <div className="flex justify-center py-16">
              <LoadingSpinner size={36} />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-[#444] py-16 text-sm">No books found.</p>
          ) : (
            <div
              className="grid gap-3.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}
            >
              {filtered.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
