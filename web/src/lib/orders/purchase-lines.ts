import type { PricedLine } from "@/lib/orders/purchase-pricing";

/**
 * The `order_lines` rows of a purchase, and the ids the capacity batch needs
 * to attribute each hold to ITS line (split out of purchase.ts at the 800-line cap).
 */
export function buildOrderLineRows(
  priced: readonly PricedLine[],
  ctx: { orderId: string; tenantId: string; sessionIds: ReadonlyArray<string | null | undefined> },
) {
  return priced.map((l, i) => ({
    order_id: ctx.orderId,
    tenant_id: ctx.tenantId,
    offering_id: l.offeringId,
    variant_id: l.variantId,
    addon_ids: l.addonIds,
    label: l.label,
    units: l.units,
    unit_cents: l.unitCents,
    total_cents: l.totalCents,
    talent_profile_id: l.talentProfileId,
    owner_tenant_id: l.ownerTenantId,
    talent_cost_cents: l.talentCostCents,
    ...(l.ownerTakeCents != null ? { owner_take_cents: l.ownerTakeCents, owner_share_snapshot: l.ownerShareSnapshot } : {}),
    // TUL-1302: the phase that set this price; a later phase never rewrites it.
    ...(l.pricePhaseId ? { price_phase_id: l.pricePhaseId } : {}),
    // Never `orders.session_id` (a box-office convenience); `mint-on-paid` filters on this.
    session_id: ctx.sessionIds[i] ?? null,
    sort_order: i,
  }));
}

/**
 * Inserted line ids, keyed two ways. By LINE INDEX (`sort_order` = request
 * index) is exact: TUL-1314, an order holding two variants of one offering put
 * both holds on whichever line was written last when this was keyed by offering
 * alone, so releasing one line could free the other's stock. By offering is the
 * fallback for a hold that names no line.
 */
export function indexInsertedLines(
  rows: ReadonlyArray<{ id: string; offering_id: string | null; sort_order?: number | null }>,
): { byOffering: Map<string, string>; byIndex: Map<number, string> } {
  const byOffering = new Map<string, string>();
  const byIndex = new Map<number, string>();
  for (const row of rows) {
    if (row.offering_id) byOffering.set(row.offering_id, row.id);
    if (typeof row.sort_order === "number") byIndex.set(row.sort_order, row.id);
  }
  return { byOffering, byIndex };
}
