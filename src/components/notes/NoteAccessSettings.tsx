"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Loader2, Shield, Trash2, X } from "lucide-react";
import type { NotePermissions } from "./types";

interface ShareRow {
  id: string;
  userId: string;
  status: string;
  permissions: NotePermissions;
  user: { id: string; name: string; email?: string; profilePicture?: string | null };
}

interface NoteAccessSettingsProps {
  isOpen: boolean;
  noteId: string;
  onClose: () => void;
}

const PERM_LABELS: Array<{ key: keyof NotePermissions; label: string; hint: string }> = [
  { key: "canCreate", label: "Create", hint: "Add checklist items / append text" },
  { key: "canRead", label: "Read", hint: "View the note" },
  { key: "canUpdate", label: "Update", hint: "Edit title, body, and existing items" },
  { key: "canDelete", label: "Delete", hint: "Remove checklist items" },
];

export default function NoteAccessSettings({
  isOpen,
  noteId,
  onClose,
}: NoteAccessSettingsProps) {
  const [shares, setShares] = useState<ShareRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/share`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load access");
      setShares(data.shares || []);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (isOpen) void load();
  }, [isOpen, load]);

  const updatePerm = async (share: ShareRow, key: keyof NotePermissions, value: boolean) => {
    if (key === "canRead" && !value) return; // read always on
    const permissions = { ...share.permissions, [key]: value, canRead: true };
    setSavingId(share.userId);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/shares/${share.userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setShares((prev) =>
        prev.map((s) =>
          s.userId === share.userId ? { ...s, permissions } : s
        )
      );
    } catch (e: any) {
      setError(e.message || "Update failed");
    } finally {
      setSavingId(null);
    }
  };

  const revoke = async (userId: string) => {
    if (!confirm("Remove this person's access to the note?")) return;
    setSavingId(userId);
    try {
      const res = await fetch(`/api/notes/${noteId}/shares/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to revoke");
      }
      setShares((prev) => prev.filter((s) => s.userId !== userId));
    } catch (e: any) {
      setError(e.message || "Failed to revoke");
    } finally {
      setSavingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-lg rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-dark-border">
          <h3 className="font-display font-semibold text-neutral-900 dark:text-dark-text flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Note access
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-dark-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mb-4">
            Assign Create, Read, Update, and Delete per person. New invites start with Create + Read only.
          </p>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              Nobody has been invited yet. Use Share to invite friends.
            </p>
          ) : (
            <ul className="space-y-4">
              {shares.map((share) => (
                <li
                  key={share.userId}
                  className="rounded-xl border border-neutral-200 dark:border-dark-border p-3"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-neutral-900 dark:text-dark-text truncate">
                        {share.user?.name || "User"}
                      </p>
                      <p className="text-[11px] text-neutral-500 capitalize">
                        {share.status}
                        {savingId === share.userId ? " · saving…" : ""}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => revoke(share.userId)}
                      className="p-1.5 rounded-lg text-neutral-400 hover:text-error"
                      title="Remove access"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {PERM_LABELS.map(({ key, label, hint }) => (
                      <label
                        key={key}
                        className="flex items-start gap-2 text-xs text-neutral-700 dark:text-dark-text-secondary cursor-pointer"
                        title={hint}
                      >
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-neutral-300"
                          checked={Boolean(share.permissions?.[key])}
                          disabled={key === "canRead" || savingId === share.userId}
                          onChange={(e) => updatePerm(share, key, e.target.checked)}
                        />
                        <span>
                          <span className="font-medium block">{label}</span>
                          <span className="text-[10px] text-neutral-400">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {error && <p className="mt-3 text-xs text-error">{error}</p>}
        </div>

        <div className="p-4 border-t border-neutral-100 dark:border-dark-border">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 rounded-xl bg-neutral-100 dark:bg-dark-bg-tertiary text-sm font-medium text-neutral-800 dark:text-dark-text"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
