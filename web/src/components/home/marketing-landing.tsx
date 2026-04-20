/**
 * Root page for `kind === "marketing"` — the product-sales surface.
 *
 * Scope in this phase: a single landing with product positioning and a
 * contact mailto. No directory/AI calls, no storefront data, no tenant
 * reads. Full marketing site (pricing, case studies, docs) is out of
 * scope until there is real sales content to ship.
 */
export function MarketingLanding() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 py-16 text-center sm:px-6 sm:py-24 lg:px-8">
        <p className="font-display text-xs font-medium uppercase tracking-[0.4em] text-[var(--impronta-gold-dim)]">
          Impronta
        </p>
        <h1 className="mt-6 font-display text-3xl font-normal leading-tight tracking-[0.06em] text-foreground sm:text-5xl">
          A booking engine for modeling &amp; talent agencies.
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-base text-[var(--impronta-muted)] sm:text-lg">
          Structured inquiry, offer, and booking coordination — replacing
          spreadsheets and chat threads with one workspace for agencies,
          clients, and talent.
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href="mailto:hello@impronta.group?subject=Impronta%20demo"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-[var(--impronta-gold-border)] bg-[var(--impronta-surface)]/40 px-8 text-sm font-medium text-foreground transition hover:bg-[var(--impronta-surface)]/60"
          >
            Request a demo
          </a>
        </div>
      </main>
    </div>
  );
}
