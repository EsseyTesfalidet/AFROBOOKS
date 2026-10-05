'use client';

import { useState } from 'react';
import {
  AdminHeading,
  AdminSearch,
  AdminPagination,
  AdminDrawer,
  AdminError,
  AdminBadge,
} from '@/components/admin/AdminUI';
import { useAdminCollection } from '@/lib/admin/useAdminCollection';
import { dateValue } from '@/lib/admin/metrics';
import { adminPersonName, matchesAdminPerson } from '@/lib/admin/people';
import { authenticatedPost } from '@/lib/firebase/request';
import type { User } from '@/types/user';

type Action = 'active' | 'warned' | 'suspended' | 'delete';
const roleLabel: Record<string, string> = {
  buyer: 'Reader',
  seller: 'Author',
  both: 'Reader & author',
  admin: 'Administrator',
};
export default function AdminUsersPage() {
  const { data: users, loading, error, retry } = useAdminCollection<User>('users');
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const filtered = users
    .filter(
      (user) =>
        (role === 'all' || user.role === role) &&
        (status === 'all' || user.status === status) &&
        matchesAdminPerson(user, search),
    )
    .sort((a, b) => dateValue(b.createdAt) - dateValue(a.createdAt));
  const currentPage = Math.min(page, Math.max(1, Math.ceil(filtered.length / 15)));
  const user = users.find((item) => item.id === selected);
  async function moderate(action: Action) {
    if (!user || user.role === 'admin' || busy) return;
    if (
      action === 'delete' &&
      !window.confirm(
        'Permanently delete ' +
          adminPersonName(user) + ' (' + (user.phone || user.email || user.id) + ')' +
          "'s account and any published books? This cannot be undone.",
      )
    )
      return;
    if (
      action === 'suspended' &&
      !window.confirm('Suspend this account and prevent access to AfroBooks?')
    )
      return;
    setBusy(true);
    setActionError('');
    setNotice('');
    try {
      await authenticatedPost('/api/admin/moderate-user', { uid: user.id, action });
      setNotice(action === 'delete' ? 'Account deleted.' : 'Account status updated.');
      if (action === 'delete') setSelected(null);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Unable to update this account.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="admin-page">
      <AdminHeading
        title="People"
        description="Readers and authors in one place. Open a profile when an account needs attention."
      />
      <AdminError error={error} retry={retry} />
      {notice && (
        <p role="status" className="mb-5 text-sm text-[#d8edb2]">
          {notice}
        </p>
      )}
      <div className="admin-toolbar">
        <AdminSearch
          label="Search name, email, phone, or account ID"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <select
          aria-label="Account role"
          value={role}
          onChange={(event) => {
            setRole(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All roles</option>
          {Object.entries(roleLabel).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Account status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="all">All statuses</option>
          {['active', 'warned', 'suspended', 'banned'].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </div>
      <section className="admin-panel">
        {loading ? (
          <p className="admin-empty" role="status">
            Loading people…
          </p>
        ) : error ? null : (
          <>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Person</th>
                    <th>Role</th>
                    <th>Joined</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice((currentPage - 1) * 15, currentPage * 15).map((person) => (
                    <tr key={person.id}>
                      <td>
                        <div className="flex gap-3 items-center">
                          <span className="admin-avatar">{adminPersonName(person)[0]}</span>
                          <div>
                            <button
                              type="button"
                              className="admin-row-title"
                              onClick={() => {
                                setSelected(person.id);
                                setActionError('');
                                setNotice('');
                              }}
                            >
                              {adminPersonName(person)}
                            </button>
                            {person.email && <small>{person.email}</small>}
                            {person.phone && <small>{person.phone}</small>}
                            {!person.email && !person.phone && <small>Account ID: {person.id}</small>}
                          </div>
                        </div>
                      </td>
                      <td>{roleLabel[person.role] ?? person.role}</td>
                      <td className="admin-muted">
                        {dateValue(person.createdAt)
                          ? new Date(dateValue(person.createdAt)).toLocaleDateString()
                          : 'Unknown'}
                      </td>
                      <td>
                        <AdminBadge tone={person.status === 'active' ? 'good' : 'warning'}>
                          {person.status ?? 'Unknown'}
                        </AdminBadge>
                      </td>
                    </tr>
                  ))}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={4} className="admin-empty">
                        No people match your search and filters.
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
      {user && (
        <AdminDrawer busy={busy} title="Account details" onClose={() => setSelected(null)}>
          <h3 className="text-xl font-semibold">
            {adminPersonName(user)}
          </h3>
          <dl>
            <div>
              <dt>Email</dt>
              <dd>{user.email || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Phone</dt>
              <dd>{user.phone || 'Not provided'}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{roleLabel[user.role] ?? user.role}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>
                <AdminBadge>{user.status}</AdminBadge>
              </dd>
            </div>
            <div>
              <dt>Joined</dt>
              <dd>
                {dateValue(user.createdAt)
                  ? new Date(dateValue(user.createdAt)).toLocaleDateString()
                  : 'Unknown'}
              </dd>
            </div>
          </dl>
          {user.bio && <p className="text-[#c4ccbe] whitespace-pre-wrap">{user.bio}</p>}
          <p className="mt-6 text-xs text-[#a6afa3]">Account ID: {user.id}</p>
          <AdminError error={actionError} />
          {user.role === 'admin' ? (
            <p className="mt-6 text-sm text-[#a6afa3]">
              Administrator accounts are protected from moderation here.
            </p>
          ) : (
            <>
              <div className="admin-drawer-actions">
                {['warned', 'suspended'].includes(user.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    className="admin-primary"
                    onClick={() => moderate('active')}
                  >
                    Restore active status
                  </button>
                )}
                {user.status === 'active' && (
                  <button
                    type="button"
                    disabled={busy}
                    className="admin-secondary"
                    onClick={() => moderate('warned')}
                  >
                    Mark as warned
                  </button>
                )}
                {['active', 'warned'].includes(user.status) && (
                  <button
                    type="button"
                    disabled={busy}
                    className="admin-secondary"
                    onClick={() => moderate('suspended')}
                  >
                    Suspend account
                  </button>
                )}
              </div>
              <button
                type="button"
                disabled={busy}
                className="admin-danger"
                onClick={() => moderate('delete')}
              >
                Delete account permanently
              </button>
            </>
          )}
        </AdminDrawer>
      )}
    </main>
  );
}
