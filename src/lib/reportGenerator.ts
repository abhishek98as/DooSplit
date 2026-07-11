/**
 * reportGenerator.ts
 * Generates beautiful PDF expense reports using jsPDF + jspdf-autotable.
 * Loaded lazily via dynamic import so it does not bloat the initial bundle.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ReportExpense {
  date: string;
  description: string;
  category: string;
  amount: number;
  currency: string;
  paidByName?: string;
  splitMethod?: string;
}

export interface ReportMember {
  name: string;
  balance: number;
}

export interface ReportTransaction {
  fromName: string;
  toName: string;
  amount: number;
}

export interface GroupReportData {
  groupName: string;
  groupType: string;
  currency: string;
  generatedAt: string;
  members: ReportMember[];
  expenses: ReportExpense[];
  simplifiedTransactions?: ReportTransaction[];
  totalSpent: number;
}

export interface PersonalReportData {
  userName: string;
  timeframe: string;
  generatedAt: string;
  totalSpent: number;
  totalPaid: number;
  averageExpense: number;
  categoryBreakdown: Array<{ category: string; total: number; count: number }>;
  monthlyTrend: Array<{ month: string; total: number; expenses: number }>;
  expenses?: ReportExpense[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatINR(amount: number, currency = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    food: 'Food',
    transport: 'Transport',
    shopping: 'Shopping',
    entertainment: 'Entertainment',
    utilities: 'Utilities',
    healthcare: 'Healthcare',
    rent: 'Rent',
    travel: 'Travel',
    other: 'Other',
  };
  return map[category?.toLowerCase()] || category || 'Other';
}

// ─── Colour palette ───────────────────────────────────────────────────────────

const BRAND = { r: 255, g: 92, b: 57 };       // #FF5C39 coral (warm modern)
const DARK  = { r: 28, g: 24, b: 20 };         // #1C1814 warm charcoal
const CORAL = { r: 255, g: 92, b: 57 };        // #FF5C39
const GRAY  = { r: 100, g: 116, b: 139 };      // slate-500
const LIGHT = { r: 248, g: 250, b: 252 };      // slate-50
const WHITE = { r: 255, g: 255, b: 255 };

// ─── Group Report ─────────────────────────────────────────────────────────────

export async function generateGroupReport(data: GroupReportData): Promise<void> {
  // Dynamic import — only loads jsPDF when actually needed
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Header banner ────────────────────────────────────────────────────────
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.rect(0, 0, PAGE_W, 44, 'F');

  // Accent strip
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 42, PAGE_W, 3, 'F');

  // App name
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text('DooSplit', MARGIN, 18);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text('Group Expense Report', MARGIN, 26);

  // Group name right-aligned
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  const groupLine = `${data.groupType === 'trip' ? 'Trip' : data.groupType === 'home' ? 'Home' : 'Group'}: ${data.groupName}`;
  doc.text(groupLine, PAGE_W - MARGIN, 18, { align: 'right' });

  // Generated date
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`Generated ${data.generatedAt}`, PAGE_W - MARGIN, 26, { align: 'right' });

  let y = 56;

  // ── Summary cards row ────────────────────────────────────────────────────
  const cards = [
    { label: 'Total Spent', value: formatINR(data.totalSpent, data.currency) },
    { label: 'Members', value: String(data.members.length) },
    { label: 'Expenses', value: String(data.expenses.length) },
  ];
  const cardW = (CONTENT_W - 8) / 3;

  cards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 4);
    doc.setFillColor(LIGHT.r, LIGHT.g, LIGHT.b);
    doc.roundedRect(cx, y, cardW, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(card.value, cx + cardW / 2, y + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(card.label, cx + cardW / 2, y + 18, { align: 'center' });
  });

  y += 28;

  // ── Member balances table ────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text('Member Balances', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Member', 'Balance']],
    body: data.members.map((m) => [
      m.name,
      m.balance > 0.01
        ? `gets back ${formatINR(m.balance, data.currency)}`
        : m.balance < -0.01
        ? `owes ${formatINR(Math.abs(m.balance), data.currency)}`
        : 'Settled',
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [DARK.r, DARK.g, DARK.b],
      textColor: [WHITE.r, WHITE.g, WHITE.b],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [LIGHT.r, LIGHT.g, LIGHT.b] },
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Simplified settlement plan ───────────────────────────────────────────
  if (data.simplifiedTransactions && data.simplifiedTransactions.length > 0) {
    if (y > PAGE_H - 60) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text('Smart Settle Up Plan', MARGIN, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['From', 'To', 'Amount']],
      body: data.simplifiedTransactions.map((tx) => [
        tx.fromName,
        tx.toName,
        formatINR(tx.amount, data.currency),
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [BRAND.r, BRAND.g, BRAND.b],
        textColor: [WHITE.r, WHITE.g, WHITE.b],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [LIGHT.r, LIGHT.g, LIGHT.b] },
      columnStyles: { 2: { halign: 'right', fontStyle: 'bold' } },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Expenses table ───────────────────────────────────────────────────────
  if (y > PAGE_H - 60) { doc.addPage(); y = 20; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text('Expense History', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Date', 'Description', 'Category', 'Paid By', 'Amount']],
    body: data.expenses.map((e) => [
      new Date(e.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }),
      e.description,
      categoryEmoji(e.category),
      e.paidByName || '—',
      formatINR(e.amount, e.currency || data.currency),
    ]),
    styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
    headStyles: {
      fillColor: [DARK.r, DARK.g, DARK.b],
      textColor: [WHITE.r, WHITE.g, WHITE.b],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [LIGHT.r, LIGHT.g, LIGHT.b] },
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 'auto' },
      2: { cellWidth: 25 },
      3: { cellWidth: 28 },
      4: { cellWidth: 30, halign: 'right', fontStyle: 'bold' },
    },
  });

  // ── Footer on every page ─────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(DARK.r, DARK.g, DARK.b);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text('Generated by DooSplit · doosplit.app', MARGIN, PAGE_H - 4);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  const safeName = data.groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`doosplit_${safeName}_report.pdf`);
}

// ─── Personal Analytics Report ───────────────────────────────────────────────

export async function generatePersonalReport(data: PersonalReportData): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const PAGE_W = doc.internal.pageSize.getWidth();
  const PAGE_H = doc.internal.pageSize.getHeight();
  const MARGIN = 16;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  // ── Header ───────────────────────────────────────────────────────────────
  doc.setFillColor(DARK.r, DARK.g, DARK.b);
  doc.rect(0, 0, PAGE_W, 44, 'F');
  doc.setFillColor(BRAND.r, BRAND.g, BRAND.b);
  doc.rect(0, 42, PAGE_W, 3, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text('DooSplit', MARGIN, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(BRAND.r, BRAND.g, BRAND.b);
  doc.text('Personal Analytics Report', MARGIN, 26);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(WHITE.r, WHITE.g, WHITE.b);
  doc.text(data.userName, PAGE_W - MARGIN, 18, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
  doc.text(`${data.timeframe} · ${data.generatedAt}`, PAGE_W - MARGIN, 26, { align: 'right' });

  let y = 56;

  // ── Summary cards ────────────────────────────────────────────────────────
  const cards = [
    { label: 'Total Spent', value: formatINR(data.totalSpent) },
    { label: 'Total Paid', value: formatINR(data.totalPaid) },
    { label: 'Avg Expense', value: formatINR(data.averageExpense) },
  ];
  const cardW = (CONTENT_W - 8) / 3;

  cards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 4);
    doc.setFillColor(LIGHT.r, LIGHT.g, LIGHT.b);
    doc.roundedRect(cx, y, cardW, 20, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text(card.value, cx + cardW / 2, y + 12, { align: 'center' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text(card.label, cx + cardW / 2, y + 18, { align: 'center' });
  });

  y += 28;

  // ── Category breakdown ───────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(DARK.r, DARK.g, DARK.b);
  doc.text('Spending by Category', MARGIN, y);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    head: [['Category', 'Expenses', 'Amount', '% of Total']],
    body: data.categoryBreakdown.map((cat) => [
      categoryEmoji(cat.category),
      String(cat.count),
      formatINR(cat.total),
      data.totalSpent > 0 ? `${((cat.total / data.totalSpent) * 100).toFixed(1)}%` : '0%',
    ]),
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: {
      fillColor: [DARK.r, DARK.g, DARK.b],
      textColor: [WHITE.r, WHITE.g, WHITE.b],
      fontStyle: 'bold',
    },
    alternateRowStyles: { fillColor: [LIGHT.r, LIGHT.g, LIGHT.b] },
    columnStyles: {
      1: { halign: 'center' },
      2: { halign: 'right' },
      3: { halign: 'right', fontStyle: 'bold' },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ── Monthly trend ────────────────────────────────────────────────────────
  if (data.monthlyTrend.length > 0) {
    if (y > PAGE_H - 60) { doc.addPage(); y = 20; }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(DARK.r, DARK.g, DARK.b);
    doc.text('Monthly Trend', MARGIN, y);
    y += 4;

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN, right: MARGIN },
      head: [['Month', 'Expenses', 'Total Spent']],
      body: data.monthlyTrend.map((row) => [
        row.month,
        String(row.expenses),
        formatINR(row.total),
      ]),
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: {
        fillColor: [BRAND.r, BRAND.g, BRAND.b],
        textColor: [WHITE.r, WHITE.g, WHITE.b],
        fontStyle: 'bold',
      },
      alternateRowStyles: { fillColor: [LIGHT.r, LIGHT.g, LIGHT.b] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'right', fontStyle: 'bold' },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // ── Footer ───────────────────────────────────────────────────────────────
  const totalPages = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFillColor(DARK.r, DARK.g, DARK.b);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(GRAY.r, GRAY.g, GRAY.b);
    doc.text('Generated by DooSplit · doosplit.app', MARGIN, PAGE_H - 4);
    doc.text(`Page ${i} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: 'right' });
  }

  doc.save(`doosplit_analytics_${data.timeframe.replace(/\s/g, '_').toLowerCase()}.pdf`);
}
