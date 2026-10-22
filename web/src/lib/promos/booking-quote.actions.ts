"use server";

import { MAX_UNITS_PER_LINE } from "@/lib/orders/purchase-policy";
import { loadPriceContext } from "@/lib/orders/price/context.server";
import { priceLines } from "@/lib/orders/price/lines";
import { previewPromoForLines } from "@/lib/orders/price/promo-preview.server";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import type { BookingPreview } from "./booking-preview-view";

/**
 * Read-only booking quote for the sheet's pay step (Promos v1). Same engine,
 * same rows and same catalog prices as the purchase pipeline, so the breakdown
 * the client sees is the amount Stripe charges. Holds NOTHING: a preview must
 * never take a promo use away from someone else.
 */
export type BookingPreviewInput = {
  offeringId: string;
  variantId?: string | null;
  addOnIds?: string[];
  quantity?: number;
  /** Appointment start (ISO) for timed services; null for purchases. */
  startsAt?: string | null;
  promoCode?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
};

export async function previewBookingQuoteAction(
  input: BookingPreviewInput,
): Promise<{ ok: true; preview: BookingPreview } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin || !input.offeringId) return { ok: false };
    const loaded = await loadPriceContext(admin, { offeringIds: [input.offeringId], withTravel: false });
    if (!loaded.ok) return { ok: false };
    // The same whole-unit ceiling the checkout enforces (999), not the old 99 that undercounted a crafted request.
    const units = Math.max(1, Math.min(MAX_UNITS_PER_LINE, Math.trunc(input.quantity ?? 1)));
    const { catalog } = loaded.ctx;
    const priced = priceLines(
      { offerings: catalog.offerings, variants: catalog.variants, addons: catalog.addons },
      [{ offeringId: input.offeringId, units, variantId: input.variantId ?? null, addonIds: input.addOnIds ?? [] }],
    );
    if (!priced.ok) return { ok: false };
    return await previewPromoForLines(admin, loaded.ctx, {
      lines: priced.lines,
      startsAt: input.startsAt ?? null,
      promoCode: input.promoCode ?? null,
      contact: { email: input.contactEmail ?? null, phone: input.contactPhone ?? null },
    });
  } catch (err) {
    logServerError("promos.previewBookingQuote", err);
    return { ok: false };
  }
}
