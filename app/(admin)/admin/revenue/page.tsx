'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';
import type { Order } from '@/types/order';

interface RevenueData {
  date: string;
  revenue: number;
  platformFee: number;
  sellerPayouts: number;
  orders: number;
}

export default function AdminRevenuePage() {
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<RevenueData[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [totals, setTotals] = useState({ revenue: 0, platformFee: 0, sellerPayouts: 0, orders: 0 });
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('30d');

  useEffect(() => {
    async function load() {
      setLoading(true);
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const since = new Date();
      since.setDate(since.getDate() - days);

      const snap = await getDocs(query(
        collection(db, 'orders'),
        where('createdAt', '>=', Timestamp.fromDate(since)),
        orderBy('createdAt', 'desc')
      ));

      const orders = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Order));
      setRecentOrders(orders.slice(0, 20));

      const byDay: Record<string, RevenueData> = {};
      let totalRev = 0, totalFee = 0, totalPayout = 0;

      orders.forEach((o) => {
        const date = o.createdAt?.toDate?.()?.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) ?? '';
        if (!byDay[date]) byDay[date] = { date, revenue: 0, platformFee: 0, sellerPayouts: 0, orders: 0 };
        byDay[date].revenue += o.finalPrice ?? 0;
        byDay[date].platformFee += o.platformFee ?? 0;
        byDay[date].sellerPayouts += o.sellerEarnings ?? 0;
        byDay[date].orders += 1;
        totalRev += o.finalPrice ?? 0;
        totalFee += o.platformFee ?? 0;
        totalPayout += o.sellerEarnings ?? 0;
      });

      setTotals({ revenue: totalRev, platformFee: totalFee, sellerPayouts: totalPayout, orders: orders.length });
      setChartData(Object.values(byDay).reverse());
      setLoading(false);
    }
    load();
  }, [period]);

  const stats = [
    { label: 'Gross Revenue', value: centsToDisplay(totals.revenue), color: '#f5b800' },
    { label: 'Platform Fees', value: centsToDisplay(totals.platformFee), color: '#4ade80' },
    { label: 'Author Payouts', value: centsToDisplay(totals.sellerPayouts), color: '#60a5fa' },
    { label: 'Total Orders', value: totals.orders.toLocaleString(), color: '#e8442a' },
  ];

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-display-lg text-white">Revenue</h1>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: '#1a1a1a' }}>
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button key={p} type="button" onClick={() => setPeriod(p)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={{ background: period === p ? '#e8442a' : 'transparent', color: period === p ? '#fff' : '#666' }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {stats.map((s) => (
                <div key={s.label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
                  <p className="text-xs text-[#555] mb-1">{s.label}</p>
                  <p className="font-display text-2xl" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div className="p-5 rounded-xl border mb-6" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <h2 className="font-display text-display-sm text-white mb-4">Revenue Breakdown</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
                    labelStyle={{ color: '#aaa', fontSize: 12 }}
                    formatter={(value: number, name: string) => [centsToDisplay(value), name]}
                  />
                  <Bar dataKey="revenue" name="Gross Revenue" fill="#f5b800" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="platformFee" name="Platform Fee" fill="#4ade80" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="sellerPayouts" name="Author Payouts" fill="#60a5fa" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="p-5 rounded-xl border mb-6" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <h2 className="font-display text-display-sm text-white mb-4">Orders Over Time</h2>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                  <XAxis dataKey="date" tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#555', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }} labelStyle={{ color: '#aaa', fontSize: 12 }} />
                  <Line type="monotone" dataKey="orders" name="Orders" stroke="#e8442a" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: '#1a1a1a' }}>
                <h2 className="font-display text-display-sm text-white">Recent Orders</h2>
              </div>
              <table className="w-full text-sm min-w-[580px]">
                <thead>
                  <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                    {['Reader', 'Book', 'Total', 'Platform Fee', 'Author Earnings', 'Date'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((o) => (
                    <tr key={o.id} style={{ borderBottom: '1px solid #111' }}>
                      <td className="px-4 py-3 text-[#aaa]">{o.buyerEmail}</td>
                      <td className="px-4 py-3 text-[#666] text-xs truncate max-w-[160px]">{o.bookTitle}</td>
                      <td className="px-4 py-3 text-[#f5b800]">{centsToDisplay(o.finalPrice)}</td>
                      <td className="px-4 py-3 text-[#4ade80]">{centsToDisplay(o.platformFee)}</td>
                      <td className="px-4 py-3 text-[#60a5fa]">{centsToDisplay(o.sellerEarnings)}</td>
                      <td className="px-4 py-3 text-xs text-[#555]">{o.createdAt?.toDate?.()?.toLocaleDateString?.()}</td>
                    </tr>
                  ))}
                  {recentOrders.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#444]">No orders in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
