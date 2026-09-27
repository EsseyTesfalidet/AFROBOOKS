'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { centsToDisplay } from '@/lib/utils/formatCurrency';
import type { Payout } from '@/types/order';

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [error, setError] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [reviews, setReviews] = useState<{ sellerId: string; reason: string }[]>([]);

  useEffect(() => {
    Promise.all([getDocs(collection(db, 'payouts')), getDoc(doc(db, 'platformSettings', 'global')), getDocs(collection(db, 'payoutReviews'))]).then(([snap, settings, reviewSnap]) => {
      setPayouts(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Payout)));
      setEnabled(settings.data()?.automatedPayoutsEnabled === true);
      setReviews(reviewSnap.docs.filter(item => item.data().status === 'open').map(item => ({ sellerId: item.data().sellerId, reason: item.data().reason })));
    }).catch(() => setError('Unable to load payouts. Please reload to retry.')).finally(() => setLoading(false));
  }, []);

  const filtered = statusFilter === 'all' ? payouts : payouts.filter((p) => p.status === statusFilter);

  const totals = {
    pending: payouts.filter((p) => ['pending', 'processing', 'needs_review'].includes(p.status)).reduce((sum, p) => sum + p.amountCents, 0),
    paid: payouts.filter((p) => p.status === 'paid' && !!p.stripeTransferId).reduce((sum, p) => sum + p.amountCents, 0),
  };

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Payouts</h1>

        <p className="text-sm text-[#aaa] mb-5">{enabled ? 'Author royalties transfer to Stripe after confirmed purchases. Interrupted transfers are checked hourly. Stripe handles bank payouts on each author’s account schedule.' : 'Automatic author transfers are paused. Existing balances and transfer history are preserved.'}</p>
        {error && <p role="alert">{error}</p>}
        {reviews.length > 0 && <section className="mb-5 rounded-xl border border-amber-400/30 p-4"><h2 className="mb-2 text-sm font-semibold text-amber-200">Payments requiring review</h2><p className="mb-3 text-xs text-[#aaa]">Further transfers for these authors are held. Check the related payment and transfer history in Stripe before resolving balances.</p><ul className="space-y-2 text-sm text-[#ccc]">{reviews.map(review => <li key={review.sellerId}>{review.sellerId} — {review.reason.replace(/_/g, ' ')}</li>)}</ul></section>}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Pending Payouts</p>
            <p className="font-display text-2xl text-[#f5b800]">{centsToDisplay(totals.pending)}</p>
          </div>
          <div className="p-4 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <p className="text-xs text-[#555] mb-1">Verified Transfers</p>
            <p className="font-display text-2xl text-[#4ade80]">{centsToDisplay(totals.paid)}</p>
          </div>
        </div>

        <div className="flex gap-3 mb-5">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="paid">Transferred to Stripe</option>
            <option value="failed">Failed</option><option value="needs_review">Needs reconciliation</option><option value="processing">Processing</option>
          </select>
        </div>

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm min-w-[580px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Author', 'Amount', 'Period', 'Status', 'Requested', 'Transfer'].map((h) => (
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
                    <td className="px-4 py-3"><StatusPill status={p.status} label={p.status === 'paid' ? p.stripeTransferId ? 'Transferred to Stripe' : 'Recorded paid; unverified' : undefined} /></td>
                    <td className="px-4 py-3 text-xs text-[#555]">{p.createdAt?.toDate?.()?.toLocaleDateString?.()}</td>
                    <td className="px-4 py-3 text-xs text-[#aaa]">{p.stripeTransferId || 'Awaiting reconciliation'}</td>
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
