"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import {
  Plus,
  Search,
  Settings,
  Bell,
  Trash2,
  FolderArchive,
  Lightbulb,
  Notebook,
  ListTodo,
  Pin,
  Tag,
  Palette,
  FileText,
  Loader2,
  Download,
  Check,
  X,
  Info
} from "lucide-react";

interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

interface NoteItem {
  id: string;
  title: string;
  text: string;
  type: "text" | "list";
  items: NoteChecklistItem[];
  color: string;
  pinned: boolean;
  archived: boolean;
  trashed: boolean;
  reminder: string | null;
  createdAt: string;
  updatedAt: string;
}

const COLOR_SCHEMES: Record<string, { bg: string; border: string; accent: string; label: string }> = {
  amber: {
    bg: "from-[#FFF8E7] to-white dark:from-[rgba(232,163,61,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-amber-500/30 dark:border-amber-500/20 hover:border-amber-500",
    accent: "#E8A33D",
    label: "Personal",
  },
  coral: {
    bg: "from-[#FFEDE7] to-white dark:from-[rgba(255,92,57,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-coral/30 dark:border-coral/20 hover:border-coral",
    accent: "#FF5C39",
    label: "Work",
  },
  mint: {
    bg: "from-[#E7F8F1] to-white dark:from-[rgba(45,155,107,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-emerald-500/30 dark:border-emerald-500/20 hover:border-emerald-500",
    accent: "#2D9B6B",
    label: "Health",
  },
  lavender: {
    bg: "from-[#F0EBFA] to-white dark:from-[rgba(139,92,246,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-violet-500/30 dark:border-violet-500/20 hover:border-violet-500",
    accent: "#8B5CF6",
    label: "Ideas",
  },
  sky: {
    bg: "from-[#E7F0FA] to-white dark:from-[rgba(14,165,233,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-sky-500/30 dark:border-sky-500/20 hover:border-sky-500",
    accent: "#0EA5E9",
    label: "Travel",
  },
  rose: {
    bg: "from-[#FCE7EC] to-white dark:from-[rgba(244,63,94,0.08)] dark:to-[#1F1B16] bg-gradient-to-br",
    border: "border-rose-500/30 dark:border-rose-500/20 hover:border-rose-500",
    accent: "#F43F5E",
    label: "Other",
  },
};

function formatTime(iso: string | Date | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  if (diffDay < 7) return `${diffDay}d ago`;
  if (diffDay < 365) return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatReminder(iso: string | Date | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff < 0) return "Overdue · " + formatTime(iso);
  const diffDay = Math.floor(diff / 86400000);
  if (diffDay === 0) return "Today " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDay === 1) return "Tomorrow " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDay < 7) return date.toLocaleDateString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function NotesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<"all" | "reminders" | "archive" | "trash">("all");
  const [currentLabel, setCurrentLabel] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "title">("updated");

  // Editor Draft State
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{
    title: string;
    text: string;
    type: "text" | "list";
    items: NoteChecklistItem[];
    color: string;
    pinned: boolean;
    reminder: string | null;
  }>({
    title: "",
    text: "",
    type: "list",
    items: [],
    color: "",
    pinned: false,
    reminder: null,
  });

  // Settings & Popovers
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);

  // Toast State
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "info" | "warn";
    actionLabel?: string;
    actionFn?: () => void;
  } | null>(null);

  const showToast = useCallback((message: string, type: "success" | "info" | "warn" = "success", actionLabel?: string, actionFn?: () => void) => {
    setToast({ message, type, actionLabel, actionFn });
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => {
        setToast(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auth Protection
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/login");
    }
  }, [status, router]);

  // Fetch Notes
  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch("/api/notes");
      if (res.ok) {
        const data = await res.json();
        setNotes(data.notes || []);
      }
    } catch (err) {
      console.error("Failed to load notes:", err);
      showToast("Error loading notes", "warn");
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotes();
    }
  }, [status, fetchNotes]);

  // Trigger reminders alert checking
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      notes.forEach(note => {
        if (note.reminder && !note.trashed && !note.archived) {
          const remTime = new Date(note.reminder).getTime();
          // Alert if difference is within a minute
          if (Math.abs(now - remTime) < 30000) {
            showToast(`Reminder: "${note.title || "Untitled"}" is due!`, "info");
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [notes, showToast]);

  // Draft Helpers
  const addChecklistItem = (index?: number) => {
    const now = new Date().toISOString();
    const newItem = {
      id: "i" + Date.now() + Math.random(),
      text: "",
      done: false,
      createdAt: now,
      updatedAt: now,
    };
    setDraft(prev => {
      const items = [...prev.items];
      if (index !== undefined) {
        items.splice(index, 0, newItem);
      } else {
        items.push(newItem);
      }
      return { ...prev, items };
    });
  };

  const updateDraftItem = (index: number, val: string) => {
    setDraft(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], text: val, updatedAt: new Date().toISOString() };
      return { ...prev, items };
    });
  };

  const toggleDraftItem = (index: number) => {
    setDraft(prev => {
      const items = [...prev.items];
      items[index] = { ...items[index], done: !items[index].done, updatedAt: new Date().toISOString() };
      return { ...prev, items };
    });
  };

  const removeDraftItem = (index: number) => {
    setDraft(prev => {
      const items = prev.items.filter((_, i) => i !== index);
      return {
        ...prev,
        items: items.length === 0 ? [{ id: "i" + Date.now(), text: "", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] : items,
      };
    });
  };

  // CRUD Actions
  const openEditor = (note?: NoteItem) => {
    if (note) {
      setEditingId(note.id);
      setDraft({
        title: note.title || "",
        text: note.text || "",
        type: note.type,
        items: note.items ? note.items.map(i => ({ ...i })) : [],
        color: note.color || "",
        pinned: note.pinned,
        reminder: note.reminder,
      });
    } else {
      setEditingId(null);
      const now = new Date().toISOString();
      setDraft({
        title: "",
        text: "",
        type: "list",
        items: [{ id: "i" + Date.now(), text: "", done: false, createdAt: now, updatedAt: now }],
        color: "",
        pinned: false,
        reminder: null,
      });
    }
    setShowColorPicker(false);
    setShowReminderPicker(false);
    setModalOpen(true);
  };

  const saveNote = async () => {
    if (!draft.title.trim() && !draft.text.trim() && (draft.type === "text" || draft.items.every(i => !i.text.trim()))) {
      showToast("Note is empty", "warn");
      return;
    }

    let finalItems = [...draft.items];
    if (draft.type === "list") {
      finalItems = finalItems.filter(i => i.text.trim());
      if (finalItems.length === 0) {
        finalItems = [{ id: "i" + Date.now(), text: "", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
      }
    }

    const payload = {
      title: draft.title.trim(),
      text: draft.type === "text" ? draft.text.trim() : "",
      type: draft.type,
      items: draft.type === "list" ? finalItems : [],
      color: draft.color,
      pinned: draft.pinned,
      reminder: draft.reminder,
    };

    try {
      if (editingId) {
        const res = await fetch(`/api/notes/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(prev => prev.map(n => n.id === editingId ? data.note : n));
          showToast("Note updated");
        }
      } else {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(prev => [data.note, ...prev]);
          showToast("Note created");
        }
      }
      setModalOpen(false);
      setEditingId(null);
    } catch (err) {
      console.error(err);
      showToast("Failed to save note", "warn");
    }
  };

  const togglePin = async (e: React.MouseEvent, note: NoteItem) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
        showToast(note.pinned ? "Note unpinned" : "Note pinned");
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleArchive = async (e: React.MouseEvent | null, note: NoteItem) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !note.archived }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
        showToast(
          note.archived ? "Note restored" : "Note archived",
          "info",
          "Undo",
          () => toggleArchive(null, { ...note, archived: !note.archived })
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const deleteNote = async (e: React.MouseEvent, note: NoteItem) => {
    e.stopPropagation();
    try {
      if (note.trashed) {
        const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
        if (res.ok) {
          setNotes(prev => prev.filter(n => n.id !== note.id));
          showToast("Note permanently deleted");
        }
      } else {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trashed: true }),
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
          showToast("Note moved to trash", "info", "Undo", async () => {
            await fetch(`/api/notes/${note.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ trashed: false }),
            });
            fetchNotes();
          });
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleCardItemDone = async (noteId: string, itemId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || !note.items) return;

    const updatedItems = note.items.map(item => {
      if (item.id === itemId) {
        return { ...item, done: !item.done, updatedAt: new Date().toISOString() };
      }
      return item;
    });

    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updatedItems }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === noteId ? data.note : n));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const emptyTrash = async () => {
    const trashedNotes = notes.filter(n => n.trashed);
    if (trashedNotes.length === 0) {
      showToast("Trash is already empty", "info");
      return;
    }
    try {
      await Promise.all(
        trashedNotes.map(n => fetch(`/api/notes/${n.id}`, { method: "DELETE" }))
      );
      setNotes(prev => prev.filter(n => !n.trashed));
      showToast(`Emptied ${trashedNotes.length} notes from trash`);
    } catch (err) {
      console.error(err);
      showToast("Failed to empty trash", "warn");
    }
  };

  const exportNotes = () => {
    const blob = new Blob([JSON.stringify(notes, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doosplit-notes-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Notes exported");
  };

  // Computations
  const counts = useMemo(() => {
    return {
      all: notes.filter(n => !n.archived && !n.trashed).length,
      reminders: notes.filter(n => n.reminder && !n.trashed && !n.archived).length,
      archive: notes.filter(n => n.archived && !n.trashed).length,
      trash: notes.filter(n => n.trashed).length,
    };
  }, [notes]);

  const storageStats = useMemo(() => {
    const notesJson = JSON.stringify(notes);
    const limit = 10 * 1024 * 1024; // 10MB
    const pct = Math.min(100, (notesJson.length / limit) * 100);
    const kb = (notesJson.length / 1024).toFixed(1);
    return { percentage: pct, kb };
  }, [notes]);

  const filteredNotes = useMemo(() => {
    let result = [...notes];

    if (currentView === "archive") result = result.filter(n => n.archived && !n.trashed);
    else if (currentView === "trash") result = result.filter(n => n.trashed);
    else if (currentView === "reminders") result = result.filter(n => n.reminder && !n.trashed && !n.archived);
    else result = result.filter(n => !n.archived && !n.trashed);

    if (currentLabel) result = result.filter(n => n.color === currentLabel);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => {
        const titleMatch = n.title.toLowerCase().includes(q);
        const textMatch = (n.text || "").toLowerCase().includes(q);
        const itemsMatch = (n.items || []).some(item => item.text.toLowerCase().includes(q));
        return titleMatch || textMatch || itemsMatch;
      });
    }

    if (sortBy === "updated") {
      result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    } else if (sortBy === "created") {
      result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    } else if (sortBy === "title") {
      result.sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled"));
    }

    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

    return result;
  }, [notes, currentView, currentLabel, searchQuery, sortBy]);

  if (loading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex flex-col md:flex-row min-h-[calc(100vh-140px)] w-full relative px-1 py-1">
        
        {/* ── Sub Sidebar Categories & Labels (Desktop) ──────────────────────────── */}
        <aside className="w-56 shrink-0 border-r border-neutral-200 dark:border-dark-border pr-6 hidden md:block select-none">
          <button
            onClick={() => openEditor()}
            className="w-full mb-6 py-2.5 px-4 bg-primary text-white font-display font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-primary-dark shadow-sm active:scale-[0.98] transition-all"
          >
            <Plus className="h-4.5 w-4.5" />
            New Note
          </button>

          <nav className="space-y-1">
            <button
              onClick={() => { setCurrentView("all"); setCurrentLabel(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentView === "all" && !currentLabel
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              <div className="flex items-center gap-3">
                <Lightbulb className="h-4.5 w-4.5" />
                <span>All Notes</span>
              </div>
              <span className="text-xs bg-neutral-200/50 dark:bg-dark-bg-tertiary px-2 py-0.5 rounded-full text-neutral-500">{counts.all}</span>
            </button>

            <button
              onClick={() => { setCurrentView("reminders"); setCurrentLabel(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentView === "reminders" && !currentLabel
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              <div className="flex items-center gap-3">
                <Bell className="h-4.5 w-4.5" />
                <span>Reminders</span>
              </div>
              <span className="text-xs bg-neutral-200/50 dark:bg-dark-bg-tertiary px-2 py-0.5 rounded-full text-neutral-500">{counts.reminders}</span>
            </button>

            <button
              onClick={() => { setCurrentView("archive"); setCurrentLabel(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentView === "archive" && !currentLabel
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              <div className="flex items-center gap-3">
                <FolderArchive className="h-4.5 w-4.5" />
                <span>Archive</span>
              </div>
              <span className="text-xs bg-neutral-200/50 dark:bg-dark-bg-tertiary px-2 py-0.5 rounded-full text-neutral-500">{counts.archive}</span>
            </button>

            <button
              onClick={() => { setCurrentView("trash"); setCurrentLabel(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                currentView === "trash" && !currentLabel
                  ? "bg-primary/10 text-primary"
                  : "text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
              }`}
            >
              <div className="flex items-center gap-3">
                <Trash2 className="h-4.5 w-4.5" />
                <span>Trash</span>
              </div>
              <span className="text-xs bg-neutral-200/50 dark:bg-dark-bg-tertiary px-2 py-0.5 rounded-full text-neutral-500">{counts.trash}</span>
            </button>
          </nav>

          {/* Color Labels */}
          <div className="mt-8">
            <h4 className="text-[11px] font-bold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mb-2 px-3">Labels</h4>
            <div className="space-y-1">
              {Object.keys(COLOR_SCHEMES).map(colorKey => {
                const s = COLOR_SCHEMES[colorKey];
                return (
                  <button
                    key={colorKey}
                    onClick={() => { setCurrentLabel(colorKey); setCurrentView("all"); }}
                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-colors ${
                      currentLabel === colorKey
                        ? "bg-primary/10 text-primary font-bold"
                        : "text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary"
                    }`}
                  >
                    <span className="h-3 w-3 rounded-md shrink-0 border border-neutral-300 dark:border-neutral-700" style={{ backgroundColor: s.accent }} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Settings & Storage Indicator */}
          <div className="mt-8 border-t border-neutral-200 dark:border-dark-border pt-4">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold text-neutral-600 dark:text-dark-text-secondary hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
            >
              <Settings className="h-4.5 w-4.5" />
              <span>Notes Settings</span>
            </button>

            <div className="mt-4 px-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400 dark:text-dark-text-tertiary mb-1">
                <span>Storage</span>
                <span>{storageStats.kb} KB / 10 MB</span>
              </div>
              <div className="h-1.5 w-full bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${storageStats.percentage}%` }} />
              </div>
            </div>
          </div>
        </aside>

        {/* ── Horizontal Row Filter Tabs (Mobile View only) ──────────────────────────── */}
        <div className="md:hidden flex overflow-x-auto gap-2 pb-4 scrollbar-none shrink-0 border-b border-neutral-100 dark:border-dark-border mb-4">
          <button
            onClick={() => { setCurrentView("all"); setCurrentLabel(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${
              currentView === "all" && !currentLabel
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary border-neutral-200 dark:border-dark-border"
            }`}
          >
            All ({counts.all})
          </button>
          <button
            onClick={() => { setCurrentView("reminders"); setCurrentLabel(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${
              currentView === "reminders" && !currentLabel
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary border-neutral-200 dark:border-dark-border"
            }`}
          >
            Reminders ({counts.reminders})
          </button>
          <button
            onClick={() => { setCurrentView("archive"); setCurrentLabel(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${
              currentView === "archive" && !currentLabel
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary border-neutral-200 dark:border-dark-border"
            }`}
          >
            Archive ({counts.archive})
          </button>
          <button
            onClick={() => { setCurrentView("trash"); setCurrentLabel(null); }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border ${
              currentView === "trash" && !currentLabel
                ? "bg-primary text-white border-primary"
                : "bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary border-neutral-200 dark:border-dark-border"
            }`}
          >
            Trash ({counts.trash})
          </button>
          
          <div className="w-[1px] bg-neutral-200 dark:bg-dark-border self-stretch" />
          
          {Object.keys(COLOR_SCHEMES).map(colorKey => {
            const s = COLOR_SCHEMES[colorKey];
            return (
              <button
                key={colorKey}
                onClick={() => { setCurrentLabel(colorKey); setCurrentView("all"); }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap border flex items-center gap-1.5 ${
                  currentLabel === colorKey
                    ? "bg-primary text-white border-primary"
                    : "bg-white dark:bg-dark-bg-secondary text-neutral-600 dark:text-dark-text-secondary border-neutral-200 dark:border-dark-border"
                }`}
              >
                <span className="h-2 w-2 rounded-full border border-white" style={{ backgroundColor: s.accent }} />
                <span>{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* ── Main Notes Grid Pane ──────────────────────────── */}
        <div className="flex-1 min-w-0 md:pl-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <h1 className="text-2xl font-bold font-display text-neutral-900 dark:text-dark-text flex items-center gap-3">
              {currentLabel ? (
                <>
                  <Tag className="h-6 w-6 text-primary" />
                  <span>{COLOR_SCHEMES[currentLabel]?.label || "Notes"}</span>
                </>
              ) : currentView === "reminders" ? (
                <>
                  <Bell className="h-6 w-6 text-primary" />
                  <span>Reminders</span>
                </>
              ) : currentView === "archive" ? (
                <>
                  <FolderArchive className="h-6 w-6 text-primary" />
                  <span>Archive</span>
                </>
              ) : currentView === "trash" ? (
                <>
                  <Trash2 className="h-6 w-6 text-primary" />
                  <span>Trash</span>
                </>
              ) : (
                <>
                  <Notebook className="h-6 w-6 text-primary" />
                  <span>All Notes</span>
                </>
              )}
              <span className="text-xs font-semibold px-2 py-0.5 bg-neutral-200 dark:bg-dark-bg-tertiary rounded-full text-neutral-500">
                {filteredNotes.length} {filteredNotes.length === 1 ? "note" : "notes"}
              </span>
            </h1>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56 max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <input
                  type="text"
                  placeholder="Search notes..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-xs bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl focus:outline-none focus:border-primary transition-colors text-neutral-800 dark:text-dark-text"
                />
              </div>

              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value as any)}
                className="py-1.5 px-3 border border-neutral-200 dark:border-dark-border bg-white dark:bg-dark-bg-secondary text-xs rounded-xl font-bold focus:outline-none cursor-pointer text-neutral-800 dark:text-dark-text"
              >
                <option value="updated">Last edited</option>
                <option value="created">Date created</option>
                <option value="title">Title (A-Z)</option>
              </select>

              {currentView === "trash" && (
                <button
                  onClick={emptyTrash}
                  className="py-1.5 px-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl text-xs flex items-center gap-1 active:scale-[0.98] transition-all"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Empty Trash</span>
                </button>
              )}
            </div>
          </div>

          {/* Grid Layout */}
          {filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
              <Notebook className="h-12 w-12 text-neutral-300 dark:text-dark-border mb-3" />
              <h3 className="font-bold text-neutral-700 dark:text-dark-text-secondary">No notes here yet</h3>
              <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary max-w-xs mt-1">
                {searchQuery ? "No notes matched your search query." : "Click \"New Note\" or the floating + button on the bottom right to create your first note."}
              </p>
            </div>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4 space-y-4">
              {filteredNotes.map(note => {
                const scheme = COLOR_SCHEMES[note.color] || {
                  bg: "bg-white dark:bg-dark-bg-secondary",
                  border: "border-neutral-200 dark:border-dark-border hover:border-neutral-400 dark:hover:border-dark-border-hover",
                  accent: "transparent"
                };

                return (
                  <div
                    key={note.id}
                    onClick={() => openEditor(note)}
                    className={`break-inside-avoid w-full p-4 rounded-2xl border ${scheme.bg} ${scheme.border} relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden group`}
                  >
                    {/* Left edge accent line */}
                    <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ backgroundColor: scheme.accent }} />

                    {/* Pin button */}
                    <button
                      onClick={e => togglePin(e, note)}
                      className={`absolute top-3 right-3 p-1.5 rounded-lg text-neutral-400 hover:text-primary transition-colors ${
                        note.pinned ? "text-primary opacity-100 rotate-45" : "opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <Pin className="h-4 w-4 fill-current" />
                    </button>

                    {/* Title */}
                    {note.title && (
                      <h3 className="font-bold text-[15px] leading-tight text-neutral-900 dark:text-dark-text mb-2 pr-6">
                        {note.title}
                      </h3>
                    )}

                    {/* Content */}
                    {note.type === "list" ? (
                      <ul className="space-y-1 mb-3">
                        {note.items.slice(0, 6).map(item => (
                          <li
                            key={item.id}
                            onClick={e => { e.stopPropagation(); toggleCardItemDone(note.id, item.id); }}
                            className={`flex items-start gap-2 text-xs py-0.5 leading-snug cursor-pointer ${
                              item.done ? "text-neutral-400 dark:text-dark-text-tertiary line-through" : "text-neutral-700 dark:text-dark-text-secondary"
                            }`}
                          >
                            <span
                              className={`h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-all ${
                                item.done
                                  ? "bg-primary border-primary text-white"
                                  : "border-neutral-300 dark:border-neutral-700"
                              }`}
                            >
                              {item.done && <Check className="h-3 w-3" />}
                            </span>
                            <div className="flex flex-col min-w-0">
                              <span className="truncate">{item.text}</span>
                              <span className="text-[8px] text-neutral-400/80 leading-none mt-0.5">
                                Added {formatTime(item.createdAt)}
                              </span>
                            </div>
                          </li>
                        ))}
                        {note.items.length > 6 && (
                          <li className="text-[10px] font-semibold text-neutral-400 pl-6 pt-1">
                            + {note.items.length - 6} more items
                          </li>
                        )}
                      </ul>
                    ) : (
                      <p className="text-xs text-neutral-600 dark:text-dark-text-secondary leading-relaxed mb-3 whitespace-pre-wrap truncate max-h-36">
                        {note.text}
                      </p>
                    )}

                    {/* Reminder Chip */}
                    {note.reminder && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full text-[9px] mb-3">
                        <Bell className="h-3 w-3" />
                        <span>{formatReminder(note.reminder)}</span>
                      </div>
                    )}

                    {/* Card Footer */}
                    <div className="flex items-center justify-between pt-2 border-t border-dashed border-neutral-200 dark:border-dark-border text-[9px] text-neutral-400 mt-2">
                      <div className="flex flex-col">
                        <span>Updated {formatTime(note.updatedAt)}</span>
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={e => toggleArchive(e, note)}
                          title="Archive"
                          className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-dark-text rounded-md"
                        >
                          <FolderArchive className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={e => deleteNote(e, note)}
                          title="Delete"
                          className="p-1 text-neutral-400 hover:text-red-500 rounded-md"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Mobile Floating Add Button ──────────────────────────── */}
      <button
        onClick={() => openEditor()}
        className="md:hidden fixed bottom-36 right-4 h-14 w-14 bg-primary text-white rounded-full flex items-center justify-center shadow-2xl hover:scale-105 active:scale-95 transition-transform z-35"
        aria-label="Add Note"
      >
        <Plus className="h-6 w-6" />
      </button>

      {/* ── Toast Overlay ──────────────────────────── */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-4 py-2.5 rounded-xl flex items-center gap-3 text-xs shadow-lg animate-fade-in-up">
          <Info className="h-4 w-4 text-primary shrink-0" />
          <span>{toast.message}</span>
          {toast.actionLabel && toast.actionFn && (
            <button
              onClick={() => { toast.actionFn?.(); setToast(null); }}
              className="text-primary font-bold uppercase hover:underline ml-2"
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}

      {/* ── Note Editor Modal ──────────────────────────── */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-xl rounded-2xl overflow-hidden flex flex-col shadow-2xl animate-scale-in max-h-[85vh]">
            
            {/* Modal Header */}
            <div className="p-4 border-b border-neutral-100 dark:border-dark-border flex items-center justify-between">
              <input
                type="text"
                placeholder="Title"
                value={draft.title}
                onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
                className="flex-1 font-display font-bold text-lg focus:outline-none bg-transparent text-neutral-900 dark:text-dark-text"
              />
              <button
                onClick={() => setDraft(prev => ({ ...prev, pinned: !prev.pinned }))}
                className={`p-2 rounded-lg transition-colors ${
                  draft.pinned ? "text-primary" : "text-neutral-400 hover:text-neutral-600 dark:hover:text-dark-text"
                }`}
                title="Pin Note"
              >
                <Pin className="h-5 w-5 fill-current" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto min-h-64">
              <div className="flex gap-2 mb-4 bg-neutral-100 dark:bg-dark-bg-tertiary p-1 rounded-xl w-fit">
                <button
                  onClick={() => setDraft(prev => ({ ...prev, type: "list" }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    draft.type === "list"
                      ? "bg-white dark:bg-dark-bg-secondary text-primary shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <ListTodo className="h-3.5 w-3.5" />
                  <span>List</span>
                </button>
                <button
                  onClick={() => setDraft(prev => ({ ...prev, type: "text" }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    draft.type === "text"
                      ? "bg-white dark:bg-dark-bg-secondary text-primary shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800"
                  }`}
                >
                  <FileText className="h-3.5 w-3.5" />
                  <span>Note</span>
                </button>
              </div>

              {draft.type === "text" ? (
                <textarea
                  placeholder="Start writing..."
                  value={draft.text}
                  onChange={e => setDraft(prev => ({ ...prev, text: e.target.value }))}
                  className="w-full min-h-[160px] focus:outline-none bg-transparent resize-y text-sm text-neutral-800 dark:text-dark-text leading-relaxed"
                />
              ) : (
                <div className="space-y-2">
                  <ul className="space-y-2">
                    {draft.items.map((item, index) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <button
                          onClick={() => toggleDraftItem(index)}
                          className={`h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-all ${
                            item.done
                              ? "bg-primary border-primary text-white"
                              : "border-neutral-300 dark:border-neutral-700"
                          }`}
                        >
                          {item.done && <Check className="h-3 w-3" />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <input
                            type="text"
                            placeholder="List item"
                            value={item.text}
                            onChange={e => updateDraftItem(index, e.target.value)}
                            onKeyDown={e => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                addChecklistItem(index + 1);
                              }
                            }}
                            className={`w-full py-0.5 focus:outline-none bg-transparent text-sm ${
                              item.done ? "text-neutral-400 dark:text-dark-text-tertiary line-through" : "text-neutral-800 dark:text-dark-text-secondary"
                            }`}
                          />
                        </div>
                        <button
                          onClick={() => removeDraftItem(index)}
                          className="text-neutral-400 hover:text-red-500 p-1"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => addChecklistItem()}
                    className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-primary font-bold py-1 px-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-dark-bg-tertiary transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add Item</span>
                  </button>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 bg-neutral-50 dark:bg-dark-bg-tertiary border-t border-neutral-100 dark:border-dark-border flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 relative">
                
                {/* Color Button */}
                <div className="relative">
                  <button
                    onClick={() => { setShowColorPicker(!showColorPicker); setShowReminderPicker(false); }}
                    className={`p-2 rounded-lg transition-colors hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary ${
                      draft.color ? "text-primary" : "text-neutral-500"
                    }`}
                    title="Change Color"
                  >
                    <Palette className="h-4.5 w-4.5" />
                  </button>
                  {showColorPicker && (
                    <div className="absolute bottom-12 left-0 bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-2 shadow-2xl flex gap-1.5 z-50">
                      <button
                        onClick={() => { setDraft(prev => ({ ...prev, color: "" })); setShowColorPicker(false); }}
                        className={`h-7 w-7 rounded-lg border flex items-center justify-center ${!draft.color ? "border-primary" : "border-neutral-200"}`}
                      >
                        <X className="h-3.5 w-3.5 text-neutral-400" />
                      </button>
                      {Object.keys(COLOR_SCHEMES).map(cKey => (
                        <button
                          key={cKey}
                          onClick={() => { setDraft(prev => ({ ...prev, color: cKey })); setShowColorPicker(false); }}
                          className={`h-7 w-7 rounded-lg border-2 ${draft.color === cKey ? "border-primary" : "border-transparent"}`}
                          style={{ backgroundColor: COLOR_SCHEMES[cKey].accent }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Reminder Button */}
                <div className="relative">
                  <button
                    onClick={() => { setShowReminderPicker(!showReminderPicker); setShowColorPicker(false); }}
                    className={`p-2 rounded-lg transition-colors hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary ${
                      draft.reminder ? "text-primary" : "text-neutral-500"
                    }`}
                    title="Set Reminder"
                  >
                    <Bell className="h-4.5 w-4.5" />
                  </button>
                  {showReminderPicker && (
                    <div className="absolute bottom-12 left-0 bg-white dark:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl p-3 shadow-2xl z-50 w-60">
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Set Date & Time</label>
                      <input
                        type="datetime-local"
                        value={draft.reminder ? draft.reminder.slice(0, 16) : ""}
                        onChange={e => setDraft(prev => ({ ...prev, reminder: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                        className="w-full px-2 py-1 bg-neutral-100 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-lg text-xs focus:outline-none mb-3 text-neutral-800 dark:text-dark-text"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setDraft(prev => ({ ...prev, reminder: null })); setShowReminderPicker(false); }}
                          className="flex-1 py-1 text-center bg-neutral-100 hover:bg-neutral-200 text-neutral-500 font-bold rounded-lg text-[10px]"
                        >
                          Clear
                        </button>
                        <button
                          onClick={() => setShowReminderPicker(false)}
                          className="flex-1 py-1 text-center bg-primary hover:bg-primary-dark text-white font-bold rounded-lg text-[10px]"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setModalOpen(false)}
                  className="py-1.5 px-4 rounded-xl text-neutral-500 hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary font-bold text-xs"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNote}
                  className="py-1.5 px-5 bg-primary hover:bg-primary-dark text-white font-bold rounded-xl text-xs shadow-sm active:scale-[0.98]"
                >
                  Save Note
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* ── Settings Modal ──────────────────────────── */}
      {settingsOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-sm rounded-2xl overflow-hidden flex flex-col shadow-2xl p-5">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-100 dark:border-dark-border">
              <h3 className="font-display font-bold text-lg text-neutral-900 dark:text-dark-text">Notes Settings</h3>
              <button onClick={() => setSettingsOpen(false)} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-dark-text">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h4 className="text-[10px] font-bold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mb-2">Backup & Export</h4>
                <button
                  onClick={exportNotes}
                  className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs font-bold text-neutral-700 dark:text-dark-text flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Download className="h-4 w-4" />
                  <span>Export Notes (JSON)</span>
                </button>
              </div>

              <div>
                <h4 className="text-[10px] font-bold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mb-2">Trash Management</h4>
                <button
                  onClick={emptyTrash}
                  className="w-full py-2 px-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
                >
                  <Trash2 className="h-4 w-4" />
                  <span>Empty Trash Bin</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setSettingsOpen(false)}
              className="mt-6 w-full py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary text-neutral-700 dark:text-dark-text font-bold rounded-xl text-xs"
            >
              Close
            </button>
          </div>
        </div>
      )}

    </AppShell>
  );
}
