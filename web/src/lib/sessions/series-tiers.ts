/**
 * series-tiers.ts — what a repeating class's pools SHOULD be when it sells by
 * tier (TUL-1344 slice 3). Pure: no Supabase import, so it gates in CI.
 *
 * A dated offering with seats has ONE total per date and, optionally, a cap per
 * tier ("20 spots, at most 6 children"). The engine already models this: the
 * session's `default` pool carries the total, and each tier is a CHILD pool of
 * it, so a sale on a tier is counted against the tier's cap AND the total (the
 * ancestor rule). A series without tiers keeps today's single parentless
 * `default` pool, byte for byte.
 *
 * Refuses rather than guessing: a quota for a tier that does not exist would
 * create a pool nobody can sell, and "default" cannot also be a tier because
 * the parent and the child would share one key.
 */

import { DEFAULT_POOL_KEY, type TierUnits } from "./session-plan";

export type SeriesPoolPlan =
  | { ok: true; pools: TierUnits[] }
  | { ok: false; reason: "no_seats" | "blank_tier" | "unknown_quota_key" | "duplicate_tier" | "reserved_tier_key"; poolKey?: string };

/** Max a stop-selling offset may be: one year, matching the held migration's CHECK. */
export const MAX_SALES_CLOSE_MINUTES = 525_600;

export function parseSalesCloseMinutes(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return null;
  if (raw < 0 || raw > MAX_SALES_CLOSE_MINUTES) return null;
  return raw;
}

/** `session_series.tier_quotas` → `{ poolKey: positive int }`, or null when nothing usable is set. */
export function parseTierQuotas(raw: unknown): Record<string, number> | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "number" && Number.isInteger(value) && value > 0) out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function planSeriesPools(a: {
  seats: number;
  tierKeys: ReadonlyArray<string>;
  tierQuotas: Record<string, number> | null;
}): SeriesPoolPlan {
  if (!Number.isInteger(a.seats) || a.seats <= 0) return { ok: false, reason: "no_seats" };
  const pools: TierUnits[] = [{ poolKey: DEFAULT_POOL_KEY, units: a.seats }];
  const seen = new Set<string>();
  for (const raw of a.tierKeys) {
    const key = (raw ?? "").trim();
    if (!key) return { ok: false, reason: "blank_tier" };
    if (key === DEFAULT_POOL_KEY) return { ok: false, reason: "reserved_tier_key", poolKey: key };
    if (seen.has(key)) return { ok: false, reason: "duplicate_tier", poolKey: key };
    seen.add(key);
    const quota = a.tierQuotas?.[key];
    // A quota only ever LOWERS a tier below the total; it can never raise it.
    const units = typeof quota === "number" ? Math.min(quota, a.seats) : a.seats;
    pools.push({ poolKey: key, units, parentPoolKey: DEFAULT_POOL_KEY });
  }
  for (const key of Object.keys(a.tierQuotas ?? {})) {
    if (!seen.has(key)) return { ok: false, reason: "unknown_quota_key", poolKey: key };
  }
  // No tiers: exactly the single parentless default pool of today.
  return { ok: true, pools };
}
