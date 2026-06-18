'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, XCircle, Clock, ExternalLink } from 'lucide-react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { DEFAULT_SELLER_VERIFICATION_STATUS, hasCompletedSellerVerification } from '@/lib/sellerVerification';
import {
  collection, getDocs, getDoc, doc, updateDoc, addDoc, serverTimestamp, query, orderBy,
} from 'firebase/firestore';

interface VerificationRequest {
  id: string;
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  fileUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: { toDate: () => Date } | null;
  reviewedAt?: { toDate: () => Date } | null;
}

export default function AdminVerificationsPage() {
  const [requests, setRequests] = useState<VerificationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    getDocs(query(collection(db, 'verificationRequests'), orderBy('submittedAt', 'desc')))
      .then((snap) => {
        setRequests(snap.docs.map((d) => ({ id: d.id, ...d.data() } as VerificationRequest)));
        setLoading(false);
      })
      .catch((err) => {
        console.error('Failed to load verification requests:', err);
        setError('Failed to load requests. Check your admin permissions.');
        setLoading(false);
      });
  }, []);

  async function handleAction(req: VerificationRequest, action: 'approved' | 'rejected') {
    setActing(req.id);
    try {
      await updateDoc(doc(db, 'verificationRequests', req.id), {
        status: action,
        reviewedAt: serverTimestamp(),
      });

      if (action === 'approved') {
        const sellerSnap = await getDoc(doc(db, 'sellers', req.sellerId));
        const sellerData = sellerSnap.data() ?? {};
        const vs = sellerData.verificationStatus ?? {};
        const userSnap = await getDoc(doc(db, 'users', req.sellerId));
        const bioLength: number = (userSnap.data()?.bio ?? '').length;
        const nextVerificationStatus = {
          ...DEFAULT_SELLER_VERIFICATION_STATUS,
          ...vs,
          emailVerified: vs.emailVerified ?? true,
          bioAdded: bioLength >= 50,
          idVerified: true,
          tenSalesReached: (sellerData.totalSales ?? 0) >= 10,
        };

        await updateDoc(doc(db, 'sellers', req.sellerId), {
          verificationStatus: nextVerificationStatus,
          isVerified: hasCompletedSellerVerification(nextVerificationStatus),
        });
      }

      // Notify the seller
      await addDoc(collection(db, 'notifications'), {
        userId: req.sellerId,
        type: 'verification',
        title: action === 'approved' ? 'ID Verification Approved' : 'ID Verification Rejected',
        message: action === 'approved'
          ? 'Your identity document has been approved. Your ID verification step is now complete.'
          : 'Your identity document was not accepted. Please resubmit a clear photo of your government-issued ID.',
        actionUrl: '/seller/profile/verification',
        isRead: false,
        createdAt: serverTimestamp(),
      });

      setRequests((prev) =>
        prev.map((r) => r.id === req.id ? { ...r, status: action } : r)
      );
    } finally {
      setActing(null);
    }
  }

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  const counts = {
    pending: requests.filter((r) => r.status === 'pending').length,
    approved: requests.filter((r) => r.status === 'approved').length,
    rejected: requests.filter((r) => r.status === 'rejected').length,
  };

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-1">ID Verifications</h1>
        <p className="text-sm text-[#555] mb-5">Review seller identity documents</p>

        {/* Filter tabs */}
        <div className="flex gap-2 mb-5">
          {(['pending', 'approved', 'rejected', 'all'] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors capitalize"
              style={{
                background: filter === f ? '#e8442a' : '#1a1a1a',
                color: filter === f ? '#fff' : '#666',
              }}
            >
              {f === 'all' ? 'All' : `${f.charAt(0).toUpperCase() + f.slice(1)} (${counts[f as keyof typeof counts]})`}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div>
        ) : error ? (
          <div className="text-center py-16 text-[#e8442a] text-sm">{error}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-[#444]">No {filter === 'all' ? '' : filter} requests.</div>
        ) : (
          <div className="space-y-3">
            {filtered.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-xl border flex items-start gap-5"
                style={{ background: '#111', borderColor: '#1a1a1a' }}
              >
                {/* Status icon */}
                <div className="flex-shrink-0 mt-0.5">
                  {req.status === 'pending' && <Clock size={20} style={{ color: '#f5b800' }} />}
                  {req.status === 'approved' && <CheckCircle size={20} style={{ color: '#4ade80' }} />}
                  {req.status === 'rejected' && <XCircle size={20} style={{ color: '#e8442a' }} />}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white">{req.sellerName || 'Unknown Seller'}</p>
                  <p className="text-xs text-[#555] mb-1">{req.sellerEmail || req.sellerId}</p>
                  <p className="text-xs text-[#444]">
                    Submitted: {req.submittedAt?.toDate?.()?.toLocaleDateString?.() ?? '—'}
                  </p>
                  {req.reviewedAt && (
                    <p className="text-xs text-[#444]">
                      Reviewed: {req.reviewedAt?.toDate?.()?.toLocaleDateString?.() ?? '—'}
                    </p>
                  )}
                </div>

                {/* View ID button */}
                <a
                  href={req.fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs border flex-shrink-0"
                  style={{ borderColor: '#333', color: '#aaa' }}
                >
                  <ExternalLink size={12} />
                  View ID
                </a>

                {/* Actions */}
                {req.status === 'pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button
                      type="button"
                      disabled={acting === req.id}
                      onClick={() => handleAction(req, 'approved')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
                      style={{ background: '#14532d', color: '#4ade80' }}
                    >
                      {acting === req.id ? <LoadingSpinner size={10} color="#4ade80" /> : <CheckCircle size={12} />}
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={acting === req.id}
                      onClick={() => handleAction(req, 'rejected')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-opacity hover:opacity-90"
                      style={{ background: '#1f0e0c', color: '#e8442a' }}
                    >
                      {acting === req.id ? <LoadingSpinner size={10} color="#e8442a" /> : <XCircle size={12} />}
                      Reject
                    </button>
                  </div>
                )}

                {req.status !== 'pending' && (
                  <span
                    className="px-2.5 py-1 rounded-lg text-xs font-medium flex-shrink-0 capitalize"
                    style={{
                      background: req.status === 'approved' ? '#14532d' : '#1f0e0c',
                      color: req.status === 'approved' ? '#4ade80' : '#e8442a',
                    }}
                  >
                    {req.status}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
