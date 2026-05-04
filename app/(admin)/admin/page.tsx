'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, where, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { centsToDisplay } from '@/lib/utils/formatCurrency';

interface Stats {
  users: number;
  books: number;
  subscribers: number;
  flagged: number;
  openReports: number;
  salesToday: number;
  totalRevenue: number;
  activeSellers: number;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats>({ users: 0, books: 0, subscribers: 0, flagged: 0, openReports: 0, salesToday: 0, totalRevenue: 0, activeSellers: 0 });
  const [activity, setActivity] = useState<{ id: string; message: string; time: string }[]>([]);
  const [revenueData, setRevenueData] = useState<{ day: string; value: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(query(collection(db, 'books'), where('status', '==', 'live'))),
      getDocs(query(collection(db, 'users'), where('subscriptionStatus', '==', 'active'))),
      getDocs(query(collection(db, 'books'), where('status', '==', 'flagged'))),
      getDocs(query(collection(db, 'reports'), where('status', '==', 'open'))),
      getDocs(collection(db, 'orders')),
    ]).then(([users, books, subs, flagged, reports, orders]) => {
      const allOrders = orders.docs.map((d) => d.data());
      const todayOrders = allOrders.filter((o) => {
        const created = o.createdAt?.toDate?.();
        return created && created >= todayStart;
      });
      const totalRev = allOrders.reduce((s, o) => s + (o.finalPrice ?? 0), 0);

      setStats({
        users: users.size,
        books: books.size,
        subscribers: subs.size,
        flagged: flagged.size,
        openReports: reports.size,
        salesToday: todayOrders.length,
        totalRevenue: Math.round(totalRev),
        activeSellers: users.docs.filter((u) => ['seller', 'both'].includes(u.data().role)).length,
      });

      const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const rev = Array.from({ length: 7 }, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - (6 - i));
        const dateStr = d.toDateString();
        const dayOrders = allOrders.filter((o) => o.createdAt?.toDate?.()?.toDateString?.() === dateStr);
        return {
          day: DAY_NAMES[d.getDay()],
          value: dayOrders.reduce((s, o) => s + (o.finalPrice ?? 0), 0),
        };
      });
      setRevenueData(rev);

      setLoading(false);
    });

    // Live activity
    const unsub = onSnapshot(
      query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(10)),
      (snap) => {
        setActivity(snap.docs.map((d) => ({
          id: d.id,
          message: d.data().message as string,
          time: d.data().createdAt?.toDate?.()?.toLocaleTimeString?.() ?? '',
        })));
      }
    );
    return unsub;
  }, []);

  const statCards = [
    { label: 'Total Revenue', value: centsToDisplay(stats.totalRevenue), color: '#4ade80' },
    { label: 'Total Users', value: stats.users.toString(), color: '#f5b800' },
    { label: 'Active Sellers', value: stats.activeSellers.toString(), color: '#f5b800' },
    { label: 'Ebooks Live', value: stats.books.toString(), color: '#fff' },
    { label: 'Subscribers', value: stats.subscribers.toString(), color: '#7c3aed' },
    { label: 'Sales Today', value: stats.salesToday.toString(), color: '#4ade80' },
    { label: 'Flagged Content', value: stats.flagged.toString(), color: stats.flagged > 0 ? '#e8442a' : '#555' },
    { label: 'Open Reports', value: stats.openReports.toString(), color: stats.openReports > 0 ? '#f5b800' : '#555' },
  ];


  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7 space-y-7">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-display-lg text-white">Admin Dashboard</h1>
            <p className="text-sm text-[#555]">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: '#4ade80' }} />
            <span className="text-xs text-[#4ade80]">Live</span>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statCards.map(({ label, value, color }) => (
            <div key={label} className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
              <p className="text-xs text-[#555] mb-1">{label}</p>
              <p className="font-display text-2xl" style={{ color }}>{value}</p>
            </div>
          ))}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-sm font-medium text-white mb-4">Revenue (7 Days)</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1a1a1a" />
                <XAxis dataKey="day" tick={{ fill: '#555', fontSize: 11 }} />
                <YAxis tick={{ fill: '#555', fontSize: 11 }} tickFormatter={(v) => `$${(v / 100).toFixed(0)}`} />
                <Tooltip contentStyle={{ background: '#161616', border: '1px solid #222', borderRadius: 8 }} formatter={(v: number) => [`$${(v / 100).toFixed(2)}`, 'Revenue']} />
                <Bar dataKey="value" fill="#e8442a" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Activity feed */}
          <div className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-sm font-medium text-white mb-3">Live Activity</p>
            {activity.length === 0 ? (
              <p className="text-xs text-[#444] text-center py-8">No recent activity.</p>
            ) : (
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {activity.map((a) => (
                  <div key={a.id} className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#e8442a' }} />
                    <div>
                      <p className="text-xs text-[#aaa]">{a.message}</p>
                      <p className="text-xs text-[#444]">{a.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
