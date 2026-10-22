/**
 * priceSelection: lines -> promo-adjusted total -> principal -> card fee -> balance, for DISPLAY (TUL-1298).
 *
 * It composes the functions `createPurchase` charges with: `pricePurchase` (lines), `priceDueNow` (the
 * same `amountToCollectCents` floor) and `resolveCheckoutCollectCents` (the same pass-through gross-up).
 * Nothing here is imported by a charging path (`price-module-invariance.test.ts` enforces that), so
 * showing a price can never change one.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveCheckoutCollectCents } from "@/lib/orders/purchase-collect";
import { resolvePurchasePolicy, type PaymentChoice, type PolicyRefusal } from "@/lib/orders/purchase-policy";
import type { PricingRefusal } from "@/lib/orders/purchase-pricing";
import type { SelectionContext } from "./context.server";
import { priceLines } from "./lines";
import { priceDueNow } from "./rules";
import type { PriceBreakdown, SelectionLine } from "./types";

export type CollectResolver = typeof resolveCheckoutCollectCents;

export async function priceSelection(
  admin: SupabaseClient,
  ctx: SelectionContext,
  input: { lines: readonly SelectionLine[]; paymentChoice: PaymentChoice; discountCents: number },
  deps: { resolveCollect?: CollectResolver } = {},
): Promise<{ ok: true; breakdown: PriceBreakdown } | PricingRefusal | PolicyRefusal> {
  const { catalog } = ctx;
  const priced = priceLines(
    { offerings: catalog.offerings, variants: catalog.variants, addons: catalog.addons },
    input.lines.map((l) => ({ offeringId: l.offeringId, units: l.units, variantId: l.variantId ?? null, addonIds: [...(l.addonIds ?? [])] })),
  );
  if (!priced.ok) return priced;
  const policy = resolvePurchasePolicy(
    {
      clientOrderKey: "quote",
      tenantId: ctx.tenantId,
      actorUserId: null,
      paymentChoice: input.paymentChoice,
      lines: input.lines.map((l) => ({ offeringId: l.offeringId, units: l.units })),
    },
    catalog.policies,
  );
  if (!policy.ok) return policy;
  const due = priceDueNow({
    subtotalCents: priced.subtotalCents,
    discountCents: input.discountCents,
    collect: policy.collect,
    depositPct: policy.depositPct,
    payInPerson: policy.payInPerson,
  });
  const { baseCollectCents, collectCents } = await (deps.resolveCollect ?? resolveCheckoutCollectCents)(admin, {
    tenantId: ctx.tenantId,
    orderCurrency: ctx.currency,
    lines: priced.lines,
    subtotalCents: priced.subtotalCents,
    totalCents: due.totalCents,
    collect: policy.collect,
    depositPct: policy.depositPct,
    payInPerson: policy.payInPerson,
  });
  return {
    ok: true,
    breakdown: {
      ...due,
      principalCents: baseCollectCents,
      balanceCents: Math.max(0, due.totalCents - baseCollectCents),
      currency: ctx.currency,
      lines: priced.lines,
      collectCents,
      cardFeeCents: Math.max(0, collectCents - baseCollectCents),
      collect: policy.collect,
      depositPct: policy.depositPct,
      payInPerson: policy.payInPerson,
      travelFeeOnDayCents: ctx.travelFeeOnDayCents,
    },
  };
}
