/**
 * The promo side of a quote (Promos v1): the discount the purchase pipeline will record, read without
 * holding anything. One helper behind `previewBookingQuoteAction` and `quoteSelectionAction`, so the
 * sheet's promo breakdown and its "you pay now" can never disagree.
 */
import "server-only";

import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PricedLine } from "@/lib/orders/purchase-pricing";
import { bookingPromoRequest } from "@/lib/scheduling/instant-book-promo";
import { PROMO_COOKIE, PROMO_VIA_COOKIE } from "@/lib/promos/share/cookies";
import { bookingCartLines, quoteBooking } from "@/lib/promos/booking-quote.server";
import { bookingPreviewView, type BookingPreview } from "@/lib/promos/booking-preview-view";
import type { PriceContext } from "./context.server";

export async function previewPromoForLines(
  admin: SupabaseClient,
  ctx: PriceContext,
  input: {
    lines: readonly PricedLine[];
    startsAt?: string | null;
    promoCode?: string | null;
    contact?: { email?: string | null; phone?: string | null } | null;
  },
): Promise<{ ok: true; preview: BookingPreview } | { ok: false }> {
  const jar = await cookies();
  const req = bookingPromoRequest({
    promoCode: input.promoCode,
    linkCookie: jar.get(PROMO_COOKIE)?.value ?? null,
    viaCookie: jar.get(PROMO_VIA_COOKIE)?.value ?? null,
  });
  const { catalog } = ctx;
  const lines = input.lines.map((l) => ({
    offeringId: l.offeringId,
    kind: catalog.rawOfferings.get(l.offeringId)?.kind ?? "service",
    totalCents: l.totalCents,
    addons: l.addonIds.map((id) => ({ id, cents: catalog.addons.get(id)?.amountCents ?? 0 })),
  }));
  const cart = bookingCartLines(lines, { currency: ctx.currency, appointmentStart: input.startsAt ?? null });
  const q = await quoteBooking(admin, {
    tenantId: ctx.tenantId,
    talentProfileId: ctx.talentProfileId,
    lines: cart,
    contact: { email: input.contact?.email ?? null, phone: input.contact?.phone ?? null },
    code: req.code,
    linkPromoIds: req.linkPromoIds,
  });
  if (!q.ok) return { ok: false };
  const labels = new Map<string, string>();
  for (const l of input.lines) {
    labels.set(l.offeringId, catalog.offerings.get(l.offeringId)?.label ?? "");
    for (const id of l.addonIds) {
      const a = catalog.addons.get(id);
      if (a) labels.set(id, a.label);
    }
  }
  return { ok: true, preview: bookingPreviewView({ cart, value: q.value, labels, linkPromoIds: req.linkPromoIds ?? [] }) };
}
