import { filterToPubliclyListedIds } from "@/lib/directory/public-listing-predicate";

/**
 * TUL-1940: `talent_discover_index` is a MATERIALIZED view, so it lags an
 * unlist/hide until the next refresh. Filtering the page AFTER `range()` left
 * short pages and a wrong total. This module gates the WHOLE filtered id set
 * against live `talent_profiles` first (the canonical public-listing gate),
 * then pages over the live-listed ids, so a stale row can never show an
 * unlisted talent, never leaves a hole in a page, and `total` is exact.
 * The matview still supplies the rich fields for the (<= page size) ids.
 */

/** Structural slice of a Supabase filter builder. */
interface IndexFilterBuilder {
  eq(column: string, value: string): IndexFilterBuilder;
  gt(column: string, value: number): IndexFilterBuilder;
  in(column: string, values: string[]): IndexFilterBuilder;
  is(column: string, value: null): IndexFilterBuilder;
  or(filter: string): IndexFilterBuilder;
}

export type DiscoverIndexFilters = {
  category?: string;
  hub?: string;
  /** null = no location filter; [] = filter set but matched nothing (=> no rows). */
  residenceCityIds: string[] | null;
  trustTier?: string;
  availableOnly?: boolean;
  /** Pre-built PostgREST `or` filter for text search, or null. */
  qFilter: string | null;
};

/** Apply the Discover filters to a `talent_discover_index` query. */
export function applyDiscoverIndexFilters<Q>(query: Q, f: DiscoverIndexFilters): Q {
  let q = query as unknown as IndexFilterBuilder;
  if (f.category) q = q.eq("category_slug", f.category);
  if (f.hub) q = q.eq("agency_tenant_id", f.hub);
  if (f.residenceCityIds) {
    q = f.residenceCityIds.length ? q.in("residence_city_id", f.residenceCityIds) : q.is("id", null);
  }
  if (f.trustTier) q = q.eq("trust_tier", f.trustTier);
  if (f.availableOnly) q = q.gt("available_days_in_next_30", 0);
  if (f.qFilter) q = q.or(f.qFilter);
  return q as unknown as Q;
}

/** Minimal ordered-range query surface used to walk the filtered id set. */
export type IdPageFetcher = (
  from: number,
  to: number,
) => PromiseLike<{ data: { id: string }[] | null; error: { message: string } | null }>;

const ID_PAGE = 1000; // PostgREST default max-rows
const ID_CAP = 5000; // hard bound on ids pulled per request

/**
 * Walk the filtered, ordered id set (<= ID_CAP), keep only live-listed ids,
 * and return the requested slice plus the exact live total.
 * Throws on any read error (callers fail closed).
 */
export async function pageLiveListedIds(
  supabase: unknown,
  fetchIds: IdPageFetcher,
  offset: number,
  limit: number,
): Promise<{ pageIds: string[]; total: number }> {
  const ids: string[] = [];
  for (let from = 0; from < ID_CAP; from += ID_PAGE) {
    const { data, error } = await fetchIds(from, from + ID_PAGE - 1);
    if (error) throw new Error(`[discover] index ids: ${error.message}`);
    const batch = (data ?? []).map((r) => r.id);
    ids.push(...batch);
    if (batch.length < ID_PAGE) break;
  }
  const live = await filterToPubliclyListedIds(supabase, ids);
  return { pageIds: live.slice(offset, offset + limit), total: live.length };
}

/** Re-order fetched rows to match the live page order (an `in()` read is unordered). */
export function orderRowsByIds<T extends { id: string }>(rows: readonly T[], ids: readonly string[]): T[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [r] : [];
  });
}
