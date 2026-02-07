"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import AppShell from "@/components/layout/AppShell";
import Card, { CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { TrendingUp, PieChart, Calendar, Download } from "lucide-react";

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

export default function AnalyticsPage() {
  const { data: session } = useSession();
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState("month");

  useEffect(() => {
    if (session) {
      fetchAnalytics();
    }
  }, [session, timeframe]);

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
    }).format(amount);
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      food: "🍔",
      transport: "🚗",
      entertainment: "🎬",
      shopping: "🛒",
      bills: "📄",
      healthcare: "⚕️",
      travel: "✈️",
      other: "📦",
    };
    return icons[category] || "📦";
  };

  const handleExportAnalytics = async () => {
    if (!analytics) return;

    try {
      const XLSX = await import('xlsx');
      
      // Create summary sheet
      const summaryData = [
        ['Metric', 'Value'],
        ['Total Expenses', analytics.summary.totalExpenses],
        ['Total Spent', `₹${analytics.summary.totalSpent.toFixed(2)}`],
        ['Total Paid', `₹${analytics.summary.totalPaid.toFixed(2)}`],
        ['Total Settled', `₹${analytics.summary.totalSettled.toFixed(2)}`],
        ['Average Expense', `₹${analytics.summary.averageExpense.toFixed(2)}`],
      ];

      // Create category breakdown sheet
      const categoryData = [
        ['Category', 'Count', 'Total Amount', 'Percentage'],
        ...analytics.categoryBreakdown.map(cat => [
          cat.category,
          cat.count,
          `₹${cat.total.toFixed(2)}`,
          `${((cat.total / analytics.summary.totalSpent) * 100).toFixed(1)}%`,
        ]),
      ];

      // Create monthly trend sheet
      const monthlyData = [
        ['Month', 'Expenses', 'Total Amount'],
        ...analytics.monthlyTrend.map(month => [
          month.month,
          month.expenses,
          `₹${month.total.toFixed(2)}`,
        ]),
      ];

      // Create workbook
      const wb = XLSX.utils.book_new();
      
      const summaryWs = XLSX.utils.aoa_to_sheet(summaryData);
      const categoryWs = XLSX.utils.aoa_to_sheet(categoryData);
      const monthlyWs = XLSX.utils.aoa_to_sheet(monthlyData);

      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
      XLSX.utils.book_append_sheet(wb, categoryWs, 'Categories');
      XLSX.utils.book_append_sheet(wb, monthlyWs, 'Monthly Trend');

      // Download file
      const fileName = `analytics_${timeframe}_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
    } catch (error) {
      consodiv className="flex items-center gap-3">
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
          </div
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
                <span className="text-2xl">✓</span>
              </div>
            </CardContent>
          </Card>
        </div>

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

        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle>Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.monthlyTrend.map((month) => (
                <div
                  key={month.month}
                  className="flex items-center justify-between py-2 border-b border-neutral-200 dark:border-dark-border last:border-0"
                >
                  <div>
                    <p className="text-sm font-medium">{month.month}</p>
                    <p className="text-xs text-neutral-500">
                      {month.expenses} expense{month.expenses !== 1 ? "s" : ""}
                    </p>
                  </div>
                  <p className="text-lg font-semibold">
                    {formatCurrency(month.total)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
