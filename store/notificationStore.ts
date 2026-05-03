import { create } from 'zustand';
import type { Notification } from '@/types/review';

interface NotificationState {
  notifications: Notification[];
  panelOpen: boolean;
  setNotifications: (notifications: Notification[]) => void;
  setPanelOpen: (open: boolean) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  unreadCount: () => number;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  panelOpen: false,
  setNotifications: (notifications) => set({ notifications }),
  setPanelOpen: (open) => set({ panelOpen: open }),
  markRead: (id) =>
    set({
      notifications: get().notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      ),
    }),
  markAllRead: () =>
    set({ notifications: get().notifications.map((n) => ({ ...n, isRead: true })) }),
  unreadCount: () => get().notifications.filter((n) => !n.isRead).length,
}));
