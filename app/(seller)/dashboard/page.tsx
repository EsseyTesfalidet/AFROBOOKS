'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PlusCircle } from 'lucide-react';
import SellerHeader from '@/components/seller/SellerHeader';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { getSellerBooks } from '@/lib/firebase/firestore';
import { db } from '@/lib/firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Seller } from '@/types/user';

export default function SellerDashboardPage() {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [books, setBooks] = useState<Book[]>([]);
  const [sellerData, setSellerData] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile) return;
    Promise.all([
      getSellerBooks(userProfile.uid),
      getDoc(doc(db, 'sellers', userProfile.uid)),
    ]).then(([bks, sellerSnap]) => {
      setBooks(bks);
      if (sellerSnap.exists()) setSellerData(sellerSnap.data() as Seller);
      setLoading(false);
    });
  }, [userProfile?.uid]);

  const totalSales = books.reduce((s, b) => s + b.totalSales, 0);
  const totalRevenue = sellerData?.totalEarnings ?? 0;
  const pending = sellerData?.pendingBalance ?? 0;
  const liveCount = books.filter((b) => b.status === 'live').length;

  const statCards = [
    { label: 'Total Sales', value: totalSales.toString(), color: '#f5b800' },
    { label: 'Books Listed', value: books.length.toString(), color: '#fff' },
    { label: 'Total Revenue', value: centsToDisplay(totalRevenue), color: '#4ade80' },
    { label: 'Pending Payout', value: centsToDisplay(pending), color: '#f5b800' },
  ];

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-display-lg text-white">Dashboard</h1>
            <p className="text-sm text-[#666]">Welcome back, {userProfile?.firstName}</p>
          </div>
          <Link href="/publish" className="flex-shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
            <PlusCircle size={15} />
            <span className="hidden sm:inline">Publish New Ebook</span>
            <span className="sm:hidden">Publish</span>
          </Link>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-xs text-[#555] mb-1">{label}</p>
              <p className="font-display text-2xl" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Recent Books */}
        <div>
          <h2 className="font-display text-display-sm text-white mb-3">Your Books</h2>
          {books.length === 0 ? (
            <div className="text-center py-12 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-[#555] mb-4 text-sm">You haven't published any books yet.</p>
              <Link href="/publish" className="px-5 py-2.5 rounded-lg text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
                Publish Your First Book
              </Link>
            </div>
          ) : (
            <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <table className="w-full text-sm min-w-[500px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    {['Book', 'Price', 'Sales', 'Rating', 'Status', ''].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {books.slice(0, 8).map((book) => (
                    <tr key={book.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-7 h-9 rounded flex-shrink-0" style={{ background: book.coverBgColor }} />
                          <div>
                            <p className="font-medium text-white truncate max-w-[160px]">{book.title}</p>
                            <p className="text-xs text-[#555]">{book.genre}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(book.price)}</td>
                      <td className="px-4 py-3 text-[#aaa]">{book.totalSales}</td>
                      <td className="px-4 py-3 text-[#aaa]">{book.averageRating.toFixed(1)}</td>
                      <td className="px-4 py-3"><StatusPill status={book.status} /></td>
                      <td className="px-4 py-3">
                        <Link href={`/listings?edit=${book.id}`} className="text-xs text-[#e8442a] hover:underline">Edit</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
