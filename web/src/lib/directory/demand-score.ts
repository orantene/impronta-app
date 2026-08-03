import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Demand-weighted ranking signal for the directory's "Recommended" sort.
 *
 * Score = first-party engagement over the last 30 days, per talent, per
 * tenant, from `analytics_events` (the dual-write pipeline that the profile
 * modal / quick view / directory tracking feeds):
 *
 *   view_talent_profile  ×3  (a full profile open — modal or page)
 *   view_talent_card     ×1  (quick-view media peek)
 *
 * The service-role client is required — analytics_events RLS is
 * staff/tenant-scoped and the directory fetch runs as anon. Scores are
 * cached in-module per tenant for 10 minutes so the aggregate scan runs at
 * most a few times an hour per tenant, not per request.
 *
 * Applied as PAGE-LOCAL smoothing (the applyTopRatedSmoothing precedent):
 * featured rows keep their curated block untouched at the top; the
 * non-featured remainder of the loaded page is stably re-ordered by demand.
 * No query/offset/nextCursor change.
 */
export const DEMAND_EVENT_WEIGHTS: Record<string, number> = {
  view_talent_profile: 3,
  view_talent_card: 1,
};
export const DEMAND_WINDOW_DAYS = 30;

/** Back-compat aliases for the in-module live path below. */
const EVENT_WEIGHTS = DEMAND_EVENT_WEIGHTS;
const WINDOW_DAYS = DEMAND_WINDOW_DAYS;
const CACHE_TTL_MS = 10 * 60 * 1000;
const SCAN_LIMIT = 50_000;

const cache = new Map<string, { at: number; scores: Map<string, number> }>();

export async function getDemandScores(
  tenantId: string,
): Promise<Map<string, number>> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.scores;

  const scores = new Map<string, number>();
  const admin = createServiceRoleClient();
  if (!admin) return scores;

  // Prefer the MATERIALIZED score (refreshed nightly by
  // /api/cron/refresh-demand-scores): it covers the whole roster, so a talent
  // with real demand on page 3 can climb. Falls through to the live scan below
  // when the table is empty — a fresh install, or before the first cron run —
  // so the feature is never worse than the page-local behavior it replaced.
  const { data: persisted } = await admin
    .from("talent_demand_scores")
    .select("talent_profile_id, score")
    .eq("tenant_id", tenantId);

  if (persisted && persisted.length > 0) {
    for (const row of persisted as Array<{
      talent_profile_id: string;
      score: number | string;
    }>) {
      const n = Number(row.score);
      if (Number.isFinite(n) && n > 0) scores.set(row.talent_profile_id, n);
    }
    cache.set(tenantId, { at: Date.now(), scores });
    return scores;
  }

  const since = new Date(
    Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const { data, error } = await admin
    .from("analytics_events")
    .select("talent_id, name")
    .eq("tenant_id", tenantId)
    .in("name", Object.keys(EVENT_WEIGHTS))
    .not("talent_id", "is", null)
    .gte("created_at", since)
    .limit(SCAN_LIMIT);

  if (!error && data) {
    for (const row of data as Array<{ talent_id: string; name: string }>) {
      scores.set(
        row.talent_id,
        (scores.get(row.talent_id) ?? 0) + (EVENT_WEIGHTS[row.name] ?? 0),
      );
    }
  }
  cache.set(tenantId, { at: Date.now(), scores });
  return scores;
}

/**
 * Stable page-local re-rank: the leading featured block is left byte-stable;
 * everything after it is ordered by demand score desc (ties keep the base
 * recency order). Mutates `items` in place, mirroring applyTopRatedSmoothing.
 */
export function applyDemandSmoothing<
  T extends { id: string; isFeatured: boolean },
>(items: T[], scores: Map<string, number>): void {
  if (items.length < 2 || scores.size === 0) return;
  let firstNonFeatured = 0;
  while (
    firstNonFeatured < items.length &&
    items[firstNonFeatured].isFeatured
  ) {
    firstNonFeatured++;
  }
  const tail = items
    .slice(firstNonFeatured)
    .map((item, i) => ({ item, i, score: scores.get(item.id) ?? 0 }))
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .map((e) => e.item);
  for (let i = 0; i < tail.length; i++) items[firstNonFeatured + i] = tail[i];
}
