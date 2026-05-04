'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, orderBy, query } from 'firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import type { Announcement } from '@/types/review';

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const userProfile = useAuthStore((s) => s.userProfile);

  const [form, setForm] = useState({
    title: '',
    body: '',
    targetAudience: 'all' as 'all' | 'buyers' | 'sellers',
    type: 'info' as 'info' | 'warning' | 'maintenance' | 'feature',
  });

  useEffect(() => {
    getDocs(query(collection(db, 'announcements'), orderBy('createdAt', 'desc'))).then((snap) => {
      setAnnouncements(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Announcement)));
      setLoading(false);
    });
  }, []);

  async function handleCreate() {
    if (!form.title || !form.body) return;
    setSaving(true);
    const ref = await addDoc(collection(db, 'announcements'), {
      ...form, isActive: true,
      authorId: userProfile?.uid,
      authorName: `${userProfile?.firstName} ${userProfile?.lastName}`,
      createdAt: serverTimestamp(),
    });
    setAnnouncements((prev) => [{
      id: ref.id, ...form, isActive: true,
      authorId: userProfile?.uid ?? '',
      authorName: `${userProfile?.firstName} ${userProfile?.lastName}`,
      createdAt: null,
    }, ...prev]);
    setForm({ title: '', body: '', targetAudience: 'all', type: 'info' });
    setShowForm(false);
    setSaving(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await updateDoc(doc(db, 'announcements', id), { isActive: !current });
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, isActive: !current } : a));
  }

  const typeColors: Record<string, { bg: string; color: string }> = {
    info: { bg: '#0f1a2e', color: '#60a5fa' },
    warning: { bg: '#2e1a0f', color: '#f5b800' },
    maintenance: { bg: '#1f0e0c', color: '#e8442a' },
    feature: { bg: '#0f2e1a', color: '#4ade80' },
  };

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <h1 className="font-display text-display-lg text-white">Announcements</h1>
          <button type="button" onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 rounded-xl text-sm font-medium" style={{ background: '#e8442a', color: '#fff' }}>
            {showForm ? 'Cancel' : 'New Announcement'}
          </button>
        </div>

        {showForm && (
          <div className="p-5 rounded-xl border mb-6 space-y-4" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <h2 className="font-display text-display-sm text-white">Create Announcement</h2>
            <div>
              <label className="block text-xs text-[#555] mb-1">Title</label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
            </div>
            <div>
              <label className="block text-xs text-[#555] mb-1">Body</label>
              <textarea rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border text-sm resize-none" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="block text-xs text-[#555] mb-1">Audience</label>
                <select value={form.targetAudience} onChange={(e) => setForm((f) => ({ ...f, targetAudience: e.target.value as typeof form.targetAudience }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
                  <option value="all">All Users</option>
                  <option value="buyers">Buyers Only</option>
                  <option value="sellers">Sellers Only</option>
                </select>
              </div>
              <div className="flex-1">
                <label className="block text-xs text-[#555] mb-1">Type</label>
                <select value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as typeof form.type }))}
                  className="w-full px-3 py-2 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
                  <option value="info">Info</option>
                  <option value="feature">Feature</option>
                  <option value="warning">Warning</option>
                  <option value="maintenance">Maintenance</option>
                </select>
              </div>
            </div>
            <button type="button" onClick={handleCreate} disabled={saving || !form.title || !form.body}
              className="px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50"
              style={{ background: '#e8442a', color: '#fff' }}>
              {saving ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        )}

        {loading ? <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div> : (
          <div className="space-y-4">
            {announcements.map((a) => {
              const tc = typeColors[a.type] ?? typeColors.info;
              return (
                <div key={a.id} className="p-5 rounded-xl border" style={{ background: '#111', borderColor: '#1a1a1a', opacity: a.isActive ? 1 : 0.5 }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: tc.bg, color: tc.color }}>{a.type}</span>
                        <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: '#1a1a1a', color: '#666' }}>{a.targetAudience}</span>
                        {!a.isActive && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#1a1a1a', color: '#444' }}>Inactive</span>}
                      </div>
                      <p className="font-medium text-white">{a.title}</p>
                      <p className="text-sm text-[#666] mt-1">{a.body}</p>
                      <p className="text-xs text-[#444] mt-2">{a.authorName} · {(a.createdAt as any)?.toDate?.()?.toLocaleDateString?.()}</p>
                    </div>
                    <button type="button" onClick={() => toggleActive(a.id, a.isActive)}
                      className="text-xs px-3 py-1.5 rounded-lg border flex-shrink-0"
                      style={{ borderColor: a.isActive ? '#333' : '#1a4a2a', color: a.isActive ? '#666' : '#4ade80' }}>
                      {a.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  </div>
                </div>
              );
            })}
            {announcements.length === 0 && (
              <div className="text-center py-16">
                <p className="text-[#444] text-sm">No announcements yet.</p>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
