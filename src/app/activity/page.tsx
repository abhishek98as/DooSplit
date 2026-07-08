"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  Clock,
  Receipt,
  DollarSign,
  UserPlus,
  Filter,
  Search,
  X,
  Users,
  UserMinus,
  FolderPlus,
  FolderMinus,
} from "lucide-react";

interface Activity {
  id: string;
  type: string;
  expenseType?: string;
  description: string;
  amount?: number;
  currency?: string;
  actionHref?: string;
  actionLabel?: string;
  expenseId?: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    profilePicture?: string;
  };
  group?: {
    id: string;
    name: string;
  };
}

const ACTIVITY_PAGE_SIZE = 50;

function mergeActivitiesById(existing: Activity[], incoming: Activity[]): Activity[] {
  const map = new Map<string, Activity>();

  for (const activity of existing) {
    map.set(activity.id, activity);
  }

  for (const activity of incoming) {
    map.set(activity.id, activity);
  }

  return Array.from(map.values()).sort((a, b) => {
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export default function ActivityPage() {
  const { data: session, status } = useSession();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextPage, setNextPage] = useState(2);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  // Filter states
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expenseTypeFilter, setExpenseTypeFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/auth/login";
    } else if (status === "authenticated") {
      fetchActivities();
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("activity") ||
        domains.includes("expenses") ||
        domains.includes("friends") ||
        domains.includes("groups") ||
        domains.includes("settlements")
      ) {
        fetchActivities();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [status]);

  const fetchActivities = async () => {
    try {
      const res = await fetch(`/api/activities?page=1&limit=${ACTIVITY_PAGE_SIZE}`);
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const pageActivities: Activity[] = Array.isArray(data.activities) ? data.activities : [];
      const totalPages = Math.max(1, Number(data.pagination?.totalPages || 1));

      setActivities(pageActivities);
      setNextPage(2);
      setHasMore(totalPages > 1);
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMoreActivities = async () => {
    if (loading || loadingMore || !hasMore) {
      return;
    }

    try {
      setLoadingMore(true);
      const pageToLoad = nextPage;
      const res = await fetch(`/api/activities?page=${pageToLoad}&limit=${ACTIVITY_PAGE_SIZE}`);
      if (!res.ok) {
        return;
      }

      const data = await res.json();
      const pageActivities: Activity[] = Array.isArray(data.activities) ? data.activities : [];
      const totalPages = Math.max(1, Number(data.pagination?.totalPages || 1));

      setActivities((prev) => mergeActivitiesById(prev, pageActivities));
      setNextPage(pageToLoad + 1);
      setHasMore(pageToLoad < totalPages);
    } catch (error) {
      console.error("Failed to load more activities:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  // Filter activities based on current filters
  const filteredActivities = activities.filter(activity => {
    // Type filter
    if (typeFilter !== "all") {
      const type = activity.type || "";
      const matchesType =
        (typeFilter === "expense" && type.startsWith("expense_")) ||
        (typeFilter === "settlement" && (type === "settlement" || type === "settlement_added")) ||
        (typeFilter === "friend" && type.startsWith("friend_")) ||
        (typeFilter === "group" && type.startsWith("group_")) ||
        type === typeFilter;

      if (!matchesType) {
        return false;
      }
    }

    // Expense type filter
    if (expenseTypeFilter !== "all" && activity.expenseType !== expenseTypeFilter) {
      return false;
    }

    // Date filter
    if (dateFilter !== "all") {
      const activityDate = new Date(activity.createdAt);
      const now = new Date();

      switch (dateFilter) {
        case "today":
          if (activityDate.toDateString() !== now.toDateString()) return false;
          break;
        case "week":
          const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          if (activityDate < weekAgo) return false;
          break;
        case "month":
          const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          if (activityDate < monthAgo) return false;
          break;
      }
    }

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      return activity.description?.toLowerCase().includes(query) ||
             activity.user?.name?.toLowerCase().includes(query) ||
             activity.group?.name?.toLowerCase().includes(query);
    }

    return true;
  });

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString("en-IN", {
      month: "short",
      day: "numeric",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const renderActivity = (activity: Activity) => {
    const { type } = activity;

    switch (type) {
      case "expense_added":
      case "expense_updated":
      case "expense_deleted":
      case "expense_comment_added":
      case "expense_mentioned":
      case "recurring_expense_created":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Receipt className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {activity.expenseType && (
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                    activity.expenseType === 'group'
                      ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                      : activity.expenseType === 'personal'
                      ? 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                      : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                  }`}>
                    {activity.expenseType === 'group' ? '👥' : activity.expenseType === 'personal' ? '👤' : '🤝'}
                    {activity.expenseType === 'group' ? 'Group' : activity.expenseType === 'personal' ? 'Personal' : 'Non-Group'}
                  </span>
                )}
                {activity.amount && (
                  <span className="text-sm font-semibold text-primary">
                    {formatCurrency(activity.amount)}
                  </span>
                )}
                <span className="text-xs text-neutral-500">
                  {formatDate(activity.createdAt)}
                </span>
              </div>
              {activity.expenseId && (
                <Link
                  href={`/expenses/edit/${activity.expenseId}`}
                  className="inline-block mt-2 text-xs font-medium text-primary hover:underline"
                >
                  Open expense
                </Link>
              )}
            </div>
          </div>
        );

      case "settlement":
      case "settlement_added":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-success/20 flex items-center justify-center flex-shrink-0">
              <DollarSign className="h-5 w-5 text-success" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {activity.amount && (
                  <span className="text-sm font-semibold text-success">
                    {formatCurrency(activity.amount)}
                  </span>
                )}
                <span className="text-xs text-neutral-500">
                  {formatDate(activity.createdAt)}
                </span>
              </div>
            </div>
          </div>
        );

      case "friend_request":
      case "friend_request_sent":
      case "friend_added":
      case "friend_removed":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0">
              {type === "friend_removed" ? (
                <UserMinus className="h-5 w-5 text-info" />
              ) : (
                <UserPlus className="h-5 w-5 text-info" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <span className="text-xs text-neutral-500">
                {formatDate(activity.createdAt)}
              </span>
            </div>
          </div>
        );

      case "group_created":
      case "group_deleted":
      case "group_member_added":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-warning/20 flex items-center justify-center flex-shrink-0">
              {type === "group_deleted" ? (
                <FolderMinus className="h-5 w-5 text-warning" />
              ) : type === "group_member_added" ? (
                <Users className="h-5 w-5 text-warning" />
              ) : (
                <FolderPlus className="h-5 w-5 text-warning" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <span className="text-xs text-neutral-500">
                {formatDate(activity.createdAt)}
              </span>
            </div>
          </div>
        );

      case "smart_nudge":
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-blue-600 dark:text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <span className="text-xs text-neutral-500">
                {formatDate(activity.createdAt)}
              </span>
              {activity.actionHref && (
                <Link
                  href={activity.actionHref}
                  className="block mt-2 text-xs font-medium text-primary hover:underline"
                >
                  {activity.actionLabel || "Open"}
                </Link>
              )}
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-neutral-200 dark:bg-dark-bg-secondary flex items-center justify-center flex-shrink-0">
              <Clock className="h-5 w-5 text-neutral-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {activity.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {activity.amount && (
                  <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text">
                    {formatCurrency(activity.amount)}
                  </span>
                )}
                <span className="text-xs text-neutral-500">
                  {formatDate(activity.createdAt)}
                </span>
              </div>
            </div>
          </div>
        );
    }
  };

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6">
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Activity
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            View all your expense and settlement activities
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-neutral-900 dark:text-dark-text">Filters</h3>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1 text-sm text-primary hover:text-primary/80"
            >
              <Filter className="h-4 w-4" />
              {showFilters ? "Hide Filters" : "Show Filters"}
            </button>
          </div>

          {showFilters && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              {/* Search */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-dark-text-secondary mb-1">
                  Search
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search activities..."
                    className="w-full pl-9 pr-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text placeholder-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                  />
                </div>
              </div>

              {/* Type Filter */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-dark-text-secondary mb-1">
                  Activity Type
                </label>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="all">All Activities</option>
                  <option value="expense">Expenses</option>
                  <option value="settlement">Settlements</option>
                  <option value="friend">Friends</option>
                  <option value="group">Groups</option>
                </select>
              </div>

              {/* Expense Type Filter */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-dark-text-secondary mb-1">
                  Expense Type
                </label>
                <select
                  value={expenseTypeFilter}
                  onChange={(e) => setExpenseTypeFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="all">All Expense Types</option>
                  <option value="group">Group Expenses</option>
                  <option value="non-group">Non-Group Expenses</option>
                  <option value="personal">Personal Expenses</option>
                </select>
              </div>

              {/* Date Filter */}
              <div>
                <label className="block text-xs font-medium text-neutral-700 dark:text-dark-text-secondary mb-1">
                  Date Range
                </label>
                <select
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-neutral-300 dark:border-dark-border rounded-md bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                >
                  <option value="all">All Time</option>
                  <option value="today">Today</option>
                  <option value="week">Last 7 days</option>
                  <option value="month">Last 30 days</option>
                </select>
              </div>
            </div>
          )}

          {/* Active Filters Summary */}
          {(typeFilter !== "all" || dateFilter !== "all" || searchQuery.trim()) && (
            <div className="flex items-center gap-2 mt-4 pt-4 border-t border-neutral-200 dark:border-dark-border">
              <span className="text-xs text-neutral-600 dark:text-dark-text-secondary">Active filters:</span>
              {typeFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
                  {typeFilter === "expense"
                    ? "Expenses"
                    : typeFilter === "settlement"
                    ? "Settlements"
                    : typeFilter === "friend"
                    ? "Friends"
                    : typeFilter === "group"
                    ? "Groups"
                    : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
                  <button onClick={() => setTypeFilter("all")} className="ml-1 hover:bg-primary/20 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {dateFilter !== "all" && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
                  {dateFilter === "today" ? "Today" : dateFilter === "week" ? "Last 7 days" : "Last 30 days"}
                  <button onClick={() => setDateFilter("all")} className="ml-1 hover:bg-primary/20 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {searchQuery.trim() && (
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs">
                  &quot;{searchQuery}&quot;
                  <button onClick={() => setSearchQuery("")} className="ml-1 hover:bg-primary/20 rounded-full p-0.5">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              <button
                onClick={() => {
                  setTypeFilter("all");
                  setDateFilter("all");
                  setSearchQuery("");
                }}
                className="text-xs text-neutral-600 dark:text-dark-text-secondary hover:text-primary ml-auto"
              >
                Clear all
              </button>
            </div>
          )}
        </div>

        <Card>
          <CardContent>
            {filteredActivities.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  {activities.length === 0 ? "No activity yet" : "No activities match your filters"}
                </p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  {activities.length === 0
                    ? "Your transaction history will appear here"
                    : "Try adjusting your filters to see more results"}
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {filteredActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="py-3 border-b border-neutral-200 dark:border-dark-border last:border-0"
                    >
                      {renderActivity(activity)}
                    </div>
                  ))}
                </div>

                {hasMore && (
                  <div className="pt-4 flex justify-center">
                    <Button
                      variant="secondary"
                      onClick={loadMoreActivities}
                      disabled={loadingMore}
                    >
                      {loadingMore ? "Loading..." : "Load More"}
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

