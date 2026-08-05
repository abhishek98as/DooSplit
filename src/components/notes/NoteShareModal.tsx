"use client";

import React, { useEffect, useState } from "react";
import { Loader2, Share2, X, Check } from "lucide-react";

interface FriendRow {
  id: string;
  name: string;
  email?: string;
  profilePicture?: string | null;
}

interface NoteShareModalProps {
  isOpen: boolean;
  noteId: string;
  noteTitle: string;
  onClose: () => void;
  onShared?: () => void;
}

export default function NoteShareModal({
  isOpen,
  noteId,
  noteTitle,
  onClose,
  onShared,
}: NoteShareModalProps) {
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelected(new Set());
    setError(null);
    setDoneMsg(null);
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/friends");
        if (!res.ok) throw new Error("Failed to load friends");
        const data = await res.json();
        const all: FriendRow[] = (data.friends || [])
          .map((f: any) => ({
            id: String(f.friend?.id || f.friend?._id || ""),
            name: f.friend?.name || "Friend",
            email: f.friend?.email,
            profilePicture: f.friend?.profilePicture || null,
            isDummy: Boolean(f.friend?.isDummy),
          }))
          .filter((f: FriendRow & { isDummy?: boolean }) => Boolean(f.id) && !f.isDummy);
        setFriends(all);
      } catch (e: any) {
        setError(e.message || "Failed to load friends");
      } finally {
        setLoading(false);
      }
    })();
  }, [isOpen]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleShare = async () => {
    if (selected.size === 0) {
      setError("Select at least one friend");
      return;
    }
    setSharing(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes/${noteId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ friendIds: [...selected] }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Share failed");
      const count = (data.invited || []).length;
      setDoneMsg(
        count > 0
          ? `Invitation sent to ${count} friend${count === 1 ? "" : "s"}`
          : "No new invitations (already shared or not eligible)"
      );
      onShared?.();
      if (count > 0) {
        setTimeout(onClose, 900);
      }
    } catch (e: any) {
      setError(e.message || "Share failed");
    } finally {
      setSharing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-md rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between p-4 border-b border-neutral-100 dark:border-dark-border">
          <div className="min-w-0">
            <h3 className="font-display font-semibold text-neutral-900 dark:text-dark-text flex items-center gap-2">
              <Share2 className="h-4 w-4 text-primary" />
              Share note
            </h3>
            <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary truncate mt-0.5">
              {noteTitle || "Untitled note"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-dark-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          <p className="text-xs text-neutral-500 dark:text-dark-text-secondary mb-3">
            Friends get Create + Read access until you change permissions.
          </p>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : friends.length === 0 ? (
            <p className="text-sm text-neutral-500 text-center py-8">
              No friends yet. Add friends first to share notes.
            </p>
          ) : (
            <ul className="space-y-1">
              {friends.map((f) => {
                const checked = selected.has(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      onClick={() => toggle(f.id)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-colors ${
                        checked
                          ? "bg-primary/10 border border-primary/30"
                          : "hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary border border-transparent"
                      }`}
                    >
                      <span
                        className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${
                          checked
                            ? "bg-primary border-primary text-white"
                            : "border-neutral-300 dark:border-neutral-600"
                        }`}
                      >
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <span className="h-8 w-8 rounded-full bg-neutral-200 dark:bg-dark-bg-tertiary flex items-center justify-center text-xs font-semibold text-neutral-600 dark:text-dark-text-secondary shrink-0 overflow-hidden">
                        {f.profilePicture ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={f.profilePicture} alt="" className="h-full w-full object-cover" />
                        ) : (
                          (f.name || "?").charAt(0).toUpperCase()
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-neutral-900 dark:text-dark-text truncate">
                          {f.name}
                        </span>
                        {f.email && (
                          <span className="block text-[11px] text-neutral-500 truncate">{f.email}</span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {error && (
            <p className="mt-3 text-xs text-error">{error}</p>
          )}
          {doneMsg && (
            <p className="mt-3 text-xs text-success">{doneMsg}</p>
          )}
        </div>

        <div className="p-4 border-t border-neutral-100 dark:border-dark-border flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl border border-neutral-200 dark:border-dark-border text-sm font-medium text-neutral-700 dark:text-dark-text-secondary"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleShare}
            disabled={sharing || selected.size === 0}
            className="flex-1 py-2.5 rounded-xl bg-primary hover:bg-primary-dark text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {sharing && <Loader2 className="h-4 w-4 animate-spin" />}
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
