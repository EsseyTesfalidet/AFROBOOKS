'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { BellRing, BookOpen, CheckCheck, Clock3, Sparkles } from 'lucide-react';
import BuyerHeader from '@/components/buyer/BuyerHeader';
import ContinueReadingShelf from '@/components/buyer/ContinueReadingShelf';
import ReaderMomentum from '@/components/buyer/ReaderMomentum';
import LoadingSpinner from '@/components/shared/LoadingSpinner';
import { useAuthStore } from '@/store/authStore';
import { markAllNotificationsRead, markNotificationRead, subscribeToNotifications } from '@/lib/firebase/firestore';
import type { Notification } from '@/types/review';

type NotificationsTab = 'overview' | 'unread' | 'all';

const TYPE_ICON: Record<string, string> = {
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

export default function NotificationsPage() {
  const router = useRouter();
  const userProfile = useAuthStore((state) => state.userProfile);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<NotificationsTab>('overview');

  useEffect(() => {
    if (!userProfile?.uid) {
      setLoading(false);
      return;
    }
    const unsubscribe = subscribeToNotifications(userProfile.uid, (items) => {
      setNotifications(items);
      setLoading(false);
    });
    return unsubscribe;
  }, [userProfile?.uid]);

  async function handleRead(id: string) {
    await markNotificationRead(id);
  }

  async function handleMarkAll() {
    if (!userProfile?.uid) return;
    await markAllNotificationsRead(userProfile.uid);
  }

  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.isRead),
    [notifications]
  );
  const reminderNotifications = useMemo(
    () =>
      notifications.filter(
        (notification) =>
          notification.type === 'reading_reminder' || notification.type === 'new_chapter'
      ),
    [notifications]
  );
  const weeklyActivity = useMemo(
    () =>
      notifications.filter((notification) => {
        const createdAt = notification.createdAt?.toDate?.();
        if (!createdAt) return false;
        return Date.now() - createdAt.getTime() <= 1000 * 60 * 60 * 24 * 7;
      }).length,
    [notifications]
  );

  const feed =
    tab === 'overview'
      ? notifications.slice(0, 8)
      : tab === 'unread'
        ? unreadNotifications
        : notifications;

  return (
    <div className="min-h-screen bg-[#0e0e0e]">
      <BuyerHeader />
      <main className="mx-auto max-w-5xl px-4 py-6 space-y-8">
        <section
          className="surface-panel rounded-[28px] p-5 sm:p-6"
          style={{
            background:
              'radial-gradient(circle at top right, rgba(14,165,233,0.18), transparent 34%), linear-gradient(180deg, #151515 0%, #101010 100%)',
          }}
        >
          <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.24em]" style={{ color: '#666' }}>
                Re-engagement center
              </p>
              <h1 className="mt-2 font-display text-display-lg text-white">Notifications that pull you back in</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: '#777' }}>
                Reading reminders, fresh releases, and account updates now live alongside your momentum feed.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3 sm:w-[320px]">
              {[
                { label: 'Unread', value: unreadNotifications.length, icon: BellRing, accent: '#e8442a' },
                { label: 'Reminders', value: reminderNotifications.length, icon: BookOpen, accent: '#7c3aed' },
                { label: 'This week', value: weeklyActivity, icon: Clock3, accent: '#0ea5e9' },
              ].map(({ label, value, icon: Icon, accent }) => (
                <div
                  key={label}
                  className="surface-panel-muted rounded-2xl p-3"
                >
                  <Icon size={16} style={{ color: accent }} />
                  <p className="mt-3 text-lg font-semibold text-white">{value}</p>
                  <p className="mt-1 text-xs" style={{ color: '#666' }}>
                    {label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {userProfile ? (
          <>
            <ReaderMomentum
              userId={userProfile.uid}
              favoriteGenre={userProfile.favoriteGenre || 'Fiction'}
              subscriptionActive={userProfile.subscriptionStatus === 'active'}
            />
            <ContinueReadingShelf userId={userProfile.uid} />
          </>
        ) : null}

        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              {([
                { id: 'overview', label: 'Overview' },
                { id: 'unread', label: 'Unread' },
                { id: 'all', label: 'All activity' },
              ] as const).map((item) => {
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTab(item.id)}
                    className="rounded-full px-4 py-2 text-sm font-medium"
                    style={{
                      background: active ? '#f5f2eb' : 'rgba(255,255,255,0.04)',
                      color: active ? '#000' : '#aaa',
                      border: `1px solid ${active ? '#f5f2eb' : 'rgba(255,255,255,0.08)'}`,
                    }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              {unreadNotifications.length > 0 ? (
                <button
                  type="button"
                  onClick={handleMarkAll}
                  className="button-secondary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium"
                >
                  <CheckCheck size={16} />
                  Mark all read
                </button>
              ) : null}
              <Link href="/profile/preferences" className="text-xs transition-colors hover:text-white" style={{ color: '#666' }}>
                Notification settings →
              </Link>
            </div>
          </div>

          {tab === 'overview' ? (
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                {
                  title: unreadNotifications.length > 0 ? 'Unread activity waiting' : 'Inbox under control',
                  body:
                    unreadNotifications.length > 0
                      ? `${unreadNotifications.length} notifications still need attention.`
                      : 'Nothing urgent right now. Good time to keep reading.',
                  href: unreadNotifications[0]?.actionUrl ?? '/library',
                  accent: '#e8442a',
                },
                {
                  title: userProfile?.notificationPreferences.weeklyDigest ? 'Weekly digest enabled' : 'Weekly digest is off',
                  body: userProfile?.notificationPreferences.weeklyDigest
                    ? 'You will keep getting roundup updates automatically.'
                    : 'Turn on weekly digest to bring readers back every week.',
                  href: '/profile/preferences',
                  accent: '#0ea5e9',
                },
                {
                  title: reminderNotifications.length > 0 ? 'Reading reminders active' : 'No reminder pressure',
                  body: reminderNotifications.length > 0
                    ? `${reminderNotifications.length} reminders or new chapter alerts recently landed.`
                    : 'When reminders start firing, they will show up here.',
                  href: '/library',
                  accent: '#7c3aed',
                },
              ].map((card) => (
                <Link
                  key={card.title}
                  href={card.href}
                  className="surface-panel-muted rounded-2xl p-4 transition-transform hover:-translate-y-0.5"
                >
                  <span
                    className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                    style={{ background: `${card.accent}22`, color: card.accent }}
                  >
                    Overview
                  </span>
                  <p className="mt-3 text-base font-semibold text-white">{card.title}</p>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: '#666' }}>
                    {card.body}
                  </p>
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-display text-display-sm text-white">
                {tab === 'overview' ? 'Latest activity' : tab === 'unread' ? 'Unread notifications' : 'All notifications'}
              </h2>
              <p className="text-sm" style={{ color: '#666' }}>
                {feed.length} item{feed.length === 1 ? '' : 's'} in view.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <LoadingSpinner size={36} />
            </div>
          ) : feed.length === 0 ? (
            <div className="empty-state-card rounded-3xl px-4 py-14 text-center">
              <p className="text-sm" style={{ color: '#666' }}>
                You have no notifications yet.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {feed.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={async () => {
                    if (!notification.isRead) {
                      await handleRead(notification.id);
                    }
                    if (notification.actionUrl) {
                      router.push(notification.actionUrl);
                    }
                  }}
                  className="w-full rounded-2xl border p-4 text-left transition-colors"
                  style={{
                    background: notification.isRead
                      ? 'linear-gradient(180deg, rgba(18,18,20,0.94) 0%, rgba(13,13,15,0.98) 100%)'
                      : 'radial-gradient(circle at top right, rgba(232,68,42,0.12), transparent 40%), linear-gradient(180deg, rgba(22,18,18,0.98) 0%, rgba(13,13,15,0.98) 100%)',
                    borderColor: notification.isRead ? 'rgba(255,255,255,0.06)' : 'rgba(232,68,42,0.16)',
                    boxShadow: notification.isRead ? '0 14px 28px rgba(0,0,0,0.16)' : '0 16px 32px rgba(232,68,42,0.08)',
                  }}
                >
                  <div className="flex gap-3">
                    <span className="mt-0.5 text-lg">{TYPE_ICON[notification.type] ?? '🔔'}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className={`text-sm font-medium ${notification.isRead ? 'text-[#bbb]' : 'text-white'}`}>
                            {notification.title}
                          </p>
                          <p className="mt-1 text-xs leading-relaxed" style={{ color: '#666' }}>
                            {notification.message}
                          </p>
                        </div>
                        {!notification.isRead ? (
                          <span className="mt-1 h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: '#e8442a' }} />
                        ) : null}
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <p className="text-[11px]" style={{ color: '#444' }}>
                          {notification.createdAt?.toDate?.()?.toLocaleDateString?.()}
                        </p>
                        {notification.actionUrl ? (
                          <span className="text-[11px] font-medium" style={{ color: '#888' }}>
                            Open →
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
