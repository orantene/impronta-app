/**
 * Pure grouping / filter helpers for the Starter Kit category collections
 * view (A7).
 *
 * Everything here is PURE (no React, no IO) so it is unit-testable in the
 * `test:builder` list. The component imports these to drive category-section
 * rendering, filter-bar pill counts, and the quick-rename predicate.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

/** Minimal shape the grouping helpers need from a starter row. */
export interface StarterRowLike {
  id: string;
  category: string;
  title: string;
}

/** One category bucket: the display name + sorted rows within it. */
export interface StarterCategoryGroup<R extends StarterRowLike = StarterRowLike> {
  /** The exact category string shared by all rows in this group. */
  category: string;
  /** Rows within this category, sorted by title ascending. */
  rows: R[];
}

// ── groupByCategory ───────────────────────────────────────────────────────────

/**
 * Group an already-filtered list of starter rows into category buckets.
 *
 * Sort order: categories sorted alpha ascending; within each category rows
 * are sorted by title ascending. The input list may arrive in any order.
 *
 * PURE — no I/O.
 */
export function groupByCategory<R extends StarterRowLike>(
  rows: R[],
): StarterCategoryGroup<R>[] {
  const map = new Map<string, R[]>();
  for (const row of rows) {
    const cat = (row.category ?? "").trim() || "Uncategorized";
    if (!map.has(cat)) map.set(cat, []);
    map.get(cat)!.push(row);
  }
  // Sort rows within each bucket
  for (const bucket of map.values()) {
    bucket.sort((a, b) => a.title.localeCompare(b.title));
  }
  // Return buckets sorted alpha by category name
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, rows]) => ({ category, rows }));
}

// ── categoryFilterOptions ─────────────────────────────────────────────────────

/** One entry in the category filter bar. */
export interface CategoryFilterOption {
  /** The raw category string used as a filter key; "all" is a special sentinel. */
  key: string;
  label: string;
  count: number;
}

/**
 * Build the ordered list of filter-bar options from an ungrouped list of rows.
 *
 * Always prepends an "All" option whose count is the total row count.
 * Per-category entries are sorted alpha ascending by label.
 *
 * PURE — no I/O.
 */
export function categoryFilterOptions(rows: StarterRowLike[]): CategoryFilterOption[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const cat = (row.category ?? "").trim() || "Uncategorized";
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  const cats = [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cat, count]) => ({ key: cat, label: cat, count }));
  return [{ key: "all", label: "All", count: rows.length }, ...cats];
}

// ── applyStarterCategoryFilter ────────────────────────────────────────────────

/**
 * Filter a list of starter rows to only those matching `categoryKey`.
 *
 * Passing `"all"` (or any key not present as a category) returns the full list.
 *
 * PURE — no I/O.
 */
export function applyStarterCategoryFilter<R extends StarterRowLike>(
  rows: R[],
  categoryKey: string,
): R[] {
  if (categoryKey === "all") return rows;
  return rows.filter(
    (r) => ((r.category ?? "").trim() || "Uncategorized") === categoryKey,
  );
}
