"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NotFound() {
  const pathname = usePathname();

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
    <main className="flex min-h-[70vh] items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)] p-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--impronta-gold-dim)]">
          Impronta
        </p>
        <h1 className="mt-3 font-[family-name:var(--font-cinzel)] text-3xl font-medium tracking-wide text-[var(--impronta-foreground)]">
          Page not found
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--impronta-muted)]">
          We couldn’t find the page you’re looking for.
          {pathname ? (
            <>
              {" "}
              <span className="font-mono text-xs text-[var(--impronta-gold-dim)]">
                {pathname}
              </span>
            </>
          ) : null}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/directory"
            className="rounded-full border border-[var(--impronta-gold-border)] bg-black/40 px-4 py-2 text-sm text-[var(--impronta-foreground)] hover:bg-black/55"
          >
            Browse talent
          </Link>
          <Link
            href="/login"
            className="rounded-full border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)] px-4 py-2 text-sm font-medium text-black hover:opacity-90"
          >
            Sign in
          </Link>
        </div>
      </div>
    </main>
    </div>
  );
}

