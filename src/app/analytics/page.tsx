"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/lib/auth/react-session";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { TrendingUp, PieChart, Calendar, Download } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
} from "recharts";

interface AnalyticsData {
  summary: {
    totalExpenses: number;
    totalSpent: number;
    totalPaid: number;
    totalSettled: number;
    averageExpense: number;
  };
  categoryBreakdown: Array<{
    category: string;
    count: number;
    total: number;
  }>;
  monthlyTrend: Array<{
    month: string;
    expenses: number;
    total: number;
  }>;
}

interface ReconciliationReport {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    openingBalance: number;
    expenseDelta: number;
    settlementDelta: number;
    netChange: number;
    closingBalance: number;
  };
  changes: {
    expenses: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      delta: number;
      currency: string;
    }>;
    settlements: Array<{
      id: string;
      date: string;
      description: string;
      amount: number;
      delta: number;
      currency: string;
    }>;
  };
}

export default function AnalyticsPage() {
  const { data: session, status } = useSession();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [reconciliation, setReconciliation] = useState<ReconciliationReport | null>(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationStartDate, setReconciliationStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split("T")[0];
  });
  const [reconciliationEndDate, setReconciliationEndDate] = useState(
    () => new Date().toISOString().split("T")[0]
  );
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("month");

  useEffect(() => {
    if (status === "unauthenticated") {
      window.location.href = "/auth/login";
    } else if (status === "authenticated") {
      fetchAnalytics();
      fetchReconciliation();
    }
  }, [status, timeframe]);

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`/api/analytics?timeframe=${timeframe}`);
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error("Failed to fetch analytics:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchReconciliation = async () => {
    setReconciliationLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: reconciliationStartDate,
        endDate: reconciliationEndDate,
      });
      const res = await fetch(`/api/analytics/reconciliation?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setReconciliation(data);
      }
    } catch (error) {
      console.error("Failed to fetch reconciliation report:", error);
    } finally {
      setReconciliationLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      food: "ðŸ”",
      transport: "ðŸš—",
      entertainment: "ðŸŽ¬",
      shopping: "ðŸ›’",
      bills: "ðŸ“„",
      healthcare: "âš•ï¸",
      travel: "âœˆï¸",
      other: "ðŸ“¦",
    };
    return icons[category] || "ðŸ“¦";
  };

  const handleExportAnalytics = async () => {
    if (!analytics) return;

    try {
      const { exportAnalyticsToCSV } = await import("@/lib/exportUtils");
      exportAnalyticsToCSV(
        analytics.summary,
        analytics.categoryBreakdown,
        analytics.monthlyTrend,
        timeframe
      );
    } catch (error) {
      console.error("Failed to export analytics:", error);
    }
  };

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="p-4 md:p-8">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-neutral-200 dark:bg-dark-border rounded w-48" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-neutral-200 dark:bg-dark-border rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  if (!analytics || analytics.summary.totalExpenses === 0) {
    return (
      <AppShell>
        <div className="p-4 md:p-8 space-y-6">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Analytics
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              View insights and spending patterns
            </p>
          </div>
          <Card>
            <CardContent>
              <div className="text-center py-12">
                <TrendingUp className="h-16 w-16 mx-auto text-neutral-300 mb-4" />
                <p className="text-body text-neutral-500 dark:text-dark-text-secondary">
                  No data to analyze yet
                </p>
                <p className="text-sm text-neutral-400 dark:text-dark-text-tertiary mt-2">
                  Start adding expenses to see insights
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    );
  }

  // Colors for charts
  const COLORS = ['#00B8A9', '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8'];

  // Prepare chart data
  const pieChartData = analytics.categoryBreakdown.map((cat, index) => ({
    name: cat.category,
    value: cat.total,
    count: cat.count,
    fill: COLORS[index % COLORS.length],
  }));

  const lineChartData = analytics.monthlyTrend.map((month) => ({
    month: month.month,
    expenses: month.total,
    count: month.expenses,
  }));

  return (
    <AppShell>
      <div className="p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 font-bold text-neutral-900 dark:text-dark-text">
              Analytics
            </h1>
            <p className="text-body text-neutral-500 dark:text-dark-text-secondary mt-1">
              View insights and spending patterns
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="secondary"
              onClick={handleExportAnalytics}
              className="flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </Button>
            <select
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
              className="px-4 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
            >
              <option value="week">Last Week</option>
              <option value="month">Last Month</option>
              <option value="quarter">Last Quarter</option>
              <option value="year">This Year</option>
              <option value="all">All Time</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-neutral-500">Total Expenses</p>
                <p className="text-2xl font-bold mt-1">{analytics.summary.totalExpenses}</p>
              </div>
              <div className="h-12 w-12 bg-primary/10 rounded-full flex items-center justify-center">
                <Calendar className="h-6 w-6 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-neutral-500">Total Spent</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(analytics.summary.totalSpent)}
                </p>
              </div>
              <div className="h-12 w-12 bg-coral/10 rounded-full flex items-center justify-center">
                <TrendingUp className="h-6 w-6 text-coral" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-neutral-500">Average Expense</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(analytics.summary.averageExpense)}
                </p>
              </div>
              <div className="h-12 w-12 bg-info/10 rounded-full flex items-center justify-center">
                <PieChart className="h-6 w-6 text-info" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="text-sm text-neutral-500">Settled</p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(analytics.summary.totalSettled)}
                </p>
              </div>
              <div className="h-12 w-12 bg-success/10 rounded-full flex items-center justify-center">
                <span className="text-2xl">âœ“</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Balance Reconciliation Report</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">Start Date</label>
                <input
                  type="date"
                  value={reconciliationStartDate}
                  onChange={(e) => setReconciliationStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-500 mb-1">End Date</label>
                <input
                  type="date"
                  value={reconciliationEndDate}
                  onChange={(e) => setReconciliationEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-neutral-300 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-neutral-900 dark:text-dark-text"
                />
              </div>
              <div className="md:col-span-2 flex items-end">
                <Button onClick={fetchReconciliation} className="w-full" disabled={reconciliationLoading}>
                  {reconciliationLoading ? "Generating..." : "Generate Report"}
                </Button>
              </div>
            </div>

            {reconciliation && (
              <div className="mt-5 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                    <p className="text-xs text-neutral-500">Opening</p>
                    <p className="text-lg font-semibold font-mono">{formatCurrency(reconciliation.summary.openingBalance)}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                    <p className="text-xs text-neutral-500">Expenses Impact</p>
                    <p className="text-lg font-semibold font-mono">{formatCurrency(reconciliation.summary.expenseDelta)}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                    <p className="text-xs text-neutral-500">Settlements Impact</p>
                    <p className="text-lg font-semibold font-mono">{formatCurrency(reconciliation.summary.settlementDelta)}</p>
                  </div>
                  <div className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                    <p className="text-xs text-neutral-500">Net Change</p>
                    <p className="text-lg font-semibold font-mono">{formatCurrency(reconciliation.summary.netChange)}</p>
                  </div>
                  <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <p className="text-xs text-neutral-500">Closing</p>
                    <p className="text-lg font-semibold font-mono">{formatCurrency(reconciliation.summary.closingBalance)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-semibold mb-2">Expense Changes</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {reconciliation.changes.expenses.length === 0 ? (
                        <p className="text-xs text-neutral-500">No expense changes in selected period.</p>
                      ) : (
                        reconciliation.changes.expenses.map((row) => (
                          <div key={row.id} className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">{row.description}</p>
                              <p className="text-sm font-mono">{formatCurrency(row.delta)}</p>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                              {new Date(row.date).toLocaleDateString("en-IN")} • {formatCurrency(row.amount)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-semibold mb-2">Settlement Changes</p>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {reconciliation.changes.settlements.length === 0 ? (
                        <p className="text-xs text-neutral-500">No settlement changes in selected period.</p>
                      ) : (
                        reconciliation.changes.settlements.map((row) => (
                          <div key={row.id} className="rounded-lg border border-neutral-200 dark:border-dark-border p-3">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-sm font-medium truncate">{row.description}</p>
                              <p className="text-sm font-mono">{formatCurrency(row.delta)}</p>
                            </div>
                            <p className="text-xs text-neutral-500 mt-1">
                              {new Date(row.date).toLocaleDateString("en-IN")} • {formatCurrency(row.amount)}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Category Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle>Spending by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.categoryBreakdown.map((cat) => {
                const percentage =
                  (cat.total / analytics.summary.totalSpent) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{getCategoryIcon(cat.category)}</span>
                        <span className="text-sm font-medium capitalize">
                          {cat.category}
                        </span>
                        <span className="text-xs text-neutral-500">({cat.count})</span>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(cat.total)}
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-dark-border rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Monthly Trend Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Monthly Spending Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-w-0 w-full">
                <ResponsiveContainer width="100%" height={320} minWidth={280}>
                  <LineChart data={lineChartData}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis
                      dataKey="month"
                      fontSize={12}
                      tick={{ fill: 'currentColor' }}
                    />
                    <YAxis
                      fontSize={12}
                      tick={{ fill: 'currentColor' }}
                      tickFormatter={(value) => `â‚¹${value}`}
                    />
                    <Tooltip
                      formatter={(value) => value ? [formatCurrency(Number(value)), 'Amount'] : ['â‚¹0', 'Amount']}
                      labelStyle={{ color: 'currentColor' }}
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="expenses"
                      stroke="#00B8A9"
                      strokeWidth={3}
                      dot={{ fill: '#00B8A9', strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, stroke: '#00B8A9', strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Category Breakdown Pie Chart */}
          <Card>
            <CardHeader>
              <CardTitle>Spending by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="min-w-0 w-full">
                <ResponsiveContainer width="100%" height={320} minWidth={280}>
                  <RechartsPieChart>
                    <Pie
                      data={pieChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => formatCurrency(Number(value))}
                      contentStyle={{
                        backgroundColor: 'var(--background)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                      }}
                    />
                  </RechartsPieChart>
                </ResponsiveContainer>
              </div>
              {/* Legend */}
              <div className="grid grid-cols-2 gap-2 mt-4">
                {pieChartData.slice(0, 6).map((entry, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: entry.fill }}
                    />
                    <span className="text-xs text-neutral-600 dark:text-dark-text-secondary truncate">
                      {entry.name} ({entry.count})
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Category Details Table */}
        <Card>
          <CardHeader>
            <CardTitle>Detailed Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.categoryBreakdown.map((cat) => {
                const percentage =
                  (cat.total / analytics.summary.totalSpent) * 100;
                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{getCategoryIcon(cat.category)}</span>
                        <span className="text-sm font-medium capitalize">
                          {cat.category}
                        </span>
                        <span className="text-xs text-neutral-500">({cat.count})</span>
                      </div>
                      <span className="text-sm font-semibold">
                        {formatCurrency(cat.total)}
                      </span>
                    </div>
                    <div className="w-full bg-neutral-200 dark:bg-dark-border rounded-full h-2">
                      <div
                        className="bg-primary h-2 rounded-full"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

