/**
 * Checkout collect amount for `createPurchase`: deposit/full principal from the
 * (possibly discounted) order total, then pass_through inflation per resolved
 * owning party.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
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
  const sellers = await resolvePurchaseSellersForCollect(
    admin,
    input.lines,
    baseCollectCents,
    input.subtotalCents,
    input.tenantId,
  );
  const collectCents = await resolvePassThroughCollectCents(admin, {
    baseCollectCents,
    currencyCode: input.orderCurrency,
    sellers,
  });
  return { baseCollectCents, collectCents };
}
