'use client';

import { useRouter } from 'next/navigation';
import {
  ShoppingBag, MessageSquare, BookOpen, Tag, Bell,
  DollarSign, Star, TrendingUp, Users, Info,
} from 'lucide-react';
import type { Notification } from '@/types/review';

const TYPE_ICONS: Record<string, React.ElementType> = {
  purchase: ShoppingBag,
  review_reply: MessageSquare,
  new_chapter: BookOpen,
  promo: Tag,
  reading_reminder: Bell,
  sale: DollarSign,
  payout: DollarSign,
  new_review: Star,
  low_rating: Star,
  milestone: TrendingUp,
  follower: Users,
  system: Info,
};

const TYPE_COLORS: Record<string, string> = {
  purchase: '#4ade80',
  sale: '#4ade80',
  payout: '#4ade80',
  review_reply: '#0ea5e9',
  new_chapter: '#0ea5e9',
  promo: '#f5b800',
  reading_reminder: '#f5b800',
  new_review: '#f5b800',
  low_rating: '#e8442a',
  milestone: '#7c3aed',
  follower: '#7c3aed',
  system: '#aaa',
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
}

export default function NotificationItem({ notification, onRead }: Props) {
  const router = useRouter();
  const Icon = TYPE_ICONS[notification.type] ?? Bell;
  const color = TYPE_COLORS[notification.type] ?? '#aaa';
  const date = notification.createdAt?.toDate?.() ?? new Date();

  function handleClick() {
    if (!notification.isRead) onRead(notification.id);
    if (notification.actionUrl) router.push(notification.actionUrl);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[#161616]"
      style={{
        background: notification.isRead ? 'transparent' : '#14110a',
        borderLeft: notification.isRead ? 'none' : '3px solid #e8442a',
      }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}22` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[#f5f2eb] leading-snug">{notification.message}</p>
        <p className="text-xs text-[#555] mt-0.5">{timeAgo(date)}</p>
      </div>
      {!notification.isRead && (
        <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ background: '#e8442a' }} />
      )}
    </button>
  );
}
