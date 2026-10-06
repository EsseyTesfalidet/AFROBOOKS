'use client';

import { useRouter } from 'next/navigation';
import {
  ShoppingBag, MessageSquare, BookOpen, Tag, Bell,
  DollarSign, Star, TrendingUp, Users, Info,
} from 'lucide-react';
import type { Notification } from '@/types/review';
import DeleteNotificationButton from './DeleteNotificationButton';

const TYPE_ICONS: Record<string, React.ElementType> = {
  purchase: ShoppingBag, review_reply: MessageSquare, new_chapter: BookOpen,
  promo: Tag, reading_reminder: Bell, sale: DollarSign, payout: DollarSign,
  new_review: Star, low_rating: Star, milestone: TrendingUp, follower: Users, system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  purchase: '#4ade80', sale: '#4ade80', payout: '#4ade80',
  review_reply: '#0ea5e9', new_chapter: '#0ea5e9',
  promo: '#f5b800', reading_reminder: '#f5b800', new_review: '#f5b800',
  low_rating: '#e8442a', milestone: '#7c3aed', follower: '#7c3aed', system: '#aaa',
};

function timeAgo(date: Date): string {
  const diff = (Date.now() - date.getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface Props {
  notification: Notification;
  onRead: (id: string) => void;
  onError: (message: string) => void;
}

export default function NotificationItem({ notification, onRead, onError }: Props) {
  const router = useRouter();
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const color = TYPE_COLORS[notification.type] ?? '#aaa';
  const date = notification.createdAt?.toDate?.() ?? new Date();

  function handleClick() {
    if (!notification.isRead) onRead(notification.id);
    if (notification.actionUrl) router.push(notification.actionUrl);
  }

  return (
    <div
      className="mx-3 my-2 flex w-[calc(100%-1.5rem)] items-start gap-3 rounded-2xl border px-4 py-3 text-left transition-colors"
      style={{
        background: notification.isRead
          ? 'var(--app-field, linear-gradient(180deg, rgba(20,20,22,0.84) 0%, rgba(14,14,16,0.9) 100%))'
          : 'var(--app-accent-surface, radial-gradient(circle at top right, rgba(232,68,42,0.12), transparent 40%), linear-gradient(180deg, rgba(30,22,18,0.96) 0%, rgba(16,14,14,0.98) 100%))',
        borderColor: notification.isRead ? 'var(--app-line, rgba(255,255,255,0.06))' : 'rgba(232,68,42,0.28)',
        boxShadow: notification.isRead ? '0 10px 22px rgba(0,0,0,0.14)' : '0 14px 28px rgba(232,68,42,0.08)',
      }}
    >
      <button type="button" onClick={handleClick} className="flex min-w-0 flex-1 items-start gap-3 text-left">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}22` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug text-[#f5f2eb]">{notification.message}</p>
        <p className="mt-1 text-xs text-[#6f6f78]">{timeAgo(date)}</p>
      </div>
      {!notification.isRead && (
        <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: 'var(--app-action, #e8442a)' }} />
      )}
      </button>
      <DeleteNotificationButton id={notification.id} title={notification.title} onError={onError} />
    </div>
  );
}
