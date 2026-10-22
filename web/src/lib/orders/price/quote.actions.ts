"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { offeringIsQuotable, sanitizeQuoteAddOnIds } from "@/lib/orders/checkout-quote-gate";
import { instantBookPaymentChoice } from "@/lib/scheduling/instant-book-payment-choice";
import { PAYMENT_CHOICES, type PaymentChoice } from "@/lib/orders/purchase-policy";
import type { BookingPreview } from "@/lib/promos/booking-preview-view";
import { loadPriceContext } from "./context.server";
import { previewPromoForLines } from "./promo-preview.server";
import { priceSelection } from "./selection.server";
import type { PriceBreakdown } from "./types";

const MAX_QUOTE_LINES = 20;
/** Matches `MAX_UNITS_PER_LINE` in the policy; the pipeline refuses anything fractional or above it. */
const MAX_QUOTE_UNITS = 999;

/**
 * Read-only: what this selection costs and what is charged now, with the promo the purchase would apply
 * (typed code, plus the link cookie read here on the server). The ONE quote every display surface renders.
 * Creates nothing and holds nothing. Public + service role, so it only quotes what a guest may already
 * buy (`offeringIsQuotable`), checked before anything is loaded. The tenant is resolved from the
 * offerings, never from the request.
 */
export async function quoteSelectionAction(input: {
  lines: Array<{ offeringId: string; units?: number; variantId?: string | null; addOnIds?: string[] }>;
  paymentChoice?: PaymentChoice | null;
  promoCode?: string | null;
  contact?: { email?: string | null; phone?: string | null } | null;
  startsAt?: string | null;
}): Promise<{ ok: true; breakdown: PriceBreakdown; promo: BookingPreview | null } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin || !Array.isArray(input.lines) || input.lines.length === 0 || input.lines.length > MAX_QUOTE_LINES) return { ok: false };
    const lines = [];
    for (const l of input.lines) {
      if (!l || typeof l.offeringId !== "string" || !l.offeringId) return { ok: false };
      const units = l.units ?? 1;
      if (!Number.isSafeInteger(units) || units < 1 || units > MAX_QUOTE_UNITS) return { ok: false };
      if (!(await offeringIsQuotable(admin, l.offeringId))) return { ok: false };
      const addOnIds = sanitizeQuoteAddOnIds(l.addOnIds);
      if (!addOnIds) return { ok: false };
      lines.push({ offeringId: l.offeringId, units, variantId: l.variantId ?? null, addonIds: addOnIds });
    }
    const loaded = await loadPriceContext(admin, { offeringIds: lines.map((l) => l.offeringId) });
    if (!loaded.ok) return { ok: false };
    const { ctx } = loaded;
    const first = ctx.catalog.policies.get(lines[0]!.offeringId);
    const choice: PaymentChoice =
      input.paymentChoice && PAYMENT_CHOICES.includes(input.paymentChoice)
        ? input.paymentChoice
        : instantBookPaymentChoice(false, first?.reserveMode);

    // Pass 1: list lines and policy (no discount) so the promo engine prices the same lines the pipeline does.
    const list = await priceSelection(admin, ctx, { lines, paymentChoice: choice, discountCents: 0 });
    if (!list.ok) return { ok: false };
    const promo = await previewPromoForLines(admin, ctx, {
      lines: list.breakdown.lines,
      startsAt: input.startsAt ?? null,
      promoCode: input.promoCode ?? null,
      contact: input.contact ?? null,
    });
    const preview = promo.ok ? promo.preview : null;
    const discountCents = preview?.discountCents ?? 0;
    if (discountCents <= 0) return { ok: true, breakdown: list.breakdown, promo: preview };
    // Pass 2: the same lines, now with the discount, so the deposit and card fee are on the promo-adjusted total.
    const final = await priceSelection(admin, ctx, { lines, paymentChoice: choice, discountCents });
    if (!final.ok) return { ok: false };
    return { ok: true, breakdown: final.breakdown, promo: preview };
  } catch (err) {
    logServerError("orders.quoteSelection", err);
    return { ok: false };
  }
}
