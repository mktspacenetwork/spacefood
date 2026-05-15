import { createContext, useContext, useState, useEffect, useRef, useCallback, ReactNode } from "react";
import { api } from "../lib/api";

const LS_READ_KEY = (id: string) => `sf:notifs:read:${id}`;
const LS_DISMISSED_KEY = (id: string) => `sf:notifs:dismissed:${id}`;

function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch { /* quota exceeded */ }
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  type: "info" | "alert" | "order" | "promo";
  sentAt: string;
  sentByName?: string;
  read: boolean;
  targetUserId?: string;
}

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissNotification: (id: string) => void;
  dismissAllNotifications: () => void;
  /** Called by the auth layer to tell us who the current user is */
  setUserId: (id: string | null) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const prevIdsRef = useRef<Set<string>>(new Set());
  const mountedRef = useRef(false);
  const userIdRef = useRef<string | null>(null);

  // Keep userIdRef in sync
  useEffect(() => { userIdRef.current = userId; }, [userId]);

  const getDismissedIds = useCallback((uid: string): Set<string> => {
    return new Set(lsGet<string[]>(LS_DISMISSED_KEY(uid), []));
  }, []);

  const fetchNotifications = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    try {
      const apiNotifs = await api.authGet("/notifications").catch(() => []);
      const validNotifs = Array.isArray(apiNotifs) ? apiNotifs : [];
      
      const readIds = lsGet<string[]>(LS_READ_KEY(uid), []);
      const readSet = new Set<string>(readIds);
      const dismissedSet = getDismissedIds(uid);

      const newNotifs: AppNotification[] = validNotifs
        .filter((n: any) => !dismissedSet.has(n.id))
        .map((n: any) => ({
          ...n,
          read: readSet.has(n.id)
        }));

      // Check for new unread for browser notification
      if (mountedRef.current) {
        const newUnread = newNotifs.filter(
          (n) => !n.read && !prevIdsRef.current.has(n.id)
        );
        if (
          newUnread.length > 0 &&
          "Notification" in window &&
          Notification.permission === "granted" &&
          "serviceWorker" in navigator
        ) {
          navigator.serviceWorker.ready.then((reg) => {
            newUnread.slice(0, 3).forEach((n) => {
              reg.showNotification(n.title, {
                body: n.message,
                icon: "/icon-192.png",
                badge: "/icon-192.png",
                tag: n.id,
              });
            });
          }).catch(() => {
            newUnread.slice(0, 3).forEach((n) => {
              new Notification(n.title, {
                body: n.message,
                icon: "/icon-192.png",
                tag: n.id,
              });
            });
          });
        }
      }

      prevIdsRef.current = new Set(newNotifs.map((n) => n.id));
      setNotifications(newNotifs);
    } catch (e) {
      console.error("Failed to fetch notifications", e);
    } finally {
      setLoading(false);
    }
  }, [getDismissedIds]);

  useEffect(() => {
    // Request permission on mount
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    if (!userId) {
      setNotifications([]);
      return;
    }
    setLoading(true);
    mountedRef.current = false;
    fetchNotifications().then(() => {
      mountedRef.current = true;
    });

    const interval = setInterval(fetchNotifications, 30_000);
    return () => clearInterval(interval);
  }, [userId, fetchNotifications]);

  const markRead = useCallback((id: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
    const key = LS_READ_KEY(uid);
    const readIds = lsGet<string[]>(key, []);
    if (!readIds.includes(id)) {
      lsSet(key, [...readIds, id]);
    }
  }, []);

  const markAllRead = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    setNotifications((prev) => {
      const key = LS_READ_KEY(uid);
      lsSet(key, prev.map((n) => n.id));
      return prev.map((n) => ({ ...n, read: true }));
    });
  }, []);

  const dismissNotification = useCallback((id: string) => {
    const uid = userIdRef.current;
    if (!uid) return;
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    const key = LS_DISMISSED_KEY(uid);
    const dismissed = lsGet<string[]>(key, []);
    if (!dismissed.includes(id)) {
      lsSet(key, [...dismissed, id]);
    }
  }, []);

  const dismissAllNotifications = useCallback(() => {
    const uid = userIdRef.current;
    if (!uid) return;
    setNotifications((prev) => {
      const key = LS_DISMISSED_KEY(uid);
      lsSet(key, prev.map((n) => n.id));
      return [];
    });
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <NotificationContext.Provider
      value={{ notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead, dismissNotification, dismissAllNotifications, setUserId }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    // Return safe defaults instead of throwing — handles HMR edge cases
    // and components that render before the provider mounts
    return {
      notifications: [] as AppNotification[],
      unreadCount: 0,
      loading: false,
      fetchNotifications: async () => {},
      markRead: (_id: string) => {},
      markAllRead: () => {},
      dismissNotification: (_id: string) => {},
      dismissAllNotifications: () => {},
      setUserId: (_id: string | null) => {},
    } as NotificationContextType;
  }
  return context;
}