'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { markNotificationRead, markAllNotificationsRead } from '@/lib/firebase/firestore';
import { useAuthStore } from '@/store/authStore';
import NotificationItem from './NotificationItem';

interface Props {
  onClose: () => void;
  isMobile: boolean;
}

export default function NotificationPanel({ onClose, isMobile }: Props) {
  const [tab, setTab] = useState<'all' | 'unread'>('all');
  const { notifications, markRead, markAllRead } = useNotificationStore();
  const userProfile = useAuthStore((s) => s.userProfile);

  // Entry animation: start offscreen above, slide down after mount
  const [visible, setVisible] = useState(false);
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  // Swipe-up-to-dismiss on mobile (vertical, on panel)
  const startY = useRef(0);
  const startX = useRef(0);
  const [dragY, setDragY] = useState(0);
  const dragging = useRef(false);

  function onPanelTouchStart(e: React.TouchEvent) {
    startY.current = e.touches[0].clientY;
    startX.current = e.touches[0].clientX;
    dragging.current = true;
  }
  function onPanelTouchMove(e: React.TouchEvent) {
    if (!dragging.current) return;
    const dy = e.touches[0].clientY - startY.current;
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dy) > Math.abs(dx) && dy < 0) setDragY(dy);
  }
  function onPanelTouchEnd() {
    dragging.current = false;
    if (dragY < -80) { onClose(); }
    setDragY(0);
  }

  // Swipe-to-switch-tabs (horizontal, on list area)
  const tabStartX = useRef(0);
  const tabStartY = useRef(0);
  const [tabSwipeX, setTabSwipeX] = useState(0);

  function onListTouchStart(e: React.TouchEvent) {
    tabStartX.current = e.touches[0].clientX;
    tabStartY.current = e.touches[0].clientY;
  }
  function onListTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - tabStartX.current;
    const dy = e.touches[0].clientY - tabStartY.current;
    if (Math.abs(dx) > Math.abs(dy)) {
      setTabSwipeX(dx);
      e.stopPropagation();
    }
  }
  function onListTouchEnd() {
    if (tabSwipeX < -60 && tab === 'all') setTab('unread');
    else if (tabSwipeX > 60 && tab === 'unread') setTab('all');
    setTabSwipeX(0);
  }

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

  if (isMobile) {
    return (
      <>
        {/* Backdrop */}
        <div
          className="fixed inset-0 z-50 bg-black/60"
          style={{ backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        />
        {/* Top sheet */}
        <div
          className="fixed left-0 right-0 top-0 z-50 rounded-b-2xl flex flex-col"
          style={{
            background: '#111',
            borderBottom: '1px solid #222',
            maxHeight: '80vh',
            paddingTop: 'env(safe-area-inset-top)',
            transform: dragging.current ? `translateY(${dragY}px)` : visible ? 'translateY(0)' : 'translateY(-100%)',
            transition: dragging.current ? 'none' : 'transform 0.3s cubic-bezier(0.32,0.72,0,1)',
          }}
          onTouchStart={onPanelTouchStart}
          onTouchMove={onPanelTouchMove}
          onTouchEnd={onPanelTouchEnd}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 flex-shrink-0" style={{ paddingTop: '16px' }}>
            <h3 className="font-display text-lg text-white">Notifications</h3>
            <div className="flex items-center gap-3">
              <button type="button" onClick={handleMarkAll} className="text-xs" style={{ color: '#f5b800' }}>
                Mark all read
              </button>
              <button type="button" title="Close" onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded-lg"
                style={{ color: '#666' }}>
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex px-5 gap-4 flex-shrink-0" style={{ borderBottom: '1px solid #1a1a1a' }}>
            {(['all', 'unread'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setTab(t)}
                className="text-sm pb-2.5 capitalize transition-colors"
                style={{ color: tab === t ? '#f5f2eb' : '#666', borderBottom: tab === t ? '2px solid #e8442a' : '2px solid transparent' }}>
                {t}
              </button>
            ))}
          </div>

          {/* List — horizontal swipe switches tabs */}
          <div
            className="overflow-y-auto flex-1"
            onTouchStart={onListTouchStart}
            onTouchMove={onListTouchMove}
            onTouchEnd={onListTouchEnd}
            style={{
              transform: `translateX(${tabSwipeX * 0.15}px)`,
              transition: tabSwipeX === 0 ? 'transform 0.2s ease' : 'none',
            }}
          >
            {recent.length === 0
              ? <p className="text-center text-sm text-[#444] py-10">No notifications</p>
              : recent.map((n) => <NotificationItem key={n.id} notification={n} onRead={handleMarkRead} />)}
          </div>

          {/* Footer */}
          <div className="px-5 py-4 flex-shrink-0" style={{ borderTop: '1px solid #1a1a1a' }}>
            <Link href="/notifications" onClick={onClose} className="text-xs" style={{ color: '#aaa' }}>
              View all notifications →
            </Link>
          </div>

          {/* Swipe-up hint */}
          <div className="flex justify-center pb-3 flex-shrink-0">
            <div className="w-10 h-1 rounded-full" style={{ background: '#333' }} />
          </div>
        </div>
      </>
    );
  }

  // Desktop dropdown
  return (
    <div
      className="absolute right-0 top-10 w-80 rounded-xl border shadow-2xl z-50"
      style={{ background: '#111', borderColor: '#222' }}
    >
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h3 className="font-display text-lg text-white">Notifications</h3>
        <button type="button" onClick={handleMarkAll} className="text-xs" style={{ color: '#f5b800' }}>
          Mark all read
        </button>
      </div>

      <div className="flex px-4 gap-3 mb-2">
        {(['all', 'unread'] as const).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className="text-sm pb-1 capitalize transition-colors"
            style={{ color: tab === t ? '#f5f2eb' : '#666', borderBottom: tab === t ? '2px solid #e8442a' : '2px solid transparent' }}>
            {t}
          </button>
        ))}
      </div>

      <div className="max-h-72 overflow-y-auto">
        {recent.length === 0
          ? <p className="text-center text-sm text-[#444] py-8">No notifications</p>
          : recent.map((n) => <NotificationItem key={n.id} notification={n} onRead={handleMarkRead} />)}
      </div>

      <div className="px-4 py-3 border-t" style={{ borderColor: '#1a1a1a' }}>
        <Link href="/notifications" onClick={onClose} className="text-xs text-[#aaa] hover:text-white transition-colors">
          View all notifications
        </Link>
      </div>
    </div>
  );
}
