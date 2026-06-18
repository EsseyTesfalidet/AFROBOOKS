'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

export default function AdminBooksPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [filtered, setFiltered] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

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
    await updateDoc(doc(db, 'books', book.id), {
      status: 'live',
      publishedAt: book.publishedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    setBooks((prev) => prev.map((item) => item.id === book.id ? { ...item, status: 'live' } : item));
    await addDoc(collection(db, 'notifications'), {
      userId: book.sellerId,
      type: 'system',
      title: 'Book Approved',
      message: `Your book "${book.title}" is now live in the buyer catalog.`,
      isRead: false,
      actionUrl: '/listings',
      relatedBookId: book.id,
      createdAt: serverTimestamp(),
    });
  }

  async function removeBook(bookId: string, sellerId: string, title: string) {
    await updateDoc(doc(db, 'books', bookId), { status: 'removed', updatedAt: serverTimestamp() });
    setBooks((prev) => prev.map((b) => b.id === bookId ? { ...b, status: 'removed' } : b));
    await addDoc(collection(db, 'notifications'), {
      userId: sellerId, type: 'system', title: 'Book Removed',
      message: `Your book "${title}" has been removed by the platform admin.`,
      isRead: false, actionUrl: '/listings', relatedBookId: bookId, createdAt: serverTimestamp(),
    });
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
                        <p className="text-white truncate max-w-[140px]">{book.title}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#aaa]">{book.authorName}</td>
                    <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(book.price)}</td>
                    <td className="px-4 py-3 text-[#aaa]">{book.totalSales}</td>
                    <td className="px-4 py-3 text-[#aaa]">{book.averageRating.toFixed(1)}</td>
                    <td className="px-4 py-3"><StatusPill status={book.status} /></td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        {book.status === 'in_review' && (
                          <button
                            type="button"
                            onClick={() => approveBook(book)}
                            className="text-xs px-2.5 py-1 rounded-lg border"
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
                        {book.status !== 'removed' && (
                          <button type="button" onClick={() => removeBook(book.id, book.sellerId, book.title)}
                            className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: '#333', color: '#e8442a' }}>
                            Remove
                          </button>
                        )}
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
