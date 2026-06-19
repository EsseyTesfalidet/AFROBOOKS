'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { auth, db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { getCopyrightBasisLabel } from '@/lib/utils/copyright';
import type { Book } from '@/types/book';

export default function AdminBooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [filtered, setFiltered] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'books')).then((snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book));
      setBooks(all);
      setFiltered(all);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let res = books;
    if (search) res = res.filter((b) => b.title.toLowerCase().includes(search.toLowerCase()) || b.authorName.toLowerCase().includes(search.toLowerCase()));
    if (statusFilter !== 'all') res = res.filter((b) => b.status === statusFilter);
    setFiltered(res);
  }, [search, statusFilter, books]);

  async function toggleFeatured(bookId: string, current: boolean) {
    await updateDoc(doc(db, 'books', bookId), { isFeatured: !current, updatedAt: serverTimestamp() });
    setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, isFeatured: !current } : b));
  }

  async function approveBook(book: Book) {
    setPendingBookId(book.id);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }

      const response = await fetch('/api/admin/moderate-book', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ bookId: book.id, action: 'live' }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to approve this book.');
      }

      setBooks((prev) =>
        prev.map((item) =>
          item.id === book.id
            ? { ...item, status: 'live', flagReason: null, flagCount: 0, copyrightReviewStatus: 'approved' }
            : item
        )
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to approve this book.');
    } finally {
      setPendingBookId(null);
    }
  }

  async function deleteBook(book: Book) {
    const confirmed = window.confirm(`Permanently delete "${book.title}" from the platform?`);
    if (!confirmed) {
      return;
    }

    setPendingBookId(book.id);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
      }

      const response = await fetch('/api/admin/moderate-book', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({ bookId: book.id, action: 'delete' }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to delete this book.');
      }

      setBooks((prev) => prev.filter((item) => item.id !== book.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to delete this book.');
    } finally {
      setPendingBookId(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Ebook Library</h1>

        <div className="flex flex-wrap gap-2 mb-5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search books..." className="flex-1 min-w-[180px] px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            {['all', 'live', 'in_review', 'draft', 'flagged', 'removed'].map((s) => <option key={s} value={s}>{s === 'all' ? 'All' : s}</option>)}
          </select>
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm min-w-[660px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Book', 'Author', 'Price', 'Sales', 'Rating', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((book) => (
                  <tr key={book.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-9 rounded flex-shrink-0" style={{ background: book.coverBgColor }} />
                        <div className="min-w-0">
                          <p className="text-white truncate max-w-[140px]">{book.title}</p>
                          <p className="text-[11px] text-[#666] truncate max-w-[180px]">
                            {getCopyrightBasisLabel(book.copyrightBasis)}{book.copyrightReviewStatus ? ` · review ${book.copyrightReviewStatus}` : ''}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#aaa]">
                      <div className="space-y-1">
                        <p>{book.authorName}</p>
                        {book.copyrightDetails && (
                          <p className="text-[11px] text-[#555] max-w-[180px] truncate">{book.copyrightDetails}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(book.price)}</td>
                    <td className="px-4 py-3 text-[#aaa]">{book.totalSales}</td>
                    <td className="px-4 py-3 text-[#aaa]">{book.averageRating.toFixed(1)}</td>
                    <td className="px-4 py-3"><StatusPill status={book.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {book.status === 'in_review' && (
                          <button
                            type="button"
                            disabled={pendingBookId === book.id}
                            onClick={() => approveBook(book)}
                            className="text-xs px-2.5 py-1 rounded-lg border disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ borderColor: '#4ade80', color: '#4ade80' }}
                          >
                            Approve
                          </button>
                        )}
                        <button type="button" onClick={() => toggleFeatured(book.id, book.isFeatured)}
                          className="text-xs px-2.5 py-1 rounded-lg border"
                          style={{ borderColor: book.isFeatured ? '#f5b800' : '#333', color: book.isFeatured ? '#f5b800' : '#888' }}>
                          {book.isFeatured ? 'Unfeature' : 'Feature'}
                        </button>
                        <button
                          type="button"
                          disabled={pendingBookId === book.id}
                          onClick={() => deleteBook(book)}
                          className="text-xs px-2.5 py-1 rounded-lg border disabled:cursor-not-allowed disabled:opacity-50"
                          style={{ borderColor: '#333', color: '#e8442a' }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-[#444]">No books found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
