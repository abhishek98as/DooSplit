"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/auth/react-session";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  ArrowLeft,
  Calendar,
  Compass,
  AlertCircle,
} from "lucide-react";
import Link from "next/link";
import getOfflineStore from "@/lib/offline-store";

interface GroupMember {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    profilePicture?: string;
  } | null;
  role: string;
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
}

export default function TripDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const groupId = String(params.groupId || "");

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"itinerary" | "balances" | "summary">("itinerary");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
      return;
    }
    if (status === "authenticated" && groupId) {
      fetchTripData();
    }
  }, [status, groupId]);

  const fetchTripData = async () => {
    setLoading(true);
    try {
      // 1. Fetch group details
      const gRes = await fetch(`/api/groups/${groupId}`);
      let groupObj: Group | null = null;
      if (gRes.ok) {
        const d = await gRes.json();
        groupObj = d.group;
      }

      // 2. Fetch expenses
      const eRes = await fetch(`/api/expenses?groupId=${groupId}&limit=100&page=1`);
      let expList: GroupExpense[] = [];
      if (eRes.ok) {
        const d = await eRes.json();
        expList = d.expenses || [];
      }

      // Fallback to offline store if fetch failed
      const offlineStore = getOfflineStore();
      if (!groupObj) {
        const localGroups = await offlineStore.getGroups();
        const found = localGroups.find((g: any) => g._id === groupId);
        if (found) {
          groupObj = found as unknown as Group;
        }
      }
      if (expList.length === 0) {
        const localExp = await offlineStore.getExpenses({ groupId, limit: 100 });
        expList = localExp as unknown as GroupExpense[];
      }

      setGroup(groupObj);
      setExpenses(expList.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
    } catch (e) {
      console.error("Trip mode fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Group expenses by date
  const itineraryDays = useMemo(() => {
    if (expenses.length === 0) return [];
    
    const daysMap: Record<string, { dateStr: string; expenses: GroupExpense[] }> = {};
    const sorted = [...expenses].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    sorted.forEach((exp) => {
      const d = new Date(exp.date);
      const key = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
      if (!daysMap[key]) {
        daysMap[key] = { dateStr: key, expenses: [] };
      }
      daysMap[key].expenses.push(exp);
    });

    return Object.values(daysMap);
  }, [expenses]);

  // Category breakdown for summary tab
  const categorySummary = useMemo(() => {
    const sum: Record<string, number> = {};
    expenses.forEach((e) => {
      const cat = e.category || "other";
      sum[cat] = (sum[cat] || 0) + (e.amount || 0);
    });
    return Object.entries(sum)
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total);
  }, [expenses]);

  const totalSpent = useMemo(() => {
    return expenses.reduce((acc, e) => acc + (e.amount || 0), 0);
  }, [expenses]);

  if (loading || status === "loading") {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner size="lg" />
        </div>
      </AppShell>
    );
  }

  if (!group) {
    return (
      <AppShell>
        <div className="p-4 space-y-4 max-w-2xl mx-auto text-center">
          <AlertCircle className="h-12 w-12 mx-auto text-coral mb-2" />
          <h2 className="text-xl font-bold">Trip not found</h2>
          <Button variant="secondary" onClick={() => router.push("/groups")}>
            Back to Groups
          </Button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              className="!p-2"
              onClick={() => router.push(`/groups/${groupId}`)}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl">??</span>
                <h1 className="text-h2 font-bold text-neutral-900 dark:text-dark-text">
                  {group.name}
                </h1>
              </div>
              <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mt-0.5">
                Dedicated Trip Mode view
              </p>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-neutral-200 dark:border-dark-border">
          {(["itinerary", "balances", "summary"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-3 text-sm font-semibold capitalize border-b-2 text-center transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-400 hover:text-neutral-600 dark:hover:text-dark-text"
              }`}
            >
              {tab === "itinerary" ? "??? Itinerary" : tab === "balances" ? "?? Balances" : "?? Summary"}
            </button>
          ))}
        </div>

        {/* Tab Contents */}
        {activeTab === "itinerary" && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <Compass className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold">Trip Expense Timeline</h3>
                    <p className="text-xs text-neutral-400 dark:text-dark-text-secondary mt-0.5">
                      Your expenses chronologically mapped across travel days. Perfect for tracking itinerary spending.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {itineraryDays.length === 0 ? (
              <div className="text-center py-12 border border-dashed border-neutral-300 dark:border-dark-border rounded-2xl">
                <Calendar className="h-12 w-12 mx-auto text-neutral-300 mb-2" />
                <p className="text-sm text-neutral-400">No expenses logged yet</p>
                <Link href={`/expenses/add?groupId=${groupId}`}>
                  <Button className="mt-3" size="sm">
                    Add Trip Expense
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="relative pl-6 border-l-2 border-primary/20 space-y-8 ml-3">
                {itineraryDays.map((day, idx) => (
                  <div key={day.dateStr} className="relative">
                    {/* Timeline Node */}
                    <div className="absolute -left-[31px] top-1.5 h-4 w-4 rounded-full border-2 border-primary bg-white dark:bg-dark-bg flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-primary" />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-baseline gap-2">
                        <span className="text-sm font-bold text-neutral-900 dark:text-dark-text">
                          Day {idx + 1}
                        </span>
                        <span className="text-xs text-neutral-400 dark:text-dark-text-secondary">
                          {day.dateStr}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {day.expenses.map((exp) => (
                          <div
                            key={exp._id}
                            className="flex items-center justify-between p-3 rounded-xl border border-neutral-100 dark:border-dark-border bg-white dark:bg-dark-bg-secondary hover:shadow-sm transition-shadow"
                          >
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-neutral-800 dark:text-dark-text">
                                {exp.description}
                              </p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-500 dark:text-dark-text-secondary uppercase">
                                  {exp.category}
                                </span>
                                <span className="text-[10px] text-neutral-400">
                                  paid by {exp.createdBy?.name || "Member"}
                                </span>
                              </div>
                            </div>
                            <span className="text-sm font-bold font-mono shrink-0 ml-4">
                              {new Intl.NumberFormat("en-IN", {
                                style: "currency",
                                currency: exp.currency || group.currency || "INR",
                              }).format(exp.amount)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "balances" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Member Balances</CardTitle>
              </CardHeader>
              <CardContent className="divide-y divide-neutral-100 dark:divide-dark-border">
                {(group.balances || []).map((b) => (
                  <div key={b.userId} className="flex justify-between py-3">
                    <span className="text-sm font-medium">{b.userName}</span>
                    <span
                      className={`text-sm font-bold font-mono ${
                        b.balance > 0.01 ? "text-primary" : b.balance < -0.01 ? "text-coral" : ""
                      }`}
                    >
                      {b.balance > 0.01
                        ? `gets back ${new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: group.currency,
                          }).format(b.balance)}`
                        : b.balance < -0.01
                        ? `owes ${new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: group.currency,
                          }).format(Math.abs(b.balance))}`
                        : "Settled up"}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Link href={`/groups/${groupId}`}>
              <Button variant="secondary" className="w-full">
                Settle up via Group details Page ?
              </Button>
            </Link>
          </div>
        )}

        {activeTab === "summary" && (
          <div className="space-y-6">
            {/* Stats row */}
            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-xs text-neutral-400">Total Trip Spending</p>
                  <p className="text-2xl font-bold font-mono mt-1 text-primary">
                    {new Intl.NumberFormat("en-IN", {
                      style: "currency",
                      currency: group.currency,
                    }).format(totalSpent)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6 text-center">
                  <p className="text-xs text-neutral-400">Expenses Logged</p>
                  <p className="text-2xl font-bold font-mono mt-1">
                    {expenses.length}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Category breakdown */}
            <Card>
              <CardHeader>
                <CardTitle>Spending by Category</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {categorySummary.map(({ category, total }) => {
                  const pct = totalSpent > 0 ? Math.round((total / totalSpent) * 100) : 0;
                  return (
                    <div key={category} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize font-medium">{category}</span>
                        <span className="font-mono text-neutral-500">
                          {new Intl.NumberFormat("en-IN", {
                            style: "currency",
                            currency: group.currency,
                          }).format(total)}{" "}
                          ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 dark:bg-dark-bg-tertiary overflow-hidden">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
                {categorySummary.length === 0 && (
                  <p className="text-xs text-center text-neutral-400 py-4">No categories logged yet</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </AppShell>
  );
}
