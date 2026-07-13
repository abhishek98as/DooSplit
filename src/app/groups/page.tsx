"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { useAnalytics } from "@/components/analytics/AnalyticsProvider";
import { AnalyticsEvents } from "@/lib/firebase-analytics";
import getOfflineStore from "@/lib/offline-store";
import Link from "next/link";
import { Users, Plus, ChevronRight, Search, FileText, ArrowUpDown } from "lucide-react";
import { simplifyGroupDebtsLocal } from "@/lib/split-solvers";

interface Group {
  _id: string;
  name: string;
  description: string;
  image: string | null;
  type: string;
  currency: string;
  memberCount: number;
  userRole: string;
  members: any[];
  createdAt?: string;
  balances?: any[];
}

interface Friend {
  _id: string;
  name: string;
  email: string;
  balance: number;
}

interface ExpenseParticipant {
  userId: string | { _id?: string; id?: string; uid?: string; userId?: string };
  paidAmount: number;
  owedAmount: number;
}

interface ExpenseRecord {
  _id: string;
  participants?: ExpenseParticipant[];
}

function extractUserId(value: unknown): string {
  if (!value) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "object") {
    const typed = value as { _id?: string; id?: string; uid?: string; userId?: unknown };
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

export default function GroupsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const { trackEvent } = useAnalytics();
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [groupBalances, setGroupBalances] = useState<Record<string, number>>({});
  const [groupMemberBalances, setGroupMemberBalances] = useState<Record<string, Array<{ userId: string; userName: string; balance: number }>>>({});
  const [nonGroupBalance, setNonGroupBalance] = useState(0);
  const [showSettledGroups, setShowSettledGroups] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "balance" | "recent">("recent");
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    type: "trip",
    currency: "INR",
    memberIds: [] as string[],
  });

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchGroups(true);
      fetchFriends();
    }
  }, [status]);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsReady(true), 20);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("groups") ||
        domains.includes("friends") ||
        domains.includes("expenses") ||
        domains.includes("activity")
      ) {
        fetchGroups(true);
        fetchFriends();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [status]);

  const fetchGroups = async (forceFresh = false) => {
    try {
      const res = await fetch(`/api/groups${forceFresh ? `?refresh=${Date.now()}` : ""}`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setGroups((data.groups || []) as Group[]);
        return;
      }

      const offlineStore = getOfflineStore();
      const groupsData = await offlineStore.getGroups();
      setGroups((groupsData || []) as unknown as Group[]);
    } catch (error) {
      console.error("Failed to fetch groups:", error);
      setGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const offlineStore = getOfflineStore();
      const rawFriends = await offlineStore.getFriends();
      const mappedFriends = (rawFriends || []).map((item: any) => ({
        _id: item.friend?.id || item.id || item._id,
        name: item.friend?.name || item.name || "Unknown",
        email: item.friend?.email || item.email || "",
        balance: item.balance || 0,
      }));
      setFriends(mappedFriends);
    } catch (error) {
      console.error("Failed to fetch friends:", error);
      setFriends([]);
    }
  };

  useEffect(() => {
    let active = true;

    const computeBalances = async () => {
      if (status !== "authenticated" || !session?.user?.id || groups.length === 0) {
        if (active) {
          setGroupBalances({});
          setGroupMemberBalances({});
          setNonGroupBalance(0);
        }
        return;
      }

      setBalanceLoading(true);
      const offlineStore = getOfflineStore();
      const computed: Record<string, number> = {};
      const computedMemberBalances: Record<string, Array<{ userId: string; userName: string; balance: number }>> = {};

      try {
        // 1. Compute balances for each group
        await Promise.all(
          groups.map(async (group) => {
            let totalForGroup = 0;
            const memberBalancesMap: Record<string, number> = {};
            
            // Initialize members
            if (group.members) {
              for (const m of group.members) {
                const uId = extractUserId(m.userId);
                if (uId) memberBalancesMap[uId] = 0;
              }
            }
            
            let page = 1;
            while (page <= 20) {
              const expenses = (await offlineStore.getExpenses({
                groupId: group._id,
                page,
                limit: 100,
              })) as ExpenseRecord[];

              if (!Array.isArray(expenses) || expenses.length === 0) {
                break;
              }

              for (const expense of expenses) {
                const myParticipant = (expense.participants || []).find(
                  (participant) =>
                    extractUserId(participant.userId) === String(session.user.id)
                );
                if (myParticipant) {
                  totalForGroup += toNumber(myParticipant.paidAmount) - toNumber(myParticipant.owedAmount);
                }

                for (const p of (expense.participants || [])) {
                  const uId = extractUserId(p.userId);
                  if (uId) {
                    memberBalancesMap[uId] = (memberBalancesMap[uId] || 0) + toNumber(p.paidAmount) - toNumber(p.owedAmount);
                  }
                }
              }

              if (expenses.length < 100) {
                break;
              }
              page += 1;
            }

            computed[group._id] = totalForGroup;
            computedMemberBalances[group._id] = Object.entries(memberBalancesMap).map(([userId, balance]) => {
              const m = group.members?.find((member) => extractUserId(member.userId) === userId);
              const nameFallback = userId === String(session?.user?.id)
                ? (session?.user?.name || "You")
                : (friends.find((f) => f._id === userId)?.name || "Unknown");
              return {
                userId,
                userName: (m?.userId && typeof m.userId === "object" ? (m.userId as any).name : null) || nameFallback,
                balance,
              };
            });
          })
        );

        // 2. Compute non-group expenses balance
        let computedNonGroup = 0;
        let nonGroupPage = 1;
        while (nonGroupPage <= 20) {
          const allExpenses = (await offlineStore.getExpenses({
            page: nonGroupPage,
            limit: 100,
          })) as any[];

          if (!Array.isArray(allExpenses) || allExpenses.length === 0) {
            break;
          }

          const nonGroupList = allExpenses.filter(e => !e.groupId && !e.group_id);
          for (const expense of nonGroupList) {
            const myParticipant = (expense.participants || []).find(
              (participant: any) =>
                extractUserId(participant.userId) === String(session.user.id)
            );
            if (myParticipant) {
              computedNonGroup += toNumber(myParticipant.paidAmount) - toNumber(myParticipant.owedAmount);
            }
          }

          if (allExpenses.length < 100) {
            break;
          }
          nonGroupPage += 1;
        }

        if (active) {
          setGroupBalances(computed);
          setGroupMemberBalances(computedMemberBalances);
          setNonGroupBalance(computedNonGroup);
        }
      } catch (error) {
        console.error("Failed to compute balances:", error);
      } finally {
        if (active) {
          setBalanceLoading(false);
        }
      }
    };

    void computeBalances();

    return () => {
      active = false;
    };
  }, [groups, session?.user?.id, status]);

  const createGroup = async () => {
    if (!formData.name) return;

    setSubmitting(true);
    try {
      const offlineStore = getOfflineStore();
      const newGroup = await offlineStore.createGroup(formData);

      if (newGroup?._id) {
        setGroups((prev) => {
          const next = prev.filter((item) => item._id !== newGroup._id);
          return [newGroup as unknown as Group, ...next];
        });
      }
      trackEvent(AnalyticsEvents.GROUP_CREATED, {
        member_count: formData.memberIds.length,
        group_type: formData.type,
        currency: formData.currency
      });
      setShowCreateModal(false);
      setFormData({
        name: "",
        description: "",
        type: "trip",
        currency: "INR",
        memberIds: [],
      });
      fetchGroups(true);
    } catch (error) {
      console.error("Failed to create group:", error);
      alert(error instanceof Error ? error.message : "Failed to create group");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleMemberSelection = (friendId: string) => {
    setFormData((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(friendId)
        ? prev.memberIds.filter((id) => id !== friendId)
        : [...prev.memberIds, friendId],
    }));
  };

  const formatCurrency = (amount: number, currency = "INR") => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const groupSimplifiedDebts = useMemo(() => {
    const record: Record<string, any[]> = {};
    for (const [groupId, balances] of Object.entries(groupMemberBalances)) {
      record[groupId] = simplifyGroupDebtsLocal(balances);
    }
    return record;
  }, [groupMemberBalances]);

  const filteredAndSortedGroups = useMemo(() => {
    let result = [...groups];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(g => g.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "balance") {
        const balA = Math.abs(groupBalances[a._id] ?? 0);
        const balB = Math.abs(groupBalances[b._id] ?? 0);
        return balB - balA;
      }
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    });

    return result;
  }, [groups, searchQuery, sortBy, groupBalances]);

  const activeAndSettled = useMemo(() => {
    const active: Group[] = [];
    const settled: Group[] = [];

    for (const group of filteredAndSortedGroups) {
      const balance = groupBalances[group._id] ?? 0;
      if (Math.abs(balance) <= 0.01) {
        settled.push(group);
      } else {
        active.push(group);
      }
    }

    return { active, settled };
  }, [groupBalances, filteredAndSortedGroups]);

  const overallBalance = useMemo(() => {
    return groups.reduce((sum, group) => sum + (groupBalances[group._id] ?? 0), 0);
  }, [groupBalances, groups]);

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
      <div className="p-4 md:p-8 space-y-6 pb-24 md:pb-8">
        <div className="flex items-center justify-between">
          <div className="md:hidden">
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Groups
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Your circles, totals, and what is left to settle
            </p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Create Group
          </Button>
        </div>

        <div
          className={`rounded-2xl bg-navy p-5 transition-all duration-300 ${
            isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          }`}
          style={{
            boxShadow:
              "0 18px 45px rgba(17, 24, 39, 0.22), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <p className="text-sm text-white/65">Overall balance</p>
          <p
            className={`mt-1 text-2xl md:text-3xl font-bold font-mono ${
              overallBalance < 0
                ? "text-coral"
                : overallBalance > 0
                ? "text-primary"
                : "text-white"
            }`}
          >
            {overallBalance < -0.01
              ? `Overall, you owe ${formatCurrency(Math.abs(overallBalance))}`
              : overallBalance > 0.01
              ? `Overall, you are owed ${formatCurrency(overallBalance)}`
              : "Overall, you are settled up"}
          </p>
          {balanceLoading && (
            <p className="mt-2 text-xs text-white/55">Refreshing group balances...</p>
          )}
        </div>

        {/* Search & Sort Panel */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
            <input
              type="text"
              placeholder="Search groups..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm text-neutral-900 dark:text-dark-text placeholder-neutral-400 focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>
          <div className="relative">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="w-full sm:w-auto appearance-none pl-10 pr-8 py-2.5 rounded-xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm font-medium text-neutral-700 dark:text-dark-text-secondary focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 cursor-pointer"
            >
              <option value="recent">Recent activity</option>
              <option value="name">Group name</option>
              <option value="balance">Net balance</option>
            </select>
            <ArrowUpDown className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 pointer-events-none" />
          </div>
        </div>

        {/* Non-Group Expenses Pinned Card */}
        <div
          className={`rounded-2xl border border-neutral-200 bg-white p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 dark:border-dark-border dark:bg-dark-bg-secondary ${
            isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 shrink-0 rounded-xl bg-neutral-100 text-2xl flex items-center justify-center dark:bg-dark-bg-tertiary">
              💼
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-neutral-900 dark:text-dark-text">
                Non-Group Expenses
              </p>
              <p
                className={`text-sm font-medium ${
                  nonGroupBalance < 0
                    ? "text-coral"
                    : nonGroupBalance > 0
                    ? "text-primary"
                    : "text-neutral-500 dark:text-dark-text-secondary"
                }`}
              >
                {nonGroupBalance < -0.01
                  ? `you owe ${formatCurrency(Math.abs(nonGroupBalance))}`
                  : nonGroupBalance > 0.01
                  ? `you are owed ${formatCurrency(nonGroupBalance)}`
                  : "you are settled"}
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
          </div>
        </div>

        <div className="space-y-3">
          {groups.length === 0 ? (
            <Card>
              <CardContent>
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                  <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                    No groups yet
                  </p>
                  <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                    Create a group to organize expenses with multiple friends
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <>
              {activeAndSettled.active.map((group, index) => {
                const balance = groupBalances[group._id] ?? 0;
                const simplified = groupSimplifiedDebts[group._id] || [];
                const myUserId = String(session?.user?.id || "");
                const userDebts = simplified.filter(
                  (tx) => tx.from.id === myUserId || tx.to.id === myUserId
                );

                return (
                  <Link key={group._id} href={`/groups/${group._id}`}>
                    <div
                      className={`flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 dark:border-dark-border dark:bg-dark-bg-secondary ${
                        isReady ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1"
                      }`}
                      style={{ transitionDelay: `${Math.min(index * 40, 240)}ms` }}
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`h-14 w-14 shrink-0 rounded-xl text-2xl flex items-center justify-center ${groupTypeColor(
                            group.type
                          )}`}
                        >
                          {groupTypeEmoji(group.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-neutral-900 dark:text-dark-text">
                              {group.name}
                            </p>
                            {group.type === "trip" && (
                              <Link
                                href={`/trip/${group._id}`}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Trip View ✈️
                              </Link>
                            )}
                          </div>
                          <p
                            className={`text-sm font-semibold ${
                              balance < 0
                                ? "text-coral"
                                : balance > 0
                                ? "text-primary"
                                : "text-neutral-500 dark:text-dark-text-secondary"
                            }`}
                          >
                            {balance < -0.01
                              ? `you owe ${formatCurrency(Math.abs(balance), group.currency || "INR")}`
                              : balance > 0.01
                              ? `you are owed ${formatCurrency(balance, group.currency || "INR")}`
                              : "settled up"}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                      </div>

                      {/* Sub-lines of largest balances */}
                      {userDebts.length > 0 && (
                        <div className="border-t border-neutral-100 dark:border-dark-border/40 pt-2.5 space-y-1">
                          {userDebts.slice(0, 2).map((tx, idx) => {
                            const isOwed = tx.to.id === myUserId;
                            return (
                              <p
                                key={idx}
                                className={`text-xs font-medium ${
                                  isOwed ? "text-primary/95" : "text-coral/95"
                                }`}
                              >
                                {isOwed
                                  ? `${tx.from.name} owes you ${formatCurrency(tx.amount, group.currency || "INR")}`
                                  : `You owe ${tx.to.name} ${formatCurrency(tx.amount, group.currency || "INR")}`}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}

              <div className="pt-2 text-center">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(true)}
                  className="w-full max-w-sm rounded-xl py-3 border-2 border-primary/20 text-primary hover:bg-primary/5 transition-all duration-200"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Start a new group
                </Button>
              </div>

              {activeAndSettled.settled.length > 0 && (
                <div className="pt-1">
                  <button
                    onClick={() => setShowSettledGroups((prev) => !prev)}
                    className="text-sm font-medium text-neutral-600 underline-offset-4 hover:underline dark:text-dark-text-secondary"
                  >
                    {showSettledGroups
                      ? `Hide ${activeAndSettled.settled.length} settled group${
                          activeAndSettled.settled.length === 1 ? "" : "s"
                        }`
                      : `Show ${activeAndSettled.settled.length} settled group${
                          activeAndSettled.settled.length === 1 ? "" : "s"
                        }`}
                  </button>
                </div>
              )}

              {showSettledGroups &&
                activeAndSettled.settled.map((group) => {
                  const balance = groupBalances[group._id] ?? 0;
                  return (
                    <Link key={`settled-${group._id}`} href={`/groups/${group._id}`}>
                      <div className="flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white/75 p-4 transition-all duration-300 hover:shadow-md hover:-translate-y-0.5 dark:border-dark-border dark:bg-dark-bg-secondary/80">
                        <div
                          className={`h-14 w-14 shrink-0 rounded-xl text-2xl flex items-center justify-center ${groupTypeColor(
                            group.type
                          )}`}
                        >
                          {groupTypeEmoji(group.type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-semibold text-neutral-900 dark:text-dark-text">
                              {group.name}
                            </p>
                            {group.type === "trip" && (
                              <Link
                                href={`/trip/${group._id}`}
                                className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Trip View ✈️
                              </Link>
                            )}
                          </div>
                          <p className="text-sm font-medium text-neutral-500 dark:text-dark-text-secondary">
                            you are settled
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 shrink-0 text-neutral-400" />
                      </div>
                    </Link>
                  );
                })}
            </>
          )}
        </div>

        <Modal
          isOpen={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setFormData({
              name: "",
              description: "",
              type: "trip",
              currency: "INR",
              memberIds: [],
            });
          }}
          title="Create New Group"
        >
          <div className="space-y-4">
            <Input
              label="Group Name"
              type="text"
              placeholder="e.g., Goa Trip"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
            />

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, description: e.target.value }))
                }
                placeholder="What's this group for?"
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                rows={3}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Type
              </label>
              <select
                value={formData.type}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, type: e.target.value }))
                }
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
              >
                <option value="trip">Trip</option>
                <option value="home">Home</option>
                <option value="couple">Couple</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Add Members
              </label>
              <div className="max-h-48 overflow-y-auto space-y-2 border border-neutral-200 dark:border-dark-border rounded-lg p-2">
                {friends.length === 0 ? (
                  <p className="text-sm text-neutral-500 text-center py-4">
                    No friends to add
                  </p>
                ) : (
                  friends.map((friend) => (
                    <label
                      key={friend._id}
                      className="flex items-center gap-3 p-2 hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={formData.memberIds.includes(friend._id)}
                        onChange={() => toggleMemberSelection(friend._id)}
                        className="rounded border-neutral-300"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{friend.name}</p>
                        <p className="text-xs text-neutral-500">{friend.email}</p>
                      </div>
                      {friend.balance !== 0 && (
                        <div className="text-right">
                          <span
                            className={`text-xs font-medium ${
                              friend.balance > 0
                                ? "text-green-600 dark:text-green-400"
                                : "text-red-600 dark:text-red-400"
                            }`}
                          >
                            {friend.balance > 0 ? "+" : ""}₹{Math.abs(friend.balance)}
                          </span>
                          <p className="text-xs text-neutral-500">
                            {friend.balance > 0 ? "Owes you" : "You owe"}
                          </p>
                        </div>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => setShowCreateModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button onClick={createGroup} disabled={!formData.name || submitting}>
                {submitting ? "Creating..." : "Create Group"}
              </Button>
            </div>
          </div>
        </Modal>
        
        {/* Floating Add Expense Button */}
        <Link
          href="/expenses/add"
          className="fixed bottom-24 right-4 z-40 flex items-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-medium text-white shadow-xl transition-all duration-300 hover:bg-primary-dark"
        >
          <Plus className="h-5 w-5" />
          Add Expense
        </Link>
      </div>
    </AppShell>
  );
}

