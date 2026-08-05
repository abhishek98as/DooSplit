"use client";

import { AppErrorState } from "@/components/ui/AppErrorState";

export default function ExpensesError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <AppErrorState
      message="Something went wrong. Please try again."
      onRetry={reset}
      homeHref="/dashboard"
    />
  );
}
