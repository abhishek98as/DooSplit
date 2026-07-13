"use client";

import React, { useCallback, useEffect } from "react";
import { useSession } from "@/lib/auth/react-session";
import { useRouter } from "next/navigation";
import type { NoteItem, NoteDraft, NoteChecklistItem } from "./types";
import { formatTime, formatReminder } from "./types";

interface UseNotesReturn {
  // State
  notes: NoteItem[];
  loading: boolean;
  currentView: "all" | "reminders" | "archive" | "trash" | "drafts";
  setCurrentView: (view: "all" | "reminders" | "archive" | "trash" | "drafts") => void;
  currentLabel: string | null;
  setCurrentLabel: (label: string | null) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  sortBy: "updated" | "created" | "title";
  setSortBy: (sort: "updated" | "created" | "title") => void;
  modalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  editingId: string | null;
  draft: NoteDraft;
  setDraft: React.Dispatch<React.SetStateAction<NoteDraft>>;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  showColorPicker: boolean;
  setShowColorPicker: (show: boolean) => void;
  showReminderPicker: boolean;
  setShowReminderPicker: (show: boolean) => void;
  toast: { message: string; type: "success" | "info" | "warn"; actionLabel?: string; actionFn?: () => void } | null;
  setToast: React.Dispatch<React.SetStateAction<{ message: string; type: "success" | "info" | "warn"; actionLabel?: string; actionFn?: () => void } | null>>;

  // Computed
  counts: { all: number; reminders: number; archive: number; trash: number; drafts: number };
  filteredNotes: NoteItem[];
  draftNotes: NoteItem[];

  // Actions
  fetchNotes: () => Promise<void>;
  openEditor: (note?: NoteItem) => void;
  closeEditor: () => void;
  saveNote: () => Promise<void>;
  togglePin: (e: React.MouseEvent, note: NoteItem) => void;
  toggleArchive: (e: React.MouseEvent | null, note: NoteItem) => void;
  deleteNote: (e: React.MouseEvent, note: NoteItem) => void;
  toggleCardItemDone: (noteId: string, itemId: string) => void;
  emptyTrash: () => Promise<void>;
  exportNotes: (format?: "json" | "txt" | "csv") => void;

  // Draft helpers
  addChecklistItem: (index?: number) => void;
  updateDraftItem: (index: number, val: string) => void;
  toggleDraftItem: (index: number) => void;
  removeDraftItem: (index: number) => void;
}

export function useNotes(): UseNotesReturn {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [notes, setNotes] = React.useState<NoteItem[]>([]);
  const [draftNotes, setDraftNotes] = React.useState<NoteItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [currentView, setCurrentView] = React.useState<"all" | "reminders" | "archive" | "trash" | "drafts">("all");
  const [currentLabel, setCurrentLabel] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"updated" | "created" | "title">("updated");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const initialDraftRef = React.useRef<string>("");
  const [draft, setDraft] = React.useState<NoteDraft>({
    title: "", text: "", type: "list", items: [], color: "", pinned: false, reminder: null,
  });
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [showColorPicker, setShowColorPicker] = React.useState(false);
  const [showReminderPicker, setShowReminderPicker] = React.useState(false);
  const [toast, setToast] = React.useState<{
    message: string; type: "success" | "info" | "warn"; actionLabel?: string; actionFn?: () => void;
  } | null>(null);

  // Toast auto-dismiss
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Auth guard
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
      setToast({ message: "Error loading notes", type: "warn" });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") {
      fetchNotes();
    }
  }, [status, fetchNotes]);

  // ── Draft Persistence (localStorage auto-save) ─────────────────────────
  const draftKey = (id: string | null) =>
    `doosplit:note_draft:${id ?? "new"}`;

  const persistDraft = (id: string | null, d: typeof draft) => {
    try {
      localStorage.setItem(draftKey(id), JSON.stringify({ draft: d, savedAt: Date.now() }));
    } catch { /* localStorage full or unavailable */ }
  };

  const clearDraft = (id: string | null) => {
    try { localStorage.removeItem(draftKey(id)); } catch { }
  };

  const loadDraft = (id: string | null): typeof draft | null => {
    try {
      const raw = localStorage.getItem(draftKey(id));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Discard drafts older than 7 days
      if (Date.now() - (parsed.savedAt || 0) > 7 * 24 * 60 * 60 * 1000) {
        clearDraft(id);
        return null;
      }
      return parsed.draft || null;
    } catch { return null; }
  };

  const refreshDrafts = useCallback(() => {
    if (typeof window === "undefined") return;
    const list: NoteItem[] = [];
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith("doosplit:note_draft:")) {
          const idPart = key.replace("doosplit:note_draft:", "");
          const raw = localStorage.getItem(key);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.draft) {
              const d = parsed.draft;
              list.push({
                id: idPart,
                title: d.title || "",
                text: d.text || "",
                type: d.type || "text",
                items: d.items || [],
                color: d.color || "",
                pinned: d.pinned || false,
                archived: false,
                trashed: false,
                reminder: d.reminder || null,
                createdAt: parsed.savedAt ? new Date(parsed.savedAt).toISOString() : new Date().toISOString(),
                updatedAt: parsed.savedAt ? new Date(parsed.savedAt).toISOString() : new Date().toISOString(),
                isDraft: true,
              } as any);
            }
          }
        }
      }
    } catch (e) {
      console.error("Failed to load drafts:", e);
    }
    setDraftNotes(list);
  }, []);

  useEffect(() => {
    refreshDrafts();
  }, [refreshDrafts]);

  // Auto-save draft to localStorage (debounced 600ms) when the editor is open
  useEffect(() => {
    if (!modalOpen) return;
    const timer = setTimeout(() => persistDraft(editingId, draft), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, modalOpen, editingId]);

  // Immediate flush when the page is hidden (tab switch, app background, browser close)
  // This catches the gap that the 600ms debounce would miss on abrupt navigation.
  useEffect(() => {
    if (!modalOpen) return;

    const flush = () => {
      if (document.visibilityState === "hidden") {
        persistDraft(editingId, draft);
      }
    };
    const handleBeforeUnload = () => persistDraft(editingId, draft);

    document.addEventListener("visibilitychange", flush);
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalOpen, editingId, draft]);


  // Reminder alert checking
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date().getTime();
      notes.forEach(note => {
        if (note.reminder && !note.trashed && !note.archived) {
          const remTime = new Date(note.reminder).getTime();
          if (Math.abs(now - remTime) < 30000) {
            setToast({ message: `Reminder: "${note.title || "Untitled"}" is due!`, type: "info" });
          }
        }
      });
    }, 60000);
    return () => clearInterval(interval);
  }, [notes]);

  // Draft helpers
  const addChecklistItem = (index?: number) => {
    const now = new Date().toISOString();
    const newItem: NoteChecklistItem = {
      id: "i" + Date.now() + Math.random(),
      text: "", done: false, createdAt: now, updatedAt: now,
    };
    setDraft(prev => {
      const items = [...prev.items];
      if (index !== undefined) items.splice(index, 0, newItem);
      else items.push(newItem);
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
        items: items.length === 0
          ? [{ id: "i" + Date.now(), text: "", done: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
          : items,
      };
    });
  };

  // Editor
  const openEditor = (note?: NoteItem) => {
    let baseDraft;
    if (note) {
      setEditingId(note.id);
      // Silently restore any saved draft for this note; fall back to the saved note data
      const saved = loadDraft(note.id);
      baseDraft = saved ?? {
        title: note.title || "",
        text: note.text || "",
        type: note.type,
        items: note.items ? note.items.map(i => ({ ...i })) : [],
        color: note.color || "",
        pinned: note.pinned,
        reminder: note.reminder,
      };
    } else {
      const tempId = "draft_" + Date.now();
      setEditingId(tempId);
      const now = new Date().toISOString();
      // Silently restore any in-progress new-note draft
      const saved = loadDraft(tempId) || loadDraft(null);
      baseDraft = saved ?? {
        title: "", text: "", type: "list",
        items: [{ id: "i" + Date.now(), text: "", done: false, createdAt: now, updatedAt: now }],
        color: "", pinned: false, reminder: null,
      };
    }
    setDraft(baseDraft as NoteDraft);
    initialDraftRef.current = JSON.stringify(baseDraft);
    setShowColorPicker(false);
    setShowReminderPicker(false);
    setModalOpen(true);
  };

  const closeEditor = () => {
    const currentDraftStr = JSON.stringify(draft);
    const hasChanged = currentDraftStr !== initialDraftRef.current;

    const hasTitle = draft.title.trim();
    const hasText = draft.type === "text" && draft.text.trim();
    const hasItems = draft.type === "list" && draft.items.some(i => i.text.trim());
    const isEmpty = !hasTitle && !hasText && !hasItems;

    if (isEmpty || !hasChanged) {
      clearDraft(editingId);
    } else {
      persistDraft(editingId, draft);
    }
    setModalOpen(false);
    setEditingId(null);
    refreshDrafts();
  };

  const saveNote = async () => {
    const hasTitle = draft.title.trim();
    const hasText = draft.type === "text" && draft.text.trim();
    const hasItems = draft.type === "list" && draft.items.some(i => i.text.trim());
    if (!hasTitle && !hasText && !hasItems) {
      setToast({ message: "Note is empty", type: "warn" });
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
      if (editingId && !editingId.startsWith("draft_")) {
        const res = await fetch(`/api/notes/${editingId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          const normalized = {
            ...data.note,
            createdAt: data.note.createdAt || data.note.created_at,
            updatedAt: data.note.updatedAt || data.note.updated_at,
          };
          setNotes(prev => prev.map(n => n.id === editingId ? normalized : n));
          setToast({ message: "Note updated", type: "success" });
        }
      } else {
        const res = await fetch("/api/notes", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
        if (res.ok) {
          const data = await res.json();
          const normalized = {
            ...data.note,
            createdAt: data.note.createdAt || data.note.created_at,
            updatedAt: data.note.updatedAt || data.note.updated_at,
          };
          setNotes(prev => [normalized, ...prev]);
          setToast({ message: "Note created", type: "success" });
        }
      }
      setModalOpen(false);
      // ✅ Clear the persisted draft now that it's safely saved to the server
      clearDraft(editingId);
      setEditingId(null);
      refreshDrafts();
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to save note", type: "warn" });
    }
  };

  const togglePin = async (e: React.MouseEvent, note: NoteItem) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinned: !note.pinned }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
        setToast({ message: note.pinned ? "Note unpinned" : "Note pinned", type: "success" });
      }
    } catch (err) { console.error(err); }
  };

  const toggleArchive = async (e: React.MouseEvent | null, note: NoteItem) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`/api/notes/${note.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archived: !note.archived }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
        setToast({
          message: note.archived ? "Note restored" : "Note archived",
          type: "info",
          actionLabel: "Undo",
          actionFn: () => toggleArchive(null, { ...note, archived: !note.archived }),
        });
      }
    } catch (err) { console.error(err); }
  };

  const deleteNote = async (e: React.MouseEvent, note: NoteItem) => {
    e.stopPropagation();
    if (note.id.startsWith("draft_") || (note as any).isDraft) {
      clearDraft(note.id);
      setToast({ message: "Draft discarded", type: "success" });
      refreshDrafts();
      return;
    }
    try {
      if (note.trashed) {
        const res = await fetch(`/api/notes/${note.id}`, { method: "DELETE" });
        if (res.ok) {
          setNotes(prev => prev.filter(n => n.id !== note.id));
          setToast({ message: "Note permanently deleted", type: "success" });
        }
      } else {
        const res = await fetch(`/api/notes/${note.id}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },

          body: JSON.stringify({ trashed: true }),
        });
        if (res.ok) {
          const data = await res.json();
          setNotes(prev => prev.map(n => n.id === note.id ? data.note : n));
          setToast({
            message: "Note moved to trash", type: "info", actionLabel: "Undo",
            actionFn: async () => {
              await fetch(`/api/notes/${note.id}`, {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ trashed: false }),
              });
              fetchNotes();
            },
          });
        }
      }
    } catch (err) { console.error(err); }
  };

  const toggleCardItemDone = async (noteId: string, itemId: string) => {
    const note = notes.find(n => n.id === noteId);
    if (!note || !note.items) return;
    const updatedItems = note.items.map(item => {
      if (item.id === itemId) return { ...item, done: !item.done, updatedAt: new Date().toISOString() };
      return item;
    });
    try {
      const res = await fetch(`/api/notes/${noteId}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: updatedItems }),
      });
      if (res.ok) {
        const data = await res.json();
        setNotes(prev => prev.map(n => n.id === noteId ? data.note : n));
      }
    } catch (err) { console.error(err); }
  };

  const emptyTrash = async () => {
    const trashedNotes = notes.filter(n => n.trashed);
    if (trashedNotes.length === 0) {
      setToast({ message: "Trash is already empty", type: "info" });
      return;
    }
    try {
      await Promise.all(trashedNotes.map(n => fetch(`/api/notes/${n.id}`, { method: "DELETE" })));
      setNotes(prev => prev.filter(n => !n.trashed));
      setToast({ message: `Emptied ${trashedNotes.length} notes from trash`, type: "success" });
    } catch (err) {
      console.error(err);
      setToast({ message: "Failed to empty trash", type: "warn" });
    }
  };

  const exportNotes = (format: "json" | "txt" | "csv" = "json") => {
    const timestamp = new Date().toISOString().slice(0, 10);
    let content: string;
    let mimeType: string;
    let extension: string;

    switch (format) {
      case "csv": {
        // Excel-compatible CSV with BOM — each checklist item gets its own row
        const headers = ["Title", "Type", "Color", "Pinned", "Archived", "Item Text", "Item Done", "Item Created", "Item Updated", "Note Reminder", "Note Created", "Note Updated"];
        const rows = [headers];
        for (const n of notes) {
          if (n.type === "list" && (n.items || []).length > 0) {
            for (const item of n.items || []) {
              rows.push([
                n.title || "Untitled",
                "list",
                n.color || "none",
                n.pinned ? "Yes" : "No",
                n.archived ? "Yes" : "No",
                item.text || "",
                item.done ? "Yes" : "No",
                item.createdAt ? new Date(item.createdAt).toLocaleString() : "",
                item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "",
                n.reminder ? new Date(n.reminder).toLocaleString() : "",
                n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
                n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "",
              ]);
            }
          } else {
            rows.push([
              n.title || "Untitled",
              n.type,
              n.color || "none",
              n.pinned ? "Yes" : "No",
              n.archived ? "Yes" : "No",
              n.text || "",
              "",
              n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
              n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "",
              n.reminder ? new Date(n.reminder).toLocaleString() : "",
              n.createdAt ? new Date(n.createdAt).toLocaleString() : "",
              n.updatedAt ? new Date(n.updatedAt).toLocaleString() : "",
            ]);
          }
        }
        content = "﻿" + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
        mimeType = "text/csv;charset=utf-8";
        extension = "csv";
        break;
      }
      case "txt": {
        const lines: string[] = [];
        for (const n of notes) {
          lines.push(`━━━ ${n.title || "Untitled"} ${n.pinned ? "[📌]" : ""} ━━━`);
          lines.push(`Type: ${n.type} | Color: ${n.color || "none"} | ${n.archived ? "Archived" : "Active"}`);
          if (n.reminder) lines.push(`Reminder: ${new Date(n.reminder).toLocaleString()}`);
          lines.push("");
          if (n.type === "list") {
            for (const item of n.items || []) {
              lines.push(`  ${item.done ? "[✓]" : "[ ]"} ${item.text}`);
              lines.push(`     Created: ${item.createdAt ? new Date(item.createdAt).toLocaleString() : "?"} | Updated: ${item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "?"}`);
            }
          } else {
            lines.push(n.text || "(empty)");
          }
          lines.push("");
          lines.push(`Created: ${n.createdAt || "?"} | Updated: ${n.updatedAt || "?"}`);
          lines.push("");
        }
        content = lines.join("\n");
        mimeType = "text/plain;charset=utf-8";
        extension = "txt";
        break;
      }
      default: {
        content = JSON.stringify(notes, null, 2);
        mimeType = "application/json";
        extension = "json";
      }
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `doosplit-notes-${timestamp}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
    setToast({ message: `Notes exported as ${extension.toUpperCase()}`, type: "success" });
  };

  // Computed
  const counts = React.useMemo(() => ({
    all: notes.filter(n => !n.archived && !n.trashed).length,
    reminders: notes.filter(n => n.reminder && !n.trashed && !n.archived).length,
    archive: notes.filter(n => n.archived && !n.trashed).length,
    trash: notes.filter(n => n.trashed).length,
    drafts: draftNotes.length,
  }), [notes, draftNotes]);

  const filteredNotes = React.useMemo(() => {
    if (currentView === "drafts") {
      let result = [...draftNotes];
      if (currentLabel) result = result.filter(n => n.color === currentLabel);
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        result = result.filter(n => {
          return (n.title || "").toLowerCase().includes(q) ||
            (n.text || "").toLowerCase().includes(q) ||
            (n.items || []).some(item => (item.text || "").toLowerCase().includes(q));
        });
      }
      return result;
    }

    let result = [...notes];

    if (currentView === "archive") result = result.filter(n => n.archived && !n.trashed);
    else if (currentView === "trash") result = result.filter(n => n.trashed);
    else if (currentView === "reminders") result = result.filter(n => n.reminder && !n.trashed && !n.archived);
    else result = result.filter(n => !n.archived && !n.trashed);

    if (currentLabel) result = result.filter(n => n.color === currentLabel);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(n => {
        return n.title.toLowerCase().includes(q) ||
          (n.text || "").toLowerCase().includes(q) ||
          (n.items || []).some(item => item.text.toLowerCase().includes(q));
      });
    }

    if (sortBy === "updated") result.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    else if (sortBy === "created") result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    else if (sortBy === "title") result.sort((a, b) => (a.title || "Untitled").localeCompare(b.title || "Untitled"));

    result.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
    return result;
  }, [notes, draftNotes, currentView, currentLabel, searchQuery, sortBy]);

  return {
    notes, loading,
    currentView, setCurrentView,
    currentLabel, setCurrentLabel,
    searchQuery, setSearchQuery,
    sortBy, setSortBy,
    modalOpen, setModalOpen, editingId, draft, setDraft,
    settingsOpen, setSettingsOpen,
    showColorPicker, setShowColorPicker,
    showReminderPicker, setShowReminderPicker,
    toast, setToast,
    counts, filteredNotes, draftNotes,
    fetchNotes, openEditor, closeEditor, saveNote,
    togglePin, toggleArchive, deleteNote, toggleCardItemDone,
    emptyTrash, exportNotes,
    addChecklistItem, updateDraftItem, toggleDraftItem, removeDraftItem,
  };
}

