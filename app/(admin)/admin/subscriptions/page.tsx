'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Subscription } from '@/types/subscription';

export default function AdminSubscriptionsPage() {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [planFilter, setPlanFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    getDocs(collection(db, 'subscriptions')).then((snap) => {
      setSubs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Subscription)));
      setLoading(false);
    });
  }, []);

  const filtered = subs.filter((s) => {
    if (planFilter !== 'all' && s.plan !== planFilter) return false;
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    return true;
  });

  const stats = {
    active: subs.filter((s) => s.status === 'active').length,
    basic: subs.filter((s) => s.plan === 'basic' && s.status === 'active').length,
    standard: subs.filter((s) => s.plan === 'standard' && s.status === 'active').length,
    premium: subs.filter((s) => s.plan === 'premium' && s.status === 'active').length,
    mrr: subs
      .filter((s) => s.status === 'active')
      .reduce((sum, s) => sum + (s.plan === 'basic' ? 499 : s.plan === 'standard' ? 999 : 1499), 0),
  };

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Subscriptions</h1>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">MRR</p>
            <p className="font-display text-2xl text-[#f5b800]">{centsToDisplay(stats.mrr)}</p>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Active Subscribers</p>
            <p className="font-display text-2xl text-white">{stats.active}</p>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-3">Plan Breakdown</p>
            <div className="space-y-1">
              {[['Basic', stats.basic, '#555'], ['Standard', stats.standard, '#4ade80'], ['Premium', stats.premium, '#f5b800']].map(([label, count, color]) => (
                <div key={label as string} className="flex justify-between text-xs">
                  <span style={{ color: color as string }}>{label as string}</span>
                  <span className="text-[#aaa]">{count as number}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Total Records</p>
            <p className="font-display text-2xl text-white">{subs.length}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Plans</option>
            <option value="basic">Basic</option>
            <option value="standard">Standard</option>
            <option value="premium">Premium</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="cancelled">Cancelled</option>
            <option value="past_due">Past Due</option>
          </select>
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="rounded-xl border overflow-hidden" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Subscriber', 'Plan', 'Status', 'Stripe Sub ID', 'Started', 'Renews'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3">
                      <p className="text-white">{s.userDisplayName}</p>
                      <p className="text-xs text-[#555]">{s.userId}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs px-2 py-0.5 rounded-full capitalize"
                        style={{
                          background: s.plan === 'premium' ? '#2e1a0f' : s.plan === 'standard' ? '#0f2e1a' : '#1a1a1a',
                          color: s.plan === 'premium' ? '#f5b800' : s.plan === 'standard' ? '#4ade80' : '#aaa',
                        }}>
                        {s.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#555] font-mono">{s.stripeSubscriptionId}</td>
                    <td className="px-4 py-3 text-xs text-[#555]">{s.startDate?.toDate?.()?.toLocaleDateString?.()}</td>
                    <td className="px-4 py-3 text-xs text-[#555]">{s.currentPeriodEnd?.toDate?.()?.toLocaleDateString?.()}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#444]">No subscriptions found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
