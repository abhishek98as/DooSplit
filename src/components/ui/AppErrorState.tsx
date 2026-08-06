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
    <div className="min-h-[50vh] w-full flex flex-col items-center justify-center px-4 py-10 text-center bg-transparent">
      {/* eslint-disable-next-line @next/next/no-img-element -- decorative transparent SVG icon */}
      <img
        src="/illustrations/error-state.svg"
        alt=""
        aria-hidden
        draggable={false}
        width={160}
        height={160}
        className="h-24 w-24 sm:h-28 sm:w-28 md:h-32 md:w-32 lg:h-36 lg:w-36 object-contain select-none pointer-events-none mb-5 bg-transparent"
      />
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
