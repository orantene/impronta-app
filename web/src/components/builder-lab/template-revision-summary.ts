/**
 * Pure helpers for the inline per-template revision history summary line
 * (Builder Studio WS-D D4 — Phase 5).
 *
 * These are extracted from the Template Manager row card so they can be
 * unit-tested without a DOM. The UI layer (template-manager.tsx) and the
 * RevisionList expand panel (template-revision-list.tsx) import from here.
 *
 * Consumers:
 *   - TemplateRowCard (template-manager.tsx) — inline "v7, changed 2d ago,
 *     copy fix" summary line rendered at all times, before the expand panel.
 *   - RevisionList (template-revision-list.tsx) — imports `formatRevRelative`
 *     for the per-row date column.
 */

// ── Relative-time formatter ────────────────────────────────────────────────────

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Compact relative-time string for a revision timestamp ("just now", "3m ago",
 * "2h ago", "2d ago", "Jun 15"). Returns "" for an invalid ISO string.
 */
export function formatRevRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Date.now() - then;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)}m ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)}h ago`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ── Inline history summary ────────────────────────────────────────────────────

/**
 * Build the single-line history summary shown inline on every Template Manager
 * card, e.g. "v7, changed 2d ago, copy fix" or "v1, changed Jun 15".
 *
 * @param version    The template's current `version` counter.
 * @param updatedAt  ISO timestamp of the last update (from `builder_templates.updated_at`).
 * @param changelog  The most-recent publish changelog note (may be null/undefined).
 */
export function summarizeLatestRevision(
  version: number,
  updatedAt: string,
  changelog: string | null | undefined,
): string {
  const when = formatRevRelative(updatedAt);
  const whenPart = when ? `changed ${when}` : "unknown date";
  const notePart = changelog?.trim() || null;
  return notePart
    ? `v${version}, ${whenPart}, ${notePart}`
    : `v${version}, ${whenPart}`;
}
