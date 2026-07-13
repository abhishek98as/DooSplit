"use client";

import React from "react";
import { Search, Lightbulb, Bell, FolderArchive, Trash2, FileText } from "lucide-react";
import { COLOR_SCHEMES } from "./types";

interface NotesFilterBarProps {
  currentView: "all" | "reminders" | "archive" | "trash" | "drafts";
  onViewChange: (view: "all" | "reminders" | "archive" | "trash" | "drafts") => void;
  currentLabel: string | null;
  onLabelChange: (label: string | null) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  sortBy: "updated" | "created" | "title";
  onSortChange: (sort: "updated" | "created" | "title") => void;
  counts: { all: number; reminders: number; archive: number; trash: number; drafts: number };
  onEmptyTrash: () => void;
}

const VIEWS = [
  { key: "all" as const, icon: Lightbulb, label: "All Notes", countKey: "all" as const },
  { key: "reminders" as const, icon: Bell, label: "Reminders", countKey: "reminders" as const },
  { key: "drafts" as const, icon: FileText, label: "Drafts", countKey: "drafts" as const },
  { key: "archive" as const, icon: FolderArchive, label: "Archive", countKey: "archive" as const },
  { key: "trash" as const, icon: Trash2, label: "Trash", countKey: "trash" as const },
];

export default function NotesFilterBar({
  currentView,
  onViewChange,
  currentLabel,
  onLabelChange,
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  counts,
  onEmptyTrash,
}: NotesFilterBarProps) {
  const activeView = currentLabel ? "all" : currentView;

  return (
    <div className="border-b border-neutral-200 dark:border-dark-border">
      {/* Row 1: View tabs + search + sort */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pb-0">
        {/* Underlined view tabs */}
        <div className="flex items-center gap-0.5 overflow-x-auto scrollbar-hide -mb-px">
          {VIEWS.map(view => {
            const Icon = view.icon;
            const active = activeView === view.key && !currentLabel;
            return (
              <button
                key={view.key}
                onClick={() => { onViewChange(view.key); onLabelChange(null); }}
                className={`relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-bold whitespace-nowrap transition-colors border-b-2 ${
                  active
                    ? "text-primary border-primary"
                    : "text-neutral-500 border-transparent hover:text-neutral-700 dark:hover:text-dark-text hover:border-neutral-300"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{view.label}</span>
                <span className="text-xs text-neutral-400 ml-0.5">({counts[view.countKey]})</span>
              </button>
            );
          })}
        </div>

        {/* Spacer */}
        <div className="hidden sm:block flex-1" />

        {/* Search + Sort controls */}
        <div className="flex items-center gap-2 ml-auto sm:ml-0 pb-2 sm:pb-0">
          <div className="relative flex-1 sm:flex-none sm:w-44">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
            <input
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-xs bg-neutral-50 dark:bg-dark-bg-tertiary border border-neutral-200 dark:border-dark-border rounded-lg focus:outline-none focus:border-primary transition-colors text-neutral-800 dark:text-dark-text"
            />
          </div>

          <select
            value={sortBy}
            onChange={e => onSortChange(e.target.value as any)}
            className="py-2 px-2.5 border border-neutral-200 dark:border-dark-border bg-neutral-50 dark:bg-dark-bg-tertiary text-xs rounded-lg font-medium focus:outline-none cursor-pointer text-neutral-800 dark:text-dark-text"
          >
            <option value="updated">Last edited</option>
            <option value="created">Date created</option>
            <option value="title">Title A-Z</option>
          </select>

          {currentView === "trash" && (
            <button
              onClick={onEmptyTrash}
              className="py-2 px-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg text-xs flex items-center gap-1 active:scale-[0.98] transition-all shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Empty</span>
            </button>
          )}
        </div>
      </div>

      {/* Row 2: Compact label chips */}
      <div className="flex items-center gap-1.5 pb-2.5 overflow-x-auto scrollbar-hide">
        <span className="text-xs font-semibold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mr-1 shrink-0">Labels:</span>
        <button
          onClick={() => onLabelChange(null)}
          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors shrink-0 ${
            !currentLabel
              ? "bg-primary text-white"
              : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-500 hover:text-neutral-700 dark:hover:text-dark-text hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary"
          }`}
        >
          All
        </button>
        {Object.keys(COLOR_SCHEMES).map(colorKey => {
          const s = COLOR_SCHEMES[colorKey];
          return (
            <button
              key={colorKey}
              onClick={() => onLabelChange(currentLabel === colorKey ? null : colorKey)}
              className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors flex items-center gap-1 shrink-0 ${
                currentLabel === colorKey
                  ? "bg-primary text-white"
                  : "bg-neutral-100 dark:bg-dark-bg-tertiary text-neutral-500 hover:text-neutral-700 dark:hover:text-dark-text hover:bg-neutral-200 dark:hover:bg-dark-bg-secondary"
              }`}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: s.accent }} />
              <span>{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
