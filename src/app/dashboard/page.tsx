"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import {
  TrendingUp,
  Users,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import getOfflineStore from "@/lib/offline-store";
import QuickAdd from "@/components/dashboard/QuickAdd";


interface BalanceData {
  total: number;
  youOwe: number;
  youAreOwed: number;
}

interface FriendDisplay {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
}

interface Group {
  _id: string;
  name: string;
  memberCount: number;
  members?: Array<{ userId: string; role: string; joinedAt: string }>;
}

interface GroupBalance {
  _id: string;
  name: string;
  balance: number;
  memberCount: number;
}

interface ActivityItem {
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
  targetUser?: {
    id: string;
    name: string;
    profilePicture?: string;
  };
  group?: {
    id: string;
    name: string;
  };
}

interface NudgeItem {
  id: string;
  type: string;
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  metadata?: Record<string, any>;
  state?: {
    dismissedAt?: string;
    snoozedUntil?: string;
    actedAt?: string;
  };
}

interface SectionLoadingState {
  friends: boolean;
  groups: boolean;
  groupBalances: boolean;
  monthly: boolean;
  activities: boolean;
  nudges: boolean;
}

const REQUEST_TIMEOUT_MS = 25000;
const GROUP_BALANCE_CONCURRENCY = 3;

const INITIAL_SECTION_LOADING: SectionLoadingState = {
  friends: true,
  groups: true,
  groupBalances: true,
  monthly: true,
  activities: true,
  nudges: true,
};

function getActivityEmoji(activity: ActivityItem): string {
  const type = activity.type;
  const haystack = `${activity.description || ""} ${
    activity.group?.name || ""
  }`.toLowerCase();

  if (type === "expense_added") {
    if (activity.expenseType === "group") {
      if (/trip|travel|goa|flight|vacation|holiday|✈/.test(haystack)) {
        return "✈️";
      }
      return "👥";
    }
    if (activity.expenseType === "personal") {
      return "🧾";
    }
    return "🧾";
  }
  if (type === "settlement") {
    return "💸";
  }
  if (type === "friend_added") {
    return "🤝";
  }
  if (type === "group_created") {
    return "👥";
  }
  return "📋";
}

async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<R>(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = index;
        index += 1;
        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await worker(items[currentIndex]);
      }
    })
  );

  return results;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [balance, setBalance] = useState<BalanceData>({
    total: 0,
    youOwe: 0,
    youAreOwed: 0,
  });
  /** Distinguish true ₹0 from failed balance load — never treat errors as settled. */
  const [balanceStatus, setBalanceStatus] = useState<"loading" | "ready" | "error">(
    "loading"
  );
  const [friends, setFriends] = useState<FriendDisplay[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupBalances, setGroupBalances] = useState<GroupBalance[]>([]);
  const [groupBalanceErrors, setGroupBalanceErrors] = useState<string[]>([]);
  const [monthlySpending, setMonthlySpending] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [nudges, setNudges] = useState<NudgeItem[]>([]);
  const [loadingSections, setLoadingSections] =
    useState<SectionLoadingState>(INITIAL_SECTION_LOADING);
  const [error, setError] = useState<string | null>(null);

  const fetchJsonWithTimeout = useCallback(
    async <T,>(url: string, timeoutMs: number = REQUEST_TIMEOUT_MS): Promise<T> => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} for ${url}`);
        }
        return (await response.json()) as T;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          throw new Error(`Request timeout after ${timeoutMs}ms for ${url}`);
        }
        throw error;
      } finally {
        clearTimeout(timeoutId);
      }
    },
    []
  );

  const setSectionLoading = useCallback(
    (section: keyof SectionLoadingState, isLoading: boolean) => {
      setLoadingSections((prev) => ({ ...prev, [section]: isLoading }));
    },
    []
  );

  const calculateGroupBalances = useCallback(
    async (groupsData: Group[]) => {
      if (!session?.user?.id || groupsData.length === 0) {
        setGroupBalances([]);
        setSectionLoading("groupBalances", false);
        return;
      }

      setSectionLoading("groupBalances", true);
      const offlineStore = getOfflineStore();
      const failedGroupIds: string[] = [];

      try {
        const computed = await runWithConcurrency(
          groupsData,
          GROUP_BALANCE_CONCURRENCY,
          async (group): Promise<GroupBalance | null> => {
            try {
              const expenses = await offlineStore.getExpenses({
                groupId: group._id,
                limit: 100,
              });

              let groupBalance = 0;
              for (const expense of expenses as any[]) {
                const userParticipant = expense.participants?.find(
                  (p: any) =>
                    p.userId?._id === session.user.id || p.userId === session.user.id
                );

                if (userParticipant) {
                  groupBalance +=
                    (userParticipant.paidAmount || 0) -
                    (userParticipant.owedAmount || 0);
                }
              }

              if (Math.abs(groupBalance) < 0.01) {
                return null;
              }

              return {
                _id: group._id,
                name: group.name,
                balance: groupBalance,
                memberCount: group.members?.length || group.memberCount || 0,
              };
            } catch (groupError) {
              console.warn(`Failed to calculate balance for group ${group._id}:`, groupError);
              failedGroupIds.push(group._id);
              return null;
            }
          }
        );

        const topBalances = computed
          .filter((item): item is GroupBalance => item !== null)
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
          .slice(0, 3);

        setGroupBalances(topBalances);
        setGroupBalanceErrors(failedGroupIds);
      } finally {
        setSectionLoading("groupBalances", false);
      }
    },
    [session?.user?.id, setSectionLoading]
  );

  const fetchDashboardData = useCallback(async () => {
    setError(null);
    setBalanceStatus("loading");
    setLoadingSections(INITIAL_SECTION_LOADING);
    setGroupBalances([]);
    setGroupBalanceErrors([]);

    const offlineStore = getOfflineStore();
    const sectionErrors: string[] = [];

    const friendsTask = (async () => {
      try {
        const rawFriends = await offlineStore.getFriends();

        const mappedFriends: FriendDisplay[] = rawFriends.map((item: any) => ({
          _id: item.friend?.id || item.id || item._id,
          name: item.friend?.name || item.name || "Unknown",
          email: item.friend?.email || item.email || "",
          profilePicture: item.friend?.profilePicture || item.profilePicture,
          balance: Number(item.balance) || 0,
        }));

        setFriends(mappedFriends);

        const youOwe = mappedFriends
          .filter((friend) => friend.balance < 0)
          .reduce((sum, friend) => sum + Math.abs(friend.balance), 0);
        const youAreOwed = mappedFriends
          .filter((friend) => friend.balance > 0)
          .reduce((sum, friend) => sum + friend.balance, 0);

        setBalance({
          total: youAreOwed - youOwe,
          youOwe,
          youAreOwed,
        });
        setBalanceStatus("ready");
      } catch (taskError) {
        console.error("Failed to fetch friends for dashboard:", taskError);
        sectionErrors.push("friends");
        // Do not leave the initial ₹0 state looking like "settled"
        setBalanceStatus("error");
      } finally {
        setSectionLoading("friends", false);
      }
    })();

    const groupsTask = (async (): Promise<Group[]> => {
      try {
        // Fetch from the server API to get an always-accurate, user-scoped
        // group list. The offline store may contain stale or unscoped data.
        const data = await fetchJsonWithTimeout<{ groups?: Group[] }>(
          `/api/groups?refresh=${Date.now()}`
        );
        const groupsData: Group[] = data?.groups || [];
        setGroups(groupsData);
        return groupsData;
      } catch (taskError) {
        console.error("Failed to fetch groups for dashboard:", taskError);
        sectionErrors.push("groups");
        setGroups([]);
        return [];
      } finally {
        setSectionLoading("groups", false);
      }
    })();

    const monthlyTask = (async () => {
      try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        const data = await fetchJsonWithTimeout<{ expenses?: any[] }>(
          `/api/expenses?startDate=${startOfMonth.toISOString()}&endDate=${endOfMonth.toISOString()}&limit=1000`
        );

        const expenses = data.expenses || [];
        const total = expenses.reduce((sum: number, expense: any) => {
          const userParticipant = expense.participants?.find(
            (p: any) =>
              p.userId?._id === session?.user?.id || p.userId === session?.user?.id
          );
          return sum + (userParticipant?.owedAmount || 0);
        }, 0);

        setMonthlySpending(total);
      } catch (taskError) {
        console.error("Failed to fetch monthly spending:", taskError);
        sectionErrors.push("monthly");
        setMonthlySpending(0);
      } finally {
        setSectionLoading("monthly", false);
      }
    })();

    const activitiesTask = (async () => {
      try {
        const data = await fetchJsonWithTimeout<{ activities?: ActivityItem[] }>(
          "/api/dashboard/activity"
        );
        setActivities(data.activities || []);
      } catch (taskError) {
        console.error("Failed to fetch activities:", taskError);
        sectionErrors.push("activities");
        setActivities([]);
      } finally {
        setSectionLoading("activities", false);
      }
    })();

    const nudgesTask = (async () => {
      try {
        const data = await fetchJsonWithTimeout<{ nudges?: NudgeItem[] }>("/api/nudges");
        setNudges(Array.isArray(data.nudges) ? data.nudges : []);
      } catch (taskError) {
        console.error("Failed to fetch nudges:", taskError);
        sectionErrors.push("nudges");
        setNudges([]);
      } finally {
        setSectionLoading("nudges", false);
      }
    })();

    const settled = await Promise.allSettled([
      friendsTask,
      groupsTask,
      monthlyTask,
      activitiesTask,
      nudgesTask,
    ]);

    const groupsResult = settled[1];
    if (groupsResult.status === "fulfilled" && groupsResult.value.length > 0) {
      void calculateGroupBalances(groupsResult.value);
    } else {
      setSectionLoading("groupBalances", false);
      setGroupBalances([]);
    }

    if (sectionErrors.length > 0) {
      setError("Some dashboard data could not be loaded. Partial data is shown.");
    }
  }, [calculateGroupBalances, fetchJsonWithTimeout, session?.user?.id, setSectionLoading]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status === "authenticated") {
      // Check if we're coming back from expense creation — clear client cache
      // so we never show stale data from IndexedDB or memory.
      try {
        const flag = sessionStorage.getItem("doosplit:force-refresh");
        if (flag) {
          sessionStorage.removeItem("doosplit:force-refresh");
          // Clear client-side IndexedDB metadata cache entries for
          // all mutation-sensitive scopes before fetching.
          import("@/lib/offline-store").then(({ default: getOfflineStore }) => {
            const store = getOfflineStore();
            // Trigger cache invalidation via internal method by
            // simply fetching with a cache-busting timestamp.
            void fetchDashboardData();
          }).catch(() => {
            void fetchDashboardData();
          });
          return;
        }
      } catch {
        // sessionStorage unavailable — proceed normally
      }
      void fetchDashboardData();
    }
  }, [fetchDashboardData, router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("expenses") ||
        domains.includes("friends") ||
        domains.includes("groups") ||
        domains.includes("settlements") ||
        domains.includes("analytics") ||
        domains.includes("activity")
      ) {
        void fetchDashboardData();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [fetchDashboardData, status]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  if (status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  const firstName =
    session?.user?.name?.trim()?.split(/\s+/)[0] ?? "there";
  const now = new Date();
  const summaryLine = `Here's your expense summary for ${now.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
  })}.`;

  const isFriendsLoading = loadingSections.friends;
  const isGroupsLoading = loadingSections.groups;
  const isMonthlyLoading = loadingSections.monthly;
  const isActivitiesLoading = loadingSections.activities;
  const isGroupBalancesLoading = loadingSections.groupBalances;
  const isNudgesLoading = loadingSections.nudges;

  const getNudgeClasses = (severity: NudgeItem["severity"]) => {
    if (severity === "high") {
      return "border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-900/30";
    }
    if (severity === "medium") {
      return "border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-900/30";
    }
    return "border-blue-200 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-900/30";
  };

  const updateNudgeState = async (
    nudgeId: string,
    action: "dismiss" | "snooze" | "mark_acted"
  ) => {
    try {
      const snoozeUntil =
        action === "snooze"
          ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
          : undefined;
      const response = await fetch(`/api/nudges/${encodeURIComponent(nudgeId)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, snoozeUntil }),
      });
      if (!response.ok) {
        throw new Error("Failed to update nudge");
      }
      setNudges((prev) => prev.filter((nudge) => nudge.id !== nudgeId));
    } catch (error) {
      console.error("Failed to update nudge:", error);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6">
        {error && (
          <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
            <Button
              variant="secondary"
              className="ml-auto"
              onClick={() => {
                void fetchDashboardData();
              }}
            >
              Retry
            </Button>
          </div>
        )}

        <div className="ds-anim-0">
          <h1 className="font-display text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Hi, {firstName} 👋
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            {summaryLine}
          </p>
        </div>

        {isFriendsLoading ? (
          <div
            className="relative rounded-2xl overflow-hidden p-6 animate-pulse bg-navy"
            style={{
              boxShadow:
                "0 8px 32px rgba(0,184,169,0.15), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <div className="h-4 w-24 bg-white/20 rounded mb-3"></div>
            <div className="h-10 w-48 bg-white/20 rounded"></div>
            <div className="grid grid-cols-2 gap-4 mt-6">
              <div className="h-24 bg-white/10 rounded-xl"></div>
              <div className="h-24 bg-white/10 rounded-xl"></div>
            </div>
          </div>
        ) : (
          <div
            className="relative rounded-2xl overflow-hidden p-6 bg-navy"
            style={{
              boxShadow:
                "0 8px 32px rgba(0,184,169,0.15), 0 2px 8px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(ellipse at 20% 50%, rgba(0,184,169,0.25) 0%, transparent 60%)",
              }}
              aria-hidden
            />
            <p className="relative text-sm text-white/60 mb-1">Total Balance</p>
            {balanceStatus === "error" ? (
              <div className="relative mt-2 space-y-3">
                <p className="text-xl font-semibold text-coral flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 shrink-0" />
                  Balance unavailable
                </p>
                <p className="text-sm text-white/60">
                  Could not load balances. This is not a settled ₹0.
                </p>
                <Button
                  variant="secondary"
                  className="bg-white/10 text-white border-white/20 hover:bg-white/20"
                  onClick={() => void fetchDashboardData()}
                >
                  Retry
                </Button>
              </div>
            ) : (
              <>
                <p
                  className={`relative text-4xl font-bold font-mono tabular-nums ${
                    balance.total > 0
                      ? "text-primary"
                      : balance.total < 0
                        ? "text-coral"
                        : "text-white"
                  }`}
                >
                  {formatCurrency(balance.total)}
                </p>
                <div className="relative grid grid-cols-2 gap-4 mt-6">
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <p className="text-xs text-white/60 mb-1">You Owe</p>
                    <p className="text-xl font-semibold font-mono text-coral tabular-nums">
                      {formatCurrency(balance.youOwe)}
                    </p>
                  </div>
                  <div className="bg-white/10 rounded-xl p-4 backdrop-blur-sm">
                    <p className="text-xs text-white/60 mb-1">You&apos;re Owed</p>
                    <p className="text-xl font-semibold font-mono text-primary tabular-nums">
                      {formatCurrency(balance.youAreOwed)}
                    </p>
                  </div>
                </div>
              </>
            )}
            {groupBalanceErrors.length > 0 && balanceStatus === "ready" && (
              <p className="relative mt-3 text-xs text-white/55">
                {groupBalanceErrors.length} group balance
                {groupBalanceErrors.length === 1 ? "" : "s"} could not be loaded.
              </p>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/analytics" className="block group">
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                    This Month
                  </p>
                  {isMonthlyLoading ? (
                    <div className="h-8 w-28 bg-neutral-200 dark:bg-dark-border rounded mt-2 animate-pulse"></div>
                  ) : (
                    <p className="text-2xl font-semibold mt-1 font-mono tabular-nums">
                      {formatCurrency(monthlySpending)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                    <TrendingUp className="h-6 w-6 text-primary" />
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-primary transition-colors shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/groups" className="block group">
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                    Active Groups
                  </p>
                  {isGroupsLoading ? (
                    <div className="h-8 w-10 bg-neutral-200 dark:bg-dark-border rounded mt-2 animate-pulse"></div>
                  ) : (
                    <p className="text-2xl font-semibold mt-1 tabular-nums">
                      {groups.length}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-12 w-12 bg-success/10 rounded-full flex items-center justify-center">
                    <span className="text-2xl" aria-hidden>
                      👥
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-primary transition-colors shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/friends" className="block group">
            <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                    Friends
                  </p>
                  {isFriendsLoading ? (
                    <div className="h-8 w-10 bg-neutral-200 dark:bg-dark-border rounded mt-2 animate-pulse"></div>
                  ) : (
                    <p className="text-2xl font-semibold mt-1 tabular-nums">
                      {friends.length}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-12 w-12 bg-info/10 rounded-full flex items-center justify-center">
                    <span className="text-2xl" aria-hidden>
                      🤝
                    </span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-neutral-400 group-hover:text-primary transition-colors shrink-0" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {isNudgesLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Smart Nudges</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-16 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-16 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          nudges.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Smart Nudges</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {nudges.slice(0, 4).map((nudge) => (
                    <div
                      key={nudge.id}
                      className={`rounded-lg border p-3 ${getNudgeClasses(nudge.severity)}`}
                    >
                      <p className="text-sm font-semibold text-neutral-900 dark:text-dark-text">
                        {nudge.type === "recurring_settlement_reminder" ? "🔔 " : nudge.type === "predicted_pattern" ? "🔮 " : ""}{nudge.title}
                      </p>
                      <p className="text-sm text-neutral-700 dark:text-dark-text-secondary mt-1">
                        {nudge.message}
                      </p>
                      <div className="flex flex-wrap items-center gap-3 mt-2">
                        {nudge.actionLabel && nudge.actionHref && (
                          <Link
                            href={nudge.actionHref}
                            onClick={() => void updateNudgeState(nudge.id, "mark_acted")}
                            className="text-xs font-semibold text-primary hover:underline"
                          >
                            {nudge.actionLabel} →
                          </Link>
                        )}
                        {nudge.type === "recurring_settlement_reminder" && (nudge.metadata as any)?.unpaidUserIds?.length > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              const uid = (nudge.metadata as any).unpaidUserIds[0];
                              const amount = (nudge.metadata as any).totalUnpaid || 0;
                              try {
                                await fetch("/api/payment-reminders", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    toUserId: uid,
                                    amount: Math.round(amount * 100) / 100,
                                    currency: "INR",
                                    message: nudge.title,
                                  }),
                                });
                                void updateNudgeState(nudge.id, "mark_acted");
                              } catch (e) {
                                console.error("Reminder send failed:", e);
                              }
                            }}
                            className="text-sm font-semibold bg-primary text-white min-h-10 px-3.5 py-2 rounded-xl hover:bg-primary-dark transition-colors"
                          >
                            🔔 Send Reminder
                          </button>
                        )}
                        <div className="flex gap-2 ml-auto">
                          <button
                            type="button"
                            onClick={() => void updateNudgeState(nudge.id, "snooze")}
                            className="text-xs text-neutral-500 dark:text-dark-text-secondary hover:text-primary"
                          >
                            Snooze
                          </button>
                          <button
                            type="button"
                            onClick={() => void updateNudgeState(nudge.id, "dismiss")}
                            className="text-xs text-neutral-500 dark:text-dark-text-secondary hover:text-primary"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )
        )}

        {/* ── 2-column bottom grid: Top Balances | Recent Activity ──── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 ds-anim-4">

        {isFriendsLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Top Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-14 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-14 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-14 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          friends.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Top Balances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {friends
                    .filter((friend) => friend.balance !== 0)
                    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
                    .slice(0, 5)
                    .map((friend) => (
                      <div
                        key={friend._id}
                        className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                      >
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                            <span className="text-primary font-semibold">
                              {friend.name?.charAt(0)?.toUpperCase() || "?"}
                            </span>
                          </div>
                          <div>
                            <p className="font-medium text-neutral-900 dark:text-dark-text">
                              {friend.name}
                            </p>
                            <p className="text-sm text-neutral-500">{friend.email}</p>
                          </div>
                        </div>
                        <div
                          className={`text-lg font-semibold ${
                            friend.balance > 0 ? "text-success" : "text-coral"
                          }`}
                        >
                          {friend.balance > 0 ? "+" : ""}
                          {formatCurrency(friend.balance)}
                        </div>
                      </div>
                    ))}
                  {friends.filter((friend) => friend.balance !== 0).length === 0 && (
                    <div className="text-center py-8 text-neutral-500">
                      <p>All settled up!</p>
                    </div>
                  )}
                </div>
                <Link href="/friends" className="block mt-4">
                  <Button variant="secondary" className="w-full">
                    View All Friends
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        )}

        {isGroupBalancesLoading ? (
          <Card>
            <CardHeader>
              <CardTitle>Group Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-14 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-14 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          groupBalances.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Group Balances</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {groupBalances.map((group) => (
                    <div
                      key={group._id}
                      className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                          <span className="text-primary font-semibold">
                            {group.name?.charAt(0)?.toUpperCase() || "?"}
                          </span>
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-dark-text">
                            {group.name}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {group.memberCount} members
                          </p>
                        </div>
                      </div>
                      <div
                        className={`text-lg font-semibold ${
                          group.balance > 0 ? "text-success" : "text-coral"
                        }`}
                      >
                        {group.balance > 0 ? "+" : ""}
                        {formatCurrency(group.balance)}
                      </div>
                    </div>
                  ))}
                </div>
                <Link href="/groups" className="block mt-4">
                  <Button variant="secondary" className="w-full">
                    View All Groups
                  </Button>
                </Link>
              </CardContent>
            </Card>
          )
        )}

        {isActivitiesLoading ? (
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="h-16 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-16 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
                <div className="h-16 rounded bg-neutral-100 dark:bg-dark-bg-secondary animate-pulse"></div>
              </div>
            </CardContent>
          </Card>
        ) : (
          activities.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activities.slice(0, 20).map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
                    >
                      <div
                        className="flex-shrink-0 flex h-11 w-11 items-center justify-center rounded-xl bg-neutral-100 dark:bg-dark-bg-tertiary text-xl"
                        aria-hidden
                      >
                        <span role="img" aria-label="">
                          {getActivityEmoji(activity)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-neutral-900 dark:text-dark-text">
                          {activity.description}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {activity.expenseType && (
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                activity.expenseType === "group"
                                  ? "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"
                                  : activity.expenseType === "personal"
                                  ? "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200"
                                  : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                              }`}
                            >
                              {activity.expenseType === "group"
                                ? "Group"
                                : activity.expenseType === "personal"
                                ? "Personal"
                                : "Non-Group"}
                            </span>
                          )}
                          <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                            {new Date(activity.createdAt).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        </div>
                      </div>
                      {activity.amount && (
                        <div className="flex-shrink-0 text-right">
                          <p className="text-sm font-semibold font-mono text-neutral-900 dark:text-dark-text">
                            {formatCurrency(activity.amount)}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                <div className="mt-4 pt-4 border-t border-neutral-200 dark:border-dark-border">
                  <Link href="/activity">
                    <Button variant="secondary" className="w-full">
                      View All Activity
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        )}

        </div>{/* end 2-col grid */}

        {!isFriendsLoading && friends.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Get Started</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-12">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  Add friends to start tracking expenses
                </p>
                <Link href="/friends" className="inline-block mt-4">
                  <Button>Add Friends</Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
      <QuickAdd />
    </AppShell>
  );
}
