export interface NoteChecklistItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotePermissions {
  canCreate: boolean;
  canRead: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}

export interface NoteItem {
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
  /** Present on shared notes returned from API */
  isOwner?: boolean;
  sharedBy?: { id: string; name: string } | null;
  permissions?: NotePermissions;
  shareStatus?: "pending" | "accepted" | "rejected";
}

export const FULL_CLIENT_PERMISSIONS: NotePermissions = {
  canCreate: true,
  canRead: true,
  canUpdate: true,
  canDelete: true,
};

export function notePermissions(note: NoteItem): NotePermissions {
  if (note.isOwner !== false) return FULL_CLIENT_PERMISSIONS;
  return (
    note.permissions || {
      canCreate: true,
      canRead: true,
      canUpdate: false,
      canDelete: false,
    }
  );
}

export interface NoteDraft {
  title: string;
  text: string;
  type: "text" | "list";
  items: NoteChecklistItem[];
  color: string;
  pinned: boolean;
  reminder: string | null;
}

export const COLOR_SCHEMES: Record<string, { bg: string; border: string; accent: string; label: string }> = {
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

export function formatTime(iso: string | Date | undefined): string {
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

export function formatReminder(iso: string | Date | null): string {
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
