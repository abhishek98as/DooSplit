"use client";

import React from "react";
import { Pin, Bell, Check, Trash2, FolderArchive } from "lucide-react";
import type { NoteItem } from "./types";
import { COLOR_SCHEMES, formatTime, formatReminder } from "./types";

interface NoteCardProps {
  note: NoteItem;
  onTogglePin: (e: React.MouseEvent, note: NoteItem) => void;
  onToggleArchive: (e: React.MouseEvent, note: NoteItem) => void;
  onDelete: (e: React.MouseEvent, note: NoteItem) => void;
  onToggleItemDone: (noteId: string, itemId: string) => void;
  onClick: (note: NoteItem) => void;
}

export default function NoteCard({
  note,
  onTogglePin,
  onToggleArchive,
  onDelete,
  onToggleItemDone,
  onClick,
}: NoteCardProps) {
  const scheme = COLOR_SCHEMES[note.color] || {
    bg: "bg-white dark:bg-dark-bg-secondary",
    border: "border-neutral-200 dark:border-dark-border hover:border-neutral-400 dark:hover:border-dark-border-hover",
    accent: "transparent"
  };

  return (
    <div
      onClick={() => onClick(note)}
      className={`break-inside-avoid w-full p-4 rounded-2xl border ${scheme.bg} ${scheme.border} relative shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 cursor-pointer overflow-hidden group`}
    >
      {/* Left edge accent line */}
      <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl" style={{ backgroundColor: scheme.accent }} />

      {/* Pin button */}
      <button
        onClick={e => onTogglePin(e, note)}
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
              onClick={e => { e.stopPropagation(); onToggleItemDone(note.id, item.id); }}
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
            onClick={e => onToggleArchive(e, note)}
            title="Archive"
            className="p-1 text-neutral-400 hover:text-neutral-700 dark:hover:text-dark-text rounded-md"
          >
            <FolderArchive className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={e => onDelete(e, note)}
            title="Delete"
            className="p-1 text-neutral-400 hover:text-red-500 rounded-md"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
