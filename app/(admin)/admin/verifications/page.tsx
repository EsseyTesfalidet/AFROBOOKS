'use client';

import { useState } from 'react';
import { reviewVerification } from '@/lib/admin/reviewVerification';
import { db } from '@/lib/firebase/config';
import { useAuthStore } from '@/store/authStore';
import PrivateVerificationDocument from '@/components/admin/PrivateVerificationDocument';

import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue } from '@/lib/admin/metrics';
import {
  AdminHeading,
  AdminSearch,
  AdminPagination,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';

interface Verification {
  sellerId: string;
  sellerName: string;
  sellerEmail: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: unknown;
  reviewedAt?: unknown;
}
export default function AdminVerificationsPage() {
  const {
    data: requests,
    loading,
    error,
    retry,
  } = useAdminCollection<Verification>('verificationRequests');
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [filter, setFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const request = requests.find((item) => item.id === selected);
  const filtered = requests
    .filter(
      (item) =>
        (filter === 'all' || item.status === filter) &&
        [item.sellerName, item.sellerEmail, item.sellerId].some((value) =>
          value?.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => dateValue(a.submittedAt) - dateValue(b.submittedAt));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  async function review(action: 'approved' | 'rejected') {
    if (!request || !uid || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await reviewVerification(db, request.id, uid, action);
      setSelected(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to save this review.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="Verifications"
        description="Review author identity documents securely. Pending requests appear oldest first."
      />
      <AdminError error={error} retry={retry} />
      <div className="admin-toolbar">
        <AdminSearch
          label="Search author name or email"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <select
          aria-label="Verification status"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(1);
          }}
        >
          {['pending', 'approved', 'rejected', 'all'].map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All requests' : value}
            </option>
          ))}
        </select>
      </div>
      <section className="admin-panel">
        {loading ? (
          <p role="status" className="admin-empty">
            Loading verifications…
          </p>
        ) : error ? null : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Author</th>
                    <th>Submitted</th>
                    <th>Reviewed</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((currentPage - 1) * 15, currentPage * 15).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <button
                          type="button"
                          className="admin-row-title"
                          onClick={() => {
                            setSelected(item.id);
                            setActionError('');
                          }}
                        >
                          {item.sellerName || 'Unknown author'}
                        </button>
                        <small>{item.sellerEmail || item.sellerId}</small>
                      </td>
                      <td className="admin-muted">
                        {dateValue(item.submittedAt)
                          ? new Date(dateValue(item.submittedAt)).toLocaleDateString()
                          : 'Unknown'}
                      </td>
                      <td className="admin-muted">
                        {dateValue(item.reviewedAt)
                          ? new Date(dateValue(item.reviewedAt)).toLocaleDateString()
                          : '—'}
                      </td>
                      <td>
                        <AdminBadge
                          tone={
                            item.status === 'pending'
                              ? 'warning'
                              : item.status === 'approved'
                                ? 'good'
                                : 'neutral'
                          }
                        >
                          {item.status}
                        </AdminBadge>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No verification requests match this view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <AdminPagination page={currentPage} total={filtered.length} onChange={setPage} />
          </>
        )}
      </section>
      {request && (
        <AdminDrawer busy={busy} title="Identity review" onClose={() => setSelected(null)}>
          <h3 className="text-xl font-semibold">{request.sellerName || 'Unknown author'}</h3>
          <p className="mt-2 text-[#a6afa3]">{request.sellerEmail}</p>
          <div className="mt-4">
            <AdminBadge>{request.status}</AdminBadge>
          </div>
          <p className="my-6 text-sm text-[#a6afa3]">
            Open the private document and verify it before recording a decision. This publishing
            check is separate from Stripe’s payout verification.
          </p>
          <PrivateVerificationDocument key={request.id} id={request.id} />
          <AdminError error={actionError} />
          {request.status === 'pending' && (
            <div className="admin-drawer-actions">
              <button
                type="button"
                className="admin-primary"
                disabled={busy}
                onClick={() => review('approved')}
              >
                {busy ? 'Saving…' : 'Approve identity'}
              </button>
              <button
                type="button"
                className="admin-secondary"
                disabled={busy}
                onClick={() => review('rejected')}
              >
                Reject document
              </button>
            </div>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
