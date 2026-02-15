"use client";

import { useState, useEffect } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import getOfflineStore from "@/lib/offline-store";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Modal from "@/components/ui/Modal";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { exportToExcel, exportToPDF, exportToCSV } from "@/lib/exportUtils";
import { 
  Receipt,
  Search,
  Filter,
  Edit2,
  Trash2,
  Calendar,
  Users,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Plus,
  Download
} from "lucide-react";

interface Expense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  images?: string[];
  notes?: string;
  groupId?: {
    _id: string;
    name: string;
  };
  createdBy: {
    _id: string;
    name: string;
    email?: string;
    profilePicture?: string;
  };
  participants: Array<{
    userId: {
      _id: string;
      name: string;
    };
    paidAmount: number;
    owedAmount: number;
    isSettled: boolean;
  }>;
  createdAt: string;
}

interface Group {
  _id: string;
  name: string;
}

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [showSettled, setShowSettled] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('showSettledExpenses') !== 'false';
    }
    return true;
  });

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const limit = 10;

  // Delete confirmation
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const categories = [
    { value: "all", label: "All Categories", icon: "📂" },
    { value: "food", label: "Food", icon: "🍔" },
    { value: "transport", label: "Transport", icon: "🚗" },
    { value: "shopping", label: "Shopping", icon: "🛒" },
    { value: "entertainment", label: "Entertainment", icon: "🎬" },
    { value: "utilities", label: "Utilities", icon: "📄" },
    { value: "healthcare", label: "Healthcare", icon: "⚕️" },
    { value: "rent", label: "Rent", icon: "🏠" },
    { value: "other", label: "Other", icon: "📦" }
  ];

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    } else if (status === "authenticated") {
      fetchExpenses();
      fetchGroups();
    }
  }, [status, page, selectedCategory, selectedGroup, startDate, endDate]);

  const fetchExpenses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (selectedCategory !== "all") {
        params.append("category", selectedCategory);
      }
      if (selectedGroup !== "all") {
        params.append("groupId", selectedGroup);
      }
      if (startDate) {
        params.append("startDate", startDate);
      }
      if (endDate) {
        params.append("endDate", endDate);
      }

      const response = await fetch(`/api/expenses?${params.toString()}`);
      if (!response.ok) throw new Error("Failed to fetch expenses");

      const data = await response.json();
      // Ensure expenses is always an array
      const expensesArray = Array.isArray(data.expenses) ? data.expenses : [];
      setExpenses(expensesArray);
      setTotalPages(data.pagination?.totalPages || data.totalPages || 1);
    } catch (error) {
      console.error("Error fetching expenses:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGroups = async () => {
    try {
      const offlineStore = getOfflineStore();
      const groups = await offlineStore.getGroups();
      setGroups(groups || []);
    } catch (error) {
      console.error("Error fetching groups:", error);
    }
  };

  const handleSearch = (query: string) => {
    setSearchQuery(query);
  };

  const handleDeleteExpense = async () => {
    if (!expenseToDelete) return;

    setDeleting(expenseToDelete._id);
    try {
      const response = await fetch(`/api/expenses/${expenseToDelete._id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete expense");

      setExpenses(expenses.filter((e) => e._id !== expenseToDelete._id));
      setShowDeleteModal(false);
      setExpenseToDelete(null);
    } catch (error) {
      console.error("Error deleting expense:", error);
      alert("Failed to delete expense");
    } finally {
      setDeleting(null);
    }
  };

  const handleExport = async (format: 'excel' | 'pdf' | 'csv') => {
    setExporting(true);
    try {
      // Use filtered expenses for export
      const dataToExport = filteredExpenses;

      let result;
      switch (format) {
        case 'excel':
          result = await exportToExcel(dataToExport as any);
          break;
        case 'pdf':
          result = await exportToPDF(dataToExport as any, session?.user?.name || 'User');
          break;
        case 'csv':
          result = exportToCSV(dataToExport as any);
          break;
        default:
          throw new Error('Invalid format');
      }

      if (result.success) {
        alert(`Successfully exported ${dataToExport.length} expenses to ${format.toUpperCase()}`);
        setShowExportModal(false);
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error("Error exporting:", error);
      alert("Failed to export expenses. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);
  };

  const formatCurrency = (amount: number, currency: string) => {
    return `₹${amount.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getCategoryIcon = (category: string) => {
    return categories.find((c) => c.value === category)?.icon || "📦";
  };

  const getUserShareInfo = (expense: Expense) => {
    const userParticipant = expense.participants?.find(
      (p) => p.userId?._id === session?.user?.id
    );
    
    const isPayer = expense.createdBy?._id === session?.user?.id;
    const totalPaid = userParticipant?.paidAmount || 0;
    const totalOwed = userParticipant?.owedAmount || 0;
    const balance = totalPaid - totalOwed;

    if (balance > 0) {
      return { text: `you lent ${formatCurrency(balance, expense.currency)}`, color: "text-green-600 dark:text-green-400" };
    } else if (balance < 0) {
      return { text: `you borrowed ${formatCurrency(Math.abs(balance), expense.currency)}`, color: "text-red-600 dark:text-red-400" };
    } else if (isPayer) {
      return { text: "you paid and split equally", color: "text-gray-600 dark:text-gray-400" };
    } else {
      return { text: "split equally", color: "text-gray-600 dark:text-gray-400" };
    }
  };

  const filteredExpenses = expenses.filter((expense) => {
    const matchesSearch =
      expense.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (expense.createdBy?.name || "").toLowerCase().includes(searchQuery.toLowerCase());

    // Filter by settled status
    if (!showSettled) {
      const allSettled = expense.participants?.every(p => p.isSettled);
      if (allSettled) return false;
    }

    return matchesSearch;
  });

  const applyFilters = () => {
    setPage(1);
    fetchExpenses();
    setShowFilters(false);
  };

  const clearFilters = () => {
    setSelectedCategory("all");
    setSelectedGroup("all");
    setStartDate("");
    setEndDate("");
    setPage(1);
    fetchExpenses();
  };

  if (status === "loading" || loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center min-h-[60vh]">
          <LoadingSpinner size="lg" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Expenses
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and track all your expenses
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                icon={<Search className="w-4 h-4" />}
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2"
            >
              <Filter className="w-4 h-4" />
              Filters
            </Button>
            <Button
              variant="secondary"
              onClick={() => setShowExportModal(true)}
              className="flex items-center gap-2"
              disabled={filteredExpenses.length === 0}
            >
              <Download className="w-4 h-4" />
              Export
            </Button>
            <Button
              variant={showSettled ? "secondary" : "outline"}
              onClick={() => {
                setShowSettled(!showSettled);
                localStorage.setItem('showSettledExpenses', (!showSettled).toString());
              }}
              className="flex items-center gap-2"
            >
              <Eye className="w-4 h-4" />
              {showSettled ? "Hide" : "Show"} Settled
            </Button>
            <Button
              onClick={() => router.push("/expenses/add")}
              className="flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden md:inline">Add Expense</span>
            </Button>
          </div>

          {/* Filter Panel */}
          {showFilters && (
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Category
                  </label>
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    {categories.map((cat) => (
                      <option key={cat.value} value={cat.value}>
                        {cat.icon} {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Group
                  </label>
                  <select
                    value={selectedGroup}
                    onChange={(e) => setSelectedGroup(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Groups</option>
                    <option value="non-group">Non-Group Expenses</option>
                    {groups.map((group) => (
                      <option key={group._id} value={group._id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-4">
                <Button onClick={applyFilters} size="sm">
                  Apply Filters
                </Button>
                <Button onClick={clearFilters} variant="secondary" size="sm">
                  Clear Filters
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Expenses List */}
        {filteredExpenses.length === 0 ? (
          <Card className="p-12 text-center">
            <Receipt className="w-16 h-16 mx-auto mb-4 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              No expenses found
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              {searchQuery || selectedCategory !== "all" || selectedGroup !== "all" || startDate || endDate
                ? "Try adjusting your filters or search query"
                : "Start by adding your first expense"}
            </p>
            <Button onClick={() => router.push("/expenses/add")}>
              Add Expense
            </Button>
          </Card>
        ) : (
          <div className="space-y-3">
            {filteredExpenses.map((expense) => {
              const shareInfo = getUserShareInfo(expense);
              return (
                <Card key={expense._id} className="p-4 hover:shadow-md transition-shadow">
                  <div className="flex items-start gap-4">
                    {/* Category Icon */}
                    <div className="flex-shrink-0">
                      <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-2xl">
                        {getCategoryIcon(expense.category)}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                            {expense.description}
                          </h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-gray-600 dark:text-gray-400">
                            <span>{expense.createdBy?.name || "Unknown"} paid</span>
                            <span>•</span>
                            <span>{formatDate(expense.date)}</span>
                            {expense.groupId ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {expense.groupId.name}
                                </span>
                              </>
                            ) : (
                              <>
                                <span>•</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                  Non-Group
                                </span>
                              </>
                            )}
                          </div>
                          <p className={`text-sm mt-1 ${shareInfo.color}`}>
                            {shareInfo.text}
                          </p>
                        </div>

                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-lg text-gray-900 dark:text-white font-mono">
                            {formatCurrency(expense.amount, expense.currency)}
                          </div>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-3">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => router.push(`/expenses/edit/${expense._id}`)}
                          className="flex items-center gap-1"
                        >
                          <Edit2 className="w-3 h-3" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setExpenseToDelete(expense);
                            setShowDeleteModal(true);
                          }}
                          className="flex items-center gap-1 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}

        {/* Pagination */}
        {filteredExpenses.length > 0 && totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 mt-6">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setExpenseToDelete(null);
        }}
        title="Delete Expense"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete this expense? This action cannot be undone.
          </p>
          {expenseToDelete && (
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
              <p className="font-semibold text-gray-900 dark:text-white">
                {expenseToDelete.description}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {formatCurrency(expenseToDelete.amount, expenseToDelete.currency)} • {formatDate(expenseToDelete.date)}
              </p>
            </div>
          )}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => {
                setShowDeleteModal(false);
                setExpenseToDelete(null);
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDeleteExpense}
              isLoading={deleting === expenseToDelete?._id}
              className="flex-1 bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Export Modal */}
      <Modal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        title="Export Expenses"
      >
        <div className="space-y-4">
          <p className="text-gray-600 dark:text-gray-400">
            Export {filteredExpenses.length} expense{filteredExpenses.length !== 1 ? 's' : ''} to your preferred format.
          </p>
          <div className="space-y-3">
            <Button
              onClick={() => handleExport('excel')}
              disabled={exporting}
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export to Excel (.xlsx)'}
            </Button>
            <Button
              onClick={() => handleExport('pdf')}
              disabled={exporting}
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export to PDF'}
            </Button>
            <Button
              onClick={() => handleExport('csv')}
              disabled={exporting}
              variant="secondary"
              className="w-full flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export to CSV'}
            </Button>
          </div>
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              variant="secondary"
              onClick={() => setShowExportModal(false)}
              className="w-full"
              disabled={exporting}
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}

