// src/lib/supabase/paged.ts
//
// Shared, order-STABLE paginator for Supabase / PostgREST reads.
//
// WHY THIS EXISTS:
// PostgREST caps a single `.select()` at its `max-rows` setting (1000 by
// default). Any un-paged `.from(table).select(...)` that expects the FULL
// matching set SILENTLY drops every row past row 1000 — no error, no warning.
// `public.taxonomy_terms` has already crossed that cap (>1000 rows), so reads
// that need the whole set (e.g. `archived_at IS NULL` ≈ 1068 rows) lose data,
// including parent_category / talent_type rows that downstream joins rely on.
//
// HOW IT STAYS CORRECT:
// Range pagination (`.range(from, from+size-1)`) is only well-defined when the
// rows are ordered by a UNIQUE, stable key. If you page by a NON-unique display
// column (sort_order / level / kind / name), ties across a page boundary can be
// re-ordered by the engine between requests, so a row can be skipped or returned
// twice. This helper therefore ALWAYS orders internally by a unique key
// (`id` by default) — independent of whatever display order the caller wants.
// Callers that need a specific display order should re-sort the returned array
// in memory; display is then unchanged and pagination stays loss-free.
//
// RUNTIME-AGNOSTIC: this module does NOT import "server-only". It works with
// any SupabaseClient — the service-role server client AND the browser client
// (used by `"use client"` hooks like use-taxonomy.ts). Keep it that way.

import type { SupabaseClient } from "@supabase/supabase-js";

/** PostgREST default `max-rows`. One page == one round-trip. */
export const PG_MAX_ROWS = 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

/**
 * Page through every row of a table that matches the caller's filters,
 * ordering internally by a UNIQUE column so range pagination never skips or
 * duplicates rows.
 *
 * @param supabase     any SupabaseClient (server service-role OR browser).
 * @param table        the table to read.
 * @param select       the PostgREST `.select()` projection string.
 * @param opts.applyFilters  optional closure to add `.eq/.in/.is/...` filters.
 *                           Do NOT add `.order`/`.range`/`.limit` here — the
 *                           helper owns ordering + windowing.
 * @param opts.orderColumn   the UNIQUE, stable column to page by (default `id`).
 * @param opts.pageSize      rows per round-trip (default PG_MAX_ROWS).
 *
 * Returns every matching row, in `orderColumn` ascending order. Re-sort in
 * memory if you need a different display order.
 */
export async function fetchAllRows<Row>(
  supabase: SupabaseClient,
  table: string,
  select: string,
  opts: {
    applyFilters?: (q: AnyQuery) => AnyQuery;
    orderColumn?: string;
    pageSize?: number;
  } = {},
): Promise<Row[]> {
  const orderColumn = opts.orderColumn ?? "id";
  const pageSize = opts.pageSize ?? PG_MAX_ROWS;
  const out: Row[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + pageSize - 1)
      // Order by a UNIQUE key so the window boundaries are deterministic.
      .order(orderColumn, { ascending: true });
    if (opts.applyFilters) query = opts.applyFilters(query);
    const { data, error } = await query;
    if (error) {
      throw new Error(`${table} (paged): ${error.message}`);
    }
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    // A short page means we reached the end of the matching set.
    if (rows.length < pageSize) break;
  }
  return out;
}

/**
 * Convenience wrapper for the most common offender: `taxonomy_terms`.
 * Pages by `id` (unique) and applies the caller's filters. Re-sort the
 * result in memory for display order.
 *
 * @example
 *   const terms = await fetchAllTaxonomyTerms(
 *     supabase,
 *     "id, slug, term_type, parent_id",
 *     (q) => q.is("archived_at", null),
 *   );
 */
export function fetchAllTaxonomyTerms<Row>(
  supabase: SupabaseClient,
  select: string,
  applyFilters?: (q: AnyQuery) => AnyQuery,
): Promise<Row[]> {
  return fetchAllRows<Row>(supabase, "taxonomy_terms", select, { applyFilters });
}
