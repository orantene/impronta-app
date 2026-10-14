"use server";

import { cookies } from "next/headers";

import { loadCatalog } from "@/lib/orders/purchase-catalog";
import { pricePurchase } from "@/lib/orders/purchase-pricing";
import { resolveOrderCurrency } from "@/lib/orders/display-currency";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { bookingPromoRequest } from "@/lib/scheduling/instant-book-promo";
import { PROMO_COOKIE, PROMO_VIA_COOKIE } from "@/lib/promos/share/cookies";

import { bookingCartLines, quoteBooking } from "./booking-quote.server";
import { bookingPreviewView, type BookingPreview } from "./booking-preview-view";

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
    const catalog = await loadCatalog(admin, [input.offeringId]);
    if (!catalog.ok) return { ok: false };
    const policy = catalog.policies.get(input.offeringId);
    const offering = catalog.offerings.get(input.offeringId);
    if (!policy?.tenantId || !offering) return { ok: false };
    const units = Math.max(1, Math.min(99, Math.trunc(input.quantity ?? 1)));
    const priced = pricePurchase(
      [{ offeringId: input.offeringId, units, variantId: input.variantId ?? null, addonIds: input.addOnIds ?? [] }],
      { offerings: catalog.offerings, variants: catalog.variants, addons: catalog.addons },
    );
    if (!priced.ok) return { ok: false };
    const ccy = resolveOrderCurrency([offering.currency ?? null]);
    if (!ccy.ok) return { ok: false };

    const jar = await cookies();
    const req = bookingPromoRequest({
      promoCode: input.promoCode,
      linkCookie: jar.get(PROMO_COOKIE)?.value ?? null,
      viaCookie: jar.get(PROMO_VIA_COOKIE)?.value ?? null,
    });
    const lines = priced.lines.map((l) => ({
      offeringId: l.offeringId,
      kind: catalog.rawOfferings.get(l.offeringId)?.kind ?? "service",
      totalCents: l.totalCents,
      addons: l.addonIds.map((id) => ({ id, cents: catalog.addons.get(id)?.amountCents ?? 0 })),
    }));
    const cart = bookingCartLines(lines, { currency: ccy.currency, appointmentStart: input.startsAt ?? null });
    const q = await quoteBooking(admin, {
      tenantId: policy.tenantId,
      lines: cart,
      contact: { email: input.contactEmail ?? null, phone: input.contactPhone ?? null },
      code: req.code,
      linkPromoIds: req.linkPromoIds,
    });
    if (!q.ok) return { ok: false };
    const labels = new Map<string, string>();
    labels.set(input.offeringId, offering.label);
    for (const id of input.addOnIds ?? []) {
      const a = catalog.addons.get(id);
      if (a) labels.set(id, a.label);
    }
    return { ok: true, preview: bookingPreviewView({ cart, value: q.value, labels, linkPromoIds: req.linkPromoIds }) };
  } catch (err) {
    logServerError("promos.previewBookingQuote", err);
    return { ok: false };
  }
}
