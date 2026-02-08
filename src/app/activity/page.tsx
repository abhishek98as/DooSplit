"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent } from "@/components/ui/Card";
import { Clock, Receipt, DollarSign, UserPlus, Filter, Search, Calendar, X } from "lucide-react";

interface Activity {
  id: string;
  type: string;
  expenseType?: string;
  description: string;
  amount?: number;
  currency?: string;
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

export default function ActivityPage() {
  const { data: session, status } = useSession();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
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

  const fetchActivities = async () => {
    try {
      const res = await fetch("/api/dashboard/activity");
      if (res.ok) {
        const data = await res.json();
        setActivities(data.activities || []);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter activities based on current filters
  const filteredActivities = activities.filter(activity => {
    // Type filter
    if (typeFilter !== "all" && activity.type !== typeFilter) {
      return false;
    }

    // Expense type filter
    if (expenseTypeFilter !== "all" && activity.expenseType !== expenseTypeFilter) {
      return false;
    }

    // Date filter
    if (dateFilter !== "all") {
      const activityDate = new Date(activity.createdAt || activity.timestamp);
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
             (activity.data?.description || "").toLowerCase().includes(query);
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
    const { type, data, timestamp } = activity;

    switch (type) {
      case "expense_added":
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
            </div>
          </div>
        );

      case "settlement":
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
        const isReceived = data.friendId._id === session?.user?.id;
        const friendData = isReceived ? data.userId : data.friendId;
        return (
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-info/20 flex items-center justify-center flex-shrink-0">
              <UserPlus className="h-5 w-5 text-info" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-neutral-900 dark:text-dark-text">
                {isReceived
                  ? `${friendData.name} sent you a friend request`
                  : `You sent ${friendData.name} a friend request`}
              </p>
              <span className="text-xs text-neutral-500">
                {formatDate(timestamp)}
              </span>
            </div>
          </div>
        );

      default:
        return null;
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
                  <option value="friend_request">Friend Requests</option>
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
                  {typeFilter === "friend_request" ? "Friend Requests" : typeFilter.charAt(0).toUpperCase() + typeFilter.slice(1)}
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
                  "{searchQuery}"
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
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
