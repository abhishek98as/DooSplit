"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, Users, Receipt, AlertCircle, Clock, User, Users as UsersIcon } from "lucide-react";
import Link from "next/link";
import getOfflineStore from "@/lib/offline-store";

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

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [balance, setBalance] = useState<BalanceData>({
    total: 0,
    youOwe: 0,
    youAreOwed: 0,
  });
  const [friends, setFriends] = useState<FriendDisplay[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupBalances, setGroupBalances] = useState<GroupBalance[]>([]);
  const [monthlySpending, setMonthlySpending] = useState(0);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status]);

  const fetchDashboardData = async () => {
    setError(null);
    try {
      // Fetch friends with balances using offline store
      const rawFriends = await offlineStore.getFriends();

        // Map API response structure to display structure
        // API returns: { id, friend: { id, name, email, profilePicture }, balance }
        const mappedFriends: FriendDisplay[] = rawFriends.map((item: any) => ({
          _id: item.friend?.id || item.id || item._id,
          name: item.friend?.name || item.name || "Unknown",
          email: item.friend?.email || item.email || "",
          profilePicture: item.friend?.profilePicture || item.profilePicture,
          balance: item.balance || 0,
        }));

        setFriends(mappedFriends);

        // Calculate total balance from friends
        const youOwe = mappedFriends
          .filter((f: FriendDisplay) => f.balance < 0)
          .reduce((sum: number, f: FriendDisplay) => sum + Math.abs(f.balance), 0);
        const youAreOwed = mappedFriends
          .filter((f: FriendDisplay) => f.balance > 0)
          .reduce((sum: number, f: FriendDisplay) => sum + f.balance, 0);

        setBalance({
          total: youAreOwed - youOwe,
          youOwe,
          youAreOwed,
        });

      // Fetch groups using offline store
      const groupsData = await offlineStore.getGroups();
      setGroups(groupsData || []);

        // Calculate group balances by fetching expenses for each group
        const groupsWithBalances: GroupBalance[] = [];

        for (const group of groupsData.groups || []) {
          try {
            // Fetch expenses for this group using offline store
            const expenses = await offlineStore.getExpenses({
              groupId: group._id,
              limit: 100
            });

              // Calculate user's balance in this group
              // Positive balance means group owes user money
              // Negative balance means user owes group money
              let groupBalance = 0;
              expenses.forEach((expense: any) => {
                const userParticipant = expense.participants?.find(
                  (p: any) => p.userId?._id === session?.user?.id || p.userId === session?.user?.id
                );
                if (userParticipant) {
                  // Net position = what user paid - what user owes
                  const userNetPosition = userParticipant.paidAmount - userParticipant.owedAmount;
                  groupBalance += userNetPosition;
                }
              });

              if (groupBalance !== 0) {
                groupsWithBalances.push({
                  _id: group._id,
                  name: group.name,
                  balance: groupBalance,
                  memberCount: group.members?.length || 0
                });
              }
            }
          } catch (err) {
            console.warn(`Failed to calculate balance for group ${group._id}:`, err);
          }
        }

        // Sort by absolute balance and take top 3
        groupsWithBalances
          .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
          .splice(3); // Keep only top 3

        setGroupBalances(groupsWithBalances);
      }

      // Fetch this month's expenses using offline store
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

      const expenses = await offlineStore.getExpenses({
        dateRange: { start: startOfMonth.toISOString(), end: now.toISOString() },
        limit: 1000
      });
        
        // Calculate total spending for this month
        const total = expenses.reduce((sum: number, expense: any) => {
          // Find user's share in this expense
          const userParticipant = expense.participants?.find(
            (p: any) => p.userId?._id === session?.user?.id || p.userId === session?.user?.id
          );
          return sum + (userParticipant?.owedAmount || 0);
        }, 0);
        
        setMonthlySpending(total);
      }

      // Fetch recent activities (keep using direct fetch for now as it's not in offline store)
      const activitiesRes = await fetch("/api/dashboard/activity");
      if (activitiesRes.ok) {
        const activitiesData = await activitiesRes.json();
        setActivities(activitiesData.activities || []);
      }
    } catch (err: any) {
      console.error("Failed to fetch dashboard data:", err);
      setError("Failed to load dashboard data. Please try refreshing the page.");
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
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
        {/* Error Banner */}
        {error && (
          <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
            <Button variant="secondary" className="ml-auto !px-3 !py-1 text-xs" onClick={() => { setLoading(true); fetchDashboardData(); }}>
              Retry
            </Button>
          </div>
        )}

        {/* Header */}
        <div>
          <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
            Dashboard
          </h1>
          <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
            Welcome back! Here's your expense summary.
          </p>
        </div>

        {/* Balance Summary */}
        <div className="bg-gradient-to-br from-primary/10 to-success/10 rounded-xl p-6">
          <p className="text-sm text-neutral-600 dark:text-dark-text-secondary mb-2">
            Total Balance
          </p>
          <p className={`text-4xl font-bold font-mono ${
            balance.total > 0
              ? "text-success"
              : balance.total < 0
              ? "text-coral"
              : "text-neutral-900 dark:text-dark-text"
          }`}>
            {formatCurrency(balance.total)}
          </p>
          <div className="grid grid-cols-2 gap-4 mt-6">
            <div className="bg-white/60 dark:bg-dark-bg-secondary/60 rounded-lg p-4">
              <div className="flex items-center text-coral mb-2">
                <ArrowUpCircle className="h-4 w-4 mr-1" />
                <span className="text-xs font-medium">You Owe</span>
              </div>
              <p className="text-xl font-semibold font-mono text-coral">
                {formatCurrency(balance.youOwe)}
              </p>
            </div>
            <div className="bg-white/60 dark:bg-dark-bg-secondary/60 rounded-lg p-4">
              <div className="flex items-center text-success mb-2">
                <ArrowDownCircle className="h-4 w-4 mr-1" />
                <span className="text-xs font-medium">You're Owed</span>
              </div>
              <p className="text-xl font-semibold font-mono text-success">
                {formatCurrency(balance.youAreOwed)}
              </p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  This Month
                </p>
                <p className="text-2xl font-semibold mt-1 font-mono">
                  {formatCurrency(monthlySpending)}
                </p>
              </div>
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  Active Groups
                </p>
                <p className="text-2xl font-semibold mt-1">{groups.length}</p>
              </div>
              <div className="h-12 w-12 bg-success/10 rounded-full flex items-center justify-center">
                <span className="text-2xl">👥</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  Friends
                </p>
                <p className="text-2xl font-semibold mt-1">{friends.length}</p>
              </div>
              <div className="h-12 w-12 bg-info/10 rounded-full flex items-center justify-center">
                <span className="text-2xl">👤</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Balances */}
        {friends.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Top Balances</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {friends
                  .filter((f) => f.balance !== 0)
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
                            {friend.name.charAt(0).toUpperCase()}
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
                          friend.balance > 0
                            ? "text-success"
                            : "text-coral"
                        }`}
                      >
                        {friend.balance > 0 ? "+" : ""}
                        {formatCurrency(friend.balance)}
                      </div>
                    </div>
                  ))}
                {friends.filter((f) => f.balance !== 0).length === 0 && (
                  <div className="text-center py-8 text-neutral-500">
                    <p>All settled up! 🎉</p>
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
        )}

        {/* Group Balances */}
        {groupBalances.length > 0 && (
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
                          {group.name.charAt(0).toUpperCase()}
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
                        group.balance > 0
                          ? "text-success"
                          : "text-coral"
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
        )}

        {/* Recent Activity */}
        {activities.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activities.slice(0, 10).map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-start gap-3 p-3 rounded-lg border border-neutral-200 dark:border-dark-border hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
                  >
                    <div className="flex-shrink-0">
                      {activity.type === "expense_added" && <Receipt className="h-5 w-5 text-primary" />}
                      {activity.type === "settlement" && <ArrowUpCircle className="h-5 w-5 text-success" />}
                      {activity.type === "friend_added" && <User className="h-5 w-5 text-info" />}
                      {activity.type === "group_created" && <UsersIcon className="h-5 w-5 text-warning" />}
                      {!["expense_added", "settlement", "friend_added", "group_created"].includes(activity.type) && <Clock className="h-5 w-5 text-neutral-400" />}
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
                        <p className="text-xs text-neutral-500 dark:text-dark-text-secondary">
                          {new Date(activity.createdAt).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
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
        )}

        {friends.length === 0 && (
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
    </AppShell>
  );
}
