import { filterToPubliclyListedIds } from "@/lib/directory/public-listing-predicate";

/**
 * `talent_discover_index` is a MATERIALIZED view refreshed on a cron, so it can
 * lag a hide / unlist / delete by up to the refresh interval. Every surface
 * that builds cards (or counts) from it must drop rows whose LIVE
 * `talent_profiles` row no longer passes the canonical public-listing gate
 * (the same one the profile page and the main directory list use).
 *
 * One bounded batched read per 200 ids (never per row). Fails CLOSED: if the
 * live read errors, nothing is shown rather than a possibly-hidden profile.
 */
export async function liveGateIndexRows<T extends { id: string }>(
  supabase: unknown,
  rows: readonly T[],
): Promise<{ rows: T[]; dropped: number }> {
  if (rows.length === 0) return { rows: [], dropped: 0 };
  let allowedIds: string[];
  try {
    allowedIds = await filterToPubliclyListedIds(
      supabase,
      rows.map((r) => r.id),
    );
  } catch {
    return { rows: [], dropped: rows.length };
  }
  const allowed = new Set(allowedIds);
  const kept = rows.filter((r) => allowed.has(r.id));
  return { rows: kept, dropped: rows.length - kept.length };
}
