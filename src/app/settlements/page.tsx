"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { DollarSign, Plus, ArrowRight, Wallet } from "lucide-react";
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
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/auth/login";
    } else if (status === "authenticated") {
      fetchSettlements();
      fetchFriends();
    }
  }, [status]);

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
          <Button onClick={() => setShowModal(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Record Payment
          </Button>
        </div>

        {/* Settlements History */}
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

        {/* Record Payment Modal */}
        <Modal
          isOpen={showModal}
          onClose={() => {
            setShowModal(false);
            setSelectedFriend("");
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
                onChange={(e) => setSelectedFriend(e.target.value)}
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

            <Input
              label="Amount"
              type="number"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

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
