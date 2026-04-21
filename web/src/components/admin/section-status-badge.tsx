/**
 * Phase 5 / M4 — shared section-status badge.
 *
 * Keep this presentational helper in one place so the sections list, the
 * editor header, and the future homepage composer (M5) render identical
 * chips. Keys off SECTION_STATUSES from `@/lib/site-admin` so the set
 * cannot drift.
 */

import type { SectionStatusLiteral } from "@/lib/site-admin/forms/sections";

const STATUS_CLASSES: Record<SectionStatusLiteral, string> = {
  draft: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  published: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  archived: "bg-muted/40 text-muted-foreground border-border/60",
};

const STATUS_LABEL: Record<SectionStatusLiteral, string> = {
  draft: "draft",
  published: "published",
  archived: "archived",
};

export function SectionStatusBadge({ status }: { status: string }) {
  const key = (status in STATUS_CLASSES
    ? status
    : "draft") as SectionStatusLiteral;
  return (
    <span
      className={`rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${STATUS_CLASSES[key]}`}
      title={`Status: ${STATUS_LABEL[key]}`}
    >
      {STATUS_LABEL[key]}
    </span>
  );
}
