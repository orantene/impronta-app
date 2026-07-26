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
const EVENT_WEIGHTS: Record<string, number> = {
  view_talent_profile: 3,
  view_talent_card: 1,
};
const WINDOW_DAYS = 30;
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
