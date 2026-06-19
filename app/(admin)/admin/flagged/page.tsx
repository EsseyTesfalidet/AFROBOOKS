'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';

export default function AdminFlaggedPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingBookId, setPendingBookId] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'books'), where('status', '==', 'flagged'))).then((snap) => {
      setBooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Book)));
      setLoading(false);
    });
  }, []);

  async function handleAction(book: Book, action: 'live' | 'delete') {
    if (
      action === 'delete' &&
      !window.confirm(`Permanently delete "${book.title}" from the platform?`)
    ) {
      return;
    }

    setPendingBookId(book.id);

    try {
      const response = await fetch('/api/admin/moderate-book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: book.id, action }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to update this book.');
      }

      setBooks((prev) => prev.filter((item) => item.id !== book.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to update this book.');
    } finally {
      setPendingBookId(null);
    }
  }

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <div className="flex items-center justify-between mb-5">
          <h1 className="font-display text-display-lg text-white">Flagged Content</h1>
          {books.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: '#2e1a0f' }}>
              <div className="w-2 h-2 rounded-full" style={{ background: '#f5b800' }} />
              <span className="text-xs text-[#f5b800]">{books.length} item{books.length !== 1 ? 's' : ''} need review</span>
            </div>
          )}
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> :
          books.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[#444] text-sm">No flagged content. All clear.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {books.map((book) => (
                <div key={book.id} className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <div className="flex gap-4">
                    <div className="w-16 h-20 rounded-lg flex-shrink-0" style={{ background: book.coverBgColor }} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-medium text-white">{book.title}</p>
                          <p className="text-sm text-[#666]">{book.authorName}</p>
                          <p className="text-xs text-[#555] mt-1">{book.totalSales} sales · {centsToDisplay(book.price)}</p>
                        </div>
                      </div>
                      {book.flagReason && (
                        <div className="mt-3 p-3 rounded-lg" style={{ background: '#1f0e0c' }}>
                          <p className="text-xs font-medium" style={{ color: '#e8442a' }}>Flag reason</p>
                          <p className="text-xs text-[#aaa] mt-0.5">{book.flagReason}</p>
                          <p className="text-xs text-[#555] mt-1">{book.flagCount} report{book.flagCount !== 1 ? 's' : ''}</p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-3 mt-4">
                    <button
                      type="button"
                      disabled={pendingBookId === book.id}
                      onClick={() => handleAction(book, 'live')}
                      className="px-4 py-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: '#0f2e1a', color: '#4ade80', border: '1px solid #1a4a2a' }}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={pendingBookId === book.id}
                      onClick={() => handleAction(book, 'delete')}
                      className="px-4 py-2 rounded-lg text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                      style={{ background: '#1f0e0c', color: '#e8442a', border: '1px solid #3a1a18' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </main>
    </div>
  );
}
