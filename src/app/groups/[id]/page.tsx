"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { ArrowLeft, Plus, Settings, ChevronRight, Receipt } from "lucide-react";

interface GroupMember {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    profilePicture?: string;
  } | null;
  role: string;
  joinedAt: string;
}

interface GroupBalance {
  userId: string;
  userName: string;
  balance: number;
}

interface Group {
  _id: string;
  name: string;
  description?: string;
  type: string;
  currency: string;
  members: GroupMember[];
  balances?: GroupBalance[];
  memberCount: number;
  userRole: string;
}

interface GroupExpenseParticipant {
  userId:
    | string
    | {
        _id?: string;
        id?: string;
        uid?: string;
        userId?: string;
      };
  paidAmount: number;
  owedAmount: number;
}

interface GroupExpense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  createdBy?: {
    _id?: string;
    name?: string;
  } | null;
  participants: GroupExpenseParticipant[];
}

interface SimplifiedDebtTransaction {
  from: {
    id: string;
    name: string;
  };
  to: {
    id: string;
    name: string;
  };
  amount: number;
}

interface SimplifiedDebtsPayload {
  transactions: SimplifiedDebtTransaction[];
  originalCount: number;
  optimizedCount: number;
  savings: number;
  message?: string;
}

const PAGE_SIZE = 20;

function extractUserId(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const typed = value as {
      _id?: string;
      id?: string;
      uid?: string;
      userId?: unknown;
    };

    if (typed.userId) {
      return extractUserId(typed.userId);
    }
    if (typed._id) {
      return String(typed._id);
    }
    if (typed.id) {
      return String(typed.id);
    }
    if (typed.uid) {
      return String(typed.uid);
    }
  }

  return "";
}

function toNumber(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function formatCurrency(amount: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function groupTypeEmoji(type: string): string {
  if (type === "trip") return "✈️";
  if (type === "home") return "🏠";
  if (type === "couple") return "💑";
  return "👥";
}

function groupTypeColor(type: string): string {
  if (type === "trip") return "bg-primary/15";
  if (type === "home") return "bg-info/15";
  if (type === "couple") return "bg-coral/15";
  return "bg-neutral-200 dark:bg-dark-bg-tertiary";
}

function getCategoryIcon(category: string): string {
  const icons: Record<string, string> = {
    food: "🍔",
    transport: "🚗",
    shopping: "🛒",
    entertainment: "🎬",
    bills: "📄",
    healthcare: "⚕️",
    travel: "✈️",
    other: "📦",
    rent: "🏠",
    utilities: "💡",
  };

  return icons[category] || "📦";
}

export default function GroupDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const groupId = String(params.id || "");

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [simplifiedDebts, setSimplifiedDebts] = useState<SimplifiedDebtsPayload | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Date filter state
  const [dateFilter, setDateFilter] = useState<{ start: string; end: string } | null>(null);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 20);
    return () => window.clearTimeout(timer);
  }, []);

  const fetchGroupDetails = async () => {
    const response = await fetch(`/api/groups/${groupId}`, { cache: "no-store" });
    if (!response.ok) {
      if (response.status === 404) {
        router.push("/groups");
        return null;
      }
      throw new Error("Failed to fetch group");
    }

    const data = (await response.json()) as { group: Group };
    setGroup(data.group || null);
    return data.group || null;
  };

  const fetchGroupExpenses = async (page: number, append: boolean) => {
    const response = await fetch(
      `/api/expenses?groupId=${groupId}&limit=${PAGE_SIZE}&page=${page}`,
      { cache: "no-store" }
    );
    if (!response.ok) {
      throw new Error("Failed to fetch group expenses");
    }

    const data = (await response.json()) as {
      expenses?: GroupExpense[];
      pagination?: {
        totalPages?: number;
      };
    };

    const incomingExpenses = Array.isArray(data.expenses) ? data.expenses : [];
    const totalPages = toNumber(data.pagination?.totalPages);

    setExpenses((prev) => {
      if (!append) {
        return incomingExpenses;
      }

      const seen = new Set(prev.map((item) => item._id));
      const merged = [...prev];
      for (const expense of incomingExpenses) {
        if (!seen.has(expense._id)) {
          merged.push(expense);
        }
      }
      return merged;
    });

    if (totalPages > 0) {
      setHasMore(page < totalPages);
    } else {
      setHasMore(incomingExpenses.length >= PAGE_SIZE);
    }
    setCurrentPage(page);
  };

  const fetchSimplifiedDebts = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}/simplified-debts`, {
        cache: "no-store",
      });
      if (!response.ok) {
        setSimplifiedDebts(null);
        return;
      }

      const data = (await response.json()) as SimplifiedDebtsPayload;
      setSimplifiedDebts(data);
    } catch (error) {
      console.error("Failed to fetch simplified debts:", error);
      setSimplifiedDebts(null);
    }
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }

    if (status !== "authenticated" || !groupId) {
      return;
    }

    let active = true;

    const load = async () => {
      setLoading(true);
      try {
        await Promise.all([
          fetchGroupDetails(),
          fetchGroupExpenses(1, false),
          fetchSimplifiedDebts(),
        ]);
      } catch (error) {
        console.error("Failed to load group details:", error);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      active = false;
    };
  }, [groupId, router, status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("groups") ||
        domains.includes("expenses") ||
        domains.includes("settlements") ||
        domains.includes("activity")
      ) {
        void fetchGroupDetails();
        void fetchGroupExpenses(1, false);
        void fetchSimplifiedDebts();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [status, groupId]);

  const myBalance = useMemo(() => {
    if (!group || !session?.user?.id) {
      return 0;
    }

    const match = (group.balances || []).find(
      (balance) => String(balance.userId) === String(session.user.id)
    );
    return toNumber(match?.balance);
  }, [group, session?.user?.id]);

  const pairwiseLines = useMemo(() => {
    const myId = String(session?.user?.id || "");
    if (!myId || !simplifiedDebts?.transactions) {
      return [];
    }

    const lines: string[] = [];
    for (const tx of simplifiedDebts.transactions) {
      if (String(tx.from.id) === myId) {
        lines.push(`You owe ${tx.to.name} ${formatCurrency(tx.amount, group?.currency || "INR")}`);
      } else if (String(tx.to.id) === myId) {
        lines.push(`${tx.from.name} owes you ${formatCurrency(tx.amount, group?.currency || "INR")}`);
      }
    }

    return lines;
  }, [group?.currency, session?.user?.id, simplifiedDebts?.transactions]);

  // Dynamic filtering of expenses
  const filteredExpenses = useMemo(() => {
    if (!dateFilter) return expenses;
    const start = new Date(dateFilter.start).getTime();
    const end = new Date(dateFilter.end).getTime();
    return expenses.filter((e) => {
      const t = new Date(e.date).getTime();
      return t >= start && t <= end;
    });
  }, [expenses, dateFilter]);

  // Recalculate net balance for this period
  const periodBalance = useMemo(() => {
    if (!session?.user?.id) return 0;
    const myId = String(session.user.id);
    let net = 0;
    filteredExpenses.forEach((exp) => {
      const p = (exp.participants || []).find((part) => extractUserId(part.userId) === myId);
      if (p) {
        net += toNumber(p.paidAmount) - toNumber(p.owedAmount);
      }
    });
    return net;
  }, [filteredExpenses, session?.user?.id]);

  const monthGroups = useMemo(() => {
    const sorted = [...filteredExpenses].sort((a, b) => {
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });

    const grouped = new Map<string, GroupExpense[]>();
    for (const expense of sorted) {
      const key = new Date(expense.date).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric",
      });
      const list = grouped.get(key) || [];
      list.push(expense);
      grouped.set(key, list);
    }

    return Array.from(grouped.entries());
  }, [filteredExpenses]);

  const setPresetFilter = (preset: "all" | "week" | "lastweek" | "month") => {
    const now = new Date();
    if (preset === "all") {
      setDateFilter(null);
      setCustomStart("");
      setCustomEnd("");
    } else if (preset === "week") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + (6 - now.getDay()), 23, 59, 59);
      setDateFilter({ start: start.toISOString(), end: end.toISOString() });
    } else if (preset === "lastweek") {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 1, 23, 59, 59);
      setDateFilter({ start: start.toISOString(), end: end.toISOString() });
    } else if (preset === "month") {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
      setDateFilter({ start: start.toISOString(), end: end.toISOString() });
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) {
      return;
    }

    setLoadingMore(true);
    try {
      await fetchGroupExpenses(currentPage + 1, true);
    } catch (error) {
      console.error("Failed to load more group expenses:", error);
    } finally {
      setLoadingMore(false);
    }
  };

  if (loading || status === "loading" || !group) {
    return (
      <AppShell>
        <div className="flex min-h-[420px] items-center justify-center">
          <LoadingSpinner />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div
        className={`pb-28 md:pb-8 transition-all duration-300 ${
          isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
        }`}
      >
        <div className="flex items-center justify-between px-4 pt-4">
          <button
            onClick={() => router.push("/groups")}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
            aria-label="Back to groups"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <Link
            href={`/groups/${groupId}/settings`}
            className="rounded-lg p-2 transition-colors hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
            aria-label="Group settings"
          >
            <Settings className="h-5 w-5" />
          </Link>
        </div>

        <div className="flex items-center gap-4 px-4 py-3">
          <div
            className={`h-16 w-16 rounded-2xl text-3xl flex items-center justify-center ${groupTypeColor(
              group.type
            )}`}
          >
            {groupTypeEmoji(group.type)}
          </div>
          <div>
            <h1 className="font-display text-h1 font-bold text-neutral-900 dark:text-dark-text">
              {group.name}
            </h1>
            {group.description && (
              <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                {group.description}
              </p>
            )}
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto px-4 pb-1">
          <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
            {group.memberCount} people
          </span>
          <span className="shrink-0 rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium capitalize text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
            {group.type} group
          </span>
          {group.description && (
            <span className="max-w-[220px] truncate rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium text-neutral-600 dark:bg-dark-bg-tertiary dark:text-dark-text-secondary">
              {group.description}
            </span>
          )}
        </div>

        {/* Date Filter Panel */}
        <div className="mx-4 mt-4 p-3 rounded-2xl border border-neutral-200 bg-white dark:border-dark-border dark:bg-dark-bg-secondary space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-neutral-500">Date Range Filter</span>
            {dateFilter && (
              <button
                onClick={() => setPresetFilter("all")}
                className="text-xs font-semibold text-primary hover:underline"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setPresetFilter("all")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                !dateFilter
                  ? "bg-primary text-white"
                  : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
              }`}
            >
              All Time
            </button>
            <button
              onClick={() => setPresetFilter("week")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                dateFilter &&
                Math.abs(new Date(dateFilter.start).getDate() - (new Date().getDate() - new Date().getDay())) <= 1 &&
                Math.abs(new Date(dateFilter.end).getDate() - (new Date().getDate() + (6 - new Date().getDay()))) <= 1
                  ? "bg-primary text-white"
                  : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
              }`}
            >
              This Week
            </button>
            <button
              onClick={() => setPresetFilter("lastweek")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                dateFilter &&
                Math.abs(new Date(dateFilter.start).getDate() - (new Date().getDate() - new Date().getDay() - 7)) <= 1
                  ? "bg-primary text-white"
                  : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
              }`}
            >
              Last Week
            </button>
            <button
              onClick={() => setPresetFilter("month")}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                dateFilter &&
                new Date(dateFilter.start).getDate() === 1 &&
                new Date(dateFilter.start).getMonth() === new Date().getMonth()
                  ? "bg-primary text-white"
                  : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
              }`}
            >
              This Month
            </button>
          </div>

          {/* Custom Date Pickers */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="date"
              value={customStart}
              onChange={(e) => {
                setCustomStart(e.target.value);
                if (e.target.value && customEnd) {
                  setDateFilter({
                    start: new Date(e.target.value).toISOString(),
                    end: new Date(customEnd + "T23:59:59").toISOString(),
                  });
                }
              }}
              className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
            />
            <span className="text-xs text-neutral-400">to</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => {
                setCustomEnd(e.target.value);
                if (customStart && e.target.value) {
                  setDateFilter({
                    start: new Date(customStart).toISOString(),
                    end: new Date(e.target.value + "T23:59:59").toISOString(),
                  });
                }
              }}
              className="flex-1 px-2.5 py-1 text-xs rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
            />
          </div>
        </div>

        {/* Period balance card (shows up when a date range filter is active) */}
        {dateFilter && (
          <div className="mx-4 mt-3 rounded-2xl bg-primary/10 border border-primary/20 p-4 relative overflow-hidden">
            <p className="text-xs font-semibold text-primary">Period Balance Summary</p>
            <p
              className={`mt-1 text-xl font-bold font-mono ${
                periodBalance < 0
                  ? "text-coral"
                  : periodBalance > 0
                  ? "text-primary"
                  : "text-neutral-500"
              }`}
            >
              {periodBalance < -0.01
                ? `In this period, you borrowed ${formatCurrency(Math.abs(periodBalance), group.currency)}`
                : periodBalance > 0.01
                ? `In this period, you lent ${formatCurrency(periodBalance, group.currency)}`
                : "In this period, you are settled up"}
            </p>
            <p className="text-[10px] text-neutral-400 mt-1">
              Based on {filteredExpenses.length} expense(s) found in this timeframe.
            </p>
          </div>
        )}

        <div className="mx-4 mt-4 rounded-2xl bg-navy p-4 text-white relative overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(ellipse at 20% 50%, rgba(0,184,169,0.25), transparent 60%)",
            }}
          />
          <p className="relative text-sm text-white/65">Overall balance</p>
          <p
            className={`relative mt-1 text-2xl md:text-3xl font-bold font-mono ${
              myBalance < 0
                ? "text-coral"
                : myBalance > 0
                ? "text-primary"
                : "text-white"
            }`}
          >
            {myBalance < -0.01
              ? `You owe ${formatCurrency(Math.abs(myBalance), group.currency)}`
              : myBalance > 0.01
              ? `You are owed ${formatCurrency(myBalance, group.currency)}`
              : "You are settled up"}
          </p>

          <div className="relative mt-3 space-y-1">
            {pairwiseLines.length > 0 ? (
              pairwiseLines.slice(0, 4).map((line) => (
                <p key={line} className="text-sm text-white/80">
                  {line}
                </p>
              ))
            ) : (
              <p className="text-sm text-white/70">No individual balances pending right now.</p>
            )}
          </div>
        </div>

        <div className="mx-4 mt-3">
          <Link href={`/settlements?groupId=${groupId}`}>
            <Button className="w-full">Settle Up</Button>
          </Link>
        </div>

        <div className="mx-4 mt-5 rounded-2xl border border-neutral-200 bg-white p-4 dark:border-dark-border dark:bg-dark-bg-secondary">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-dark-text">Expenses</h2>
            <Link href={`/expenses/add?groupId=${groupId}`} className="hidden md:block">
              <Button size="sm">
                <Plus className="mr-1 h-4 w-4" />
                Add expense
              </Button>
            </Link>
          </div>

          {monthGroups.length === 0 ? (
            <div className="py-10 text-center">
              <Receipt className="mx-auto mb-3 h-10 w-10 text-neutral-300" />
              <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                No expenses yet in this group.
              </p>
              <Link href={`/expenses/add?groupId=${groupId}`} className="mt-4 inline-block">
                <Button>Add first expense</Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {monthGroups.map(([month, monthExpenses], monthIndex) => (
                <div
                  key={month}
                  className="transition-all duration-300"
                  style={{ transitionDelay: `${Math.min(monthIndex * 60, 240)}ms` }}
                >
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-dark-text-secondary">
                    {month}
                  </h3>

                  <div className="divide-y divide-neutral-200 dark:divide-dark-border">
                    {monthExpenses.map((expense) => {
                      const date = new Date(expense.date);
                      const monthShort = date.toLocaleDateString("en-IN", { month: "short" });
                      const day = date.toLocaleDateString("en-IN", { day: "2-digit" });

                      const myParticipant = (expense.participants || []).find(
                        (participant) =>
                          extractUserId(participant.userId) === String(session?.user?.id || "")
                      );

                      const myPaid = toNumber(myParticipant?.paidAmount);
                      const myOwed = toNumber(myParticipant?.owedAmount);
                      const net = myPaid - myOwed;

                      return (
                        <Link
                          key={expense._id}
                          href={`/expenses/edit/${expense._id}`}
                          className="-mx-2 flex items-center gap-3 rounded-xl px-2 py-3 transition-all duration-200 hover:bg-neutral-50 hover:translate-x-0.5 dark:hover:bg-dark-bg-tertiary"
                        >
                          <div className="w-10 shrink-0 text-center">
                            <p className="text-[10px] uppercase tracking-wide text-neutral-400">{monthShort}</p>
                            <p className="text-sm font-semibold text-neutral-700 dark:text-dark-text-secondary">
                              {day}
                            </p>
                          </div>

                          <div className="h-10 w-10 shrink-0 rounded-xl bg-neutral-100 text-xl flex items-center justify-center dark:bg-dark-bg-tertiary">
                            {getCategoryIcon(expense.category)}
                          </div>

                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-neutral-900 dark:text-dark-text">
                              {expense.description}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                              {expense.createdBy?.name || "Someone"} paid {formatCurrency(expense.amount, expense.currency)}
                            </p>
                          </div>

                          <div className="shrink-0 text-right">
                            <p
                              className={`text-xs ${
                                net >= 0 ? "text-neutral-500 dark:text-dark-text-secondary" : "text-coral"
                              }`}
                            >
                              {net >= 0 ? "you lent" : "you borrowed"}
                            </p>
                            <p
                              className={`text-sm font-semibold font-mono ${
                                net >= 0 ? "text-primary" : "text-coral"
                              }`}
                            >
                              {formatCurrency(Math.abs(net), expense.currency)}
                            </p>
                          </div>

                          <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}

              {hasMore && (
                <div className="pt-1 text-center">
                  <Button variant="secondary" onClick={handleLoadMore} disabled={loadingMore}>
                    {loadingMore ? "Loading..." : "Load older expenses"}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <Link
        href={`/expenses/add?groupId=${groupId}`}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white shadow-xl transition-all duration-300 hover:bg-primary-dark md:hidden"
      >
        <Plus className="h-5 w-5" />
        Add expense
      </Link>
    </AppShell>
  );
}
