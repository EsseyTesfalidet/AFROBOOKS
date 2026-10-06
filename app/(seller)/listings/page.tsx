'use client';

import { accountFetch } from '@/lib/network';

import { Suspense, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import BookList from '@/components/seller/BookList';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { useSellerBooks } from '@/hooks/useSellerBooks';
import type { Book } from '@/types/book';

function ListingsPageContent() {
  const searchParams = useSearchParams();
  const { books, loading, error, retry, removeLocalBook } = useSellerBooks();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [removingId, setRemovingId] = useState<string | null>(null);
  const removing = useRef(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');

  async function removeBook(book: Book) {
    if (removing.current) return;
    if (!window.confirm(`Permanently remove “${book.title}” and its related data? This cannot be undone.`)) return;
    removing.current = true;
    setRemovingId(book.id);
    setActionError('');
    setNotice('');
    const { firebaseUser, userProfile } = useAuthStore.getState();
    const uid = userProfile?.uid;
    try {
      const headers: HeadersInit = {};
      if (firebaseUser) headers.Authorization = `Bearer ${await firebaseUser.getIdToken()}`;
      const response = await accountFetch(`/api/books/${encodeURIComponent(book.id)}`, { method: 'DELETE', headers, credentials: 'include' });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error ?? 'This book could not be removed. Please try again.');
      if (useAuthStore.getState().userProfile?.uid !== uid) return;
      removeLocalBook(book.id);
      setNotice(`“${book.title}” was removed.`);
    } catch (failure) {
      if (useAuthStore.getState().userProfile?.uid === uid) setActionError(failure instanceof Error ? failure.message : 'This book could not be removed. Please try again.');
    } finally {
      removing.current = false;
      setRemovingId(null);
    }
  }

  const published = searchParams.get('published');
  const publishNotice = published === 'live' ? 'Book published. Readers can now discover it in the catalog.'
    : published === 'in_review' ? 'Book submitted. Staff will review it before it appears in the catalog.'
    : published === 'draft' ? 'Draft saved. It stays private until you publish.' : '';
  const visibleBooks = books.filter((book) => {
    const matchesStatus = filter === 'all' || book.status === filter || (filter === 'attention' && (book.status === 'flagged' || book.status === 'removed'));
    const term = search.trim().toLocaleLowerCase();
    return matchesStatus && `${book.title} ${book.authorName ?? ''}`.toLocaleLowerCase().includes(term);
  });
  const count = (status: string) => books.filter((book) => status === 'attention' ? book.status === 'flagged' || book.status === 'removed' : book.status === status).length;

  return (
    <main className="app-page mx-auto max-w-5xl px-5 py-8 sm:px-8 sm:py-12">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c5a56a]">Your catalog</p>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-5">
        <div><h1 className="text-[28px] font-semibold tracking-tight sm:text-[36px]">Books</h1><p className="mt-2 text-[14px] text-[#a8a49c]">From your first draft to your next release.</p></div>
        <Link href="/publish" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#ed6647] px-4 text-[14px] font-semibold text-[#160e0b] hover:bg-[#ff8b6f]"><Plus size={17} /> New book</Link>
      </div>
      {(notice || publishNotice) && <p role="status" className="mt-6 border-l-2 border-emerald-400/60 py-2 pl-4 text-[14px] leading-relaxed text-emerald-200">{notice || publishNotice}</p>}
      {actionError && <p role="alert" className="mt-6 text-[14px] text-[#ffc2ad]">{actionError}</p>}
      {loading ? <div role="status" className="flex items-center gap-3 py-16 text-[14px] text-[#b4b1a9]"><LoadingSpinner size={24} /> Loading your books…</div>
        : error ? <div role="alert" className="py-12 text-[14px]"><p className="text-[#ffc2ad]">{error}</p><button type="button" onClick={retry} className="mt-3 min-h-11 text-[#ff9e83] underline">Try again</button></div>
        : books.length === 0 ? <div className="mt-9 border-t border-white/10 py-12"><h2 className="text-[20px] font-medium">Make room for your first book.</h2><p className="mt-3 max-w-md text-[14px] leading-relaxed text-[#a8a49c]">Start with New book. You can save your work as a draft and return whenever you’re ready.</p></div>
        : <>
          <div className="mt-8 grid gap-4 border-b border-white/10 pb-6 sm:grid-cols-[minmax(0,1fr)_220px]">
            <div><label htmlFor="book-search" className="mb-2 block text-[12px] text-[#b4b1a9]">Search books</label><div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-3.5 text-[#96938b]" /><input id="book-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Title or author" className="min-h-11 w-full rounded-lg border border-white/15 bg-white/[0.03] pl-10 pr-3 text-[16px] placeholder:text-[#96938b]" /></div></div>
            <div><label htmlFor="book-status" className="mb-2 block text-[12px] text-[#b4b1a9]">Status</label><select id="book-status" value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-11 w-full rounded-lg border border-white/15 bg-[#181816] px-3 text-[16px]">
              <option value="all">All books ({books.length})</option><option value="live">Published ({count('live')})</option><option value="draft">Drafts ({count('draft')})</option><option value="in_review">In review ({count('in_review')})</option><option value="attention">Needs attention ({count('attention')})</option>
            </select></div>
          </div>
          <p role="status" className="pt-5 text-[12px] text-[#96938b]">{visibleBooks.length} of {books.length} books</p>
          {visibleBooks.length ? <BookList books={visibleBooks} onRemove={removeBook} removingId={removingId} /> : <p className="py-12 text-[14px] text-[#b4b1a9]">No matching books. Try a different title or status.</p>}
        </>}
    </main>
  );
}

export default function ListingsPage() {
  return <div className="app-canvas min-h-screen bg-[#10100f]"><SellerHeader /><Suspense fallback={<div role="status" className="flex justify-center py-16"><LoadingSpinner size={28} /><span className="sr-only">Loading your books…</span></div>}><ListingsPageContent /></Suspense></div>;
}
