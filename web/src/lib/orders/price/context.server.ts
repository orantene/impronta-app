/**
 * loadPriceContext: all the I/O a price quote needs, in one place (TUL-1298).
 *
 * Reads the same catalog rows `createPurchase` prices from (`loadCatalog`), the same order
 * currency rule (`resolveOrderCurrency`) and the E5 travel line. Read only: nothing is held or written.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCatalog } from "@/lib/orders/purchase-catalog";
import { resolveOrderCurrency } from "@/lib/orders/display-currency";
import { travelFeeOnDayCents } from "@/lib/orders/travel-fee";
import { offeringWhereFromAttributes } from "@/lib/talent/offering-request-detail";
import { loadSellingDefaultsByTalent } from "@/lib/talent/offering-policy-server";
import { logServerError } from "@/lib/server/safe-error";

type Loaded = Extract<Awaited<ReturnType<typeof loadCatalog>>, { ok: true }>;

/** The slice of a context that pricing needs; tests build it without a database. */
export type SelectionContext = {
  tenantId: string;
  currency: string;
  catalog: Pick<Loaded, "offerings" | "variants" | "addons" | "policies">;
  travelFeeOnDayCents: number;
};

export type PriceContext = SelectionContext & {
  catalog: Loaded;
  /** The talent that owns the first offering (promo scope); null for an agency-owned one. */
  talentProfileId: string | null;
};

export async function loadPriceContext(
  admin: SupabaseClient,
  input: { offeringIds: readonly string[]; /** Skip the E5 travel reads when only the promo is needed. */ withTravel?: boolean },
): Promise<{ ok: true; ctx: PriceContext } | { ok: false }> {
  const ids = [...new Set(input.offeringIds)];
  if (ids.length === 0) return { ok: false };
  const catalog = await loadCatalog(admin, ids);
  if (!catalog.ok) return { ok: false };
  let tenantId: string | null = null;
  for (const id of ids) {
    const policy = catalog.policies.get(id);
    if (!policy?.tenantId || !catalog.offerings.get(id)) return { ok: false };
    if (tenantId && tenantId !== policy.tenantId) return { ok: false };
    tenantId = policy.tenantId;
  }
  const ccy = resolveOrderCurrency(ids.map((id) => catalog.offerings.get(id)?.currency ?? null));
  if (!ccy.ok || !tenantId) return { ok: false };
  let travel = 0;
  if (input.withTravel !== false) for (const id of ids) travel += await travelOnDay(admin, id, catalog.offerings.get(id)?.talentProfileId ?? null);
  return {
    ok: true,
    ctx: {
      tenantId,
      currency: ccy.currency,
      catalog,
      talentProfileId: catalog.offerings.get(ids[0]!)?.talentProfileId ?? null,
      travelFeeOnDayCents: travel,
    },
  };
}

/** E5 (TUL-1270 M2): the talent's travel fee for a home visit. Display only; a failed read shows no line (logged). */
async function travelOnDay(admin: SupabaseClient, offeringId: string, talentProfileId: string | null): Promise<number> {
  if (!talentProfileId) return 0;
  const { data, error } = await admin.from("talent_offerings").select("attributes").eq("id", offeringId).maybeSingle();
  if (error) {
    logServerError("orders.priceContext/travelWhere", error);
    return 0;
  }
  const where = offeringWhereFromAttributes((data as { attributes?: Record<string, unknown> | null } | null)?.attributes ?? null);
  if (where.length === 0) return 0;
  const defaults = await loadSellingDefaultsByTalent(admin, [talentProfileId]);
  if (!defaults.ok) return 0;
  return travelFeeOnDayCents({ where, sellingDefaults: defaults.defaults.get(talentProfileId) ?? null });
}
