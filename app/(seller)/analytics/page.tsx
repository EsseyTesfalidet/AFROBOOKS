'use client';

import { useEffect, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import SellerHeader from '@/components/seller/SellerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { getSellerBooks } from '@/lib/firebase/firestore';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Book } from '@/types/book';
import type { Payout } from '@/types/order';
import type { Seller } from '@/types/user';

const TABS = ['Overview', 'By Book', 'Payouts', 'Audience'];
const COLORS = ['#e8442a', '#f5b800', '#4ade80', '#7c3aed', '#0ea5e9', '#f97316'];

export default function AnalyticsPage() {
  const userProfile = useAuthStore((s) => s.userProfile);
  const [tab, setTab] = useState('Overview');
  const [books, setBooks] = useState<Book[]>([]);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [revenueData, setRevenueData] = useState<{ day: string; revenue: number; sales: number }[]>([]);
  const [genreData, setGenreData] = useState<{ name: string; value: number }[]>([]);

  useEffect(() => {
    if (!userProfile) return;
    Promise.all([
      getSellerBooks(userProfile.uid),
      getDoc(doc(db, 'sellers', userProfile.uid)),
      getDocs(query(collection(db, 'payouts'), where('sellerId', '==', userProfile.uid))),
      getDocs(query(collection(db, 'orders'), where('sellerId', '==', userProfile.uid))),
    ]).then(([bks, sellerSnap, payoutSnap, ordersSnap]) => {
      setBooks(bks);
      if (sellerSnap.exists()) setSeller(sellerSnap.data() as Seller);
      setPayouts(payoutSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Payout)));

      // Build last-7-days revenue from real orders
      const orders = ordersSnap.docs.map((d) => d.data());
      const now = new Date();
      const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const rev = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        const dateStr = d.toDateString();
        const dayOrders = orders.filter((o) => o.createdAt?.toDate?.()?.toDateString?.() === dateStr);
        return {
          day: DAY_NAMES[d.getDay()],
          revenue: dayOrders.reduce((s: number, o) => s + Math.round((o.finalPrice ?? 0) * 0.7), 0),
          sales: dayOrders.length,
        };
      });
      setRevenueData(rev);

      // Genre breakdown from seller's books
      const genreMap: Record<string, number> = {};
      bks.forEach((b) => {
        if (b.genre) genreMap[b.genre] = (genreMap[b.genre] ?? 0) + b.totalSales;
      });
      setGenreData(Object.entries(genreMap).map(([name, value]) => ({ name, value })));

      setLoading(false);
    });
  }, [userProfile?.uid]);

  const bookSalesData = books.slice(0, 5).map((b) => ({
    name: b.title.substring(0, 12) + (b.title.length > 12 ? '…' : ''),
    sales: b.totalSales,
  }));

  const totalRevenue = seller?.totalEarnings ?? 0;
  const pending = seller?.pendingBalance ?? 0;
  const totalPaid = payouts.filter((p) => p.status === 'paid').reduce((s, p) => s + p.amountCents, 0);

  if (loading) return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <div className="flex justify-center pt-16"><LoadingSpinner size={36} /></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <SellerHeader />
      <main className="max-w-5xl mx-auto px-4 py-8">
        <h1 className="font-display text-display-lg text-white mb-4">Analytics</h1>

        {/* Date range */}
        <div className="flex gap-2 mb-6">
          {['7D', '30D', '90D', 'All Time'].map((d) => (
            <button key={d} type="button"
              className="px-3 py-1.5 rounded-lg text-xs border"
              style={{ background: d === '30D' ? '#e8442a' : '#1a1a1a', color: d === '30D' ? '#fff' : '#888', borderColor: d === '30D' ? '#e8442a' : '#333' }}>
              {d}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b" style={{ borderColor: '#1a1a1a' }}>
          {TABS.map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)}
              className="pb-2 text-sm font-medium transition-colors"
              style={{ color: tab === t ? '#f5f2eb' : '#555', borderBottom: tab === t ? '2px solid #e8442a' : '2px solid transparent' }}>
              {t}
            </button>
          ))}
        </div>

        {/* Overview */}
        {tab === 'Overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Revenue', value: centsToDisplay(totalRevenue), color: '#4ade80' },
                { label: 'Sales', value: books.reduce((s, b) => s + b.totalSales, 0), color: '#f5b800' },
                { label: 'Earnings', value: centsToDisplay(totalRevenue), color: '#4ade80' },
                { label: 'Avg Rating', value: (books.reduce((s, b) => s + b.averageRating, 0) / Math.max(books.length, 1)).toFixed(1), color: '#f5b800' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <p className="text-xs text-[#555]">{label}</p>
                  <p className="font-display text-2xl mt-1" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {/* Revenue chart */}
            <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-sm font-medium text-white mb-4">Revenue (Last 7 Days)</p>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={revenueData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#555', fontSize: 11 }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                  <Tooltip
                    contentStyle={{ background: '#161616', border: '1px solid #222', borderRadius: 8 }}
                    labelStyle={{ color: '#aaa' }}
                    formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#e8442a" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Sales by book */}
            {bookSalesData.length > 0 && (
              <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <p className="text-sm font-medium text-white mb-4">Sales by Book</p>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={bookSalesData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                    <XAxis dataKey="name" tick={{ fill: '#555', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#555', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#161616', border: '1px solid #222', borderRadius: 8 }} labelStyle={{ color: '#aaa' }} />
                    <Bar dataKey="sales" fill="#e8442a" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}

        {/* Payouts */}
        {tab === 'Payouts' && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              {[
                { label: 'Total Earned', value: centsToDisplay(totalRevenue), color: '#4ade80' },
                { label: 'Paid Out', value: centsToDisplay(totalPaid), color: '#4ade80' },
                { label: 'Pending', value: centsToDisplay(pending), color: '#f5b800' },
              ].map(({ label, value, color }) => (
                <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <p className="text-xs text-[#555]">{label}</p>
                  <p className="font-display text-2xl mt-1" style={{ color }}>{value}</p>
                </div>
              ))}
            </div>

            {payouts.length === 0 ? (
              <p className="text-center text-[#444] py-8 text-sm">No payout history is available yet.</p>
            ) : (
              <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                      {['Period', 'Sales', 'Gross', 'Earnings', 'Status'].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                        <td className="px-4 py-3 text-[#aaa]">{p.periodLabel}</td>
                        <td className="px-4 py-3 text-[#aaa]">{p.salesCount}</td>
                        <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(p.salesEarnings + p.subscriptionEarnings)}</td>
                        <td className="px-4 py-3" style={{ color: '#4ade80' }}>{centsToDisplay(p.amountCents)}</td>
                        <td className="px-4 py-3">
                          <span className="text-xs px-2 py-0.5 rounded"
                            style={{ background: p.status === 'paid' ? '#0f2e1a' : '#2e1a0f', color: p.status === 'paid' ? '#4ade80' : '#f5b800' }}>
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* By Book */}
        {tab === 'By Book' && (
          <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Book', 'Price', 'Sales', 'Revenue', 'Reviews', 'Rating'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {books.map((b) => (
                  <tr key={b.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-8 rounded flex-shrink-0" style={{ background: b.coverBgColor }} />
                        <span className="text-white truncate max-w-[140px]">{b.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(b.price)}</td>
                    <td className="px-4 py-3 text-[#aaa]">{b.totalSales}</td>
                    <td className="px-4 py-3" style={{ color: '#4ade80' }}>{centsToDisplay(b.totalSales * b.price * 0.7)}</td>
                    <td className="px-4 py-3 text-[#aaa]">{b.reviewCount}</td>
                    <td className="px-4 py-3 text-[#f5b800]">{b.averageRating.toFixed(1)}</td>
                  </tr>
                ))}
                {books.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#444]">No books have been published yet.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Audience */}
        {tab === 'Audience' && (
          <div className="grid grid-cols-2 gap-5">
            {genreData.length > 0 && (
              <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                <p className="text-sm font-medium text-white mb-4">Sales by Genre</p>
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie data={genreData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} label={({ name, value }) => `${name} (${value})`}>
                      {genreData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: '#161616', border: '1px solid #222', borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
            {genreData.length === 0 && (
              <div className="col-span-2 text-center py-16 text-[#444] text-sm">Genre insights will appear once enough sales data is available.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
