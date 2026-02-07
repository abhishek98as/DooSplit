"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ArrowUpCircle, ArrowDownCircle, TrendingUp, Users, Receipt } from "lucide-react";
import Link from "next/link";

interface BalanceData {
  total: number;
  youOwe: number;
  youAreOwed: number;
}

interface Friend {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
}

export default function DashboardPage() {
  const { data: session } = useSession();
  const [balance, setBalance] = useState<BalanceData>({
    total: 0,
    youOwe: 0,
    youAreOwed: 0,
  });
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (session) {
      fetchDashboardData();
    }
  }, [session]);

  const fetchDashboardData = async () => {
    try {
      // Fetch friends with balances
      const friendsRes = await fetch("/api/friends");
      if (friendsRes.ok) {
        const friendsData = await friendsRes.json();
        setFriends(friendsData.friends || []);

        // Calculate total balance from friends
        const balances = friendsData.friends || [];
        const youOwe = balances
          .filter((f: Friend) => f.balance < 0)
          .reduce((sum: number, f: Friend) => sum + Math.abs(f.balance), 0);
        const youAreOwed = balances
          .filter((f: Friend) => f.balance > 0)
          .reduce((sum: number, f: Friend) => sum + f.balance, 0);

        setBalance({
          total: youAreOwed - youOwe,
          youOwe,
          youAreOwed,
        });
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
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

  if (loading) {
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
                <p className="text-2xl font-semibold mt-1 font-mono">₹0</p>
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
                <p className="text-2xl font-semibold mt-1">0</p>
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

        {/* Recent Activity */}
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
