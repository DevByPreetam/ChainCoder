import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { useAuth } from "./AuthContext";
import {
  getNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
} from "../services/notificationService";

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { isAuthenticated, user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchUnreadCount = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const count = await getUnreadNotificationCount();
      setUnreadCount(typeof count === "number" ? count : 0);
    } catch (err) {
      // Quietly log or ignore transient unread count error
      console.warn("Failed to fetch unread notification count:", err.message);
    }
  }, [isAuthenticated]);

  const fetchNotifications = useCallback(async () => {
    if (!isAuthenticated) return [];
    setLoading(true);
    setError(null);
    try {
      const list = await getNotifications();
      const safeList = Array.isArray(list) ? list : [];
      setNotifications(safeList);
      const unread = safeList.filter((item) => !item.read).length;
      setUnreadCount(unread);
      return safeList;
    } catch (err) {
      const message = err.message || "Unable to load notifications";
      setError(message);
      return [];
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  const markAsRead = useCallback(async (notificationId) => {
    if (!notificationId) return null;
    try {
      const updated = await markNotificationAsRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) =>
          item.id === notificationId
            ? { ...item, read: true, ...(updated || {}) }
            : item
        )
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
      return updated;
    } catch (err) {
      console.error("Failed to mark notification as read:", err.message);
      throw err;
    }
  }, []);

  // Reset state during render if user changes to prevent cross-user state leaks
  const [lastUserId, setLastUserId] = useState(user?.userId || null);
  if ((user?.userId || null) !== lastUserId) {
    setLastUserId(user?.userId || null);
    setNotifications([]);
    setUnreadCount(0);
  }

  // Initial fetch and conservative periodic refresh for active user
  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    // Initial fetch of unread count
    fetchUnreadCount();

    // Conservative polling interval (60 seconds) with window visibility check
    const interval = setInterval(() => {
      if (document.visibilityState !== "hidden") {
        fetchUnreadCount();
      }
    }, 60000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchUnreadCount();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isAuthenticated, user, fetchUnreadCount]);

  // Session-guarded notification state ensures no data leaks across logged-out/switching users
  const activeNotifications = !isAuthenticated || !user ? [] : notifications;
  const activeUnreadCount = !isAuthenticated || !user ? 0 : unreadCount;

  const value = {
    notifications: activeNotifications,
    unreadCount: activeUnreadCount,
    loading,
    error,
    fetchNotifications,
    fetchUnreadCount,
    markAsRead,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within a NotificationProvider");
  }
  return context;
}
