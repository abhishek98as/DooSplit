"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import Card, { CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { authFetch } from "@/lib/auth/client-session";
import { Calendar, Pause, Play, RotateCw, Square } from "lucide-react";

interface RecurringExpense {
  id: string;
  name: string;
  status: "active" | "paused" | "ended";
  frequency: "weekly" | "monthly" | "yearly";
  interval: number;
  nextRunAt: string;
  lastRunAt: string;
  reminderEnabled: boolean;
  reminderDaysBefore: number;
  expense: {
    amount?: number;
    currency?: string;
    description?: string;
  };
}

function formatDate(value: string) {
  if (!value) return "Not scheduled";
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatCurrency(amount: number | undefined, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(Number(amount || 0));
}

export default function RecurringExpensesPage() {
  const [items, setItems] = useState<RecurringExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchRecurring = async () => {
    setLoading(true);
    try {
      const response = await authFetch("/api/recurring-expenses");
      if (!response.ok) throw new Error("Failed to fetch recurring expenses");
      const data = await response.json();
      setItems(Array.isArray(data.recurringExpenses) ? data.recurringExpenses : []);
    } catch (error) {
      console.error(error);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRecurring();
  }, []);

  const updateStatus = async (item: RecurringExpense, status: RecurringExpense["status"]) => {
    setBusyId(item.id);
    try {
      const response = await authFetch(`/api/recurring-expenses/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) throw new Error("Failed to update recurring expense");
      await fetchRecurring();
    } catch (error) {
      console.error(error);
      alert("Failed to update recurring expense");
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async (item: RecurringExpense) => {
    setBusyId(item.id);
    try {
      const response = await authFetch(`/api/recurring-expenses/${item.id}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: true }),
      });
      if (!response.ok) throw new Error("Failed to run recurring expense");
      await fetchRecurring();
      try {
        window.dispatchEvent(
          new CustomEvent("doosplit:data-updated", {
            detail: { domains: ["expenses", "activity", "friends", "analytics"] },
          })
        );
      } catch {}
    } catch (error) {
      console.error(error);
      alert("Failed to run recurring expense");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Recurring Expenses
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              Keep rent, bills, subscriptions, and routine costs on schedule.
            </p>
          </div>
          <Link href="/expenses/add">
            <Button>Add Expense</Button>
          </Link>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <LoadingSpinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="text-center py-12">
              <Calendar className="h-14 w-14 mx-auto text-neutral-300 mb-3" />
              <p className="font-medium text-neutral-900 dark:text-dark-text">
                No recurring expenses yet
              </p>
              <p className="text-sm text-neutral-500 mt-1">
                Add an expense and enable repeat to create one.
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Templates</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-md border border-neutral-200 dark:border-dark-border p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-neutral-900 dark:text-dark-text">
                          {item.name}
                        </p>
                        <span className="text-xs rounded-full px-2 py-0.5 bg-neutral-100 dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary">
                          {item.status}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-500 mt-1">
                        {formatCurrency(item.expense?.amount, item.expense?.currency)} every{" "}
                        {item.interval > 1 ? `${item.interval} ` : ""}
                        {item.frequency}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        Next run: {formatDate(item.nextRunAt)}
                        {item.lastRunAt ? ` · Last run: ${formatDate(item.lastRunAt)}` : ""}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => runNow(item)}
                        disabled={busyId === item.id || item.status === "ended"}
                      >
                        <RotateCw className="h-3 w-3 mr-1" />
                        Run Now
                      </Button>
                      {item.status === "active" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(item, "paused")}
                          disabled={busyId === item.id}
                        >
                          <Pause className="h-3 w-3 mr-1" />
                          Pause
                        </Button>
                      ) : item.status === "paused" ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => updateStatus(item, "active")}
                          disabled={busyId === item.id}
                        >
                          <Play className="h-3 w-3 mr-1" />
                          Resume
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => updateStatus(item, "ended")}
                        disabled={busyId === item.id || item.status === "ended"}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Square className="h-3 w-3 mr-1" />
                        End
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppShell>
  );
}
