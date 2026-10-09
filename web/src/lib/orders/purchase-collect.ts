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
  resolvePassThroughCollectCents,
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
): Promise<{ baseCollectCents: number; collectCents: number }> {
  const baseCollectCents = amountToCollectCents(
    input.totalCents,
    input.collect,
    input.depositPct,
  );
  if (!(baseCollectCents > 0) || input.payInPerson) {
    return { baseCollectCents, collectCents: baseCollectCents };
  }
  const collectCents = await resolveCollectForPrincipal(admin, {
    tenantId: input.tenantId,
    orderCurrency: input.orderCurrency,
    lines: input.lines,
    subtotalCents: input.subtotalCents,
    principalCents: baseCollectCents,
  });
  return { baseCollectCents, collectCents };
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
  },
): Promise<number> {
  if (!(input.principalCents > 0)) return Math.max(0, input.principalCents || 0);
  const sellers = await resolvePurchaseSellersForCollect(admin, input.lines, input.principalCents, input.subtotalCents, input.tenantId);
  return resolvePassThroughCollectCents(admin, { baseCollectCents: input.principalCents, currencyCode: input.orderCurrency, sellers });
}

/** The same, reading the order's lines (the payment-link checkout has an order id, not lines). */
export async function collectForOrderPrincipal(
  admin: SupabaseClient,
  input: { tenantId: string; orderId: string; orderCurrency: string; principalCents: number; subtotalCents: number },
): Promise<number> {
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
  return resolveCollectForPrincipal(admin, { tenantId: input.tenantId, orderCurrency: input.orderCurrency, lines, subtotalCents: input.subtotalCents, principalCents: input.principalCents });
}
