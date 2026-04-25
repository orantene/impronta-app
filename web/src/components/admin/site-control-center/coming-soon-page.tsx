import Link from "next/link";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_PAGE_STACK } from "@/lib/dashboard-shell-classes";
import { PLAN_COLOR, PLAN_LABEL, type Plan } from "./capability-catalog";

/**
 * Stub-page primitive used by capabilities that don't ship yet (Widgets,
 * API keys, Domain & Home, Hub publishing, Multi-agency manager). Renders
 * a unified "Coming with <plan>" empty state with a back link to /admin/site.
 *
 * The whole admin surface needs these endpoints because the catalog tiles
 * link straight to them. Better a polite stub than a 404.
 */
export function ComingSoonPage({
  icon: Icon,
  title,
  eyebrow = "Site & AI",
  plan,
  description,
  bullets = [],
}: {
  icon: LucideIcon;
  title: string;
  eyebrow?: string;
  plan: Plan;
  description: string;
  /** Short list of what this surface will deliver. */
  bullets?: string[];
}) {
  const accent = PLAN_COLOR[plan];

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Icon}
        eyebrow={eyebrow}
        title={title}
        right={
          <Link
            href="/admin/site"
            className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/80 px-3.5 py-1.5 text-[12px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55 hover:bg-[var(--impronta-gold)]/[0.05]"
          >
            <ArrowLeft className="size-3.5" aria-hidden />
            Back to Site
          </Link>
        }
      />

      <div className="rounded-2xl border border-dashed border-border/60 bg-card/50 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ backgroundColor: accent.bg, color: accent.fg }}
          >
            {PLAN_LABEL[plan]}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Coming soon
          </span>
        </div>

        <h2 className="mt-3 font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {description}
        </h2>

        {bullets.length > 0 ? (
          <ul className="mt-4 grid gap-2 text-[13px] text-muted-foreground sm:grid-cols-2">
            {bullets.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="mt-1 size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: accent.bg }}
                />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            href="/admin/site"
            className="rounded-full bg-foreground px-4 py-2 text-[13px] font-semibold text-background transition-transform hover:-translate-y-px"
          >
            Browse all capabilities
          </Link>
          <a
            href="mailto:hello@impronta.group?subject=Notify%20me%3A%20{title}"
            className="rounded-full border border-border/60 bg-background/80 px-4 py-2 text-[13px] font-semibold text-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/55"
          >
            Notify me when it ships
          </a>
        </div>
      </div>
    </div>
  );
}
