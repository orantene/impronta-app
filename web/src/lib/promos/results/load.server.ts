import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { USE_STATUSES } from "@/lib/orders/promo-redemption-status";
import { computeMonthRollup, computePromoResult, monthBounds, type MonthRollup, type PromoResult, type ResultEvent, type ResultRedemption } from "./compute";

/**
 * Reads the rows `compute.ts` needs. Confirmed redemptions only (USE_STATUSES),
 * plus promo_events. Callers pass the promo ids of ONE owner (from
 * `loadTenantPromos`), so no cross-tenant read is possible from here.
 */
export type PromoResultsBundle = {
  results: Record<string, PromoResult>;
  month: MonthRollup;
};

export async function loadPromoResults(
  admin: SupabaseClient,
  promos: readonly { id: string; max_uses?: number | null; starts_at?: string | null; created_at?: string | null }[],
  now: Date = new Date(),
): Promise<PromoResultsBundle | null> {
  const ids = promos.map((p) => p.id);
  const empty: PromoResultsBundle = { results: {}, month: computeMonthRollup({ rows: [], ...monthBounds(now) }) };
  if (ids.length === 0) return empty;

  const [red, ev] = await Promise.all([
    admin
      .from("tenant_promo_redemptions")
      .select("promo_code_id, status, list_cents, discount_cents, currency, source_channel, client_status, is_price_promo, created_at")
      .in("promo_code_id", [...ids])
      .in("status", [...USE_STATUSES]),
    admin.from("promo_events").select("promo_id, kind, at").in("promo_id", [...ids]).eq("kind", "link_open"),
  ]);
  if (red.error) {
    logServerError("promos.results/redemptions", red.error);
    return null;
  }
  if (ev.error) {
    logServerError("promos.results/events", ev.error);
    return null;
  }
  const rows = (red.data ?? []) as unknown as ResultRedemption[];
  const events = (ev.data ?? []) as unknown as ResultEvent[];

  const results: Record<string, PromoResult> = {};
  for (const p of promos) {
    results[p.id] = computePromoResult({
      promoId: p.id,
      rows,
      events,
      maxUses: p.max_uses ?? null,
      startedAt: p.starts_at ?? p.created_at ?? null,
    });
  }
  return { results, month: computeMonthRollup({ rows, ...monthBounds(now) }) };
}
