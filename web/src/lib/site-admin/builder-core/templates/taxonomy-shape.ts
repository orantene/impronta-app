/**
 * taxonomy-shape.ts (D5) — PURE taxonomy types + aggregation/transform helpers.
 *
 * Extracted out of `taxonomy-actions.ts` because that file carries the
 * `"use server"` directive, under which EVERY export must be an async function
 * (a Next.js build constraint the tsc/test gate does not enforce — a non-async
 * export there breaks `next build`). These helpers are pure (no I/O), so they
 * live here and are imported by both the server actions and the unit tests.
 */

import type { BuilderTemplateRow } from "./registry-rows";

// ── Taxonomy types ────────────────────────────────────────────────────────────

export interface TaxonomyEntry {
  value: string;
  /** Number of templates that carry this tag or category. */
  count: number;
}

export interface TemplateTaxonomy {
  tags: TaxonomyEntry[];
  categories: TaxonomyEntry[];
}

// ── Pure aggregation & transform helpers ──────────────────────────────────────

/**
 * Aggregate distinct tags with per-tag template counts from a list of rows.
 * Sorted by count descending, then value ascending for deterministic output.
 * PURE — no I/O.
 */
export function aggregateTags(rows: BuilderTemplateRow[]): TaxonomyEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const tag of row.tags ?? []) {
      const t = tag.trim();
      if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Aggregate distinct categories with per-category template counts.
 * Sorted by count descending, then value ascending.
 * PURE — no I/O.
 */
export function aggregateCategories(
  rows: BuilderTemplateRow[],
): TaxonomyEntry[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cat = (row.category ?? "").trim();
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Compute which tags to write onto a row after renaming `fromTag` → `toTag`.
 * Returns null if the row doesn't carry `fromTag` (caller can skip the write).
 * PURE — no I/O.
 */
export function applyTagRename(
  currentTags: string[],
  fromTag: string,
  toTag: string,
): string[] | null {
  const to = toTag.trim();
  if (!currentTags.includes(fromTag)) return null;
  // Replace every occurrence of `fromTag` with `toTag`; dedupe in case `toTag`
  // already exists on the row.
  const next = new Set(currentTags.map((t) => (t === fromTag ? to : t)));
  return [...next];
}

/**
 * Compute which tags to write after merging any of `fromTags` into `intoTag`.
 * Returns null if the row carries none of the `fromTags`.
 * PURE — no I/O.
 */
export function applyTagMerge(
  currentTags: string[],
  fromTags: string[],
  intoTag: string,
): string[] | null {
  const into = intoTag.trim();
  const fromSet = new Set(fromTags);
  if (!currentTags.some((t) => fromSet.has(t))) return null;
  const next = new Set(currentTags.map((t) => (fromSet.has(t) ? into : t)));
  return [...next];
}

/**
 * Compute which tags to write after deleting `tag`.
 * Returns null if the row doesn't carry `tag` (caller can skip the write).
 * PURE — no I/O.
 */
export function applyTagDelete(
  currentTags: string[],
  tag: string,
): string[] | null {
  if (!currentTags.includes(tag)) return null;
  return currentTags.filter((t) => t !== tag);
}
