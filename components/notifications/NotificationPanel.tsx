'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useNotificationStore } from '@/store/notificationStore';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import NotificationItem from './NotificationItem';

export default function NotificationPanel() {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const { notifications, markRead, markAllRead } = useNotificationStore();
  const userProfile = useAuthStore((s) => s.userProfile);

  const filtered = tab === 'unread' ? notifications.filter((n) => !n.isRead) : notifications;
  const recent = filtered.slice(0, 10);

  async function handleMarkRead(id: string) {
    markRead(id);
    await markNotificationRead(id);
  }

  async function handleMarkAll() {
    if (!userProfile?.uid) return;
    markAllRead();
    await markAllNotificationsRead(userProfile.uid);
  }

  return (
    <div
      className="absolute right-0 top-10 w-80 rounded-xl border shadow-2xl z-50"
      style={{ background: '#111', borderColor: '#222' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h3 className="font-display text-lg text-white">Notifications</h3>
        <button
          type="button"
          onClick={handleMarkAll}
          className="text-xs text-[#f5b800] hover:underline"
        >
          Mark all read
        </button>
      </div>

      {/* Tabs */}
      <div className="flex px-4 gap-3 mb-2">
        {(['all', 'unread'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="text-sm pb-1 capitalize transition-colors"
            style={{
              color: tab === t ? '#f5f2eb' : '#666',
              borderBottom: tab === t ? '2px solid #e8442a' : '2px solid transparent',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="max-h-72 overflow-y-auto">
        {recent.length === 0 ? (
          <p className="text-center text-sm text-[#444] py-8">No notifications</p>
        ) : (
          recent.map((n) => (
            <NotificationItem key={n.id} notification={n} onRead={handleMarkRead} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t" style={{ borderColor: '#1a1a1a' }}>
        <Link
          href="/notifications"
          className="text-xs text-[#aaa] hover:text-white transition-colors"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}
