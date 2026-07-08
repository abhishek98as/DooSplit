"use client";

import React from "react";
import { Notebook } from "lucide-react";

interface NotesEmptyStateProps {
  searchQuery: string;
}

export default function NotesEmptyState({ searchQuery }: NotesEmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <Notebook className="h-12 w-12 text-neutral-300 dark:text-dark-border mb-3" />
      <h3 className="font-bold text-neutral-700 dark:text-dark-text-secondary">No notes here yet</h3>
      <p className="text-xs text-neutral-500 dark:text-dark-text-tertiary max-w-xs mt-1">
        {searchQuery
          ? "No notes matched your search query."
          : "Click \"New Note\" or the floating + button to create your first note."}
      </p>
    </div>
  );
}
