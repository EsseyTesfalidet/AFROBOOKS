'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal, Search, Sparkles, X, Check } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import BookCard from '@/components/buyer/BookCard';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { getLiveBooks } from '@/lib/firebase/firestore';
import { orderBy } from 'firebase/firestore';
import type { Book } from '@/types/book';

const GENRES = ['Fiction', 'Science', 'History', 'Fantasy', 'Romance', 'Biography', 'Self-Help', 'Business', 'Poetry'];
const LANGUAGES = ['English', 'French', 'Swahili', 'Yoruba', 'Amharic', 'Arabic', 'Portuguese'];
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Most relevant' },
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Highest rated' },
];

interface Filters {
  genres: string[];
  minPrice: string;
  maxPrice: string;
  minRating: number;
  language: string;
  verifiedOnly: boolean;
  inSubscription: boolean;
}

const EMPTY_FILTERS: Filters = {
  genres: [],
  minPrice: '',
  maxPrice: '',
  minRating: 0,
  language: '',
  verifiedOnly: false,
  inSubscription: false,
};

type SheetMode = 'filters' | 'sort' | null;

export default function SearchPage() {
  const [allBooks, setAllBooks] = useState<Book[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<Filters>(EMPTY_FILTERS);
  const [sort, setSort] = useState('relevance');
  const [sheetMode, setSheetMode] = useState<SheetMode>(null);

  useEffect(() => {
    getLiveBooks([orderBy('totalSales', 'desc')]).then((data) => {
      setAllBooks(data);
      setLoading(false);
    });
  }, []);

  const results = useMemo(() => {
    let next = allBooks;

    if (query.trim()) {
      const normalized = query.toLowerCase();
      next = next.filter(
        (book) =>
          book.title.toLowerCase().includes(normalized) ||
          book.authorName.toLowerCase().includes(normalized) ||
          book.genre.toLowerCase().includes(normalized) ||
          book.tags.some((tag) => tag.toLowerCase().includes(normalized))
      );
    }

    if (appliedFilters.genres.length > 0) {
      next = next.filter((book) => appliedFilters.genres.includes(book.genre));
    }

    if (appliedFilters.minPrice) {
      next = next.filter((book) => book.price >= Number(appliedFilters.minPrice) * 100);
    }

    if (appliedFilters.maxPrice) {
      next = next.filter((book) => book.price <= Number(appliedFilters.maxPrice) * 100);
    }

    if (appliedFilters.minRating > 0) {
      next = next.filter((book) => book.averageRating >= appliedFilters.minRating);
    }

    if (appliedFilters.language) {
      next = next.filter((book) => book.language === appliedFilters.language);
    }

    if (appliedFilters.verifiedOnly) {
      next = next.filter((book) => book.sellerVerified);
    }

    if (appliedFilters.inSubscription) {
      next = next.filter((book) => book.inSubscription);
    }

    if (sort === 'price_asc') {
      next = [...next].sort((left, right) => left.price - right.price);
    } else if (sort === 'price_desc') {
      next = [...next].sort((left, right) => right.price - left.price);
    } else if (sort === 'rating') {
      next = [...next].sort((left, right) => right.averageRating - left.averageRating);
    } else if (sort === 'newest') {
      next = [...next].sort(
        (left, right) =>
          (right.publishedAt?.toMillis?.() ?? 0) - (left.publishedAt?.toMillis?.() ?? 0)
      );
    }

    return next;
  }, [allBooks, appliedFilters, query, sort]);

  const activeFilterCount =
    appliedFilters.genres.length +
    (appliedFilters.minPrice ? 1 : 0) +
    (appliedFilters.maxPrice ? 1 : 0) +
    (appliedFilters.minRating ? 1 : 0) +
    (appliedFilters.language ? 1 : 0) +
    (appliedFilters.verifiedOnly ? 1 : 0) +
    (appliedFilters.inSubscription ? 1 : 0);

  const quickCollections = [
    { label: 'Subscriber titles', action: () => setAppliedFilters((current) => ({ ...current, inSubscription: true })) },
    { label: 'Verified authors', action: () => setAppliedFilters((current) => ({ ...current, verifiedOnly: true })) },
    { label: '4★ and up', action: () => setAppliedFilters((current) => ({ ...current, minRating: 4 })) },
    { label: 'New fiction', action: () => setAppliedFilters((current) => ({ ...current, genres: ['Fiction'] })) },
  ];

  function toggleGenre(genre: string) {
    setFilters((current) => ({
      ...current,
      genres: current.genres.includes(genre)
        ? current.genres.filter((item) => item !== genre)
        : [...current.genres, genre],
    }));
  }

  function resetFilters() {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  }

  function removeAppliedGenre(genre: string) {
    setAppliedFilters((current) => ({
      ...current,
      genres: current.genres.filter((item) => item !== genre),
    }));
  }

  function clearAppliedFilter(key: keyof Filters) {
    if (key === 'genres') {
      setAppliedFilters((current) => ({ ...current, genres: [] }));
      return;
    }

    if (key === 'verifiedOnly' || key === 'inSubscription') {
      setAppliedFilters((current) => ({ ...current, [key]: false }));
      return;
    }

    if (key === 'minRating') {
      setAppliedFilters((current) => ({ ...current, minRating: 0 }));
      return;
    }

    setAppliedFilters((current) => ({ ...current, [key]: '' }));
  }

  function applyFilters() {
    setAppliedFilters(filters);
    setSheetMode(null);
  }

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />

      <main className="mx-auto max-w-5xl px-4 py-6 space-y-6">
        <section
          className="rounded-[28px] border p-5 sm:p-6"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(232,68,42,0.18), transparent 32%), linear-gradient(180deg, #151515 0%, #111 100%)',
            borderColor: 'rgba(255,255,255,0.08)',
          }}
        >
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: '#666' }}>
                Mobile-first search
              </p>
              <h1 className="mt-2 font-display text-display-lg text-white">Find the exact next read</h1>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: '#777' }}>
                Search by title, author, genre, or refine the catalog with sheet-based filters.
              </p>
            </div>

            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#555]" size={18} />
              <input
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search books, authors, or topics..."
                className="w-full rounded-2xl border py-3.5 pl-12 pr-4 text-sm"
                style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
              />
            </div>

            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {quickCollections.map(({ label, action }) => (
                <button
                  key={label}
                  type="button"
                  onClick={action}
                  className="flex-shrink-0 rounded-full border px-3.5 py-2 text-sm transition-colors"
                  style={{ background: '#161616', borderColor: '#2a2a2a', color: '#ccc' }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="sticky top-[88px] z-20 -mx-4 px-4 py-3" style={{ background: 'rgba(14,14,14,0.92)', backdropFilter: 'blur(18px)' }}>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSheetMode('filters')}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
            >
              <SlidersHorizontal size={16} />
              Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-full px-1.5 text-[11px] font-bold" style={{ background: '#e8442a', color: '#fff' }}>
                  {activeFilterCount}
                </span>
              ) : null}
            </button>

            <button
              type="button"
              onClick={() => setSheetMode('sort')}
              className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
              style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
            >
              <Sparkles size={16} />
              {SORT_OPTIONS.find((option) => option.value === sort)?.label}
            </button>

            {activeFilterCount > 0 ? (
              <button
                type="button"
                onClick={resetFilters}
                className="inline-flex flex-shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium"
                style={{ background: '#171717', borderColor: '#2a2a2a', color: '#e8442a' }}
              >
                Reset
              </button>
            ) : null}
          </div>

          {activeFilterCount > 0 ? (
            <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1">
              {appliedFilters.genres.map((genre) => (
                <button
                  key={genre}
                  type="button"
                  onClick={() => removeAppliedGenre(genre)}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{ background: '#1f0e0c', borderColor: '#e8442a', color: '#fff' }}
                >
                  {genre} <X size={12} />
                </button>
              ))}
              {appliedFilters.minRating > 0 ? (
                <button
                  type="button"
                  onClick={() => clearAppliedFilter('minRating')}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{ background: '#171717', borderColor: '#2a2a2a', color: '#ddd' }}
                >
                  {appliedFilters.minRating}+ stars <X size={12} />
                </button>
              ) : null}
              {appliedFilters.language ? (
                <button
                  type="button"
                  onClick={() => clearAppliedFilter('language')}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{ background: '#171717', borderColor: '#2a2a2a', color: '#ddd' }}
                >
                  {appliedFilters.language} <X size={12} />
                </button>
              ) : null}
              {appliedFilters.verifiedOnly ? (
                <button
                  type="button"
                  onClick={() => clearAppliedFilter('verifiedOnly')}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{ background: '#171717', borderColor: '#2a2a2a', color: '#ddd' }}
                >
                  Verified only <X size={12} />
                </button>
              ) : null}
              {appliedFilters.inSubscription ? (
                <button
                  type="button"
                  onClick={() => clearAppliedFilter('inSubscription')}
                  className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{ background: '#171717', borderColor: '#2a2a2a', color: '#ddd' }}
                >
                  Subscription <X size={12} />
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-display-sm text-white">Results</h2>
              <p className="text-sm" style={{ color: '#666' }}>
                {results.length} title{results.length === 1 ? '' : 's'} found
              </p>
            </div>
            <Link href="/browse" className="text-xs transition-colors hover:text-white" style={{ color: '#666' }}>
              Back to home →
            </Link>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : results.length === 0 ? (
            <div className="rounded-3xl border px-4 py-14 text-center" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-sm" style={{ color: '#666' }}>
                No books match that search. Try a broader query or reset the filters.
              </p>
            </div>
          ) : (
            <div
              className="grid gap-3.5"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}
            >
              {results.map((book) => (
                <BookCard key={book.id} book={book} />
              ))}
            </div>
          )}
        </section>
      </main>

      {sheetMode ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4" onClick={() => setSheetMode(null)}>
          <div
            className="w-full max-w-xl rounded-t-[28px] border p-5 sm:rounded-[28px]"
            style={{ background: '#111', borderColor: '#1a1a1a' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: '#666' }}>
                  {sheetMode === 'filters' ? 'Refine results' : 'Sort results'}
                </p>
                <h3 className="mt-1 font-display text-display-sm text-white">
                  {sheetMode === 'filters' ? 'Filter sheet' : 'Choose an order'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSheetMode(null)}
                className="flex h-9 w-9 items-center justify-center rounded-xl"
                style={{ background: '#171717', color: '#888' }}
              >
                <X size={16} />
              </button>
            </div>

            {sheetMode === 'filters' ? (
              <div className="space-y-5">
                <div>
                  <p className="mb-3 text-xs uppercase tracking-[0.24em]" style={{ color: '#555' }}>
                    Genre
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {GENRES.map((genre) => {
                      const active = filters.genres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => toggleGenre(genre)}
                          className="rounded-full px-3.5 py-2 text-sm font-medium"
                          style={{
                            background: active ? '#f5f2eb' : '#171717',
                            color: active ? '#000' : '#ccc',
                            border: `1px solid ${active ? '#f5f2eb' : '#2a2a2a'}`,
                          }}
                        >
                          {genre}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.24em]" style={{ color: '#555' }}>
                      Min price
                    </label>
                    <input
                      type="number"
                      value={filters.minPrice}
                      onChange={(event) => setFilters((current) => ({ ...current, minPrice: event.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm"
                      style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.24em]" style={{ color: '#555' }}>
                      Max price
                    </label>
                    <input
                      type="number"
                      value={filters.maxPrice}
                      onChange={(event) => setFilters((current) => ({ ...current, maxPrice: event.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm"
                      style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
                      placeholder="25"
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.24em]" style={{ color: '#555' }}>
                      Language
                    </label>
                    <select
                      value={filters.language}
                      onChange={(event) => setFilters((current) => ({ ...current, language: event.target.value }))}
                      className="w-full rounded-2xl border px-4 py-3 text-sm"
                      style={{ background: '#171717', borderColor: '#2a2a2a', color: '#f5f2eb' }}
                    >
                      <option value="">Any language</option>
                      {LANGUAGES.map((language) => (
                        <option key={language} value={language}>
                          {language}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs uppercase tracking-[0.24em]" style={{ color: '#555' }}>
                      Minimum rating
                    </label>
                    <div className="flex gap-2">
                      {[0, 3, 4, 5].map((rating) => {
                        const active = filters.minRating === rating;
                        return (
                          <button
                            key={rating}
                            type="button"
                            onClick={() => setFilters((current) => ({ ...current, minRating: rating }))}
                            className="flex-1 rounded-2xl border py-3 text-sm font-medium"
                            style={{
                              background: active ? '#f5f2eb' : '#171717',
                              color: active ? '#000' : '#ccc',
                              borderColor: active ? '#f5f2eb' : '#2a2a2a',
                            }}
                          >
                            {rating === 0 ? 'Any' : `${rating}+`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-2xl border p-4" style={{ background: '#151515', borderColor: '#1f1f1f' }}>
                  {[
                    { key: 'verifiedOnly', label: 'Verified authors only' },
                    { key: 'inSubscription', label: 'Included in subscription' },
                  ].map(({ key, label }) => {
                    const checked = filters[key as keyof Filters] as boolean;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setFilters((current) => ({ ...current, [key]: !checked }))}
                        className="flex w-full items-center justify-between gap-3 text-left"
                      >
                        <span className="text-sm text-white">{label}</span>
                        <span
                          className="flex h-6 w-6 items-center justify-center rounded-full border"
                          style={{
                            background: checked ? '#e8442a' : 'transparent',
                            borderColor: checked ? '#e8442a' : '#333',
                            color: '#fff',
                          }}
                        >
                          {checked ? <Check size={14} /> : null}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setFilters(EMPTY_FILTERS);
                      setAppliedFilters(EMPTY_FILTERS);
                      setSheetMode(null);
                    }}
                    className="flex-1 rounded-2xl border py-3 text-sm font-medium"
                    style={{ background: '#171717', borderColor: '#2a2a2a', color: '#ddd' }}
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    onClick={applyFilters}
                    className="flex-1 rounded-2xl py-3 text-sm font-medium"
                    style={{ background: '#e8442a', color: '#fff' }}
                  >
                    Apply filters
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {SORT_OPTIONS.map((option) => {
                  const active = option.value === sort;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSort(option.value);
                        setSheetMode(null);
                      }}
                      className="flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-medium"
                      style={{
                        background: active ? '#1f0e0c' : '#171717',
                        borderColor: active ? '#e8442a' : '#2a2a2a',
                        color: active ? '#fff' : '#ddd',
                      }}
                    >
                      {option.label}
                      {active ? <Check size={16} style={{ color: '#e8442a' }} /> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
