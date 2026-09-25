/**
 * G0.2 / Stage B1 — Convert a talent-owned hold into a confirmed commercial
 * booking on the platform hub (talent as seller).
 */

"use server";

import { revalidatePath } from "next/cache";
import { logServerError } from "@/lib/server/safe-error";
import { loadBusyIntervals } from "@/lib/scheduling/load-busy";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { computeBookingTalentRowTotals } from "@/lib/booking-pricing";
import { resolveTalentOwnWorkTenant } from "@/lib/talent-agenda/own-work-tenant";

export type ConvertOwnHoldResult =
  | { ok: true; bookingId: string; already?: boolean }
  | { ok: false; reason: string; message?: string };

/**
 * Turn a talent_holds row into agency_bookings + talent_bookings on the hub,
 * then delete the hold. Payment stays unpaid until collected.
 */
export async function convertOwnTalentHold(holdId: string): Promise<ConvertOwnHoldResult> {
  if (!holdId) return { ok: false, reason: "missing" };
  const actor = await loadTalentActor();
  if (!actor.ok) return { ok: false, reason: "unauthorized" };

  const admin = actor.admin;
  const ownTenant = await resolveTalentOwnWorkTenant();
  if (!ownTenant.ok) {
    return { ok: false, reason: "no_hub", message: "Platform hub is not available." };
  }
  const tenantId = ownTenant.tenantId;

  const { data: hold, error: holdErr } = await admin
    .from("talent_holds")
    .select(
      "id, talent_profile_id, tenant_id, title, client_label, starts_at, ends_at, all_day, inquiry_id",
    )
    .eq("id", holdId)
    .maybeSingle();
  if (holdErr) {
    logServerError("agenda.convertHold.load", holdErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!hold) return { ok: false, reason: "not_found" };
  if (hold.talent_profile_id !== actor.talentProfileId) {
    return { ok: false, reason: "unauthorized" };
  }

  const startsAt = new Date(hold.starts_at);
  const endsAt = new Date(hold.ends_at);
  if (
    Number.isNaN(startsAt.getTime()) ||
    Number.isNaN(endsAt.getTime()) ||
    endsAt.getTime() <= startsAt.getTime()
  ) {
    return { ok: false, reason: "invalid", message: "Hold times are invalid." };
  }

  // Busy check excluding this hold's window would still see the hold itself
  // as occupied — loadBusy includes holds. Allow overlap with this hold only
  // by deleting the hold after the booking insert succeeds; check other busy.
  try {
    const busy = await loadBusyIntervals({
      admin,
      talentProfileId: actor.talentProfileId,
      from: new Date(startsAt.getTime() - 60 * 60_000),
      to: new Date(endsAt.getTime() + 60 * 60_000),
    });
    const conflict = busy.some((b) => {
      // Same hold window appears as busy — ignore intervals that match hold bounds.
      const sameWindow =
        Math.abs(b.startsAt.getTime() - startsAt.getTime()) < 1000 &&
        Math.abs(b.endsAt.getTime() - endsAt.getTime()) < 1000;
      if (sameWindow) return false;
      return b.startsAt < endsAt && b.endsAt > startsAt;
    });
    if (conflict) {
      return {
        ok: false,
        reason: "slot_taken",
        message: "Something else already occupies this time. Release or move first.",
      };
    }
  } catch (err) {
    logServerError("agenda.convertHold.busy", err);
    return { ok: false, reason: "unavailable" };
  }

  const title = (hold.title ?? "Booking").trim() || "Booking";
  const clientName = (hold.client_label ?? "").trim() || "Client";

  const { data: agencyRow, error: agencyErr } = await admin
    .from("agency_bookings")
    .insert({
      tenant_id: tenantId,
      source_inquiry_id: hold.inquiry_id,
      owner_staff_id: actor.userId,
      created_by_staff_id: actor.userId,
      title,
      status: "confirmed" as never,
      payment_status: "unpaid" as never,
      currency_code: "MXN",
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      contact_name: clientName,
      source_type_snapshot: hold.inquiry_id ? "tulala" : "manual",
      internal_notes: "Converted from calendar hold by talent.",
    })
    .select("id")
    .single();

  if (agencyErr || !agencyRow) {
    logServerError("agenda.convertHold.agency", agencyErr);
    return { ok: false, reason: "unavailable" };
  }

  const bookingId = agencyRow.id as string;
  const totals = computeBookingTalentRowTotals(1, 0, 0);

  const { error: legErr } = await admin.from("booking_talent").insert({
    tenant_id: tenantId,
    booking_id: bookingId,
    talent_profile_id: actor.talentProfileId,
    sort_order: 0,
    units: 1,
    pricing_unit: "event" as never,
    talent_cost_rate: 0,
    client_charge_rate: 0,
    talent_cost_total: totals.talent_cost_total,
    client_charge_total: totals.client_charge_total,
    gross_profit: totals.gross_profit,
  });
  if (legErr) {
    logServerError("agenda.convertHold.booking_talent", legErr);
    await admin.from("agency_bookings").delete().eq("id", bookingId);
    return { ok: false, reason: "unavailable" };
  }

  const { error: calErr } = await admin.from("talent_bookings").insert({
    id: bookingId,
    talent_profile_id: actor.talentProfileId,
    tenant_id: tenantId,
    inquiry_id: hold.inquiry_id,
    title,
    client_label: clientName,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    all_day: hold.all_day === true,
    status: "confirmed",
    created_by_user_id: actor.userId,
  });

  if (calErr) {
    logServerError("agenda.convertHold.talent_bookings", calErr);
    await admin.from("booking_talent").delete().eq("booking_id", bookingId);
    await admin.from("agency_bookings").delete().eq("id", bookingId);
    if (calErr.code === "23P01" || /overlap|exclusion/i.test(calErr.message ?? "")) {
      return {
        ok: false,
        reason: "slot_taken",
        message: "That time was just taken. The hold is still yours.",
      };
    }
    return { ok: false, reason: "unavailable" };
  }

  const { error: delErr } = await admin
    .from("talent_holds")
    .delete()
    .eq("id", holdId)
    .eq("talent_profile_id", actor.talentProfileId);
  if (delErr) {
    // Booking exists; hold leak is recoverable — log and still succeed.
    logServerError("agenda.convertHold.deleteHold", delErr);
  }

  revalidatePath("/", "layout");
  return { ok: true, bookingId };
}
