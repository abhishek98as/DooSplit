"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useSession } from "@/lib/auth/react-session";
import { Bell, X, Check, DollarSign, Users, Receipt, StickyNote, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Notification {
  _id: string;
  userId: string;
  type: string;
  message: string;
  relatedId?: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: string;
}

function hrefForNotification(notification: Notification): string | null {
  const data = notification.data || {};
  switch (notification.type) {
    case "expense_added":
    case "expense_updated":
    case "group_expense":
    case "expense_comment_added":
    case "expense_mentioned": {
      const expenseId = String(data.expenseId || notification.relatedId || "");
      return expenseId ? `/expenses?id=${encodeURIComponent(expenseId)}` : "/expenses";
    }
    case "expense_deleted":
      return "/expenses";
    case "settlement_recorded":
    case "settlement_added":
    case "payment_received":
      return "/settlements";
    case "friend_request":
    case "friend_accepted":
    case "friend_removed":
      return "/friends";
    case "group_invitation": {
      const groupId = String(data.groupId || notification.relatedId || "");
      return groupId ? `/groups/${encodeURIComponent(groupId)}` : "/groups";
    }
    case "note_share_invite":
      return null; // handled via modal
    case "note_share_accepted":
      return "/notes";
    default:
      return "/dashboard";
  }
}

export default function NotificationDropdown() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [inviteModal, setInviteModal] = useState<Notification | null>(null);
  const [responding, setResponding] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = useCallback(async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      const res = await fetch("/api/notifications", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (error) {
      console.error("Failed to fetch notifications:", error);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status !== "authenticated" || !session?.user?.id) {
      return;
    }

    void fetchNotifications();

    // Dynamo-backed notifications: poll since Firestore realtime does not receive them
    const poll = window.setInterval(() => {
      void fetchNotifications(true);
    }, 20_000);

    const onFocus = () => {
      void fetchNotifications(true);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void fetchNotifications(true);
      }
    };
    const onPushRefresh = () => {
      void fetchNotifications(true);
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("doosplit:notifications-refresh", onPushRefresh);

    return () => {
      window.clearInterval(poll);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("doosplit:notifications-refresh", onPushRefresh);
    };
  }, [session?.user?.id, status, fetchNotifications]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      void fetchNotifications(true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, fetchNotifications]);

  /** Seen / click → delete from server and local list. */
  const dismissNotification = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setNotifications((prev) => {
          const target = prev.find((n) => n._id === id);
          if (target && !target.isRead) {
            setUnreadCount((c) => Math.max(0, c - 1));
          }
          return prev.filter((n) => n._id !== id);
        });
      }
    } catch (error) {
      console.error("Failed to dismiss notification:", error);
    }
  };

  const clearAllNotifications = async () => {
    try {
      const res = await fetch("/api/notifications", {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setNotifications([]);
        setUnreadCount(0);
      }
    } catch (error) {
      console.error("Failed to clear notifications:", error);
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    if (notification.type === "note_share_invite") {
      setInviteModal(notification);
      setIsOpen(false);
      return;
    }

    void dismissNotification(notification._id);
    setIsOpen(false);

    const href = hrefForNotification(notification);
    if (href) {
      router.push(href);
    }
  };

  const respondToNoteInvite = async (action: "accept" | "reject") => {
    if (!inviteModal) return;
    const noteId = String(
      inviteModal.data?.noteId || inviteModal.relatedId || ""
    );
    if (!noteId) return;
    setResponding(true);
    try {
      const res = await fetch(`/api/notes/${noteId}/share/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed");
      await dismissNotification(inviteModal._id);
      setInviteModal(null);
      if (action === "accept") {
        router.push("/notes");
      }
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "Failed to respond");
    } finally {
      setResponding(false);
    }
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case "expense_added":
      case "expense_updated":
      case "expense_deleted":
      case "group_expense":
      case "expense_mentioned":
      case "expense_comment_added":
      case "recurring_expense_created":
        return <Receipt className="h-4 w-4 text-primary" />;
      case "payment_received":
      case "settlement_added":
      case "settlement_recorded":
        return <DollarSign className="h-4 w-4 text-success" />;
      case "friend_request":
      case "friend_accepted":
      case "friend_removed":
      case "group_invitation":
        return <Users className="h-4 w-4 text-info" />;
      case "note_share_invite":
      case "note_share_accepted":
        return <StickyNote className="h-4 w-4 text-amber-500" />;
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

  const inviteAdminName = String(
    inviteModal?.data?.invitedByName || "Someone"
  );
  const inviteNoteTitle = String(
    inviteModal?.data?.noteTitle || "a note"
  );

  return (
    <>
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="touch-target p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors relative"
          aria-label="Notifications"
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
              {notifications.length > 0 && (
                <button
                  onClick={() => void clearAllNotifications()}
                  className="text-xs text-primary hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>

            <div className="overflow-y-auto flex-1">
              {loading && notifications.length === 0 ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : notifications.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="h-12 w-12 mx-auto text-neutral-300 dark:text-dark-text-tertiary mb-2" />
                  <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                    No notifications yet
                  </p>
                </div>
              ) : (
                <div>
                  {notifications.map((notification) => (
                    <div
                      key={notification._id}
                      role="button"
                      tabIndex={0}
                      onClick={() => handleNotificationClick(notification)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleNotificationClick(notification);
                        }
                      }}
                      className={`p-4 border-b border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary transition-colors cursor-pointer ${
                        !notification.isRead ? "bg-primary/5 dark:bg-primary/10" : ""
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
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => void dismissNotification(notification._id)}
                            className="p-1 hover:bg-neutral-200 dark:hover:bg-dark-bg rounded"
                            title="Dismiss"
                          >
                            <Check className="h-3 w-3 text-neutral-600 dark:text-dark-text-secondary" />
                          </button>
                          <button
                            onClick={() => void dismissNotification(notification._id)}
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

      {inviteModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-sm rounded-2xl shadow-2xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="h-10 w-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
                <StickyNote className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <h3 className="font-display font-semibold text-neutral-900 dark:text-dark-text">
                  Note invitation
                </h3>
                <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mt-1">
                  <span className="font-medium text-neutral-900 dark:text-dark-text">
                    {inviteAdminName}
                  </span>{" "}
                  invited you to collaborate on{" "}
                  <span className="font-medium">&ldquo;{inviteNoteTitle}&rdquo;</span>.
                  You&apos;ll start with Create and Read access.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={responding}
                onClick={() => respondToNoteInvite("reject")}
                className="flex-1 py-2.5 rounded-xl border border-neutral-200 dark:border-dark-border text-sm font-medium disabled:opacity-50"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={responding}
                onClick={() => respondToNoteInvite("accept")}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {responding && <Loader2 className="h-4 w-4 animate-spin" />}
                Accept
              </button>
            </div>
            <button
              type="button"
              className="mt-3 w-full text-xs text-neutral-500 hover:underline"
              onClick={() => {
                void dismissNotification(inviteModal._id);
                setInviteModal(null);
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
}
