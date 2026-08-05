"use client";

import Link from "next/link";

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

export function AppErrorState({
  message = DEFAULT_MESSAGE,
  onRetry,
  homeHref = "/dashboard",
}: {
  message?: string;
  onRetry?: () => void;
  homeHref?: string;
}) {
  return (
    <div className="min-h-[60vh] w-full flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="relative h-40 w-40 sm:h-48 sm:w-48 mb-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/illustrations/error-state.svg"
          alt=""
          className="h-full w-full object-contain"
          width={192}
          height={192}
        />
      </div>
      <p className="text-sm sm:text-base font-medium text-neutral-800 dark:text-dark-text max-w-sm leading-relaxed">
        {message}
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark"
          >
            Try again
          </button>
        )}
        <Link
          href={homeHref}
          className="px-4 py-2 rounded-xl border border-neutral-200 dark:border-dark-border text-sm font-semibold text-neutral-700 dark:text-dark-text-secondary hover:bg-neutral-50 dark:hover:bg-dark-bg-tertiary"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
