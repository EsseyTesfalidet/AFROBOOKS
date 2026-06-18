'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNotificationStore } from '@/store/notificationStore';
import { useAuthStore } from '@/store/authStore';
import { subscribeToNotifications } from '@/lib/firebase/firestore';
import NotificationPanel from './NotificationPanel';

export default function NotificationBell() {
  const { panelOpen, setPanelOpen, setNotifications, unreadCount } = useNotificationStore();
  const userProfile = useAuthStore((s) => s.userProfile);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isMobile, setIsMobile] = useState(false);
  const count = unreadCount();

  useEffect(() => {
    if (!userProfile?.uid) return;
    const unsub = subscribeToNotifications(userProfile.uid, setNotifications);
    return unsub;
  }, [userProfile?.uid]);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Desktop: close on outside click
  useEffect(() => {
    if (isMobile || !panelOpen) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setPanelOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [panelOpen, isMobile]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setPanelOpen(!panelOpen)}
        className="icon-button relative flex h-8 w-8 items-center justify-center rounded-lg"
      >
        <Bell size={18} />
        {count > 0 && (
          <span
            className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full text-xs font-bold"
            style={{ background: '#e8442a', color: '#fff', fontSize: 10 }}
          >
            {count > 9 ? '9+' : count}
          </span>
        )}
      </button>

      {panelOpen && (
        <NotificationPanel
          isMobile={isMobile}
          onClose={() => setPanelOpen(false)}
        />
      )}
    </div>
  );
}
