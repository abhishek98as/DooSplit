"use client";

import React from "react";

interface ChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
  children: React.ReactNode;
}

/**
 * Filter / toggle pill with native-friendly tap height (≥40px).
 */
export function Chip({
  selected = false,
  className = "",
  children,
  type = "button",
  ...props
}: ChipProps) {
  return (
    <button
      type={type}
      className={`
        inline-flex items-center justify-center gap-1.5
        min-h-10 h-10 px-3.5 rounded-xl text-sm font-medium
        transition-all duration-200 active:scale-[0.98]
        ${
          selected
            ? "bg-primary text-white border border-primary shadow-sm"
            : "bg-white dark:bg-dark-bg-secondary text-neutral-700 dark:text-dark-text border border-neutral-200 dark:border-dark-border hover:border-primary/40"
        }
        ${className}
      `}
      aria-pressed={selected}
      {...props}
    >
      {children}
    </button>
  );
}

export default Chip;
