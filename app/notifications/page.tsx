'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { subscribeToNotifications, markNotificationRead, markAllNotificationsRead } from '@/lib/firebase/firestore';
import type { Notification } from '@/types/review';

export default function NotificationsPage() {
  const router = useRouter();
  const userProfile = useAuthStore((s) => s.userProfile);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeToNotifications(userProfile.uid, (notifs) => {
      setNotifications(notifs);
      setLoading(false);
    });
    return unsub;
  }, [userProfile?.uid]);

  async function handleRead(id: string) {
    await markNotificationRead(id);
  }

  async function handleMarkAll() {
    if (!userProfile?.uid) return;
    await markAllNotificationsRead(userProfile.uid);
  }

  const typeIcon: Record<string, string> = {
    purchase: '🛒',
    payout: '💰',
    review_reply: '💬',
    new_chapter: '📖',
    promo: '🎁',
    reading_reminder: '📚',
    sale: '📈',
    new_review: '⭐',
    low_rating: '⚠️',
    milestone: '🏆',
    follower: '👤',
    system: '🔔',
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="font-display text-display-lg text-white">Notifications</h1>
            {unreadCount > 0 && <p className="text-sm text-[#555] mt-0.5">{unreadCount} unread</p>}
          </div>
          {unreadCount > 0 && (
            <button type="button" onClick={handleMarkAll}
              className="text-sm text-[#e8442a] hover:text-[#c73520]">
              Mark all read
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-16"><LoadingSpinner size={32} /></div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-[#444] text-sm">No notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={async () => {
                  if (!n.isRead) await handleRead(n.id);
                  if (n.actionUrl) router.push(n.actionUrl);
                }}
                className="w-full text-left p-4 rounded-xl border transition-colors"
                style={{
                  background: n.isRead ? '#0e0e0e' : '#111',
                  borderColor: n.isRead ? '#111' : '#1a1a1a',
                }}>
                <div className="flex gap-3">
                  <span className="text-lg flex-shrink-0 mt-0.5">{typeIcon[n.type] ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm font-medium ${n.isRead ? 'text-[#aaa]' : 'text-white'}`}>{n.title}</p>
                      {!n.isRead && <div className="w-2 h-2 rounded-full flex-shrink-0 mt-1.5" style={{ background: '#e8442a' }} />}
                    </div>
                    <p className="text-xs text-[#555] mt-0.5">{n.message}</p>
                    <p className="text-xs text-[#333] mt-1.5">{n.createdAt?.toDate?.()?.toLocaleDateString?.()}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
