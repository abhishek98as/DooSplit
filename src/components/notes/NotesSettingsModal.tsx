"use client";

import React from "react";
import { X, Download, Trash2, FileText } from "lucide-react";

interface NotesSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: "json" | "txt" | "csv") => void;
  onEmptyTrash: () => void;
}

export default function NotesSettingsModal({ isOpen, onClose, onExport, onEmptyTrash }: NotesSettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-dark-bg-secondary w-full max-w-sm rounded-2xl overflow-hidden flex flex-col shadow-2xl p-5">
        <div className="flex justify-between items-center mb-4 pb-2 border-b border-neutral-100 dark:border-dark-border">
          <h3 className="font-display font-bold text-lg text-neutral-900 dark:text-dark-text">Notes Settings</h3>
          <button onClick={onClose} className="text-neutral-400 hover:text-neutral-600 dark:hover:text-dark-text">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="text-[10px] font-bold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mb-2">Export Notes</h4>
            <div className="space-y-2">
              <button
                onClick={() => onExport("json")}
                className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs font-bold text-neutral-700 dark:text-dark-text flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <Download className="h-4 w-4" />
                <span>Export as JSON</span>
              </button>
              <button
                onClick={() => onExport("csv")}
                className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs font-bold text-neutral-700 dark:text-dark-text flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <FileText className="h-4 w-4" />
                <span>Export as Excel (CSV)</span>
              </button>
              <button
                onClick={() => onExport("txt")}
                className="w-full py-2 px-3 bg-neutral-100 hover:bg-neutral-200 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary border border-neutral-200 dark:border-dark-border rounded-xl text-xs font-bold text-neutral-700 dark:text-dark-text flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
              >
                <FileText className="h-4 w-4" />
                <span>Export as Text (TXT)</span>
              </button>
            </div>
          </div>

          <div>
            <h4 className="text-[10px] font-bold text-neutral-400 dark:text-dark-text-tertiary uppercase tracking-wider mb-2">Trash Management</h4>
            <button
              onClick={onEmptyTrash}
              className="w-full py-2 px-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-all"
            >
              <Trash2 className="h-4 w-4" />
              <span>Empty Trash Bin</span>
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full py-2 bg-neutral-200 hover:bg-neutral-300 dark:bg-dark-bg-tertiary dark:hover:bg-dark-bg-secondary text-neutral-700 dark:text-dark-text font-bold rounded-xl text-xs"
        >
          Close
        </button>
      </div>
    </div>
  );
}
