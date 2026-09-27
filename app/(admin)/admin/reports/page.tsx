'use client';

import { useState } from 'react';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuthStore } from '@/store/authStore';
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
import type { Report } from '@/types/review';

export default function AdminReportsPage() {
  const { data: reports, loading, error, retry } = useAdminCollection<Report>('reports');
  const uid = useAuthStore((state) => state.userProfile?.uid);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const needle = search.trim().toLowerCase();
  const filtered = reports
    .filter(
      (report) =>
        (status === 'all' || report.status === status) &&
        [report.targetName, report.reporterName, report.reason, report.id].some((value) =>
          value?.toLowerCase().includes(needle),
        ),
    )
    .sort((a, b) => dateValue(a.createdAt) - dateValue(b.createdAt));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const report = reports.find((item) => item.id === selected);
  async function resolve(status: 'resolved' | 'dismissed') {
    if (!report || !uid || busy) return;
    setBusy(true);
    setActionError('');
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'reports', report.id);
        const current = await tx.get(ref);
        if (!current.exists() || current.data().status !== 'open')
          throw new Error(
            'This report was already reviewed. Close this panel to see its current status.',
          );
        tx.update(ref, {
          status,
          adminNote: note.trim() || null,
          resolvedBy: uid,
          resolvedAt: serverTimestamp(),
        });
      });
      setSelected(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to save your review.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="Reports"
        description="Review the full context, record a decision, and keep the oldest concerns moving."
      />
      <AdminError error={error} retry={retry} />
      <div className="admin-toolbar">
        <AdminSearch
          label="Search reports"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <select
          aria-label="Report status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          {['open', 'resolved', 'dismissed', 'all'].map((value) => (
            <option key={value} value={value}>
              {value === 'all' ? 'All reports' : value}
            </option>
          ))}
        </select>
      </div>
      <section className="admin-panel">
        {loading ? (
          <p className="admin-empty" role="status">
            Loading reports…
          </p>
        ) : error ? null : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Reported content</th>
                    <th>Submitted by</th>
                    <th>Received</th>
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
                            setNote(item.adminNote ?? '');
                            setActionError('');
                          }}
                        >
                          {item.targetName || 'Unnamed ' + item.targetType}
                        </button>
                        <small className="max-w-sm truncate">{item.reason}</small>
                      </td>
                      <td>{item.reporterName}</td>
                      <td className="admin-muted">
                        {dateValue(item.createdAt)
                          ? new Date(dateValue(item.createdAt)).toLocaleDateString()
                          : 'Unknown'}
                      </td>
                      <td>
                        <AdminBadge tone={item.status === 'open' ? 'warning' : 'neutral'}>
                          {item.status}
                        </AdminBadge>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No reports match this view.
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
      {report && (
        <AdminDrawer busy={busy} title="Report review" onClose={() => setSelected(null)}>
          <AdminBadge>{report.targetType}</AdminBadge>
          <h3 className="text-xl font-semibold mt-4">{report.targetName}</h3>
          <p className="text-sm text-[#a6afa3] mt-2">Reported by {report.reporterName}</p>
          <div className="my-6 rounded-lg border border-[#30352f] p-4 whitespace-pre-wrap">
            {report.reason}
          </div>
          <p className="text-xs text-[#a6afa3]">Target ID: {report.targetId}</p>
          <AdminError error={actionError} />
          {report.status === 'open' ? (
            <>
              <label className="block text-sm mt-6" htmlFor="review-note">
                Review note <span className="text-[#a6afa3]">(optional)</span>
              </label>
              <textarea
                id="review-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                maxLength={2000}
                rows={4}
                className="w-full mt-2 rounded-lg border border-[#49523f] bg-[#111311] p-3"
              />
              <p className="text-xs text-[#a6afa3] mt-3">
                Closing a report records your decision. Book and account moderation are managed in
                their own sections.
              </p>
              <div className="admin-drawer-actions">
                <button
                  type="button"
                  disabled={busy}
                  className="admin-primary"
                  onClick={() => resolve('resolved')}
                >
                  {busy ? 'Saving…' : 'Mark resolved'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="admin-secondary"
                  onClick={() => resolve('dismissed')}
                >
                  Dismiss report
                </button>
              </div>
            </>
          ) : (
            <div className="mt-6">
              <AdminBadge>{report.status}</AdminBadge>
              <p className="mt-4 whitespace-pre-wrap">
                {report.adminNote || 'No review note recorded.'}
              </p>
            </div>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
