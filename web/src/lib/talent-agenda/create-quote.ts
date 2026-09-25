/**
 * G2.2 — Talent event/project quote drafts that write real rows.
 * Event: draft inquiry + draft inquiry_offers (+ optional date hold).
 * Project: draft agency_bookings + booking_deliverables.due_at (no appointment).
 */

"use server";

import { revalidatePath } from "next/cache";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { getActiveTalentAgencyContext } from "@/lib/talent/active-agency-context";
import { createTalentAvailabilityBlock } from "@/lib/talent-calendar/actions";
import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";

export type QuoteActionResult =
  | { ok: true; inquiryId?: string; offerId?: string; bookingId?: string }
  | { ok: false; reason: string; message?: string };

async function ownTalentIdentity(): Promise<{
  talentId: string;
  userId: string;
} | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (typeof data?.id !== "string") return null;
  return { talentId: data.id, userId: user.id };
}

/**
 * T7.2 Event quote — draft inquiry + draft offer. Optional date hold as block.
 * Nothing else is reserved until the client accepts.
 */
export async function createOwnEventQuote(input: {
  what: string;
  eventDate: string; // YYYY-MM-DD
  holdDate?: boolean;
}): Promise<QuoteActionResult> {
  const identity = await ownTalentIdentity();
  if (!identity) return { ok: false, reason: "unauthorized" };

  const what = input.what.trim();
  if (!what) return { ok: false, reason: "invalid", message: "Describe the event." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.eventDate)) {
    return { ok: false, reason: "invalid", message: "Pick an event date." };
  }

  const agency = await getActiveTalentAgencyContext(identity.talentId);
  if (!agency?.tenantId) {
    return { ok: false, reason: "no_agency", message: "Link an agency workspace first." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: inquiry, error: inqErr } = await admin
    .from("inquiries")
    .insert({
      tenant_id: agency.tenantId,
      owner_user_id: identity.userId,
      contact_name: "Quote draft",
      contact_email: `quote-draft+${identity.userId.slice(0, 8)}@tulala.local`,
      message: what,
      event_date: input.eventDate,
      source_type: "manual",
      status: "coordination",
      uses_new_engine: true,
    })
    .select("id")
    .single();

  if (inqErr || !inquiry) {
    logServerError("agenda.eventQuote.inquiry", inqErr);
    return { ok: false, reason: "unavailable", message: "Could not start the quote." };
  }

  const inquiryId = inquiry.id as string;

  const { data: offer, error: offerErr } = await admin
    .from("inquiry_offers")
    .insert({
      inquiry_id: inquiryId,
      tenant_id: agency.tenantId,
      created_by_user_id: identity.userId,
      currency_code: "MXN",
      status: "draft",
      deposit_amount_cents: 0,
    })
    .select("id")
    .single();

  if (offerErr || !offer) {
    logServerError("agenda.eventQuote.offer", offerErr);
    await admin.from("inquiries").delete().eq("id", inquiryId);
    return { ok: false, reason: "unavailable", message: "Could not create the offer draft." };
  }

  await admin
    .from("inquiries")
    .update({ current_offer_id: offer.id as string })
    .eq("id", inquiryId);

  if (input.holdDate) {
    const starts = new Date(`${input.eventDate}T10:00:00`);
    const ends = new Date(`${input.eventDate}T18:00:00`);
    const hold = await createTalentAvailabilityBlock({
      talentProfileId: identity.talentId,
      reason: `Event hold · ${what}`,
      note: "Optional date hold while the quote is out. Other requests still show.",
      startsAt: starts.toISOString(),
      endsAt: ends.toISOString(),
      allDay: false,
    });
    if (!hold.ok) {
      // Quote rows exist; hold is optional — surface but keep success.
      revalidatePath("/", "layout");
      return {
        ok: true,
        inquiryId,
        offerId: offer.id as string,
      };
    }
  }

  revalidatePath("/", "layout");
  return { ok: true, inquiryId, offerId: offer.id as string };
}

/**
 * T7.3 Project quote — draft commercial booking (no calendar appointment) + deliverable due dates.
 */
export async function createOwnProjectQuote(input: {
  scope: string;
  dueDate?: string; // YYYY-MM-DD
  deliverables?: string[];
}): Promise<QuoteActionResult> {
  const identity = await ownTalentIdentity();
  if (!identity) return { ok: false, reason: "unauthorized" };

  const scope = input.scope.trim();
  if (!scope) return { ok: false, reason: "invalid", message: "Describe the project scope." };

  const agency = await getActiveTalentAgencyContext(identity.talentId);
  if (!agency?.tenantId) {
    return { ok: false, reason: "no_agency", message: "Link an agency workspace first." };
  }

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: booking, error: bookErr } = await admin
    .from("agency_bookings")
    .insert({
      tenant_id: agency.tenantId,
      owner_staff_id: identity.userId,
      created_by_staff_id: identity.userId,
      title: scope,
      status: "draft" as never,
      payment_status: "unpaid" as never,
      currency_code: "MXN",
      starts_at: null,
      ends_at: null,
      contact_name: "Project quote",
      source_type_snapshot: "manual",
      internal_notes: "Project quote drafted by talent. No appointment until accepted.",
    })
    .select("id")
    .single();

  if (bookErr || !booking) {
    logServerError("agenda.projectQuote.booking", bookErr);
    return { ok: false, reason: "unavailable" };
  }

  const bookingId = booking.id as string;
  const totals = computeBookingTalentRowTotals(1, 0, 0);
  await admin.from("booking_talent").insert({
    tenant_id: agency.tenantId,
    booking_id: bookingId,
    talent_profile_id: identity.talentId,
    sort_order: 0,
    units: 1,
    pricing_unit: "event" as never,
    talent_cost_rate: 0,
    client_charge_rate: 0,
    talent_cost_total: totals.talent_cost_total,
    client_charge_total: totals.client_charge_total,
    gross_profit: totals.gross_profit,
  });

  const lines =
    input.deliverables && input.deliverables.length > 0
      ? input.deliverables.map((t) => t.trim()).filter(Boolean)
      : [scope];

  const dueAt =
    input.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)
      ? new Date(`${input.dueDate}T17:00:00`).toISOString()
      : null;

  for (const title of lines) {
    const { error: delErr } = await admin.from("booking_deliverables").insert({
      tenant_id: agency.tenantId,
      booking_id: bookingId,
      title,
      kind: "service",
      status: "draft",
      due_at: dueAt,
      notes: "From project quote",
    });
    if (delErr) logServerError("agenda.projectQuote.deliverable", delErr);
  }

  revalidatePath("/", "layout");
  return { ok: true, bookingId };
}
