"use client";

import { useEffect } from "react";

import { logServerError } from "@/lib/server/safe-error";

/**
 * Error boundary for the INTERCEPTED profile modal.
 *
 * A render error inside the overlay used to escalate to the root error
 * boundary and replace the whole document — the visitor lost the directory
 * they were browsing because one profile crashed. Contain it to the panel:
 * the scrim + a retry inside the overlay, the listing alive underneath.
 */
export default function InterceptedProfileModalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logServerError("modal.profile", error);
  }, [error]);

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div className="fixed inset-0 flex flex-col items-center justify-center gap-4 bg-background p-8 text-center sm:inset-x-1/2 sm:inset-y-4 sm:w-[min(560px,calc(100vw-3rem))] sm:-translate-x-1/2 sm:rounded-2xl sm:border sm:border-white/10 sm:shadow-[0_40px_120px_-24px_rgba(0,0,0,0.7)]">
        <p className="font-display text-2xl">We couldn&apos;t open this profile</p>
        <p className="max-w-sm text-sm text-foreground/60">
          Something went wrong loading it. The directory is still open behind
          this window.
        </p>
        <div className="mt-2 flex gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex h-10 items-center rounded-full bg-foreground px-5 text-[12px] font-semibold uppercase tracking-[0.16em] text-background"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="inline-flex h-10 items-center rounded-full border border-border px-5 text-[12px] font-semibold uppercase tracking-[0.16em]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
