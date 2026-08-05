"use client";

import { AppErrorState } from "@/components/ui/AppErrorState";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-dark-bg">
      <AppErrorState
        message="Something went wrong. Please try again."
        onRetry={reset}
      />
    </div>
  );
}
