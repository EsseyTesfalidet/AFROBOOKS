'use client';

import { useEffect, useState } from 'react';
import AdminSidebar from '@/components/admin/AdminSidebar';
import StatusPill from '@/components/shared/StatusPill';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { db } from '@/lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';
import type { User } from '@/types/user';

type ModerationAction = 'active' | 'warned' | 'suspended' | 'delete';

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [filtered, setFiltered] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  useEffect(() => {
    getDocs(collection(db, 'users')).then((snap) => {
      const all = snap.docs.map((d) => d.data() as User);
      setUsers(all);
      setFiltered(all);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    let res = users;
    if (search) res = res.filter((u) => u.email.toLowerCase().includes(search.toLowerCase()) || `${u.firstName} ${u.lastName}`.toLowerCase().includes(search.toLowerCase()));
    if (roleFilter !== 'all') res = res.filter((u) => u.role === roleFilter);
    if (statusFilter !== 'all') res = res.filter((u) => u.status === statusFilter);
    setFiltered(res);
  }, [search, roleFilter, statusFilter, users]);

  async function updateStatus(user: User, action: ModerationAction) {
    const isDelete = action === 'delete';
    const confirmed =
      !isDelete ||
      window.confirm(
        `Permanently delete ${user.firstName} ${user.lastName}'s account${user.role === 'seller' || user.role === 'both' ? ' and all of their books' : ''}?`
      );

    if (!confirmed) {
      return;
    }

    setPendingUserId(user.uid);

    try {
      const response = await fetch('/api/admin/moderate-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uid: user.uid, action }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error ?? 'Unable to update account moderation.');
      }

      if (action === 'delete') {
        setUsers((prev) => prev.filter((item) => item.uid !== user.uid));
        return;
      }

      setUsers((prev) =>
        prev.map((item) => (item.uid === user.uid ? { ...item, status: action } : item))
      );
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Unable to update account moderation.');
    } finally {
      setPendingUserId(null);
    }
  }

  const statusActions: Record<User['status'], { label: string; action: ModerationAction }[]> = {
    active: [{ label: 'Warn', action: 'warned' }, { label: 'Disable', action: 'suspended' }, { label: 'Delete', action: 'delete' }],
    warned: [{ label: 'Disable', action: 'suspended' }, { label: 'Delete', action: 'delete' }],
    suspended: [{ label: 'Restore', action: 'active' }, { label: 'Delete', action: 'delete' }],
    banned: [{ label: 'Delete', action: 'delete' }],
  };

  return (
    <div className="flex min-h-screen bg-[#0e0e0e]">
      <AdminSidebar />
      <main className="flex-1 px-4 md:px-6 py-7">
        <h1 className="font-display text-display-lg text-white mb-5">Users</h1>

        <div className="flex flex-wrap gap-2 mb-5">
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="flex-1 min-w-[180px] px-3.5 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }} />
          <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Roles</option>
            <option value="buyer">Reader</option>
            <option value="seller">Author</option>
            <option value="both">Reader + Author</option>
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2.5 rounded-lg border text-sm" style={{ background: '#1a1a1a', borderColor: '#333', color: '#f5f2eb' }}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="warned">Warned</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div>
        ) : (
          <div className="rounded-xl border overflow-x-auto" style={{ background: '#111', borderColor: '#1a1a1a' }}>
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #1a1a1a' }}>
                  {['User', 'Role', 'Joined', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[#555] uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((user) => (
                  <tr key={user.uid} style={{ borderBottom: '1px solid #111' }}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-white">{user.firstName} {user.lastName}</p>
                      <p className="text-xs text-[#555]">{user.email}</p>
                    </td>
                    <td className="px-4 py-3"><StatusPill status={user.role} /></td>
                    <td className="px-4 py-3 text-[#555] text-xs">{user.createdAt?.toDate?.()?.toLocaleDateString?.()}</td>
                    <td className="px-4 py-3"><StatusPill status={user.status} /></td>
                    <td className="px-4 py-3">
                      {user.role === 'admin' ? (
                        <span className="text-xs text-[#666]">Protected account</span>
                      ) : (
                        <div className="flex gap-2">
                          {(statusActions[user.status] ?? []).map(({ label, action }) => (
                            <button
                              key={label}
                              type="button"
                              disabled={pendingUserId === user.uid}
                              onClick={() => updateStatus(user, action)}
                              className="text-xs px-2.5 py-1 rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                              style={action === 'delete'
                                ? { borderColor: '#e8442a', color: '#e8442a' }
                                : { borderColor: '#333', color: '#aaa' }}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-[#444]">No users found.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
