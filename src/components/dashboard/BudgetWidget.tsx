"use client";

import { useEffect, useState, useCallback } from "react";
import { authFetch } from "@/lib/auth/client-session";
import Link from "next/link";
import { Target, TrendingUp, Settings2, AlertTriangle } from "lucide-react";

interface BudgetEntry {
  monthly: number;
  currency: string;
}

type UserBudgets = Record<string, BudgetEntry>;

interface CategorySpend {
  category: string;
  total: number;
}

const CATEGORY_META: Record<string, { label: string; emoji: string }> = {
  food:          { label: "Food",          emoji: "🍔" },
  transport:     { label: "Transport",     emoji: "🚗" },
  shopping:      { label: "Shopping",      emoji: "🛍️" },
  entertainment: { label: "Entertainment", emoji: "🎬" },
  utilities:     { label: "Utilities",     emoji: "💡" },
  healthcare:    { label: "Healthcare",    emoji: "🏥" },
  rent:          { label: "Rent",          emoji: "🏠" },
  travel:        { label: "Travel",        emoji: "✈️" },
  other:         { label: "Other",         emoji: "📦" },
};

function fmt(n: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

function statusColor(pct: number) {
  if (pct >= 100) return "bg-coral";
  if (pct >= 90)  return "bg-orange-400";
  if (pct >= 70)  return "bg-amber-400";
  return "bg-emerald-500";
}

function statusTextColor(pct: number) {
  if (pct >= 100) return "text-coral";
  if (pct >= 90)  return "text-orange-500";
  if (pct >= 70)  return "text-amber-500";
  return "text-emerald-600 dark:text-emerald-400";
}

export default function BudgetWidget() {
  const [budgets, setBudgets] = useState<UserBudgets>({});
  const [spending, setSpending] = useState<CategorySpend[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Parallel: budgets + current month analytics
      const now = new Date();
      const [budgetRes, analyticsRes] = await Promise.all([
        authFetch("/api/budgets"),
        authFetch(`/api/analytics?timeframe=month`),
      ]);

      if (budgetRes.ok) {
        const d = await budgetRes.json();
        setBudgets(d.budgets || {});
      }
      if (analyticsRes.ok) {
        const d = await analyticsRes.json();
        setSpending(d.categoryBreakdown || []);
      }
    } catch (e) {
      console.error("BudgetWidget fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const budgetCategories = Object.keys(budgets);

  if (loading) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-4">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text">Monthly Budgets</span>
        </div>
        <div className="space-y-3 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-10 bg-neutral-100 dark:bg-dark-bg-tertiary rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (budgetCategories.length === 0) {
    return (
      <div className="rounded-2xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text">Monthly Budgets</span>
          </div>
          <Link
            href="/settings#budgets"
            className="text-xs text-primary hover:underline flex items-center gap-1"
          >
            <Settings2 className="h-3 w-3" />
            Set budgets
          </Link>
        </div>
        <p className="text-xs text-neutral-400 dark:text-dark-text-secondary">
          Track spending vs limits — set per-category monthly budgets in Settings.
        </p>
      </div>
    );
  }

  // Build spend lookup map
  const spendMap = new Map<string, number>();
  for (const s of spending) {
    spendMap.set(s.category, s.total);
  }

  // Calculate rows
  const rows = budgetCategories.map((cat) => {
    const budget = budgets[cat];
    const spent = spendMap.get(cat) || 0;
    const pct = budget.monthly > 0 ? Math.round((spent / budget.monthly) * 100) : 0;
    return { cat, budget, spent, pct };
  });

  const overBudgetCount = rows.filter((r) => r.pct >= 100).length;

  return (
    <div className="rounded-2xl border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-neutral-800 dark:text-dark-text">Monthly Budgets</span>
          {overBudgetCount > 0 && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-coral/15 text-coral">
              <AlertTriangle className="h-2.5 w-2.5" />
              {overBudgetCount} over
            </span>
          )}
        </div>
        <Link
          href="/settings#budgets"
          className="text-xs text-neutral-400 dark:text-dark-text-secondary hover:text-primary transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* Budget rows */}
      <div className="space-y-3">
        {rows.map(({ cat, budget, spent, pct }) => {
          const meta = CATEGORY_META[cat] || { label: cat, emoji: "📦" };
          const barWidth = Math.min(100, pct);
          const remaining = budget.monthly - spent;

          return (
            <div key={cat}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm">{meta.emoji}</span>
                  <span className="text-xs font-medium text-neutral-700 dark:text-dark-text">
                    {meta.label}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold ${statusTextColor(pct)}`}>
                    {pct}%
                  </span>
                  <span className="text-[10px] text-neutral-400 dark:text-dark-text-secondary font-mono">
                    {fmt(spent, budget.currency)}/{fmt(budget.monthly, budget.currency)}
                  </span>
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-1.5 rounded-full bg-neutral-100 dark:bg-dark-bg-tertiary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${statusColor(pct)}`}
                  style={{ width: `${barWidth}%` }}
                />
              </div>

              {/* Over-budget warning */}
              {pct >= 90 && (
                <p className={`text-[10px] mt-0.5 ${statusTextColor(pct)}`}>
                  {pct >= 100
                    ? `Over by ${fmt(Math.abs(remaining), budget.currency)}`
                    : `${fmt(Math.max(0, remaining), budget.currency)} remaining`}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Footer link */}
      <Link
        href="/analytics"
        className="flex items-center gap-1.5 mt-3 pt-3 border-t border-neutral-100 dark:border-dark-border text-xs text-neutral-400 dark:text-dark-text-secondary hover:text-primary transition-colors"
      >
        <TrendingUp className="h-3 w-3" />
        View full analytics
      </Link>
    </div>
  );
}
