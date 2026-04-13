"use client";

import { useEffect } from "react";

/** Temporary: dashboard-wide error surface (nested under root layout). */
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[dashboard/error.tsx]", error.message, error.stack);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6">
      <h2 className="font-semibold text-destructive">Dashboard error</h2>
      <p className="text-sm text-foreground">{error.message}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Digest: {error.digest}</p>
      ) : null}
      {error.stack ? (
        <pre className="max-h-56 overflow-auto text-[10px] leading-relaxed text-muted-foreground">
          {error.stack}
        </pre>
      ) : null}
      <button
        type="button"
        className="rounded-md border border-border bg-background px-3 py-2 text-sm"
        onClick={() => reset()}
      >
        Try again
      </button>
    </div>
  );
}
