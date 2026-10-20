"use server";

import { loadCatalog } from "@/lib/orders/purchase-catalog";
import { pricePurchase } from "@/lib/orders/purchase-pricing";
import { resolveOrderCurrency } from "@/lib/orders/display-currency";
import { resolvePurchasePolicy } from "@/lib/orders/purchase-policy";
import { instantBookPaymentChoice } from "@/lib/scheduling/instant-book-payment-choice";
import { offeringIsQuotable, sanitizeQuoteAddOnIds } from "@/lib/orders/checkout-quote-gate";
import { quoteCheckoutCollect } from "@/lib/orders/checkout-quote";
import type { CheckoutQuote } from "@/lib/orders/checkout-quote-display";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { travelFeeOnDayCents } from "@/lib/orders/travel-fee";
import { offeringWhereFromAttributes } from "@/lib/talent/offering-request-detail";
import { loadSellingDefaultsByTalent } from "@/lib/talent/offering-policy-server";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    // Public + service role: quote only what a guest may already see and buy (D-10), before anything else.
    if (!(await offeringIsQuotable(admin, input.offeringId))) return { ok: false };
    const addOnIds = sanitizeQuoteAddOnIds(input.addOnIds);
    if (!addOnIds) return { ok: false };
    const catalog = await loadCatalog(admin, [input.offeringId]);
    if (!catalog.ok) return { ok: false };
    const offeringPolicy = catalog.policies.get(input.offeringId);
    const offering = catalog.offerings.get(input.offeringId);
    if (!offeringPolicy?.tenantId || !offering) return { ok: false };
    const line = { offeringId: input.offeringId, units: 1, variantId: input.variantId ?? null, addonIds: addOnIds };
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
    const travel = await quoteTravelFeeOnDay(admin, input.offeringId, offering.talentProfileId);
    return { ok: true, quote: travel > 0 ? { ...quote, travelFeeOnDayCents: travel } : quote };
  } catch (err) {
    logServerError("orders.quoteBookingCollect", err);
    return { ok: false };
  }
}

/**
 * E5 (TUL-1270 M2): the talent's travel fee for a home visit, shown as paid on the day.
 * Display only, never added to the online charge. A failed read shows no line (logged).
 */
async function quoteTravelFeeOnDay(admin: SupabaseClient, offeringId: string, talentProfileId: string | null): Promise<number> {
  if (!talentProfileId) return 0;
  const { data, error } = await admin.from("talent_offerings").select("attributes").eq("id", offeringId).maybeSingle();
  if (error) {
    logServerError("orders.quoteBookingCollect/travelWhere", error);
    return 0;
  }
  const where = offeringWhereFromAttributes((data as { attributes?: Record<string, unknown> | null } | null)?.attributes ?? null);
  if (where.length === 0) return 0;
  const defaults = await loadSellingDefaultsByTalent(admin, [talentProfileId]);
  if (!defaults.ok) return 0;
  return travelFeeOnDayCents({ where, sellingDefaults: defaults.defaults.get(talentProfileId) ?? null });
}
