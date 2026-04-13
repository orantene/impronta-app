"use client";

import { useEffect } from "react";

export default function AdminDashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[admin/error.tsx]", error.message, error.stack);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl space-y-4 rounded-lg border border-destructive/40 bg-destructive/10 p-6">
      <h2 className="font-semibold text-destructive">Admin section error</h2>
      <p className="text-sm text-foreground">{error.message}</p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Digest: {error.digest}</p>
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

