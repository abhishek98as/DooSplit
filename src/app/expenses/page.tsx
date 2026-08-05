"use client";

import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter, useSearchParams } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import getOfflineStore from "@/lib/offline-store";
import { authFetch } from "@/lib/auth/client-session";
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
import {
  PaymentStatus,
  PAYMENT_STATUS_VALUES,
  getPaymentStatusLabel,
} from "@/lib/expenses/payment-status";

interface Expense {
  _id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  currency: string;
  images?: string[];
  notes?: string;
  paymentStatus: PaymentStatus;
  recurringTemplateId?: string;
  recurringRunId?: string;
  recurrenceOccurrenceDate?: string;
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

interface FriendFilterOption {
  id: string;
  name: string;
}

interface SavedExpenseView {
  id: string;
  name: string;
  filters: {
    category: string;
    group: string;
    status: string;
    friendId: string;
    minAmount: string;
    maxAmount: string;
    startDate: string;
    endDate: string;
    searchQuery: string;
  };
}

const SAVED_VIEWS_STORAGE_KEY = "doosplit:expense-saved-views:v1";

function ExpenseSearchFocus({
  inputRef,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      const id = window.setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(id);
    }
  }, [searchParams, inputRef]);
  return null;
}

function ApplyFilterFromQuery({
  onFilter,
}: {
  onFilter: (filter: string | null) => void;
}) {
  const searchParams = useSearchParams();
  useEffect(() => {
    onFilter(searchParams.get("filter"));
  }, [searchParams, onFilter]);
  return null;
}

export default function ExpensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [friends, setFriends] = useState<FriendFilterOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedGroup, setSelectedGroup] = useState("all");
  const [selectedStatus, setSelectedStatus] = useState("all");
  const [selectedFriend, setSelectedFriend] = useState("all");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [savedViews, setSavedViews] = useState<SavedExpenseView[]>([]);
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
    }
  }, [status, router]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchExpenses();
    }
  }, [
    status,
    page,
    selectedCategory,
    selectedGroup,
    selectedStatus,
    selectedFriend,
    minAmount,
    maxAmount,
    startDate,
    endDate,
  ]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    fetchGroups();
    fetchFriends();

    try {
      const stored = localStorage.getItem(SAVED_VIEWS_STORAGE_KEY);
      if (!stored) {
        setSavedViews([]);
        return;
      }
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        setSavedViews(parsed as SavedExpenseView[]);
      }
    } catch (error) {
      console.warn("Failed to load saved expense views", error);
      setSavedViews([]);
    }
  }, [status]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ domains?: string[] }>).detail;
      const domains = detail?.domains || [];
      if (
        domains.includes("expenses") ||
        domains.includes("friends") ||
        domains.includes("groups") ||
        domains.includes("settlements") ||
        domains.includes("analytics")
      ) {
        fetchExpenses();
      }
    };

    window.addEventListener("doosplit:data-updated", handler as EventListener);
    return () => {
      window.removeEventListener("doosplit:data-updated", handler as EventListener);
    };
  }, [
    status,
    page,
    selectedCategory,
    selectedGroup,
    selectedStatus,
    selectedFriend,
    minAmount,
    maxAmount,
    startDate,
    endDate,
  ]);

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
      if (selectedGroup !== "all" && selectedGroup !== "non-group") {
        params.append("groupId", selectedGroup);
      }
      if (selectedStatus !== "all") {
        params.append("status", selectedStatus);
      }
      if (selectedFriend !== "all") {
        params.append("friendId", selectedFriend);
      }
      if (minAmount.trim()) {
        params.append("minAmount", minAmount.trim());
      }
      if (maxAmount.trim()) {
        params.append("maxAmount", maxAmount.trim());
      }
      if (startDate) {
        params.append("startDate", startDate);
      }
      if (endDate) {
        params.append("endDate", endDate);
      }

      const response = await authFetch(`/api/expenses?${params.toString()}`);
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

  const fetchFriends = async () => {
    try {
      const response = await authFetch("/api/friends");
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      const list = Array.isArray(data?.friends) ? data.friends : [];
      const mapped: FriendFilterOption[] = list
        .map((item: any) => {
          const id = String(item?.friend?.id || item?.friend?._id || "");
          const name = String(item?.friend?.name || "").trim();
          if (!id || !name) {
            return null;
          }
          return { id, name };
        })
        .filter(Boolean) as FriendFilterOption[];

      setFriends(mapped);
    } catch (error) {
      console.error("Error fetching friends:", error);
    }
  };

  const persistSavedViews = (views: SavedExpenseView[]) => {
    setSavedViews(views);
    try {
      localStorage.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views));
    } catch (error) {
      console.warn("Failed to persist saved expense views", error);
    }
  };

  const saveCurrentView = () => {
    const viewName = window.prompt("Name this filter view:");
    if (!viewName || !viewName.trim()) {
      return;
    }

    const trimmedName = viewName.trim();
    const nextView: SavedExpenseView = {
      id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName,
      filters: {
        category: selectedCategory,
        group: selectedGroup,
        status: selectedStatus,
        friendId: selectedFriend,
        minAmount,
        maxAmount,
        startDate,
        endDate,
        searchQuery,
      },
    };

    const withoutSameName = savedViews.filter(
      (view) => view.name.toLowerCase() !== trimmedName.toLowerCase()
    );
    persistSavedViews([nextView, ...withoutSameName].slice(0, 12));
  };

  const applySavedView = (view: SavedExpenseView) => {
    setSelectedCategory(view.filters.category || "all");
    setSelectedGroup(view.filters.group || "all");
    setSelectedStatus(view.filters.status || "all");
    setSelectedFriend(view.filters.friendId || "all");
    setMinAmount(view.filters.minAmount || "");
    setMaxAmount(view.filters.maxAmount || "");
    setStartDate(view.filters.startDate || "");
    setEndDate(view.filters.endDate || "");
    setSearchQuery(view.filters.searchQuery || "");
    setPage(1);
    setShowFilters(false);
  };

  const deleteSavedView = (viewId: string) => {
    persistSavedViews(savedViews.filter((view) => view.id !== viewId));
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
      const response = await authFetch(`/api/expenses/${expenseToDelete._id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to delete expense");

      setExpenses(expenses.filter((e) => e._id !== expenseToDelete._id));
      setShowDeleteModal(false);
      const deletedId = expenseToDelete._id;
      setExpenseToDelete(null);

      // Invalidate local IndexedDB cache
      try {
        const offlineStore = getOfflineStore();
        await offlineStore.indexedDB.delete('expenses', deletedId);
        await offlineStore.invalidateEntityCaches("expense");
      } catch (err) {
        console.warn("Failed to delete from offline store:", err);
      }

      // Notify dashboard, activity, and other pages that expenses changed.
      window.dispatchEvent(
        new CustomEvent("doosplit:data-updated", {
          detail: {
            domains: ["expenses", "friends", "analytics", "activity"],
            reason: "expense-deleted",
            at: Date.now(),
          },
        })
      );
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

  const getPaymentStatusBadgeClasses = (paymentStatus: PaymentStatus) => {
    switch (paymentStatus) {
      case "paid":
        return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
      case "partially_paid":
        return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300";
      case "disputed":
        return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
      case "unpaid":
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300";
    }
  };

  const handleUpdatePaymentStatus = async (
    expenseId: string,
    nextStatus: PaymentStatus
  ) => {
    setStatusUpdating(expenseId);
    try {
      const response = await authFetch(`/api/expenses/${expenseId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ paymentStatus: nextStatus }),
      });

      if (response.status === 404) {
        // The expense was already deleted on the server, but still present in client cache.
        // Let's clean it up.
        try {
          const offlineStore = getOfflineStore();
          await offlineStore.indexedDB.delete('expenses', expenseId);
          await offlineStore.invalidateEntityCaches("expense");
        } catch (dbErr) {
          console.warn("Failed to clean up deleted expense from offline store:", dbErr);
        }
        setExpenses((prev) => prev.filter((e) => e._id !== expenseId));
        alert("This expense has already been deleted on another device or server.");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to update payment status");
      }

      const data = await response.json();
      const updatedExpense = data?.expense;
      if (updatedExpense?._id) {
        setExpenses((prev) =>
          prev.map((expense) =>
            expense._id === updatedExpense._id
              ? { ...expense, paymentStatus: updatedExpense.paymentStatus || nextStatus }
              : expense
          )
        );

        // Update IndexedDB cache
        try {
          const offlineStore = getOfflineStore();
          const existing = await offlineStore.indexedDB.get<any>('expenses', expenseId);
          if (existing) {
            const updated = {
              ...existing,
              paymentStatus: updatedExpense.paymentStatus || nextStatus,
              is_settled: (updatedExpense.paymentStatus || nextStatus) === "paid"
            };
            await offlineStore.indexedDB.putExpense(updated);
            await offlineStore.invalidateEntityCaches("expense");
          }
        } catch (err) {
          console.warn("Failed to update offline store:", err);
        }
      }

      window.dispatchEvent(
        new CustomEvent("doosplit:data-updated", {
          detail: {
            domains: ["expenses", "friends", "analytics", "activity"],
            reason: "expense-payment-status-updated",
            at: Date.now(),
          },
        })
      );
    } catch (error) {
      console.error("Error updating payment status:", error);
      alert("Failed to update payment status");
    } finally {
      setStatusUpdating(null);
    }
  };

  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      if (Number.isNaN(date.getTime())) return "—";
      return new Intl.DateTimeFormat("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(date);
    } catch {
      return "—";
    }
  };

  const formatCurrency = (amount: number, currency: string) => {
    const n = Number(amount);
    const safe = Number.isFinite(n) ? n : 0;
    return `₹${safe.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

  const filteredExpenses = (Array.isArray(expenses) ? expenses : []).filter((expense) => {
    if (!expense || typeof expense !== "object") return false;
    const matchesSearch =
      String(expense.description || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      String(expense.createdBy?.name || "").toLowerCase().includes(searchQuery.toLowerCase());

    if (selectedGroup === "non-group" && expense.groupId) {
      return false;
    }

    if (selectedStatus !== "all") {
      const status = expense.paymentStatus || "unpaid";
      if (selectedStatus === "settled" || selectedStatus === "paid") {
        if (status !== "paid") return false;
      } else if (selectedStatus === "unsettled") {
        if (status === "paid") return false;
      } else if (status !== selectedStatus) {
        return false;
      }
    }

    // Filter by settled status
    if (!showSettled) {
      const allSettled = expense.paymentStatus === "paid";
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
    setSelectedStatus("all");
    setSelectedFriend("all");
    setMinAmount("");
    setMaxAmount("");
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

  const applyUrlFilter = useCallback((filter: string | null) => {
    if (filter === "non-group") {
      setSelectedGroup("non-group");
      setShowFilters(true);
    }
  }, []);

  return (
    <AppShell>
      <Suspense fallback={null}>
        <ExpenseSearchFocus inputRef={searchInputRef} />
        <ApplyFilterFromQuery onFilter={applyUrlFilter} />
      </Suspense>
      <div className="p-4 md:p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 md:hidden">
          <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Expenses
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Manage and track all your expenses
          </p>
        </div>

        {/* Search and Filters */}
        <div className="mb-6 space-y-3">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="w-full md:flex-1">
              <Input
                ref={searchInputRef}
                icon={<Search className="w-4 h-4" />}
                placeholder="Search expenses..."
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 md:gap-3 items-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              >
                <Filter className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Filters
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowExportModal(true)}
                className="flex items-center gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
                disabled={filteredExpenses.length === 0}
              >
                <Download className="w-3.5 h-3.5 md:w-4 md:h-4" />
                Export
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={saveCurrentView}
                className="flex items-center gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              >
                Save View
              </Button>
              <Button
                variant={showSettled ? "secondary" : "outline"}
                size="sm"
                onClick={() => {
                  setShowSettled(!showSettled);
                  localStorage.setItem('showSettledExpenses', (!showSettled).toString());
                }}
                className="flex items-center gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              >
                <Eye className="w-3.5 h-3.5 md:w-4 md:h-4" />
                {showSettled ? "Hide" : "Show"} Settled
              </Button>
              <Button
                onClick={() => router.push("/expenses/add")}
                size="sm"
                className="flex items-center gap-1.5 text-xs md:text-sm h-8 md:h-9 px-2.5 md:px-3"
              >
                <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                <span className="hidden md:inline">Add Expense</span>
              </Button>
            </div>
          </div>

          {savedViews.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {savedViews.map((view) => (
                <div
                  key={view.id}
                  className="inline-flex items-center rounded-full border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800"
                >
                  <button
                    type="button"
                    onClick={() => applySavedView(view)}
                    className="px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-200"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteSavedView(view.id)}
                    className="px-2 py-1.5 text-gray-500 hover:text-red-500"
                    aria-label={`Delete saved view ${view.name}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Filter Panel */}
          {showFilters && (
            <Card className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4">
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
                    Friend
                  </label>
                  <select
                    value={selectedFriend}
                    onChange={(e) => setSelectedFriend(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Friends</option>
                    {friends.map((friend) => (
                      <option key={friend.id} value={friend.id}>
                        {friend.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Min Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={minAmount}
                    onChange={(e) => setMinAmount(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Max Amount
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={maxAmount}
                    onChange={(e) => setMaxAmount(e.target.value)}
                    placeholder="No limit"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  />
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
                    Payment Status
                  </label>
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                  >
                    <option value="all">All Statuses</option>
                    {PAYMENT_STATUS_VALUES.map((paymentStatus) => (
                      <option key={paymentStatus} value={paymentStatus}>
                        {getPaymentStatusLabel(paymentStatus)}
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
              {searchQuery || selectedCategory !== "all" || selectedGroup !== "all" || selectedStatus !== "all" || selectedFriend !== "all" || minAmount || maxAmount || startDate || endDate
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
                            <span>•</span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getPaymentStatusBadgeClasses(expense.paymentStatus || "unpaid")}`}
                            >
                              {getPaymentStatusLabel(expense.paymentStatus || "unpaid")}
                            </span>
                            {expense.groupId ? (
                              <>
                                <span>•</span>
                                <span className="flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {expense.groupId?.name || "Group"}
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
                            {expense.recurringTemplateId && (
                              <>
                                <span>â€¢</span>
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                                  Recurring
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
                        <select
                          value={expense.paymentStatus || "unpaid"}
                          onChange={(e) =>
                            handleUpdatePaymentStatus(
                              expense._id,
                              e.target.value as PaymentStatus
                            )
                          }
                          disabled={statusUpdating === expense._id}
                          className="h-8 px-2 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                        >
                          {PAYMENT_STATUS_VALUES.map((paymentStatus) => (
                            <option key={paymentStatus} value={paymentStatus}>
                              {getPaymentStatusLabel(paymentStatus)}
                            </option>
                          ))}
                        </select>
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

