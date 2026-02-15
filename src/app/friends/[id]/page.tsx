"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Modal from "@/components/ui/Modal";
import { ArrowLeft, Mail, Calendar, DollarSign, TrendingUp, TrendingDown, MessageSquare, Filter, Bell, Download, BarChart3, Users } from "lucide-react";
import Image from "next/image";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Friend {
  _id: string;
  name: string;
  email: string;
  profilePicture?: string;
  balance: number;
  friendsSince: string;
}

interface GroupBreakdown {
  groupId: string;
  groupName: string;
  balance: number;
  lastActivity: string | null;
}

interface Transaction {
  id: string;
  type: "expense" | "settlement";
  description: string;
  amount: number;
  currency: string;
  createdAt: string;
  isSettlement: boolean;
  settled?: boolean;
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
  const [groupBreakdown, setGroupBreakdown] = useState<GroupBreakdown[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "expenses" | "settlements">("all");
  const [showSettled, setShowSettled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('showSettledTransactions') !== 'false';
    }
    return true;
  });
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderAmount, setReminderAmount] = useState("");
  const [reminderMessage, setReminderMessage] = useState("");
  const [sendingReminder, setSendingReminder] = useState(false);
  const [stats, setStats] = useState<any>(null);
  const [showCharts, setShowCharts] = useState(true);

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
      setGroupBreakdown(friendData.groupBreakdown || []);

      // Fetch transaction history with this friend
      const transactionsRes = await fetch(`/api/friends/${friendId}/transactions`);
      if (transactionsRes.ok) {
        const transactionsData = await transactionsRes.json();
        setTransactions(transactionsData.transactions || []);
      }

      // Fetch statistics
      const statsRes = await fetch(`/api/friends/${friendId}/stats`);
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch (err) {
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

  const handleSendReminder = (friend: Friend) => {
    if (friend.balance > 0) {
      setReminderAmount(friend.balance.toString());
      setReminderMessage(`Hi, just a friendly reminder about the ${formatCurrency(friend.balance)} you owe me. Let's settle up!`);
      setShowReminderModal(true);
    }
  };

  const handleSendReminderSubmit = async () => {
    if (!friend || !reminderAmount) return;

    setSendingReminder(true);
    try {
      const response = await fetch("/api/payment-reminders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          toUserId: friend._id,
          amount: parseFloat(reminderAmount),
          currency: "INR",
          message: reminderMessage.trim() || undefined,
        }),
      });

      if (response.ok) {
        setShowReminderModal(false);
        setReminderAmount("");
        setReminderMessage("");
        // Could add a success toast here
      } else {
        const errorData = await response.json();
        setError(errorData.error || "Failed to send reminder");
      }
    } catch (err) {
      setError("Failed to send reminder");
    } finally {
      setSendingReminder(false);
    }
  };

  const filteredTransactions = transactions.filter(transaction => {
    // Filter by type
    if (filter === "expenses" && transaction.isSettlement) return false;
    if (filter === "settlements" && !transaction.isSettlement) return false;

    // Filter by settled status (only for expenses)
    if (!showSettled && !transaction.isSettlement) {
      // For expenses, we need to check if all participants are settled
      // For now, assume we have a settled flag on transactions
      if (transaction.settled) return false;
    }

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
                        <div className="flex gap-2 mt-2">
                          {friend.balance > 0 && (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleSendReminder(friend)}
                            >
                              <Bell className="h-4 w-4 mr-1" />
                              Remind
                            </Button>
                          )}
                          <Link href={`/settlements?friend=${friend._id}`}>
                            <Button size="sm">
                              {friend.balance > 0 ? "Request Payment" : "Settle Up"}
                            </Button>
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Group Breakdown */}
        {groupBreakdown.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Group Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {groupBreakdown.map((group) => (
                  <div key={group.groupId} className="flex items-center justify-between p-3 bg-neutral-50 dark:bg-dark-bg-secondary rounded-lg">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-neutral-500" />
                        <span className="font-medium text-neutral-900 dark:text-dark-text">{group.groupName}</span>
                      </div>
                      {group.lastActivity && (
                        <p className="text-xs text-neutral-500 mt-1">
                          Last activity: {new Date(group.lastActivity).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric'
                          })}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <div className={`font-semibold ${
                        group.balance === 0
                          ? 'text-neutral-500'
                          : group.balance > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {group.balance === 0
                          ? 'Settled'
                          : `₹${Math.abs(group.balance).toLocaleString("en-IN")}`}
                      </div>
                      <div className={`text-xs ${
                        group.balance === 0
                          ? 'text-neutral-400'
                          : group.balance > 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}>
                        {group.balance === 0
                          ? 'Balanced'
                          : group.balance > 0
                          ? 'You are owed'
                          : 'You owe'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Expense Charts */}
        {stats && showCharts && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Monthly Trend Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Monthly Spending Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-w-0 w-full">
                  <ResponsiveContainer width="100%" height={256} minWidth={240}>
                    <LineChart data={stats.monthlyTrend}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip formatter={(value) => [`₹${value}`, 'Amount']} />
                      <Line type="monotone" dataKey="amount" stroke="#00B8A9" strokeWidth={2} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Category Breakdown */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-primary" />
                  Category Breakdown
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="min-w-0 w-full">
                  <ResponsiveContainer width="100%" height={256} minWidth={240}>
                    <PieChart>
                      <Pie
                        data={stats.categoryBreakdown}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => `${name} ${Math.round((percent || 0) * 100)}%`}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="amount"
                      >
                        {stats.categoryBreakdown.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={['#00B8A9', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FECA57'][index % 6]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => [`₹${value}`, 'Amount']} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Transaction History</CardTitle>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(`/api/friends/${friendId}/export`, '_blank')}
                  className="flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Export
                </Button>
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
                <button
                  onClick={() => {
                    setShowSettled(!showSettled);
                    localStorage.setItem('showSettledTransactions', (!showSettled).toString());
                  }}
                  className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    showSettled
                      ? 'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700'
                      : 'bg-blue-100 text-blue-900 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-100 dark:hover:bg-blue-800'
                  }`}
                >
                  {showSettled ? 'Hide Settled' : 'Show Settled'}
                </button>
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

      {/* Payment Reminder Modal */}
      <Modal
        isOpen={showReminderModal}
        onClose={() => {
          setShowReminderModal(false);
          setReminderAmount("");
          setReminderMessage("");
        }}
        title={`Send Payment Reminder to ${friend?.name}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
              Amount <span className="text-error">*</span>
            </label>
            <Input
              type="number"
              placeholder="0.00"
              value={reminderAmount}
              onChange={(e) => setReminderAmount(e.target.value)}
              icon={<DollarSign className="h-5 w-5" />}
            />
            <p className="text-xs text-neutral-500 mt-1">
              Friend owes: {friend ? formatCurrency(Math.abs(friend.balance)) : ""}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
              Message (Optional)
            </label>
            <textarea
              className="w-full px-4 py-2 border border-neutral-300 dark:border-dark-border rounded-md text-body focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
              rows={3}
              placeholder="Add a personal message..."
              value={reminderMessage}
              onChange={(e) => setReminderMessage(e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-4">
            <Button
              variant="secondary"
              onClick={() => setShowReminderModal(false)}
              disabled={sendingReminder}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendReminderSubmit}
              disabled={!reminderAmount || sendingReminder}
            >
              {sendingReminder ? "Sending..." : "Send Reminder"}
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
