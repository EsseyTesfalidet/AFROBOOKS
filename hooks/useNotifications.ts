'use client';

import { useEffect } from 'react';
import {
  subscribeToNotifications,
  markNotificationRead,
  markAllNotificationsRead,
} from '@/lib/firebase/firestore';
import { useNotificationStore } from '@/store/notificationStore';

export function useNotifications(userId: string | null) {
  const { setNotifications, markRead, markAllRead, unreadCount } = useNotificationStore();

  useEffect(() => {
    if (!userId) return;
    const unsubscribe = subscribeToNotifications(userId, setNotifications);
    return unsubscribe;
  }, [userId]);

  async function handleMarkRead(notificationId: string) {
    markRead(notificationId);
    await markNotificationRead(notificationId);
  }

  async function handleMarkAllRead() {
    if (!userId) return;
    markAllRead();
    await markAllNotificationsRead(userId);
  }

  return {
    notifications: useNotificationStore.getState().notifications,
    unreadCount: unreadCount(),
    markRead: handleMarkRead,
    markAllRead: handleMarkAllRead,
  };
}
