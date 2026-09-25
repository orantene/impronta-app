/**
 * Stage B3 — open a draft `orders` + line(s) for a talent-owned Agenda booking.
 *
 * Reuses POS owners (`createDraftOrder` / `addLine` / `addCustomLine`). Prefer
 * a published `talent_offerings` row; fall back to a custom line from free-text
 * title so New booking without a catalog pick still gets an order shell.
 */

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";
import { centsToTotalClientRevenue } from "@/lib/money/total-client-revenue";
import { addCustomLine } from "@/lib/pos/custom-line";
import { addLine, createDraftOrder } from "@/lib/pos/draft";
import { logServerError } from "@/lib/server/safe-error";

export type OpenBookingOrderInput = {
  tenantId: string;
  actorUserId: string;
  talentProfileId: string;
  bookingId: string;
  title: string;
  offeringId?: string | null;
  variantId?: string | null;
  addonIds?: readonly string[] | null;
  /** Free-text / fallback amount in cents. Default 0. */
  amountCents?: number | null;
  currency?: string | null;
};

export type OpenBookingOrderResult =
  | { ok: true; orderId: string; totalCents: number; currency: string }
  | { ok: false; reason: "unavailable" | "invalid" };

type OfferingSnap = {
  id: string;
  title: string | null;
  amount_cents: number | null;
  currency: string | null;
  status: string | null;
  tenant_id: string | null;
};

async function readOwnedOffering(
  admin: SupabaseClient,
  offeringId: string,
  talentProfileId: string,
): Promise<OfferingSnap | null> {
  const { data, error } = await admin
    .from("talent_offerings")
    .select("id, title, amount_cents, currency, status, tenant_id")
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.openBookingOrder.offering", error);
    return null;
  }
  return (data as OfferingSnap | null) ?? null;
}

/**
 * After agency_bookings + booking_talent + talent_bookings exist: open draft
 * cart, add catalog or custom line, link `agency_bookings.order_id`, write
 * `total_client_revenue` in major units (cents/100).
 */
export async function openBookingOrderForAgenda(
  admin: SupabaseClient,
  input: OpenBookingOrderInput,
): Promise<OpenBookingOrderResult> {
  const title = input.title.trim() || "Booking";
  const offeringId = input.offeringId?.trim() || null;

  let currency = (input.currency?.trim() || "MXN").toUpperCase();
  let lineLabel = title;
  let fallbackCents = Math.max(
    0,
    Math.trunc(
      typeof input.amountCents === "number" && Number.isFinite(input.amountCents)
        ? input.amountCents
        : 0,
    ),
  );

  let offering: OfferingSnap | null = null;
  if (offeringId) {
    offering = await readOwnedOffering(admin, offeringId, input.talentProfileId);
    if (offering?.status === "published") {
      currency = (offering.currency || currency).toUpperCase();
      lineLabel = offering.title?.trim() || title;
      if (offering.amount_cents != null) {
        fallbackCents = Math.max(0, Math.trunc(Number(offering.amount_cents) || 0));
      }
    } else {
      offering = null;
    }
  }

  const created = await createDraftOrder(admin, {
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    currency,
    context: "talent_agenda",
    sourceChannel: "talent_agenda",
  });
  if (!created.ok) {
    logServerError("agenda.openBookingOrder.draft", created.error);
    return { ok: false, reason: "unavailable" };
  }

  let lineOk = false;
  if (offering) {
    const added = await addLine(admin, {
      tenantId: input.tenantId,
      orderId: created.orderId,
      proposedBy: "staff",
      actorId: input.actorUserId,
      line: {
        offeringId: offering.id,
        units: 1,
        variantId: input.variantId ?? undefined,
        addonIds: input.addonIds ? [...input.addonIds] : undefined,
      },
    });
    if (added.ok) {
      lineOk = true;
    } else {
      // Offering may live on a non-hub tenant while the booking is on hub —
      // still price a custom line from the catalog snapshot.
      logServerError("agenda.openBookingOrder.addLine", added.error ?? added.reason);
    }
  }

  if (!lineOk) {
    const custom = await addCustomLine(admin, {
      tenantId: input.tenantId,
      orderId: created.orderId,
      label: lineLabel.slice(0, 120),
      amountCents: fallbackCents,
      operatorUserId: input.actorUserId,
    });
    if (!custom.ok) {
      logServerError("agenda.openBookingOrder.customLine", custom.reason);
      return { ok: false, reason: custom.reason === "invalid" ? "invalid" : "unavailable" };
    }
  }

  const { data: orderRow, error: orderErr } = await admin
    .from("orders")
    .select("total_cents, currency")
    .eq("id", created.orderId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (orderErr || !orderRow) {
    logServerError("agenda.openBookingOrder.readOrder", orderErr);
    return { ok: false, reason: "unavailable" };
  }

  const totalCents = Math.max(0, Math.trunc(Number((orderRow as { total_cents?: number }).total_cents) || 0));
  const orderCurrency =
    String((orderRow as { currency?: string }).currency || currency).toUpperCase() || currency;
  // agency_bookings.total_client_revenue is NUMERIC major units (A1 helper).
  const revenueMajor = centsToTotalClientRevenue(totalCents);

  const { error: linkErr } = await admin
    .from("agency_bookings")
    .update({
      order_id: created.orderId,
      total_client_revenue: revenueMajor,
      currency_code: orderCurrency,
    })
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId);
  if (linkErr) {
    logServerError("agenda.openBookingOrder.link", linkErr);
    return { ok: false, reason: "unavailable" };
  }

  const leg = computeBookingTalentRowTotals(1, 0, revenueMajor);
  const { error: legErr } = await admin
    .from("booking_talent")
    .update({
      client_charge_rate: revenueMajor,
      client_charge_total: leg.client_charge_total,
      gross_profit: leg.gross_profit,
    })
    .eq("booking_id", input.bookingId)
    .eq("talent_profile_id", input.talentProfileId);
  if (legErr) {
    // Order is linked; leg money is secondary — log and continue.
    logServerError("agenda.openBookingOrder.bookingTalent", legErr);
  }

  const { error: stampErr } = await admin
    .from("order_lines")
    .update({
      booking_id: input.bookingId,
      booking_kind: "agency_booking",
    })
    .eq("order_id", created.orderId)
    .eq("tenant_id", input.tenantId);
  if (stampErr) {
    logServerError("agenda.openBookingOrder.stampLines", stampErr);
  }

  return {
    ok: true,
    orderId: created.orderId,
    totalCents,
    currency: orderCurrency,
  };
}
