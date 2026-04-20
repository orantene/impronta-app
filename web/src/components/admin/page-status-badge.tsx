/**
 * Phase 5 / M3 — shared page-status + system-owned badges.
 *
 * Keep these presentational helpers in one place so the pages list, the
 * editor header, and any future page dashboards render identical chips.
 * Keys off PAGE_STATUSES from `@/lib/site-admin` so the set cannot drift.
 */

import type { PageStatusLiteral } from "@/lib/site-admin/forms/pages";

const STATUS_CLASSES: Record<PageStatusLiteral, string> = {
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  archived: "bg-muted/40 text-muted-foreground border-border/60",
};

const STATUS_LABEL: Record<PageStatusLiteral, string> = {
  draft: "draft",
  published: "published",
  archived: "archived",
};

export function PageStatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_CLASSES ? status : "draft") as PageStatusLiteral;
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASSES[key]}`}
      title={`Status: ${STATUS_LABEL[key]}`}
    >
      {STATUS_LABEL[key]}
    </span>
  );
}

export function SystemOwnedBadge() {
  return (
    <span
      className="rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
      title="System-owned page — slug, locale, and template are locked. Managed from the Homepage tab (M5)."
    >
      system · locked
    </span>
  );
}
