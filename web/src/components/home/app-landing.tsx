import Link from "next/link";

/**
 * Root page for `kind === "app"` — the internal workspace host.
 *
 * Intentionally minimal: no storefront chrome, no directory/AI calls. Just
 * a sign-in entry point. Authenticated users landing here are redirected
 * to their dashboard by `auth-routing` inside `updateSession`.
 */
export function AppLanding() {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-background px-4 py-16">
      <div className="w-full max-w-md text-center">
        <p className="font-display text-xs font-medium uppercase tracking-[0.4em] text-[var(--impronta-gold-dim)]">
          Impronta
        </p>
        <h1 className="mt-6 font-display text-3xl font-normal leading-tight tracking-[0.06em] text-foreground sm:text-4xl">
          Workspace
        </h1>
        <p className="mx-auto mt-4 max-w-sm text-base text-[var(--impronta-muted)]">
          Sign in to access your admin, client, or talent workspace.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-8 text-sm font-medium text-foreground transition hover:bg-[var(--impronta-surface)]/60"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="text-sm text-[var(--impronta-muted)] underline-offset-4 hover:text-foreground hover:underline"
          >
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
