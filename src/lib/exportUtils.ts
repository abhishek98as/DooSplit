/**
 * Export utilities for expenses data
 * Supports CSV (Excel-compatible) and PDF export formats.
 *
 * Note: xlsx (SheetJS) has been removed due to critical security vulnerabilities
 * (CVE: GHSA-4r6h-8v6p-xvw6, GHSA-5pgg-2g8v-p4p4). We now generate CSV files
 * that open natively in Excel/Google Sheets — no library needed, no attack surface.
 */

interface ExportExpense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  createdBy: {
    name: string;
  };
  participants: Array<{
    userId: {
      name: string;
    };
    paidAmount: number;
    owedAmount: number;
  }>;
  groupId?: {
    name: string;
  };
}

/**
 * Escape a CSV cell value safely.
 */
function csvCell(value: string | number | undefined | null): string {
  const str = String(value ?? "");
  // Wrap in quotes if value contains comma, quote, or newline.
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a CSV string from rows (each row is an array of values).
 */
function buildCSV(rows: Array<Array<string | number | undefined | null>>): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

/**
 * Trigger a file download in the browser.
 */
function downloadFile(content: string, fileName: string, mimeType: string): void {
  const blob = new Blob(["\uFEFF" + content], { type: `${mimeType};charset=utf-8;` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", fileName);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export expenses to Excel-compatible CSV format.
 * Opens directly in Excel/Google Sheets.
 */
export function exportToExcel(expenses: ExportExpense[]) {
  try {
    const rows: Array<Array<string | number>> = [
      ["Date", "Description", "Category", "Amount", "Currency", "Paid By", "Group", "Participants"],
      ...expenses.map((expense) => [
        new Date(expense.date).toLocaleDateString(),
        expense.description,
        expense.category,
        expense.amount,
        expense.currency,
        expense.createdBy.name,
        expense.groupId?.name || "Personal",
        expense.participants.map((p) => p.userId.name).join("; "),
      ]),
    ];

    const csv = buildCSV(rows);
    const fileName = `expenses_${new Date().toISOString().split("T")[0]}.csv`;
    downloadFile(csv, fileName, "text/csv");

    return { success: true, fileName };
  } catch (error) {
    console.error("Error exporting to Excel:", error);
    return { success: false, error: "Failed to export" };
  }
}

/**
 * Export analytics data to Excel-compatible CSV with multiple sections.
 */
export function exportAnalyticsToCSV(
  summary: {
    totalExpenses: number;
    totalSpent: number;
    totalPaid: number;
    totalSettled: number;
    averageExpense: number;
  },
  categoryBreakdown: Array<{ category: string; count: number; total: number }>,
  monthlyTrend: Array<{ month: string; expenses: number; total: number }>,
  timeframe: string
) {
  try {
    const rows: Array<Array<string | number>> = [
      // Summary section
      ["=== SUMMARY ==="],
      ["Metric", "Value"],
      ["Total Expenses", summary.totalExpenses],
      ["Total Spent (INR)", summary.totalSpent.toFixed(2)],
      ["Total Paid (INR)", summary.totalPaid.toFixed(2)],
      ["Total Settled (INR)", summary.totalSettled.toFixed(2)],
      ["Average Expense (INR)", summary.averageExpense.toFixed(2)],
      [],
      // Category breakdown
      ["=== CATEGORY BREAKDOWN ==="],
      ["Category", "Count", "Total Amount (INR)", "Percentage"],
      ...categoryBreakdown.map((cat) => [
        cat.category,
        cat.count,
        cat.total.toFixed(2),
        `${((cat.total / summary.totalSpent) * 100).toFixed(1)}%`,
      ]),
      [],
      // Monthly trend
      ["=== MONTHLY TREND ==="],
      ["Month", "Expenses Count", "Total Amount (INR)"],
      ...monthlyTrend.map((month) => [
        month.month,
        month.expenses,
        month.total.toFixed(2),
      ]),
    ];

    const csv = buildCSV(rows);
    const fileName = `analytics_${timeframe}_${new Date().toISOString().split("T")[0]}.csv`;
    downloadFile(csv, fileName, "text/csv");

    return { success: true, fileName };
  } catch (error) {
    console.error("Error exporting analytics:", error);
    return { success: false, error: "Failed to export analytics" };
  }
}

/**
 * Export expenses to CSV format.
 */
export function exportToCSV(expenses: ExportExpense[]) {
  return exportToExcel(expenses);
}

/**
 * Export expenses to PDF format.
 */
export async function exportToPDF(expenses: ExportExpense[], userName: string) {
  try {
    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;

    const doc = new jsPDF();

    // Title
    doc.setFontSize(18);
    doc.text("Expense Report", 14, 20);

    // Metadata
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Generated for: ${userName}`, 14, 36);

    // Totals
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

    doc.setFontSize(12);
    doc.text("Summary", 14, 46);
    doc.setFontSize(10);
    doc.text(`Total Expenses: ${expenses.length}`, 14, 52);
    doc.text(
      `Total Amount: ₹${totalAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`,
      14,
      58
    );

    // Table
    const tableData = expenses.map((expense) => [
      new Date(expense.date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
      expense.description,
      expense.category,
      `₹${expense.amount.toFixed(2)}`,
      expense.createdBy.name,
      expense.groupId?.name || "Personal",
    ]);

    autoTable(doc, {
      startY: 68,
      head: [["Date", "Description", "Category", "Amount", "Paid By", "Group"]],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] },
      columnStyles: {
        0: { cellWidth: 25 },
        1: { cellWidth: 50 },
        2: { cellWidth: 25 },
        3: { cellWidth: 25 },
        4: { cellWidth: 30 },
        5: { cellWidth: 30 },
      },
      margin: { left: 14, right: 14 },
    });

    const fileName = `expenses_${new Date().toISOString().split("T")[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error("Error exporting to PDF:", error);
    return { success: false, error: "Failed to export to PDF" };
  }
}
