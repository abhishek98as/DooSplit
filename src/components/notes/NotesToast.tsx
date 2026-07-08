"use client";

import React from "react";
import { X, Info } from "lucide-react";

interface NotesToastProps {
  toast: {
    message: string;
    type: "success" | "info" | "warn";
    actionLabel?: string;
    actionFn?: () => void;
  } | null;
  onDismiss: () => void;
}

export default function NotesToast({ toast, onDismiss }: NotesToastProps) {
  if (!toast) return null;

  return (
    <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 text-white px-4 py-2.5 rounded-xl flex items-center gap-3 text-xs shadow-lg animate-fade-in-up">
      <Info className="h-4 w-4 text-primary shrink-0" />
      <span>{toast.message}</span>
      {toast.actionLabel && toast.actionFn && (
        <button
          onClick={() => { toast.actionFn?.(); onDismiss(); }}
          className="text-primary font-bold uppercase hover:underline ml-2"
        >
          {toast.actionLabel}
        </button>
      )}
    </div>
  );
}
