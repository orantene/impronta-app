"use server";

/**
 * WS4-PRE-1 — coordinator live-offer hydration.
 *
 * The talent shell has no live inquiry list (`effectiveMessagesInquiries` is
 * the mock `RICH_INQUIRIES`), so `LiveOfferPanel`/`OfferTab` find no real
 * offer for a real-UUID inquiry and render nothing. This loader returns the
 * inquiry's current offer mapped to the exact `RichInquiry["offer"]` (state
 * `Offer`) shape the panel reads, plus the booking id, so a talent_coord can
 * inject it via `injectedOffer` / `injectedBookingId`.
 *
 * Gate: `requireInquiryManagerAction` (WS3) — staff OR the appointed
 * coordinator of THIS inquiry, under the caller's own session. Reads run on
 * the user-scoped client (RLS-authorized); no service-role data path.
 */

import { requireInquiryManagerAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { formatMoneyCents } from "@/lib/talent/earnings-view";
import type { Offer as RichInquiryOffer, OfferLineItem, RequirementRole } from "@/components/admin/shell/internal/state/types";

type LoadCoordinatorInquiryOfferResult =
  | { ok: true; offer: RichInquiryOffer | null; bookingId: string | null }
  | { ok: false; error: string };

/** Map the DB inquiry_offer_status enum to the state Offer.status union. */
function mapOfferStatus(
  s: string | null,
): RichInquiryOffer["status"] {
  switch (s) {
    case "draft":
    case "sent":
    case "accepted":
    case "rejected":
    case "superseded":
      return s;
    case "invalidated":
      return "superseded";
    default:
      return "draft";
  }
}

/** Coarse client-approval derived from the offer status. */
function mapClientApproval(
  s: string | null,
): RichInquiryOffer["clientApproval"] {
  if (s === "accepted") return "accepted";
  if (s === "rejected") return "rejected";
  return "pending";
}

const VALID_ROLES: ReadonlySet<RequirementRole> = new Set([
  "talent",
  "host",
  "model",
  "promoter",
]);

export async function loadCoordinatorInquiryOffer(
  inquiryId: string,
): Promise<LoadCoordinatorInquiryOfferResult> {
  const trimmed = typeof inquiryId === "string" ? inquiryId.trim() : "";
  if (!trimmed) return { ok: false, error: "Missing inquiry." };

  const auth = await requireInquiryManagerAction(trimmed);
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  try {
    // Current offer (via inquiries.current_offer_id) — pinned to this tenant.
    const { data: inq } = await supabase
      .from("inquiries")
      .select("current_offer_id")
      .eq("id", trimmed)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    // Booking id for this inquiry (drives the commission breakdown).
    const { data: booking } = await supabase
      .from("agency_bookings")
      .select("id")
      .eq("source_inquiry_id", trimmed)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    const bookingId = (booking?.id as string | null) ?? null;

    const currentOfferId = (inq?.current_offer_id as string | null) ?? null;
    if (!currentOfferId) {
      return { ok: true, offer: null, bookingId };
    }

    const { data: offerRow } = await supabase
      .from("inquiry_offers")
      .select(
        "id, version, status, total_client_price, currency_code, sent_at, deposit_pct, deposit_amount_cents, balance_collection_method, refund_policy_key",
      )
      .eq("id", currentOfferId)
      .eq("tenant_id", tenantId)
      .maybeSingle();
    if (!offerRow) {
      return { ok: true, offer: null, bookingId };
    }

    const { data: lines } = await supabase
      .from("inquiry_offer_line_items")
      .select("id, total_price, talent_profile_id, label, sort_order, talent_profiles ( display_name )")
      .eq("offer_id", currentOfferId)
      .order("sort_order", { ascending: true });

    type LineRow = {
      id: string;
      total_price: number;
      talent_profile_id: string | null;
      label: string | null;
      talent_profiles: { display_name: string | null } | null;
    };
    const rows = (lines ?? []) as unknown as LineRow[];

    const currencyCode = (offerRow.currency_code as string | null) ?? "USD";
    const totalUnits = Number(offerRow.total_client_price ?? 0);
    const totalCents = Math.round(totalUnits * 100);
    const offerStatus = mapOfferStatus(offerRow.status as string | null);

    const lineItems: OfferLineItem[] = rows.map((r) => ({
      talentName: r.talent_profiles?.display_name ?? r.label ?? "Talent",
      thumb: "",
      role: "talent" as RequirementRole,
      fee: formatMoneyCents(Math.round(Number(r.total_price ?? 0) * 100), currencyCode),
      status: offerStatus === "accepted" ? "accepted" : "pending",
    }));
    void VALID_ROLES;

    // Negotiated commercial terms for the read-only summary (W6a columns).
    let commercialTerms: RichInquiryOffer["commercialTerms"] = null;
    {
      const { readOfferTermsFromRow } = await import(
        "@/lib/billing/offer-commercial-terms"
      );
      commercialTerms =
        readOfferTermsFromRow(
          {
            deposit_pct: offerRow.deposit_pct as number | string | null,
            deposit_amount_cents: offerRow.deposit_amount_cents as number | string | null,
            balance_collection_method: offerRow.balance_collection_method as string | null,
            refund_policy_key: offerRow.refund_policy_key as string | null,
          },
          totalCents,
        ) ?? null;
    }

    const sentAtRaw = (offerRow.sent_at as string | null) ?? null;

    const offer: RichInquiryOffer = {
      id: offerRow.id as string,
      version: (offerRow.version as number | null) ?? 1,
      status: offerStatus,
      total: totalCents > 0 ? formatMoneyCents(totalCents, currencyCode) : "",
      sentAt: sentAtRaw,
      lineItems,
      clientApproval: mapClientApproval(offerRow.status as string | null),
      commercialTerms,
      totalCents,
      currencyCode,
    };

    return { ok: true, offer, bookingId };
  } catch (err) {
    logServerError("talent.coordinator-offer-loader.loadCoordinatorInquiryOffer", err);
    return { ok: false, error: "Could not load the offer." };
  }
}
