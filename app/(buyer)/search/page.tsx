'use client';

import { useState, useEffect } from 'react';
import { Search, X } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getLiveBooks } from '@/lib/firebase/firestore';
import { orderBy } from 'firebase/firestore';
import type { Book } from '@/types/book';

const GENRES = ['Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];
const LANGUAGES = ['English', 'French', 'Swahili', 'Yoruba', 'Amharic', 'Arabic', 'Portuguese'];
const READ_TIMES = ['Under 1h', '1-2h', '2-4h', '4-6h', '6h+'];

interface Filters {
  genres: string[];
  minPrice: string;
  maxPrice: string;
  minRating: number;
  language: string;
  verifiedOnly: boolean;
  inSubscription: boolean;
}

export default function SearchPage() {
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [results, setResults] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    genres: [], minPrice: '', maxPrice: '', minRating: 0,
    language: '', verifiedOnly: false, inSubscription: false,
  });
  const [applied, setApplied] = useState<Filters>(filters);
  const [sort, setSort] = useState('relevance');

  useEffect(() => {
    getLiveBooks([orderBy('totalSales', 'desc')]).then((data) => {
      setAllBooks(data);
      setResults(data);
      setLoading(false);
    });
  }, []);

  function applyFilters() {
    let res = allBooks;
    if (query) {
      const q = query.toLowerCase();
      res = res.filter((b) => b.title.toLowerCase().includes(q) || b.authorName.toLowerCase().includes(q) || b.genre.toLowerCase().includes(q));
    }
    if (applied.genres.length) res = res.filter((b) => applied.genres.includes(b.genre));
    if (applied.minPrice) res = res.filter((b) => b.price >= parseFloat(applied.minPrice) * 100);
    if (applied.maxPrice) res = res.filter((b) => b.price <= parseFloat(applied.maxPrice) * 100);
    if (applied.minRating) res = res.filter((b) => b.averageRating >= applied.minRating);
    if (applied.language) res = res.filter((b) => b.language === applied.language);
    if (applied.verifiedOnly) res = res.filter((b) => b.sellerVerified);
    if (applied.inSubscription) res = res.filter((b) => b.inSubscription);

    if (sort === 'price_asc') res = [...res].sort((a, b) => a.price - b.price);
    else if (sort === 'price_desc') res = [...res].sort((a, b) => b.price - a.price);
    else if (sort === 'rating') res = [...res].sort((a, b) => b.averageRating - a.averageRating);
    else if (sort === 'newest') res = [...res].sort((a, b) => (b.publishedAt?.toMillis() ?? 0) - (a.publishedAt?.toMillis() ?? 0));

    setResults(res);
  }

  useEffect(() => { applyFilters(); }, [query, applied, sort, allBooks]);

  function toggleGenre(g: string) {
    setFilters((f) => ({ ...f, genres: f.genres.includes(g) ? f.genres.filter((x) => x !== g) : [...f.genres, g] }));
  }

  const activeFilterCount = applied.genres.length + (applied.minPrice ? 1 : 0) + (applied.maxPrice ? 1 : 0) +
    (applied.minRating ? 1 : 0) + (applied.language ? 1 : 0) + (applied.verifiedOnly ? 1 : 0) + (applied.inSubscription ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-6xl mx-auto px-4 py-6 flex gap-6">

        {/* Sidebar */}
        <aside className="w-64 flex-shrink-0 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm text-white">Filters</h3>
            {activeFilterCount > 0 && (
              <button type="button" onClick={() => { setFilters({ genres: [], minPrice: '', maxPrice: '', minRating: 0, language: '', verifiedOnly: false, inSubscription: false }); setApplied({ genres: [], minPrice: '', maxPrice: '', minRating: 0, language: '', verifiedOnly: false, inSubscription: false }); }} className="text-xs text-[#e8442a]">Clear all</button>
            )}
          </div>

          {/* Genre */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Genre</p>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.map((g) => (
                <button key={g} type="button" onClick={() => toggleGenre(g)}
                  className="px-2.5 py-1 rounded-lg text-xs transition-all"
                  style={{ background: filters.genres.includes(g) ? '#1f0e0c' : '#1a1a1a', border: `1px solid ${filters.genres.includes(g) ? '#e8442a' : '#2a2a2a'}`, color: filters.genres.includes(g) ? '#e8442a' : '#888' }}>
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Price */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Price ($)</p>
            <div className="flex gap-2">
              <input type="number" value={filters.minPrice} onChange={(e) => setFilters((f) => ({ ...f, minPrice: e.target.value }))} placeholder="Min" className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
              <input type="number" value={filters.maxPrice} onChange={(e) => setFilters((f) => ({ ...f, maxPrice: e.target.value }))} placeholder="Max" className="w-full px-2 py-1.5 rounded-lg border text-xs" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
            </div>
          </div>

          {/* Rating */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Min Rating</p>
            {[4, 3, 2, 1].map((r) => (
              <label key={r} className="flex items-center gap-2 py-1 cursor-pointer">
                <input type="radio" name="rating" checked={filters.minRating === r} onChange={() => setFilters((f) => ({ ...f, minRating: r }))} className="accent-[#e8442a]" />
                <span className="text-xs text-[#aaa]">{r}+ stars</span>
              </label>
            ))}
          </div>

          {/* Language */}
          <div>
            <p className="text-xs text-[#666] uppercase tracking-wider mb-2">Language</p>
            <select value={filters.language} onChange={(e) => setFilters((f) => ({ ...f, language: e.target.value }))}
              className="w-full px-2.5 py-1.5 rounded-lg border text-xs"
              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
              <option value="">Any language</option>
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </div>

          {/* Toggles */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.verifiedOnly} onChange={(e) => setFilters((f) => ({ ...f, verifiedOnly: e.target.checked }))} className="accent-[#e8442a]" />
              <span className="text-xs text-[#aaa]">Verified Authors Only</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={filters.inSubscription} onChange={(e) => setFilters((f) => ({ ...f, inSubscription: e.target.checked }))} className="accent-[#e8442a]" />
              <span className="text-xs text-[#aaa]">In Subscription</span>
            </label>
          </div>

          <button type="button" onClick={() => setApplied({ ...filters })}
            className="w-full py-2.5 rounded-lg text-sm font-medium"
            style={{ background: '#e8442a', color: '#fff' }}>
            Apply Filters
          </button>
        </aside>

        {/* Results */}
        <div className="flex-1 min-w-0">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#444]" size={16} />
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search books, authors..." className="w-full pl-9 pr-4 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
          </div>

          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-[#666]">{results.length} result{results.length !== 1 ? 's' : ''}</p>
            <select value={sort} onChange={(e) => setSort(e.target.value)}
              className="px-3 py-1.5 rounded-lg border text-xs"
              style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
              <option value="relevance">Most Relevant</option>
              <option value="newest">Newest</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="rating">Highest Rated</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div>
          ) : results.length === 0 ? (
            <p className="text-center text-[#444] py-16 text-sm">No results. Try different filters.</p>
          ) : (
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
              {results.map((b) => <BookCard key={b.id} book={b} />)}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
