/**
 * Export utilities for expenses data
 * Supports Excel and PDF export formats
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
 * Export expenses to Excel format
 */
export async function exportToExcel(expenses: ExportExpense[]) {
  try {
    // Use a dynamic import to reduce bundle size
    const XLSX = await import('xlsx');
    
    // Prepare data for Excel
    const data = expenses.map((expense) => ({
      Date: new Date(expense.date).toLocaleDateString(),
      Description: expense.description,
      Category: expense.category,
      Amount: expense.amount,
      Currency: expense.currency,
      'Paid By': expense.createdBy.name,
      Group: expense.groupId?.name || 'Personal',
      Participants: expense.participants.map((p) => p.userId.name).join(', '),
    }));

    // Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(data);
    
    // Set column widths
    const columnWidths = [
      { wch: 12 }, // Date
      { wch: 30 }, // Description
      { wch: 15 }, // Category
      { wch: 12 }, // Amount
      { wch: 10 }, // Currency
      { wch: 20 }, // Paid By
      { wch: 20 }, // Group
      { wch: 40 }, // Participants
    ];
    worksheet['!cols'] = columnWidths;

    // Create workbook
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Expenses');

    // Generate file
    const fileName = `expenses_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(workbook, fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error('Error exporting to Excel:', error);
    return { success: false, error: 'Failed to export to Excel' };
  }
}

/**
 * Export expenses to PDF format
 */
export async function exportToPDF(expenses: ExportExpense[], userName: string) {
  try {
    // Use dynamic imports
    const { jsPDF } = await import('jspdf');
    const autoTable = (await import('jspdf-autotable')).default;

    const doc = new jsPDF();

    // Add title
    doc.setFontSize(18);
    doc.text('Expense Report', 14, 20);

    // Add metadata
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 14, 30);
    doc.text(`Generated for: ${userName}`, 14, 36);

    // Calculate totals
    const totalAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);
    const categoryCounts = expenses.reduce((acc, exp) => {
      acc[exp.category] = (acc[exp.category] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Add summary
    doc.setFontSize(12);
    doc.text('Summary', 14, 46);
    doc.setFontSize(10);
    doc.text(`Total Expenses: ${expenses.length}`, 14, 52);
    doc.text(`Total Amount: ₹${totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`, 14, 58);

    // Prepare table data
    const tableData = expenses.map((expense) => [
      new Date(expense.date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }),
      expense.description,
      expense.category,
      `₹${expense.amount.toFixed(2)}`,
      expense.createdBy.name,
      expense.groupId?.name || 'Personal',
    ]);

    // Add table
    autoTable(doc, {
      startY: 68,
      head: [['Date', 'Description', 'Category', 'Amount', 'Paid By', 'Group']],
      body: tableData,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [79, 70, 229] }, // Primary color
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

    // Save PDF
    const fileName = `expenses_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(fileName);

    return { success: true, fileName };
  } catch (error) {
    console.error('Error exporting to PDF:', error);
    return { success: false, error: 'Failed to export to PDF' };
  }
}

/**
 * Export expenses to CSV format (fallback option)
 */
export function exportToCSV(expenses: ExportExpense[]) {
  try {
    // Prepare CSV headers
    const headers = ['Date', 'Description', 'Category', 'Amount', 'Currency', 'Paid By', 'Group', 'Participants'];
    
    // Prepare CSV rows
    const rows = expenses.map((expense) => [
      new Date(expense.date).toLocaleDateString(),
      expense.description,
      expense.category,
      expense.amount.toString(),
      expense.currency,
      expense.createdBy.name,
      expense.groupId?.name || 'Personal',
      expense.participants.map((p) => p.userId.name).join('; '),
    ]);

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `expenses_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    return { success: true, fileName: `expenses_${new Date().toISOString().split('T')[0]}.csv` };
  } catch (error) {
    console.error('Error exporting to CSV:', error);
    return { success: false, error: 'Failed to export to CSV' };
  }
}
