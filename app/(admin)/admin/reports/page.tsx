'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { Report } from '@/types/review';

export default function AdminReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const userProfile = useAuthStore((s) => s.userProfile);

  useEffect(() => {
    getDocs(collection(db, 'reports')).then((snap) => {
      setReports(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Report)));
      setLoading(false);
    });
  }, []);

  async function handleResolve(reportId: string) {
    await updateDoc(doc(db, 'reports', reportId), {
      status: 'resolved', resolvedBy: userProfile?.uid, resolvedAt: serverTimestamp(),
    });
    setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: 'resolved' } : r));
  }

  async function handleDismiss(reportId: string) {
    await updateDoc(doc(db, 'reports', reportId), { status: 'dismissed' });
    setReports((prev) => prev.map((r) => r.id === reportId ? { ...r, status: 'dismissed' } : r));
  }

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Reports</h1>
        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['Reporter', 'Type', 'Target', 'Reason', 'Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3 text-[#aaa]">{r.reporterName}</td>
                    <td className="px-4 py-3"><StatusPill status={r.targetType} /></td>
                    <td className="px-4 py-3 text-white truncate max-w-[120px]">{r.targetName}</td>
                    <td className="px-4 py-3 text-[#666] truncate max-w-[160px]">{r.reason}</td>
                    <td className="px-4 py-3 text-xs text-[#555]">{r.createdAt?.toDate?.()?.toLocaleDateString?.()}</td>
                    <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                    <td className="px-4 py-3">
                      {r.status === 'open' && (
                        <div className="flex gap-2">
                          <button type="button" onClick={() => handleResolve(r.id)} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: '#1a4a2a', color: '#4ade80' }}>Resolve</button>
                          <button type="button" onClick={() => handleDismiss(r.id)} className="text-xs px-2.5 py-1 rounded-lg border" style={{ borderColor: '#333', color: '#666' }}>Dismiss</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {reports.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-[#444]">No reports found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
