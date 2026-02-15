"use client";

import { useEffect, useState, useRef } from "react";
import { useSession } from "@/lib/auth/react-session";
import { Bell, X, Check, DollarSign, Users, Receipt } from "lucide-react";
import Link from "next/link";
import { subscribeToUserRealtime } from "@/lib/realtime/client";

interface Notification {
  _id: string;
  userId: string;
  type: string;
  message: string;
  relatedId?: string;
  isRead: boolean;
  createdAt: string;
}

export default function NotificationDropdown() {
  const { data: session, status } = useSession();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    void fetchNotifications();

    let isMounted = true;
    let unsubscribe: (() => void) | null = null;

    const scheduleRefresh = () => {
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      refreshTimerRef.current = setTimeout(() => {
        if (isMounted) {
          void fetchNotifications();
        }
      }, 350);
    };

    void subscribeToUserRealtime(session.user.id, () => {
      scheduleRefresh();
    }).then((cleanup) => {
      if (!isMounted) {
        cleanup();
        return;
      }
      unsubscribe = cleanup;
    });

    return () => {
      isMounted = false;
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current);
      }
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [session?.user?.id, status]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/notifications");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setUnreadCount(data.unreadCount);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "PUT",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n._id === id ? { ...n, isRead: true } : n))
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch (error) {
      console.error("Failed to mark notification as read:", error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "PUT",
      });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true }))
        );
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to mark all as read:", error);
    }
  };

  const deleteNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n._id !== id));
        const notification = notifications.find((n) => n._id === id);
        if (notification && !notification.isRead) {
          setUnreadCount((prev) => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error("Failed to delete notification:", error);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "expense_added":
      case "expense_updated":
        return <Receipt className="h-4 w-4 text-primary" />;
      case "payment_received":
      case "settlement_added":
        return <DollarSign className="h-4 w-4 text-success" />;
      case "friend_request":
      case "friend_accepted":
        return <Users className="h-4 w-4 text-info" />;
      default:
        return <Bell className="h-4 w-4 text-neutral-500" />;
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-md hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors relative"
      >
        <Bell className="h-5 w-5 text-neutral-700 dark:text-dark-text-secondary" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 h-4 w-4 bg-error text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white dark:bg-dark-bg-secondary rounded-lg shadow-lg border border-neutral-200 dark:border-dark-border z-50 max-h-96 overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-neutral-200 dark:border-dark-border">
            <h3 className="font-semibold text-neutral-900 dark:text-dark-text">
              Notifications
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="h-12 w-12 mx-auto text-neutral-300 mb-2" />
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  No notifications yet
                </p>
              </div>
            ) : (
              <div>
                {notifications.map((notification) => (
                  <div
                    key={notification._id}
                    className={`p-4 border-b border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors ${
                      !notification.isRead ? "bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-1">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900 dark:text-dark-text">
                          {notification.message}
                        </p>
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-1">
                          {formatDate(notification.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {!notification.isRead && (
                          <button
                            onClick={() => markAsRead(notification._id)}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-dark-bg rounded"
                            title="Mark as read"
                          >
                            <Check className="h-3 w-3 text-neutral-600 dark:text-dark-text-secondary" />
                          </button>
                        )}
                        <button
                          onClick={() => deleteNotification(notification._id)}
                          className="p-1 hover:bg-neutral-200 dark:hover:bg-dark-bg rounded"
                          title="Delete"
                        >
                          <X className="h-3 w-3 text-neutral-600 dark:text-dark-text-secondary" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {notifications.length > 0 && (
            <div className="p-3 border-t border-neutral-200 dark:border-dark-border">
              <Link
                href="/activity"
                onClick={() => setIsOpen(false)}
                className="block text-center text-sm text-primary hover:underline"
              >
                View all activity
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

