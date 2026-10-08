import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";

import { ensureAcceptedOfferPayment, previewAcceptedOfferCollection } from "./accept-offer-payment";
import type { ConfirmBookingStore, ConfirmFacts, ConfirmOfferRow } from "./talent-confirm-booking";

/**
 * Production store for `talent-confirm-booking.ts`. Every read is pinned to the
 * tenant the INQUIRY row names (resolved server-side by the caller, never taken
 * from the client) and checks its error: an unreadable fact is "unavailable",
 * never "no booking" (that would let a second booking through).
 */

type Ctx = { admin: SupabaseClient; tenantId: string; inquiryId: string; publicOrigin: string };

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

type OfferDbRow = {
  id: string;
  version: number | string;
  status: string;
  total_client_price: number | string | null;
  currency_code: string | null;
  created_by_user_id: string | null;
  deposit_pct: number | string | null;
  deposit_amount_cents: number | string | null;
};

export function productionConfirmStore(c: Ctx): ConfirmBookingStore {
  const scoped = (table: string) => tenantScopedQuery(c.admin, table, c.tenantId);

  async function loadFacts(): Promise<{ ok: true; facts: ConfirmFacts } | { ok: false }> {
    // The NEWEST offer: a newer draft after an accepted one is not "accepted".
    const offerRes = await scoped("inquiry_offers")
      .select("id, version, status, total_client_price, currency_code, created_by_user_id, deposit_pct, deposit_amount_cents")
      .eq("inquiry_id", c.inquiryId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (offerRes.error) {
      logServerError("messaging.talentConfirm.offer", offerRes.error);
      return { ok: false };
    }
    const row = offerRes.data as OfferDbRow | null;

    let offer: ConfirmOfferRow | null = null;
    if (row) {
      const linesRes = await scoped("inquiry_offer_line_items").select("talent_profile_id").eq("offer_id", row.id);
      if (linesRes.error) {
        logServerError("messaging.talentConfirm.lines", linesRes.error);
        return { ok: false };
      }
      const lineTalentIds = [...new Set(((linesRes.data ?? []) as Array<{ talent_profile_id: string | null }>).map((l) => l.talent_profile_id).filter((x): x is string => Boolean(x)))];
      const total = num(row.total_client_price);
      offer = {
        id: row.id,
        version: Number(row.version),
        status: row.status,
        totalCents: total == null ? 0 : Math.round(total * 100),
        currency: row.currency_code ? row.currency_code.toUpperCase() : null,
        createdByUserId: row.created_by_user_id ?? null,
        depositPct: num(row.deposit_pct),
        depositCents: num(row.deposit_amount_cents),
        lineTalentIds,
      };
    }

    let paymentRequested = false;
    if (offer) {
      const cardRes = await scoped("inquiry_messages")
        .select("id")
        .eq("inquiry_id", c.inquiryId)
        .in("message_kind", ["payment_request", "booking_confirmed"])
        .contains("card_payload", { offerId: offer.id })
        .limit(1);
      if (cardRes.error) {
        logServerError("messaging.talentConfirm.card", cardRes.error);
        return { ok: false };
      }
      paymentRequested = (cardRes.data ?? []).length > 0;
    }
    const bookingRes = await scoped("agency_bookings")
      .select("id, order_id")
      .eq("source_inquiry_id", c.inquiryId)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (bookingRes.error) {
      logServerError("messaging.talentConfirm.booking", bookingRes.error);
      return { ok: false };
    }
    const b = bookingRes.data as { id: string; order_id: string | null } | null;
    // Ours = an order stands behind it, or this offer's own confirmation card exists
    // (the pay-in-person path books with no order). Anything else is another path's.
    const booking = b ? { id: b.id, origin: b.order_id || paymentRequested ? ("ours" as const) : ("foreign" as const) } : null;

    return { ok: true, facts: { offer, booking, paymentRequested } };
  }

  return {
    loadFacts,
    run: (offer, createdByUserId) =>
      ensureAcceptedOfferPayment(c.admin, {
        tenantId: c.tenantId,
        inquiryId: c.inquiryId,
        offerCreatedBy: createdByUserId,
        publicOrigin: c.publicOrigin,
        offer,
      }),
    previewCollection: (offer, createdByUserId) =>
      previewAcceptedOfferCollection(c.admin, { tenantId: c.tenantId, inquiryId: c.inquiryId, offerCreatedBy: createdByUserId, offer }),
  };
}
