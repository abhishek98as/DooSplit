"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { ArrowLeft, Mail, Calendar, DollarSign, TrendingUp, TrendingDown, MessageSquare, Filter } from "lucide-react";
import Image from "next/image";

interface Friend {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
}

interface Transaction {
  id: string;
  type: "expense" | "settlement";
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
  isSettlement: boolean;
  group?: {
    id: string;
    name: string;
  };
}

export default function FriendProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const friendId = params.id as string;

  const [friend, setFriend] = useState<Friend | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "expenses" | "settlements">("all");

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated" && friendId) {
      fetchFriendData();
    }
  }, [status, friendId]);

  const fetchFriendData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch friend details
      const friendRes = await fetch(`/api/friends/${friendId}`);
      if (!friendRes.ok) {
        if (friendRes.status === 404) {
          setError("Friend not found");
          return;
        }
        throw new Error("Failed to fetch friend details");
      }

      const friendData = await friendRes.json();
      setFriend(friendData.friend);

      // Fetch transaction history with this friend
      const transactionsRes = await fetch(`/api/friends/${friendId}/transactions`);
      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        setTransactions(transactionsData.transactions || []);
      }
    } catch (err: any) {
      console.error("Failed to fetch friend data:", err);
      setError("Failed to load friend data. Please try refreshing the page.");
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

  const filteredTransactions = transactions.filter(transaction => {
    if (filter === "all") return true;
    if (filter === "expenses") return !transaction.isSettlement;
    if (filter === "settlements") return transaction.isSettlement;
    return true;
  });

  const totalExpenses = transactions
    .filter(t => !t.isSettlement)
    .reduce((sum, t) => sum + t.amount, 0);

  const totalSettlements = transactions
    .filter(t => t.isSettlement)
    .reduce((sum, t) => sum + t.amount, 0);

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      </AppShell>
    );
  }

  if (error) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          <div className="bg-error/10 border border-error/20 text-error px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
          <Link href="/friends">
            <Button variant="secondary">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Friends
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  if (!friend) {
    return (
      <AppShell>
        <div className="max-w-4xl mx-auto p-4 md:p-8">
          <div className="text-center py-12">
            <p className="text-neutral-500">Friend not found</p>
            <Link href="/friends" className="inline-block mt-4">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Friends
              </Button>
            </Link>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link href="/friends">
            <Button variant="secondary" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              {friend.name}
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Friend Profile
            </p>
          </div>
        </div>

        {/* Profile Card */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              {/* Avatar */}
              <div className="flex-shrink-0">
                {friend.profilePicture ? (
                  <Image
                    src={friend.profilePicture}
                    alt={friend.name}
                    width={80}
                    height={80}
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-2xl font-semibold text-primary">
                      {friend.name.charAt(0).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Profile Info */}
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-neutral-900 dark:text-dark-text mb-2">
                  {friend.name}
                </h2>

                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-dark-text-secondary">
                    <Mail className="h-4 w-4" />
                    <span>{friend.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-neutral-600 dark:text-dark-text-secondary">
                    <Calendar className="h-4 w-4" />
                    <span>Friends since {new Date().toLocaleDateString()}</span>
                  </div>
                </div>

                {/* Balance Summary */}
                <div className="bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                        Current Balance
                      </p>
                      <p className={`text-2xl font-bold font-mono mt-1 ${
                        friend.balance > 0
                          ? "text-success"
                          : friend.balance < 0
                          ? "text-coral"
                          : "text-neutral-900 dark:text-dark-text"
                      }`}>
                        {friend.balance > 0 ? "+" : ""}
                        {formatCurrency(friend.balance)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-neutral-600 dark:text-dark-text-secondary">
                        {friend.balance > 0 ? "You are owed" : friend.balance < 0 ? "You owe" : "Settled up"}
                      </p>
                      {friend.balance !== 0 && (
                        <Link href={`/settlements?friend=${friend._id}`} className="inline-block mt-2">
                          <Button size="sm">
                            {friend.balance > 0 ? "Request Payment" : "Settle Up"}
                          </Button>
                        </Link>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Transaction History</CardTitle>
              <div className="flex items-center gap-2">
                <Filter className="h-4 w-4 text-neutral-500" />
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value as "all" | "expenses" | "settlements")}
                  className="text-sm border border-neutral-300 rounded px-3 py-1 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="all">All Transactions</option>
                  <option value="expenses">Expenses Only</option>
                  <option value="settlements">Settlements Only</option>
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Summary Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Total Expenses</span>
                </div>
                <p className="text-xl font-semibold font-mono">{formatCurrency(totalExpenses)}</p>
              </div>
              <div className="bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-success" />
                  <span className="text-sm font-medium">Total Settlements</span>
                </div>
                <p className="text-xl font-semibold font-mono">{formatCurrency(totalSettlements)}</p>
              </div>
              <div className="bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-5 w-5 text-info" />
                  <span className="text-sm font-medium">Total Transactions</span>
                </div>
                <p className="text-xl font-semibold">{transactions.length}</p>
              </div>
            </div>

            {/* Transactions List */}
            <div className="space-y-3">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-4 border border-neutral-200 dark:border-dark-border rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex-shrink-0">
                        {transaction.isSettlement ? (
                          <TrendingUp className="h-5 w-5 text-success" />
                        ) : (
                          <DollarSign className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                          {transaction.description}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-dark-text-secondary mt-1">
                          <span>{new Date(transaction.createdAt).toLocaleDateString()}</span>
                          {transaction.group && (
                            <>
                              <span>•</span>
                              <span>{transaction.group.name}</span>
                            </>
                          )}
                          <span>•</span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            transaction.isSettlement
                              ? "bg-success/10 text-success"
                              : "bg-primary/10 text-primary"
                          }`}>
                            {transaction.isSettlement ? "Settlement" : "Expense"}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-semibold font-mono ${
                        transaction.isSettlement ? "text-success" : "text-neutral-900 dark:text-dark-text"
                      }`}>
                        {transaction.isSettlement ? "+" : "-"}
                        {formatCurrency(transaction.amount)}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12">
                  <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p className="text-neutral-500 dark:text-dark-text-secondary">
                    {filter === "all"
                      ? "No transactions yet"
                      : `No ${filter.slice(0, -1)}s found`
                    }
                  </p>
                  <p className="text-sm text-neutral-400 mt-1">
                    Expenses and settlements with {friend.name} will appear here
                  </p>
                </div>
              )}
            </div>

            {/* Add Expense Button */}
            {filteredTransactions.length > 0 && (
              <div className="mt-6 pt-4 border-t border-neutral-200 dark:border-dark-border">
                <Link href={`/expenses/add?friend=${friend._id}`}>
                  <Button className="w-full">
                    <DollarSign className="h-4 w-4 mr-2" />
                    Add Expense with {friend.name}
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}