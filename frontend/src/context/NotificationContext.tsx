import React, { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { notificationService } from '../services/notificationService';
import type { AppNotification, DepartmentLeaveCount } from '../services/notificationService';

interface NotificationContextType {
  notifications: AppNotification[];
  unreadCount: number;
  deptLeaveCounts: DepartmentLeaveCount[];
  isDrawerOpen: boolean;
  setIsDrawerOpen: (open: boolean) => void;
  fetchNotifications: () => Promise<void>;
  fetchDeptLeaveCounts: () => Promise<void>;
  markAsRead: (ids: string[]) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  latestToast: AppNotification | null;
  clearToast: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [deptLeaveCounts, setDeptLeaveCounts] = useState<DepartmentLeaveCount[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [latestToast, setLatestToast] = useState<AppNotification | null>(null);

  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const data = await notificationService.getNotifications();
      setNotifications(data);
      const count = await notificationService.getUnreadCount();
      setUnreadCount(count);
    } catch (e) {
      console.warn("Failed to fetch notifications:", e);
    }
  };

  const fetchDeptLeaveCounts = async () => {
    if (!user || !['ADMIN', 'DEAN', 'HOD'].includes(user.role)) return;
    try {
      const counts = await notificationService.getDepartmentLeaveCounts();
      setDeptLeaveCounts(counts);
    } catch (e) {
      console.warn("Failed to fetch dept leave counts:", e);
    }
  };

  useEffect(() => {
    if (user) {
      fetchNotifications();
      fetchDeptLeaveCounts();
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.hostname;
    const wsUrl = `${protocol}//${host}:8002/api/v1/ws/notifications?user_id=${user.id || 'usr'}&role=${user.role}`;

    let socket: WebSocket | null = null;
    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        console.log("Connected to AcadOps Local Notification WebSocket");
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_NOTIFICATION' && data.notification) {
            const newNotif: AppNotification = data.notification;
            setNotifications(prev => [newNotif, ...prev]);
            setUnreadCount(prev => prev + 1);
            setLatestToast(newNotif);
            fetchDeptLeaveCounts();
          }
        } catch (err) {
          console.error("WebSocket message parse error:", err);
        }
      };

      socket.onerror = (err) => {
        console.warn("Notification WebSocket warning:", err);
      };
    } catch (e) {
      console.warn("Failed to create WebSocket:", e);
    }

    return () => {
      if (socket) {
        socket.close();
      }
    };
  }, [user]);

  const markAsRead = async (ids: string[]) => {
    await notificationService.markRead(ids);
    setNotifications(prev =>
      prev.map(n => ids.includes(n.id) ? { ...n, is_read: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - ids.length));
  };

  const markAllAsRead = async () => {
    await notificationService.markAllRead();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    setUnreadCount(0);
  };

  const deleteNotification = async (id: string) => {
    await notificationService.deleteNotification(id);
    setNotifications(prev => prev.filter(n => n.id !== id));
    fetchNotifications();
  };

  const clearToast = () => setLatestToast(null);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        deptLeaveCounts,
        isDrawerOpen,
        setIsDrawerOpen,
        fetchNotifications,
        fetchDeptLeaveCounts,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        latestToast,
        clearToast
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};
