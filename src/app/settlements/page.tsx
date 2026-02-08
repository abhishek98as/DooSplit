"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { DollarSign, Plus, ArrowRight, Wallet, Bell, CheckCircle, Clock, Download } from "lucide-react";
import Modal from "@/components/ui/Modal";

interface Settlement {
  _id: string;
  fromUserId: {
    _id: string;
    name: string;
    email: string;
  };
  toUserId: {
    _id: string;
    name: string;
    email: string;
  };
  amount: number;
  currency: string;
  method: string;
  note: string;
  date: string;
}

interface FriendDisplay {
  _id: string;
  name: string;
  email: string;
  balance: number;
}

export default function SettlementsPage() {
  const { data: session, status } = useSession();
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [friends, setFriends] = useState<FriendDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState<string>("");
  const [selectedFriendBalance, setSelectedFriendBalance] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<"settlements" | "reminders">("settlements");
  const [reminders, setReminders] = useState<any[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/auth/login";
    } else if (status === "authenticated") {
      fetchSettlements();
      fetchFriends();
      fetchReminders();
    }
  }, [status]);

  const fetchReminders = async () => {
    setRemindersLoading(true);
    try {
      const [receivedRes, sentRes] = await Promise.all([
        fetch("/api/payment-reminders?type=received"),
        fetch("/api/payment-reminders?type=sent")
      ]);

      if (receivedRes.ok && sentRes.ok) {
        const receivedData = await receivedRes.json();
        const sentData = await sentRes.json();
        // Combine and sort by createdAt
        const allReminders = [...receivedData.reminders, ...sentData.reminders]
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setReminders(allReminders);
      }
    } catch (error) {
      console.error("Failed to fetch reminders:", error);
    } finally {
      setRemindersLoading(false);
    }
  };

  const exportSettlements = async () => {
    try {
      const response = await fetch("/api/settlements/export");
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `settlements_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
      } else {
        console.error("Failed to export settlements");
      }
    } catch (error) {
      console.error("Export error:", error);
    }
  };

  const fetchSettlements = async () => {
    try {
      const res = await fetch("/api/settlements");
      if (res.ok) {
        const data = await res.json();
        setSettlements(data.settlements || []);
      }
    } catch (error) {
      console.error("Failed to fetch settlements:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchFriends = async () => {
    try {
      const res = await fetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        const rawFriends = data.friends || [];
        // Map API response structure: { id, friend: { id, name, email }, balance }
        const mappedFriends: FriendDisplay[] = rawFriends.map((item: any) => ({
          _id: item.friend?.id || item.id || item._id,
          name: item.friend?.name || item.name || "Unknown",
          email: item.friend?.email || item.email || "",
          balance: item.balance || 0,
        }));
        setFriends(mappedFriends);
      }
    } catch (error) {
      console.error("Failed to fetch friends:", error);
    }
  };

  const recordSettlement = async () => {
    if (!selectedFriend || !amount) return;

    setSubmitting(true);
    try {
      const friend = friends.find((f) => f._id === selectedFriend);
      if (!friend) return;

      const res = await fetch("/api/settlements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromUserId: session?.user?.id,
          toUserId: selectedFriend,
          amount: parseFloat(amount),
          method,
          note,
        }),
      });

      if (res.ok) {
        setShowModal(false);
        setSelectedFriend("");
        setSelectedFriendBalance(0);
        setAmount("");
        setMethod("Cash");
        setNote("");
        fetchSettlements();
        fetchFriends();
      }
    } catch (error) {
      console.error("Failed to record settlement:", error);
    } finally {
      setSubmitting(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
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
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Settlements
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              View your payment history and settle debts
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={exportSettlements}
              disabled={settlements.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            <Button onClick={() => setShowModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Record Payment
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-neutral-200 dark:border-dark-border">
          <nav className="flex space-x-8">
            <button
              onClick={() => setActiveTab("settlements")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "settlements"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:hover:border-dark-border"
              }`}
            >
              Settlements
            </button>
            <button
              onClick={() => setActiveTab("reminders")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "reminders"
                  ? "border-primary text-primary"
                  : "border-transparent text-neutral-500 hover:text-neutral-700 hover:border-neutral-300 dark:hover:border-dark-border"
              }`}
            >
              Payment Reminders
              {reminders.filter(r => r.status === "sent" && !r.readAt).length > 0 && (
                <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white bg-error rounded-full">
                  {reminders.filter(r => r.status === "sent" && !r.readAt).length}
                </span>
              )}
            </button>
          </nav>
        </div>

        {/* Content based on active tab */}
        {activeTab === "settlements" ? (
          <Card>
            <CardHeader>
              <CardTitle>Payment History</CardTitle>
            </CardHeader>
          <CardContent>
            {settlements.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  No settlements yet
                </p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  Record a payment when you settle up with friends
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {settlements.map((settlement) => {
                  const isOutgoing =
                    settlement.fromUserId._id === session?.user?.id;
                  return (
                    <div
                      key={settlement._id}
                      className="flex items-center justify-between py-3 border-b border-neutral-200 dark:border-dark-border last:border-0"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`h-10 w-10 rounded-full flex items-center justify-center ${
                            isOutgoing ? "bg-coral/20" : "bg-success/20"
                          }`}
                        >
                          <ArrowRight
                            className={`h-5 w-5 ${
                              isOutgoing ? "text-coral" : "text-success rotate-180"
                            }`}
                          />
                        </div>
                        <div>
                          <p className="font-medium text-neutral-900 dark:text-dark-text">
                            {isOutgoing
                              ? `You paid ${settlement.toUserId.name}`
                              : `${settlement.fromUserId.name} paid you`}
                          </p>
                          <p className="text-sm text-neutral-500">
                            {formatDate(settlement.date)} • {settlement.method}
                            {settlement.note && ` • ${settlement.note}`}
                          </p>
                        </div>
                      </div>
                      <div
                        className={`text-lg font-semibold ${
                          isOutgoing ? "text-coral" : "text-success"
                        }`}
                      >
                        {formatCurrency(settlement.amount)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
        ) : (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Payment Reminders</CardTitle>
                <Button
                  size="sm"
                  onClick={() => {
                    // Could open a modal to send new reminder
                  }}
                >
                  <Bell className="h-4 w-4 mr-2" />
                  Send Reminder
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {remindersLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
                </div>
              ) : reminders.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                  <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                    No payment reminders yet
                  </p>
                  <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                    Send reminders to friends about outstanding payments
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {reminders.map((reminder) => {
                    const isOutgoing = reminder.fromUser.id === session?.user?.id;
                    return (
                      <div
                        key={reminder.id}
                        className="flex items-center justify-between py-3 px-4 border border-neutral-200 dark:border-dark-border rounded-lg hover:bg-neutral-50 dark:hover:bg-dark-bg-secondary transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <div className="flex-shrink-0">
                            {reminder.status === "paid" ? (
                              <CheckCircle className="h-5 w-5 text-success" />
                            ) : reminder.status === "read" ? (
                              <Clock className="h-5 w-5 text-info" />
                            ) : (
                              <Bell className="h-5 w-5 text-warning" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-neutral-900 dark:text-dark-text">
                              {isOutgoing ? `Reminder sent to ${reminder.toUser.name}` : `Reminder from ${reminder.fromUser.name}`}
                            </p>
                            <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary">
                              {formatCurrency(reminder.amount)} • {new Date(reminder.createdAt).toLocaleDateString()}
                            </p>
                            {reminder.message && (
                              <p className="text-xs text-neutral-600 dark:text-dark-text-secondary mt-1 italic">
                                "{reminder.message}"
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${
                            reminder.status === "paid"
                              ? "bg-success/10 text-success"
                              : reminder.status === "read"
                              ? "bg-info/10 text-info"
                              : "bg-warning/10 text-warning"
                          }`}>
                            {reminder.status === "paid" ? "Paid" : reminder.status === "read" ? "Read" : "Sent"}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Record Payment Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedFriend("");
            setSelectedFriendBalance(0);
            setAmount("");
            setMethod("Cash");
            setNote("");
          }}
          title="Record Payment"
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Select Friend
              </label>
              <select
                value={selectedFriend}
                onChange={(e) => {
                  const friendId = e.target.value;
                  setSelectedFriend(friendId);
                  const friend = friends.find(f => f._id === friendId);
                  if (friend) {
                    setSelectedFriendBalance(Math.abs(friend.balance));
                    // Pre-fill with the full amount that can be settled
                    setAmount(Math.abs(friend.balance).toString());
                  }
                }}
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="">Choose a friend...</option>
                {friends
                  .filter((f) => f.balance !== 0)
                  .map((friend) => (
                    <option key={friend._id} value={friend._id}>
                      {friend.name} (
                      {friend.balance < 0
                        ? `You owe ${formatCurrency(Math.abs(friend.balance))}`
                        : `Owes you ${formatCurrency(friend.balance)}`}
                      )
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <Input
                label={`Amount (Max: ${formatCurrency(selectedFriendBalance)})`}
                type="number"
                placeholder="0.00"
                value={amount}
                onChange={(e) => {
                  const value = parseFloat(e.target.value) || 0;
                  if (value <= selectedFriendBalance) {
                    setAmount(e.target.value);
                  }
                }}
                error={
                  amount && parseFloat(amount) > selectedFriendBalance
                    ? "Amount cannot exceed the settleable balance"
                    : undefined
                }
              />
              {selectedFriendBalance > 0 && (
                <p className="text-xs text-neutral-500 mt-1">
                  You can settle up to {formatCurrency(selectedFriendBalance)}.
                  {amount && parseFloat(amount) < selectedFriendBalance &&
                    " This is a partial settlement."
                  }
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-dark-text mb-2">
                Payment Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="w-full px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text focus:ring-2 focus:ring-primary focus:border-transparent"
              >
                <option value="Cash">Cash</option>
                <option value="UPI">UPI</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="PayPal">PayPal</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <Input
              label="Note (Optional)"
              type="text"
              placeholder="Add a note..."
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <div className="flex gap-2 justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => setShowModal(false)}
                disabled={submitting}
              >
                Cancel
              </Button>
              <Button
                onClick={recordSettlement}
                disabled={!selectedFriend || !amount || submitting}
              >
                {submitting ? "Recording..." : "Record Payment"}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    </AppShell>
  );
}
