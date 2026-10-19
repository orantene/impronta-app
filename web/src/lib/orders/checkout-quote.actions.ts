"use server";

import { loadCatalog } from "@/lib/orders/purchase-catalog";
import { pricePurchase } from "@/lib/orders/purchase-pricing";
import { resolveOrderCurrency } from "@/lib/orders/display-currency";
import { resolvePurchasePolicy } from "@/lib/orders/purchase-policy";
import { instantBookPaymentChoice } from "@/lib/scheduling/instant-book-payment-choice";
import { quoteCheckoutCollect } from "@/lib/orders/checkout-quote";
import type { CheckoutQuote } from "@/lib/orders/checkout-quote-display";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/**
 * Read-only: what Checkout will collect for this booking (principal + pass-through card fee), so the
 * sheet can show the fee before Stripe. Same catalog rows, same pricing, same collect function as
 * `createPurchase`. Creates nothing and holds nothing.
 */
export async function quoteBookingCollectAction(input: {
  offeringId: string;
  variantId?: string | null;
  addOnIds?: string[];
}): Promise<{ ok: true; quote: CheckoutQuote } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin || !input.offeringId) return { ok: false };
    const catalog = await loadCatalog(admin, [input.offeringId]);
    if (!catalog.ok) return { ok: false };
    const offeringPolicy = catalog.policies.get(input.offeringId);
    const offering = catalog.offerings.get(input.offeringId);
    if (!offeringPolicy?.tenantId || !offering) return { ok: false };
    const line = { offeringId: input.offeringId, units: 1, variantId: input.variantId ?? null, addonIds: input.addOnIds ?? [] };
    const priced = pricePurchase([line], { offerings: catalog.offerings, variants: catalog.variants, addons: catalog.addons });
    if (!priced.ok) return { ok: false };
    const ccy = resolveOrderCurrency([offering.currency ?? null]);
    if (!ccy.ok) return { ok: false };
    const policy = resolvePurchasePolicy(
      {
        clientOrderKey: "quote",
        tenantId: offeringPolicy.tenantId,
        actorUserId: null,
        paymentChoice: instantBookPaymentChoice(false, offeringPolicy.reserveMode),
        lines: [{ offeringId: input.offeringId, units: 1 }],
      },
      catalog.policies,
    );
    if (!policy.ok) return { ok: false };
    const quote = await quoteCheckoutCollect(admin, {
      tenantId: offeringPolicy.tenantId,
      orderCurrency: ccy.currency,
      lines: priced.lines,
      subtotalCents: priced.subtotalCents,
      totalCents: priced.subtotalCents,
      collect: policy.collect,
      depositPct: policy.depositPct,
      payInPerson: policy.payInPerson,
    });
    return { ok: true, quote };
  } catch (err) {
    logServerError("orders.quoteBookingCollect", err);
    return { ok: false };
  }
}
