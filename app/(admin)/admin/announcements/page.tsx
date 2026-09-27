'use client';

import { useState } from 'react';
import { addDoc, updateDoc, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useAuthStore } from '@/store/authStore';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue } from '@/lib/admin/metrics';
import {
  AdminHeading,
  AdminSearch,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';
import type { Announcement } from '@/types/review';

const empty = {
  title: '',
  body: '',
  targetAudience: 'all' as Announcement['targetAudience'],
  type: 'info' as Announcement['type'],
  isActive: true,
};
export default function AdminAnnouncementsPage() {
  const {
    data: announcements,
    loading,
    error,
    retry,
  } = useAdminCollection<Announcement>('announcements');
  const user = useAuthStore((state) => state.userProfile);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('active');
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(empty);
  const [baseline, setBaseline] = useState(JSON.stringify(empty));
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [notice, setNotice] = useState('');
  const filtered = announcements
    .filter(
      (item) =>
        (filter === 'all' || item.isActive === (filter === 'active')) &&
        [item.title, item.body].some((value) =>
          value?.toLowerCase().includes(search.trim().toLowerCase()),
        ),
    )
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!user || !editing || busy) return;
    if (!form.title.trim() || !form.body.trim()) {
      setSaveError('Enter a title and message.');
      return;
    }
    setBusy(true);
    setSaveError('');
    try {
      const data = {
        ...form,
        title: form.title.trim(),
        body: form.body.trim(),
        updatedAt: serverTimestamp(),
      };
      if (editing === 'new')
        await addDoc(collection(db, 'announcements'), {
          ...data,
          authorId: user.uid,
          authorName: user.firstName + ' ' + user.lastName,
          createdAt: serverTimestamp(),
        });
      else await updateDoc(doc(db, 'announcements', editing), data);
      setNotice(
        form.isActive
          ? 'Announcement saved and active for its audience.'
          : 'Announcement saved as inactive.',
      );
      setEditing(null);
    } catch {
      setSaveError('Unable to save the announcement. Your text is still here; please try again.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="Announcements"
        description="Publish a clear update for readers, authors, or your whole community."
      >
        <button
          type="button"
          className="admin-primary"
          onClick={() => {
            setEditing('new');
            setForm(empty);
            setBaseline(JSON.stringify(empty));
            setSaveError('');
          }}
        >
          New announcement
        </button>
      </AdminHeading>
      <AdminError error={error} retry={retry} />
      {notice && (
        <p role="status" className="text-sm text-[#d8edb2] mb-5">
          {notice}
        </p>
      )}
      <div className="admin-toolbar">
        <AdminSearch label="Search announcements" value={search} onChange={setSearch} />
        <select
          aria-label="Announcement visibility"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All announcements</option>
        </select>
      </div>
      {loading ? (
        <p role="status" className="admin-empty">
          Loading announcements…
        </p>
      ) : (
        !error && (
          <section className="admin-panel">
            {filtered.map((item) => (
              <article key={item.id} className="border-b border-[#30352f] last:border-0 p-6">
                <div className="flex items-center gap-3 mb-3">
                  <AdminBadge tone={item.isActive ? 'good' : 'neutral'}>
                    {item.isActive ? 'Active' : 'Inactive'}
                  </AdminBadge>
                  <span className="admin-muted text-xs">
                    {item.targetAudience === 'all'
                      ? 'Everyone'
                      : item.targetAudience === 'buyers'
                        ? 'Readers'
                        : 'Authors'}{' '}
                    · {item.type}
                  </span>
                </div>
                <button
                  type="button"
                  className="admin-row-title text-lg"
                  onClick={() => {
                    setEditing(item.id);
                    setForm({
                      title: item.title,
                      body: item.body,
                      targetAudience: item.targetAudience,
                      type: item.type,
                      isActive: item.isActive,
                    });
                    setBaseline(
                      JSON.stringify({
                        title: item.title,
                        body: item.body,
                        targetAudience: item.targetAudience,
                        type: item.type,
                        isActive: item.isActive,
                      }),
                    );
                    setSaveError('');
                  }}
                >
                  {item.title}
                </button>
                <p className="admin-muted mt-3 whitespace-pre-wrap text-sm leading-relaxed">
                  {item.body}
                </p>
                <p className="admin-muted text-xs mt-4">
                  {item.authorName} ·{' '}
                  {dateValue(item.createdAt)
                    ? new Date(dateValue(item.createdAt)).toLocaleDateString()
                    : 'Just published'}
                </p>
              </article>
            ))}
            {!filtered.length && <p className="admin-empty">No announcements match this view.</p>}
          </section>
        )
      )}
      {editing && (
        <AdminDrawer
          busy={busy}
          title={editing === 'new' ? 'New announcement' : 'Edit announcement'}
          onClose={() => {
            if (
              !busy &&
              JSON.stringify(form) !== baseline &&
              !window.confirm('Close this editor? Unsaved changes will be lost.')
            )
              return;
            if (!busy) setEditing(null);
          }}
        >
          <form onSubmit={save} className="space-y-5">
            <div>
              <label htmlFor="announcement-title">Title</label>
              <input
                id="announcement-title"
                value={form.title}
                maxLength={120}
                required
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, title: event.target.value }))
                }
                className="admin-field"
              />
            </div>
            <div>
              <label htmlFor="announcement-body">Message</label>
              <textarea
                id="announcement-body"
                value={form.body}
                maxLength={4000}
                rows={7}
                required
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, body: event.target.value }))
                }
                className="admin-field"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="announcement-audience">Audience</label>
                <select
                  id="announcement-audience"
                  value={form.targetAudience}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      targetAudience: event.target.value as Announcement['targetAudience'],
                    }))
                  }
                  className="admin-field"
                >
                  <option value="all">Everyone</option>
                  <option value="buyers">Readers</option>
                  <option value="sellers">Authors</option>
                </select>
              </div>
              <div>
                <label htmlFor="announcement-type">Type</label>
                <select
                  id="announcement-type"
                  value={form.type}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      type: event.target.value as Announcement['type'],
                    }))
                  }
                  className="admin-field"
                >
                  {['info', 'feature', 'warning', 'maintenance'].map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((previous) => ({ ...previous, isActive: event.target.checked }))
                }
              />
              Visible to the selected audience
            </label>
            <AdminError error={saveError} />
            <button type="submit" disabled={busy} className="admin-primary">
              {busy
                ? 'Saving…'
                : editing === 'new' && form.isActive
                  ? 'Publish announcement'
                  : 'Save announcement'}
            </button>
          </form>
        </AdminDrawer>
      )}
    </main>
  );
}
