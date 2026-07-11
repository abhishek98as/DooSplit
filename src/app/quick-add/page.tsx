"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/lib/auth/react-session";
import { authFetch } from "@/lib/auth/client-session";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ArrowLeft, Loader2, Zap } from "lucide-react";
import getOfflineStore from "@/lib/offline-store";

interface Friend {
  id: string;
  friend: {
    id: string;
    name: string;
    email: string;
    profilePicture?: string;
  };
  balance: number;
}

const CATEGORIES = [
  { value: "food", label: "Food", icon: "🍔" },
  { value: "transport", label: "Transport", icon: "🚗" },
  { value: "shopping", label: "Shopping", icon: "🛍️" },
  { value: "entertainment", label: "Entertainment", icon: "🎬" },
  { value: "utilities", label: "Utilities", icon: "💡" },
  { value: "other", label: "Other", icon: "📦" },
];

export default function QuickAddPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [amount, setAmount] = useState("0");
  const [category, setCategory] = useState("food");
  const [description, setDescription] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);

  const [friends, setFriends] = useState<Friend[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login?returnTo=/quick-add");
    }
  }, [status, router]);

  const fetchFriends = useCallback(async () => {
    try {
      const res = await authFetch("/api/friends");
      if (res.ok) {
        const data = await res.json();
        setFriends((data.friends || []).slice(0, 8));
      }
    } catch {
      // non-critical
    }
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      fetchFriends();
    }
  }, [session, fetchFriends]);

  const handleNumpad = (key: string) => {
    setAmount((prev) => {
      if (key === "X") {
        const next = prev.slice(0, -1) || "0";
        return next;
      }
      if (key === "." && prev.includes(".")) return prev;
      if (prev === "0" && key !== ".") return key;
      const next = prev + key;
      const [int] = next.split(".");
      if (int.length > 6) return prev;
      return next;
    });
  };

  const toggleFriend = (id: string) => {
    setSelectedFriendIds((prev) =>
      prev.includes(id) ? prev.filter((uid) => uid !== id) : [...prev, id]
    );
  };

  const handleSave = async () => {
    const amountVal = parseFloat(amount);
    if (!amountVal || amountVal <= 0) return;

    const descriptionFinal =
      description.trim() ||
      CATEGORIES.find((c) => c.value === category)?.label ||
      "Expense";
    setSubmitting(true);

    try {
      const selectedFriendObjs = friends.filter((f) =>
        selectedFriendIds.includes(f.friend.id)
      );
      const numPeople = selectedFriendObjs.length + 1;
      const round2 = (n: number) => Math.round(n * 100) / 100;
      const equalShare = round2(amountVal / numPeople);
      const remainder = round2(amountVal - equalShare * numPeople);

      const participants = [
        {
          userId: session?.user?.id || "",
          name: "You",
          owedAmount: round2(equalShare + remainder),
          paidAmount: amountVal,
        },
        ...selectedFriendObjs.map((f) => ({
          userId: f.friend.id,
          name: f.friend.name,
          owedAmount: equalShare,
          paidAmount: 0,
        })),
      ];

      const offlineStore = getOfflineStore();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expense = await offlineStore.createExpense({
        amount: amountVal,
        description: descriptionFinal,
        category,
        date: new Date().toISOString().split("T")[0],
        currency: "INR",
        participants,
        notes: "",
        images: [],
        splitMethod: "equally",
        createdBy: session?.user?.id || "",
      } as any);

      if (expense && expense._id) {
        try {
          sessionStorage.setItem(
            "doosplit:force-refresh",
            Date.now().toString()
          );
        } catch {
          // ignore
        }
        setSuccess(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 1200);
      }
    } catch (err) {
      console.error("Quick-add failed:", err);
      alert("Failed to save expense. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50 dark:bg-dark-bg">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const numpadKeys = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    ".", "0", "X",
  ];

  const amountNum = parseFloat(amount);

  return (
    <div className="flex flex-col min-h-screen bg-neutral-50 dark:bg-dark-bg">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <Link
          href="/dashboard"
          className="h-9 w-9 flex items-center justify-center rounded-xl bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border shadow-sm"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4 text-neutral-600 dark:text-dark-text-secondary" />
        </Link>
        <div className="flex items-center gap-1.5">
          <Zap className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-neutral-900 dark:text-dark-text">
            Quick Add
          </span>
        </div>
        <div className="w-9" />
      </div>

      {/* Amount display */}
      <div className="flex-none px-6 py-6 text-center">
        <p className="text-xs font-medium text-neutral-400 dark:text-dark-text-secondary uppercase tracking-widest mb-1">
          Amount
        </p>
        <p className="text-6xl font-black font-mono text-neutral-900 dark:text-dark-text tracking-tight">
          <span className="text-3xl text-neutral-400 mr-1">₹</span>
          {amount}
        </p>
      </div>

      {/* Category */}
      <div className="px-4 mb-4">
        <div className="grid grid-cols-6 gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.value}
              type="button"
              onClick={() => setCategory(cat.value)}
              className={`flex flex-col items-center gap-1 py-2.5 px-1 rounded-xl border-2 transition-all ${
                category === cat.value
                  ? "border-primary bg-primary/10"
                  : "border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary"
              }`}
            >
              <span className="text-xl">{cat.icon}</span>
              <span
                className={`text-[9px] font-semibold leading-tight truncate w-full text-center ${
                  category === cat.value
                    ? "text-primary"
                    : "text-neutral-500 dark:text-dark-text-secondary"
                }`}
              >
                {cat.label}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div className="px-4 mb-3">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What is this for? (optional)"
          className="w-full px-4 py-2.5 rounded-xl border-2 border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-sm text-neutral-900 dark:text-dark-text placeholder-neutral-400 focus:outline-none focus:border-primary"
        />
      </div>

      {/* Friends quick-pick */}
      {friends.length > 0 && (
        <div className="px-4 mb-4">
          <p className="text-xs font-medium text-neutral-400 dark:text-dark-text-secondary mb-2">
            Split with (optional)
          </p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {friends.map((friend) => {
              const isSelected = selectedFriendIds.includes(friend.friend.id);
              return (
                <button
                  key={friend.friend.id}
                  type="button"
                  onClick={() => toggleFriend(friend.friend.id)}
                  className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all shrink-0 w-16 ${
                    isSelected
                      ? "border-primary bg-primary/10"
                      : "border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary"
                  }`}
                >
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold ${
                      isSelected
                        ? "bg-primary text-white"
                        : "bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary"
                    }`}
                  >
                    {friend.friend.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className={`text-[9px] font-medium truncate w-full text-center leading-tight ${
                      isSelected
                        ? "text-primary"
                        : "text-neutral-500 dark:text-dark-text-secondary"
                    }`}
                  >
                    {friend.friend.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Numpad */}
      <div className="flex-1 px-4">
        <div className="grid grid-cols-3 gap-2">
          {numpadKeys.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => handleNumpad(key)}
              className={`h-14 rounded-2xl text-xl font-semibold flex items-center justify-center transition-all active:scale-95 ${
                key === "X"
                  ? "bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-600 dark:text-dark-text-secondary text-base"
                  : "bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border text-neutral-900 dark:text-dark-text hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary shadow-sm"
              }`}
            >
              {key === "X" ? "⌫" : key}
            </button>
          ))}
        </div>
      </div>

      {/* Save button */}
      <div className="px-4 pb-8 pt-4">
        <button
          type="button"
          onClick={handleSave}
          disabled={submitting || amountNum <= 0 || success}
          className={`w-full h-14 rounded-2xl font-bold text-lg flex items-center justify-center gap-3 transition-all ${
            success
              ? "bg-emerald-500 text-white"
              : amountNum > 0
              ? "bg-primary hover:bg-primary-dark text-white shadow-xl shadow-primary/30 active:scale-[0.99]"
              : "bg-neutral-200 dark:bg-dark-bg-tertiary text-neutral-400 dark:text-dark-text-secondary cursor-not-allowed"
          }`}
        >
          {success ? (
            <>
              <Check className="h-5 w-5" />
              Saved!
            </>
          ) : submitting ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Zap className="h-5 w-5" />
              Save {amountNum > 0 ? `₹${amount}` : ""}
            </>
          )}
        </button>

        {selectedFriendIds.length > 0 && amountNum > 0 && (
          <p className="text-center text-xs text-neutral-500 dark:text-dark-text-secondary mt-2">
            ₹{(amountNum / (selectedFriendIds.length + 1)).toFixed(2)} each ·
            split equally
          </p>
        )}
      </div>
    </div>
  );
}

