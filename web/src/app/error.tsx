"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--impronta-gold-dim)]">
          Impronta
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-cinzel)] text-3xl font-medium tracking-wide text-[var(--impronta-foreground)]">
          Something went wrong
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--impronta-muted)]">
          Please try again. If this keeps happening, the agency may need to check configuration.
        </p>
        {error?.digest ? (
          <p className="mt-3 font-mono text-xs text-[var(--impronta-gold-dim)]">
            Ref: {error.digest}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            onClick={() => reset()}
            className="rounded-full border border-[var(--impronta-gold-border)] bg-black/40 px-4 py-2 text-sm text-[var(--impronta-foreground)] hover:bg-black/55"
          >
            Retry
          </button>
          <Link
            href="/directory"
            className="rounded-full border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            Browse talent
          </Link>
        </div>
      </div>
    </main>
  );
}

