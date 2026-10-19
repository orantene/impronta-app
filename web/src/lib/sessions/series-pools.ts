import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { DEFAULT_POOL_KEY, type TierUnits } from "./session-plan";
import { parseTierQuotas, planSeriesPools } from "./series-tiers";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * The pools a series' dates should carry: the single default pool of today, or
 * (when its item sells by tier) a default total with one capped child per tier.
 *
 * Every read here is failure-tolerant and falls back to the single default
 * pool: the held TUL-1344 migration may not be applied (`tier_quotas` absent),
 * and a failed tier read must never stop the nightly sweep or leave a date
 * without ANY pool. A quota for a tier that no longer exists is dropped, not
 * refused, so a renamed tier cannot stop a class from materialising.
 */
export async function loadSeriesPoolPlan(
  admin: Admin,
  a: { tenantId: string; seriesId: string; offeringId: string | null; seats: number },
): Promise<TierUnits[]> {
  const single: TierUnits[] = [{ poolKey: DEFAULT_POOL_KEY, units: a.seats }];
  if (!a.offeringId) return single;

  const { data: variants, error: vErr } = await admin
    .from("talent_offering_variants")
    .select("pool_key, sort_order")
    .eq("offering_id", a.offeringId)
    .order("sort_order", { ascending: true });
  if (vErr) {
    logServerError("sessions.seriesPools.variants", vErr);
    return single;
  }
  const tierKeys = [
    ...new Set(
      ((variants ?? []) as Array<{ pool_key: string | null }>)
        .map((v) => (typeof v.pool_key === "string" ? v.pool_key.trim() : ""))
        .filter((k) => k && k !== DEFAULT_POOL_KEY),
    ),
  ];
  if (tierKeys.length === 0) return single;

  let quotas: Record<string, number> | null = null;
  const { data: quotaRow, error: qErr } = await admin
    .from("session_series")
    .select("tier_quotas")
    .eq("id", a.seriesId)
    .eq("tenant_id", a.tenantId)
    .maybeSingle();
  if (!qErr) {
    const parsed = parseTierQuotas((quotaRow as { tier_quotas?: unknown } | null)?.tier_quotas);
    if (parsed) {
      quotas = Object.fromEntries(Object.entries(parsed).filter(([k]) => tierKeys.includes(k)));
      if (Object.keys(quotas).length === 0) quotas = null;
    }
  }

  const plan = planSeriesPools({ seats: a.seats, tierKeys, tierQuotas: quotas });
  if (!plan.ok) {
    logServerError("sessions.seriesPools.plan", plan.reason);
    return single;
  }
  return plan.pools;
}
