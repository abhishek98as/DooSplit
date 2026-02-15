"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useParams, useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import {
  Users,
  Receipt,
  Plus,
  UserPlus,
  ArrowLeft,
  Trash2,
  ChevronRight,
  DollarSign,
} from "lucide-react";
import Link from "next/link";

interface GroupMember {
  _id: string;
  userId: {
    _id: string;
    name: string;
    email: string;
    profilePicture?: string;
  };
  role: string;
  joinedAt: string;
}

interface GroupExpense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  createdBy: {
    _id: string;
    name: string;
  };
  participants: Array<{
    userId: string;
    paidAmount: number;
    owedAmount: number;
  }>;
}

interface Group {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  type: string;
  currency: string;
  createdBy: {
    _id: string;
    name: string;
  };
  members: GroupMember[];
  balances?: Balance[];
  memberCount: number;
  userRole: string;
  createdAt: string;
}

interface Balance {
  userId: string;
  userName: string;
  balance: number;
}

export default function GroupDetailPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useParams();
  const groupId = params.id as string;

  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<GroupExpense[]>([]);
  const [balances, setBalances] = useState<Balance[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchGroupDetails();
      fetchGroupExpenses();
    }
  }, [status, groupId]);

  const fetchGroupDetails = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}`);
      if (!response.ok) {
        if (response.status === 404) {
          router.push("/groups");
          return;
        }
        throw new Error("Failed to fetch group");
      }
      const data = await response.json();
      setGroup(data.group);
      const incomingBalances = Array.isArray(data.group?.balances)
        ? data.group.balances
        : [];
      if (incomingBalances.length > 0) {
        setBalances(
          incomingBalances.map((item: any) => ({
            userId: String(item.userId || ""),
            userName: String(item.userName || "Unknown"),
            balance: Number(item.balance || 0),
          }))
        );
      } else {
        setBalances(
          (data.group?.members || []).map((member: GroupMember) => ({
            userId: member.userId._id,
            userName: member.userId.name,
            balance: 0,
          }))
        );
      }
    } catch (error) {
      console.error("Error fetching group:", error);
    }
  };

  const fetchGroupExpenses = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/expenses?groupId=${groupId}&limit=10`);
      if (response.ok) {
        const data = await response.json();
        setExpenses(data.expenses || []);
      }
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async () => {
    setDeleting(true);
    try {
      const response = await fetch(`/api/groups/${groupId}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete group");

      router.push("/groups");
    } catch (error) {
      console.error("Error deleting group:", error);
      alert("Failed to delete group");
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  const handleLeaveGroup = async () => {
    try {
      const response = await fetch(`/api/groups/${groupId}/members`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: session?.user?.id }),
      });

      if (!response.ok) throw new Error("Failed to leave group");

      router.push("/groups");
    } catch (error) {
      console.error("Error leaving group:", error);
      alert("Failed to leave group");
    }
  };

  const formatCurrency = (amount: number, currency: string = "INR") => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      food: "🍔",
      transport: "🚗",
      shopping: "🛒",
      entertainment: "🎬",
      bills: "📄",
      healthcare: "⚕️",
      travel: "✈️",
      other: "📦",
    };
    return icons[category] || "📦";
  };

  if (loading || !group) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[400px]">
          <LoadingSpinner />
        </div>
      </AppShell>
    );
  }

  const isAdmin = group.userRole === "admin";
  const totalSpent = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push("/groups")}
              className="p-2 hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary rounded-lg transition-colors"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
                {group.name}
              </h1>
              {group.description && (
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
                  {group.description}
                </p>
              )}
            </div>
          </div>
          {isAdmin && (
            <Button
              variant="destructive"
              onClick={() => setShowDeleteModal(true)}
              className="flex items-center gap-2"
            >
              <Trash2 className="h-4 w-4" />
              Delete Group
            </Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  Total Spent
                </p>
                <p className="text-2xl font-semibold mt-1 font-mono">
                  {formatCurrency(totalSpent, group.currency)}
                </p>
              </div>
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-primary" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  Members
                </p>
                <p className="text-2xl font-semibold mt-1">{group.memberCount}</p>
              </div>
              <div className="h-12 w-12 bg-success/10 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-success" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center justify-between">
              <div>
                <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                  Expenses
                </p>
                <p className="text-2xl font-semibold mt-1">{expenses.length}</p>
              </div>
              <div className="h-12 w-12 bg-info/10 rounded-full flex items-center justify-center">
                <Receipt className="h-6 w-6 text-info" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          <Link href={`/expenses/add?groupId=${groupId}`}>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Add Expense
            </Button>
          </Link>
          {isAdmin && (
            <Button variant="secondary" className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Members
            </Button>
          )}
          {!isAdmin && (
            <Button
              variant="destructive"
              onClick={handleLeaveGroup}
              className="flex items-center gap-2"
            >
              Leave Group
            </Button>
          )}
        </div>

        {/* Members */}
        <Card>
          <CardHeader>
            <CardTitle>Members ({group.memberCount})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {group.members.map((member) => (
                <div
                  key={member._id}
                  className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                      <span className="text-primary font-semibold">
                        {member.userId.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium text-neutral-900 dark:text-dark-text">
                        {member.userId.name}
                        {member.userId._id === session?.user?.id && " (You)"}
                      </p>
                      <p className="text-sm text-neutral-500">{member.userId.email}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p
                      className={`text-xs px-2 py-1 rounded ${
                        member.role === "admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
                      }`}
                    >
                      {member.role}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Member Balances */}
        <Card>
          <CardHeader>
            <CardTitle>Member Balances</CardTitle>
          </CardHeader>
          <CardContent>
            {balances.length === 0 ? (
              <p className="text-sm text-neutral-500 dark:text-dark-text-secondary">
                No balance data available.
              </p>
            ) : (
              <div className="space-y-3">
                {balances
                  .slice()
                  .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
                  .map((entry) => {
                    const isCurrentUser = entry.userId === session?.user?.id;
                    return (
                      <div
                        key={entry.userId}
                        className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                      >
                        <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                          {entry.userName}
                          {isCurrentUser ? " (You)" : ""}
                        </p>
                        <p
                          className={`text-sm font-semibold ${
                            entry.balance > 0
                              ? "text-green-600 dark:text-green-400"
                              : entry.balance < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-neutral-500 dark:text-dark-text-secondary"
                          }`}
                        >
                          {entry.balance === 0
                            ? "Settled"
                            : `${formatCurrency(Math.abs(entry.balance), group.currency)} ${entry.balance > 0 ? "to receive" : "to pay"}`}
                        </p>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Expenses */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Expenses</CardTitle>
              <Link href={`/expenses?groupId=${groupId}`}>
                <Button variant="secondary" size="sm">
                  View All
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {expenses.length === 0 ? (
              <div className="text-center py-12">
                <Receipt className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  No expenses yet
                </p>
                <Link href={`/expenses/add?groupId=${groupId}`} className="inline-block mt-4">
                  <Button>Add First Expense</Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {expenses.map((expense) => (
                  <Link
                    key={expense._id}
                    href={`/expenses/edit/${expense._id}`}
                    className="flex items-center justify-between py-3 border-b border-neutral-200 dark:border-dark-border last:border-0 hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary rounded px-2 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{getCategoryIcon(expense.category)}</div>
                      <div>
                        <p className="font-medium text-neutral-900 dark:text-dark-text">
                          {expense.description}
                        </p>
                        <p className="text-sm text-neutral-500">
                          Paid by {expense.createdBy.name} • {formatDate(expense.date)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-neutral-900 dark:text-dark-text font-mono">
                        {formatCurrency(expense.amount, expense.currency)}
                      </p>
                      <ChevronRight className="h-4 w-4 text-neutral-400" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={showDeleteModal}
          onClose={() => setShowDeleteModal(false)}
          title="Delete Group"
        >
          <div className="space-y-4">
            <p className="text-body text-neutral-600 dark:text-dark-text-secondary">
              Are you sure you want to delete &quot;{group.name}&quot;? This action cannot be undone and
              all group data will be permanently deleted.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
              >
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteGroup} disabled={deleting}>
                {deleting ? "Deleting..." : "Delete Group"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
