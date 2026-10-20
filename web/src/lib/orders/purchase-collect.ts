/**
 * Checkout collect amount for `createPurchase`: deposit/full principal from the
 * (possibly discounted) order total, then pass_through inflation per resolved
 * owning party.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { amountToCollectCents } from "@/lib/orders/purchase-pricing";
import {
  resolvePassThroughCollect,
  resolvePurchaseSellersForCollect,
  type PurchaseLineForCollect,
} from "@/lib/orders/purchase-pass-through-collect";

export async function resolveCheckoutCollectCents(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    orderCurrency: string;
    /** Catalog line totals (sum = subtotal) — used to scale per-payee shares. */
    lines: readonly PurchaseLineForCollect[];
    subtotalCents: number;
    /** Fee-exclusive order total after promo. */
    totalCents: number;
    collect: "full" | "deposit" | "none";
    depositPct: number | null;
    payInPerson: boolean;
  },
): Promise<{ baseCollectCents: number; collectCents: number; serviceFeeBpsByParty: Record<string, number> }> {
  const baseCollectCents = amountToCollectCents(
    input.totalCents,
    input.collect,
    input.depositPct,
  );
  if (!(baseCollectCents > 0) || input.payInPerson) {
    return { baseCollectCents, collectCents: baseCollectCents, serviceFeeBpsByParty: {} };
  }
  const priced = await resolveCollectForPrincipalDetailed(admin, {
    tenantId: input.tenantId,
    orderCurrency: input.orderCurrency,
    lines: input.lines,
    subtotalCents: input.subtotalCents,
    principalCents: baseCollectCents,
  });
  return { baseCollectCents, collectCents: priced.collectCents, serviceFeeBpsByParty: priced.feeBpsByParty };
}

/**
 * What Checkout must charge for a given PRINCIPAL (the service money the order is
 * credited): the principal plus the pass_through client surcharge when armed.
 * The ONE implementation behind the direct checkout (`resolveCheckoutCollectCents`)
 * and the payment-link checkout, so a link and a direct purchase of the same
 * order charge the same amount and the snapshot agrees with both.
 */
export async function resolveCollectForPrincipal(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    orderCurrency: string;
    lines: readonly PurchaseLineForCollect[];
    subtotalCents: number;
    principalCents: number;
    /** The order's frozen service-fee snapshot (TUL-1366), when it already has one. */
    frozenFeeByParty?: Record<string, number> | null;
  },
): Promise<number> {
  return (await resolveCollectForPrincipalDetailed(admin, input)).collectCents;
}

/** The same, also returning the service fee (bps) applied per seller, for the order snapshot. */
export async function resolveCollectForPrincipalDetailed(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    orderCurrency: string;
    lines: readonly PurchaseLineForCollect[];
    subtotalCents: number;
    principalCents: number;
    frozenFeeByParty?: Record<string, number> | null;
  },
): Promise<{ collectCents: number; feeBpsByParty: Record<string, number> }> {
  if (!(input.principalCents > 0)) return { collectCents: Math.max(0, input.principalCents || 0), feeBpsByParty: {} };
  const sellers = await resolvePurchaseSellersForCollect(admin, input.lines, input.principalCents, input.subtotalCents, input.tenantId);
  const r = await resolvePassThroughCollect(admin, {
    baseCollectCents: input.principalCents,
    currencyCode: input.orderCurrency,
    sellers,
    frozenByParty: input.frozenFeeByParty ?? null,
  });
  return { collectCents: r.cents, feeBpsByParty: r.feeBpsByParty };
}

/** The same, reading the order's lines (the payment-link checkout has an order id, not lines). */
export async function collectForOrderPrincipal(
  admin: SupabaseClient,
  input: { tenantId: string; orderId: string; orderCurrency: string; principalCents: number; subtotalCents: number },
): Promise<number> {
  // TUL-1366: an order already priced carries its frozen fee; a later plan or
  // fee change must not move what its payment link charges. A failed read keeps
  // the seller's current plan (no snapshot), never an invented rate.
  let frozenFeeByParty: Record<string, number> | null = null;
  try {
    const { data: o } = await admin.from("orders").select("service_fee_by_party").eq("id", input.orderId).maybeSingle();
    const v = (o as { service_fee_by_party?: unknown } | null)?.service_fee_by_party;
    if (v && typeof v === "object" && !Array.isArray(v)) frozenFeeByParty = v as Record<string, number>;
  } catch {
    frozenFeeByParty = null;
  }
  const { data, error } = await admin
    .from("order_lines")
    .select("talent_profile_id, owner_tenant_id, total_cents, talent_cost_cents")
    .eq("order_id", input.orderId);
  if (error) {
    // Never charge less than the principal on a read failure; never guess a fee either. Say so loudly.
    logServerError(`purchase-collect.collectForOrderPrincipal[order=${input.orderId}]`, error);
    return input.principalCents;
  }
  const lines: PurchaseLineForCollect[] = ((data ?? []) as Array<{ talent_profile_id: string | null; owner_tenant_id: string | null; total_cents: number | string | null; talent_cost_cents: number | string | null }>).map((l) => ({
    talentProfileId: l.talent_profile_id,
    ownerTenantId: l.owner_tenant_id,
    totalCents: Number(l.total_cents) || 0,
    talentCostCents: Number(l.talent_cost_cents) || 0,
  }));
  return resolveCollectForPrincipal(admin, { tenantId: input.tenantId, orderCurrency: input.orderCurrency, lines, subtotalCents: input.subtotalCents, principalCents: input.principalCents, frozenFeeByParty });
}
