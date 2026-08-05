"use client";

import React from "react";
import { Pin, Bell, Check, Trash2, FolderArchive, Pencil, Share2, Users } from "lucide-react";
import type { NoteItem } from "./types";
import { COLOR_SCHEMES, formatTime, formatReminder, notePermissions } from "./types";

interface NoteCardProps {
  note: NoteItem;
  onTogglePin: (e: React.MouseEvent, note: NoteItem) => void;
  onToggleArchive: (e: React.MouseEvent, note: NoteItem) => void;
  onDelete: (e: React.MouseEvent, note: NoteItem) => void;
  onToggleItemDone: (noteId: string, itemId: string) => void;
  onClick: (note: NoteItem) => void;
  onShare?: (e: React.MouseEvent, note: NoteItem) => void;
}

export default function NoteCard({
  note,
  onTogglePin,
  onToggleArchive,
  onDelete,
  onToggleItemDone,
  onClick,
  onShare,
}: NoteCardProps) {
  const scheme = COLOR_SCHEMES[note.color] || {
    bg: "bg-white dark:bg-dark-bg-secondary",
    border: "border-neutral-200 dark:border-dark-border hover:border-neutral-400 dark:hover:border-dark-border-hover",
    accent: "transparent"
  };
  const isOwner = note.isOwner !== false;
  const perms = notePermissions(note);
  const canToggleItems = isOwner || perms.canUpdate;

  return (
    <div
      className={`break-inside-avoid w-full rounded-2xl border ${scheme.bg} ${scheme.border} relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden group`}
    >
      {/* Left edge accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ backgroundColor: scheme.accent }} />

      {/* ── Clickable main body (opens editor) ────────────────────── */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => onClick(note)}
        onKeyDown={e => { if (e.key === "Enter" || e.key === " ") onClick(note); }}
        className="cursor-pointer p-4 pb-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 rounded-t-2xl"
        aria-label={`Open note: ${note.title || "Untitled"}`}
      >
        {/* Pin button — owner only */}
        {!note.id.startsWith("draft_") && !(note as any).isDraft && isOwner && (
          <button
            onClick={e => { e.stopPropagation(); onTogglePin(e, note); }}
            className={`absolute top-3 right-3 p-1.5 rounded-lg text-neutral-400 hover:text-primary transition-colors ${
              note.pinned ? "text-primary opacity-100 rotate-45" : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <Pin className="h-4 w-4 fill-current" />
          </button>
        )}

        {/* Title */}
        {note.title && (
          <h3 className="font-bold text-base leading-tight text-neutral-900 dark:text-dark-text mb-2 pr-6">
            {note.title}
          </h3>
        )}

        {/* Content */}
        {note.type === "list" ? (
          <ul className="space-y-1 mb-2">
            {note.items.slice(0, 6).map(item => (
              <li
                key={item.id}
                className={`flex items-start gap-2 text-sm py-0.5 leading-snug ${
                  item.done ? "text-neutral-400 dark:text-dark-text-tertiary line-through" : "text-neutral-700 dark:text-dark-text-secondary"
                }`}
              >
                <button
                  type="button"
                  disabled={!canToggleItems}
                  onClick={e => {
                    e.stopPropagation();
                    if (canToggleItems) onToggleItemDone(note.id, item.id);
                  }}
                  className={`h-4 w-4 shrink-0 rounded-md border flex items-center justify-center transition-all mt-0.5 ${
                    item.done
                      ? "bg-primary border-primary text-white"
                      : "border-neutral-300 dark:border-neutral-700"
                  } ${!canToggleItems ? "opacity-60 cursor-default" : ""}`}
                  aria-label={item.done ? "Mark undone" : "Mark done"}
                >
                  {item.done && <Check className="h-3 w-3" />}
                </button>
                <div className="flex flex-col min-w-0">
                  <span className="truncate">{item.text}</span>
                  <span className="text-[8px] text-neutral-400/80 leading-none mt-0.5 flex items-center gap-1.5">
                    <span>Created {formatTime(item.createdAt)}</span>
                    {item.updatedAt && item.updatedAt !== item.createdAt && (
                      <span>· Edited {formatTime(item.updatedAt)}</span>
                    )}
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
          <p className="text-sm text-neutral-600 dark:text-dark-text-secondary leading-relaxed mb-2 whitespace-pre-wrap truncate max-h-36">
            {note.text}
          </p>
        )}

        {/* Reminder Chip */}
        {note.reminder && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary font-bold rounded-full text-[9px] mb-2 mr-1">
            <Bell className="h-3 w-3" />
            <span>{formatReminder(note.reminder)}</span>
          </div>
        )}

        {/* Shared badge */}
        {!isOwner && note.sharedBy && (
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-sky-500/10 text-sky-600 dark:text-sky-400 font-bold rounded-full text-[9px] mb-2 mr-1">
            <Users className="h-3 w-3" />
            <span>Shared by {note.sharedBy.name}</span>
          </div>
        )}

        {/* Draft Badge */}
        {(note as any).isDraft && (
          <div className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-500/10 text-amber-600 dark:text-amber-400 font-bold rounded-full text-[9px] mb-2">
            <span>Unsaved Draft</span>
          </div>
        )}
      </div>

      {/* ── Card Footer (timestamps + action buttons) ────────────────────── */}
      <div className="px-4 pb-3 flex items-center justify-between border-t border-dashed border-neutral-200 dark:border-dark-border text-[9px] text-neutral-400 pt-2">
        <div className="flex flex-col">
          <span>Updated {formatTime(note.updatedAt)}</span>
        </div>

        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onClick(note)}
            title="Edit note"
            className="p-1 text-neutral-400 hover:text-primary rounded-md"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {isOwner && onShare && !note.id.startsWith("draft_") && !(note as any).isDraft && (
            <button
              onClick={e => { e.stopPropagation(); onShare(e, note); }}
              title="Share note"
              className="p-1 text-neutral-400 hover:text-primary rounded-md"
            >
              <Share2 className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwner && !note.id.startsWith("draft_") && !(note as any).isDraft && (
            <button
              onClick={e => onToggleArchive(e, note)}
              title="Archive"
              className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-dark-text rounded-md"
            >
              <FolderArchive className="h-3.5 w-3.5" />
            </button>
          )}
          {isOwner && (
            <button
              onClick={e => onDelete(e, note)}
              title="Delete"
              className="p-1 text-neutral-400 hover:text-red-500 rounded-md"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
