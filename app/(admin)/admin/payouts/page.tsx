'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Payout } from '@/types/order';

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'payouts')).then((snap) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payout)));
      setLoading(false);
    });
  }, []);

  const filtered = statusFilter === 'all' ? payouts : payouts.filter((p) => p.status === statusFilter);

  const totals = {
    pending: payouts.filter((p) => p.status === 'pending').reduce((sum, p) => sum + p.amountCents, 0),
    paid: payouts.filter((p) => p.status === 'paid').reduce((sum, p) => sum + p.amountCents, 0),
  };

  async function markPaid(payoutId: string, sellerId: string, amount: number) {
    setProcessing(payoutId);
    await updateDoc(doc(db, 'payouts', payoutId), {
      status: 'paid', paidAt: serverTimestamp(),
    });
    await addDoc(collection(db, 'notifications'), {
      userId: sellerId, type: 'payout',
      title: 'Payout Processed',
      message: `Your payout of ${centsToDisplay(amount)} has been sent to your Stripe account.`,
      isRead: false, actionUrl: '/seller/earnings', relatedBookId: null, createdAt: serverTimestamp(),
    });
    setPayouts((prev) => prev.map((p) => p.id === payoutId ? { ...p, status: 'paid' } : p));
    setProcessing(null);
  }

  async function markFailed(payoutId: string, sellerId: string) {
    setProcessing(payoutId);
    await updateDoc(doc(db, 'payouts', payoutId), { status: 'failed' });
    await addDoc(collection(db, 'notifications'), {
      userId: sellerId, type: 'system',
      title: 'Payout Failed',
      message: 'Your payout could not be processed. Please check your Stripe account details.',
      isRead: false, actionUrl: '/seller/earnings', relatedBookId: null, createdAt: serverTimestamp(),
    });
    setPayouts((prev) => prev.map((p) => p.id === payoutId ? { ...p, status: 'failed' } : p));
    setProcessing(null);
  }

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Payouts</h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Pending Payouts</p>
            <p className="font-display text-2xl text-[#f5b800]">{centsToDisplay(totals.pending)}</p>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Total Paid Out</p>
            <p className="font-display text-2xl text-[#4ade80]">{centsToDisplay(totals.paid)}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="failed">Failed</option>
          </select>
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm min-w-[580px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Author', 'Amount', 'Period', 'Status', 'Requested', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3">
                      <p className="text-white">{p.sellerName}</p>
                      <p className="text-xs text-[#555]">{p.stripeAccountId}</p>
                    </td>
                    <td className="px-4 py-3 text-[#f5b800] font-medium">{centsToDisplay(p.amountCents)}</td>
                    <td className="px-4 py-3 text-[#666] text-xs">{p.periodLabel}</td>
                    <td className="px-4 py-3"><StatusPill status={p.status} /></td>
                    <td className="px-4 py-3 text-xs text-[#555]">{p.createdAt?.toDate?.()?.toLocaleDateString?.()}</td>
                    <td className="px-4 py-3">
                      {p.status === 'pending' && (
                        <div className="flex gap-2">
                          <button type="button" disabled={processing === p.id}
                            onClick={() => markPaid(p.id, p.sellerId, p.amountCents)}
                            className="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-50"
                            style={{ borderColor: '#1a4a2a', color: '#4ade80' }}>
                            {processing === p.id ? '...' : 'Mark Paid'}
                          </button>
                          <button type="button" disabled={processing === p.id}
                            onClick={() => markFailed(p.id, p.sellerId)}
                            className="text-xs px-2.5 py-1 rounded-lg border disabled:opacity-50"
                            style={{ borderColor: '#333', color: '#e8442a' }}>
                            Failed
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-[#444]">No payouts found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
