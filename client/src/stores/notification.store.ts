import { create } from 'zustand';
import { getApi } from '../services/api';
import { Notification, API_ROUTES } from '@ncdss/shared';

interface NotificationStore {
  notifications: Notification[];
  unreadCount: number;
  isLoading: boolean;
  lastFetched: Date | null;

  fetchNotifications: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  clearNotifications: () => void;
}

let pollingInterval: ReturnType<typeof setInterval> | null = null;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isLoading: false,
  lastFetched: null,

  fetchNotifications: async () => {
    try {
      const api = await getApi();
      set({ isLoading: true });
      const response = await api.get(API_ROUTES.notifications.list, { params: { limit: 20 } });
      set({ notifications: response.data, lastFetched: new Date() });
    } catch {
      // Silently fail - polling will retry
    } finally {
      set({ isLoading: false });
    }
  },

  fetchUnreadCount: async () => {
    try {
      const api = await getApi();
      const response = await api.get(API_ROUTES.notifications.unreadCount);
      set({ unreadCount: response.data.count });
    } catch {
      // Silently fail - polling will retry
    }
  },

  markAsRead: async (id: string) => {
    try {
      const api = await getApi();
      await api.put(API_ROUTES.notifications.markRead(id));
      set((state) => ({
        notifications: state.notifications.map((n) =>
          n.id === id ? { ...n, isRead: true, readAt: new Date().toISOString() } : n
        ),
        unreadCount: Math.max(0, state.unreadCount - 1),
      }));
    } catch {
      // Revert on failure by refetching
      get().fetchNotifications();
      get().fetchUnreadCount();
    }
  },

  markAllAsRead: async () => {
    try {
      const api = await getApi();
      await api.put(API_ROUTES.notifications.markAllRead);
      set((state) => ({
        notifications: state.notifications.map((n) => ({
          ...n,
          isRead: true,
          readAt: n.readAt || new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
    } catch {
      get().fetchNotifications();
      get().fetchUnreadCount();
    }
  },

  deleteNotification: async (id: string) => {
    try {
      const api = await getApi();
      await api.delete(API_ROUTES.notifications.remove(id));
      set((state) => {
        const removed = state.notifications.find((n) => n.id === id);
        return {
          notifications: state.notifications.filter((n) => n.id !== id),
          unreadCount: removed && !removed.isRead
            ? Math.max(0, state.unreadCount - 1)
            : state.unreadCount,
        };
      });
    } catch {
      get().fetchNotifications();
      get().fetchUnreadCount();
    }
  },

  startPolling: () => {
    if (pollingInterval) return;
    // Fetch immediately
    get().fetchNotifications();
    get().fetchUnreadCount();
    // Then poll unread count every 15 seconds
    pollingInterval = setInterval(() => {
      get().fetchUnreadCount();
    }, 15000);
  },

  stopPolling: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
  },

  clearNotifications: () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      pollingInterval = null;
    }
    set({ notifications: [], unreadCount: 0, isLoading: false, lastFetched: null });
  },
}));
