"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, Coffee, Car, ShoppingCart, Home, Film, Smartphone, Stethoscope, Plane, Gift } from "lucide-react";

const QUICK_CATEGORIES = [
  { icon: Coffee, label: "Food", emoji: "🍔" },
  { icon: Car, label: "Transport", emoji: "🚗" },
  { icon: ShoppingCart, label: "Shopping", emoji: "🛒" },
  { icon: Home, label: "Bills", emoji: "🏠" },
  { icon: Film, label: "Entertainment", emoji: "🎬" },
  { icon: Smartphone, label: "Utilities", emoji: "📱" },
  { icon: Stethoscope, label: "Health", emoji: "🏥" },
  { icon: Plane, label: "Travel", emoji: "✈️" },
  { icon: Gift, label: "Other", emoji: "🎁" },
];

const QUICK_AMOUNTS = [100, 200, 500, 1000, 2000, 5000];

export default function QuickAdd() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [step, setStep] = useState<"category" | "amount" | "done">("category");

  const handleCategorySelect = (cat: string) => {
    setCategory(cat);
    setStep("amount");
  };

  const handleAmountSelect = (amt: number) => {
    setAmount(String(amt));
  };

  const handleSubmit = () => {
    const desc = description || `${category} expense`;
    const amt = amount || "0";
    router.push(`/expenses/add?quick=true&category=${encodeURIComponent(category)}&amount=${amt}&description=${encodeURIComponent(desc)}`);
    // Reset
    setIsOpen(false);
    setAmount("");
    setDescription("");
    setCategory("");
    setStep("category");
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 right-4 z-40 flex items-center gap-2 bg-primary hover:bg-primary-dark text-white rounded-2xl px-4 py-3 shadow-xl transition-all active:scale-95 font-bold text-sm"
      >
        <Plus className="h-5 w-5" />
        <span>Quick Add</span>
      </button>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setIsOpen(false)} />

      {/* Bottom Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-dark-bg-secondary rounded-t-2xl shadow-2xl animate-slide-up max-h-[70vh] overflow-y-auto safe-area-inset-bottom">
        {/* Handle + Close */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <button onClick={() => setIsOpen(false)} className="p-2 text-neutral-400 hover:text-neutral-600">
            <X className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-neutral-900 dark:text-dark-text">
            {step === "category" ? "Quick Add Expense" : step === "amount" ? "How much?" : "Done!"}
          </span>
          <div className="w-9" />
        </div>

        {step === "category" && (
          <div className="px-4 pb-6">
            <div className="grid grid-cols-3 gap-3 mt-2">
              {QUICK_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                return (
                  <button
                    key={cat.label}
                    onClick={() => handleCategorySelect(cat.label.toLowerCase())}
                    className="flex flex-col items-center gap-2 p-4 rounded-xl border border-neutral-200 dark:border-dark-border hover:border-primary hover:bg-primary/5 transition-all active:scale-95"
                  >
                    <span className="text-2xl">{cat.emoji}</span>
                    <span className="text-xs font-semibold text-neutral-700 dark:text-dark-text-secondary">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === "amount" && (
          <div className="px-4 pb-6 space-y-4">
            <p className="text-xs text-neutral-500 px-1">
              {category.charAt(0).toUpperCase() + category.slice(1)}
            </p>
            <input
              type="number"
              placeholder="Enter amount (₹)"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-3xl font-bold font-mono text-center py-4 bg-neutral-50 dark:bg-dark-bg-tertiary rounded-xl border border-neutral-200 dark:border-dark-border focus:border-primary outline-none text-neutral-900 dark:text-dark-text"
              autoFocus
            />
            <div className="grid grid-cols-3 gap-2">
              {QUICK_AMOUNTS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => handleAmountSelect(amt)}
                  className={`py-2.5 rounded-xl text-sm font-bold border transition-all active:scale-95 ${
                    amount === String(amt)
                      ? "bg-primary text-white border-primary"
                      : "bg-neutral-50 dark:bg-dark-bg-tertiary border-neutral-200 dark:border-dark-border text-neutral-700 dark:text-dark-text-secondary hover:border-primary"
                  }`}
                >
                  ₹{amt}
                </button>
              ))}
            </div>
            <input
              type="text"
              placeholder="What's this for? (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full py-3 px-4 text-sm bg-neutral-50 dark:bg-dark-bg-tertiary rounded-xl border border-neutral-200 dark:border-dark-border focus:border-primary outline-none text-neutral-900 dark:text-dark-text"
            />
            <button
              onClick={handleSubmit}
              disabled={!amount && !description}
              className="w-full py-3 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Add Expense →
            </button>
          </div>
        )}
      </div>
    </>
  );
}
