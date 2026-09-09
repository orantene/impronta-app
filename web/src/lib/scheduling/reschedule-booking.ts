/**
 * Staff reschedule with a safe slot exchange.
 *
 * THE DEFECT THIS CLOSES. `rescheduleBookingAction` used to write new
 * `agency_bookings.starts_at` / `ends_at` with no hold and no slot check. That
 * is exactly the double-booking `talent_holds_firm_no_overlap` and
 * `talent_bookings_no_overlap` exist to prevent: two confirmed windows on one
 * person, both looking booked, neither refused.
 *
 * SAFE EXCHANGE. Hold the destination first, then move the booking, then drop
 * the hold. Releasing the origin first would open a window where a concurrent
 * booker takes the destination while this booking is briefly nowhere — or,
 * worse, takes the origin and leaves the customer with no time at all.
 *
 * WHEN THERE IS NO TALENT MIRROR. Some `agency_bookings` rows are money shells
 * or event anchors with no `talent_bookings` row. Those have no person-time to
 * protect; the timestamp update alone is enough. Inventing a talent to hold
 * would invent a calendar conflict that does not exist.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import {
  isExclusionViolation,
  placeReservationHold,
  releaseReservationHold,
} from "@/lib/scheduling/reservation-hold";

export type RescheduleBookingInput = {
  tenantId: string;
  bookingId: string;
  newStartsAt: string;
  newEndsAt: string | null;
  actorUserId: string;
};

export type RescheduleBookingResult =
  | { ok: true; previous: { startsAt: string | null; endsAt: string | null } }
  | {
      ok: false;
      reason: "not_found" | "not_reschedulable" | "invalid" | "slot_taken" | "unavailable";
      error: string;
    };

const RESCHEDULABLE = new Set(["tentative", "confirmed", "draft", "in_progress"]);

function defaultEndsAt(startsAt: string): string {
  // One hour when the caller left the end open — matches public slot default.
  return new Date(Date.parse(startsAt) + 60 * 60 * 1000).toISOString();
}

export async function rescheduleBooking(
  admin: Pick<SupabaseClient, "from">,
  input: RescheduleBookingInput,
): Promise<RescheduleBookingResult> {
  if (!input.newStartsAt) {
    return { ok: false, reason: "invalid", error: "Start date required." };
  }
  const startMs = Date.parse(input.newStartsAt);
  if (!Number.isFinite(startMs)) {
    return { ok: false, reason: "invalid", error: "Start date is not valid." };
  }
  const endsAt = input.newEndsAt ?? defaultEndsAt(input.newStartsAt);
  const endMs = Date.parse(endsAt);
  if (!Number.isFinite(endMs) || endMs <= startMs) {
    return { ok: false, reason: "invalid", error: "End must be after start." };
  }

  const { data: booking, error: lookupErr } = await admin
    .from("agency_bookings")
    .select("id, status, starts_at, ends_at, source_inquiry_id")
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (lookupErr) {
    logServerError("scheduling.rescheduleBooking/lookup", lookupErr);
    return { ok: false, reason: "unavailable", error: "Could not load that booking." };
  }
  if (!booking) {
    return { ok: false, reason: "not_found", error: "Booking not found in this workspace." };
  }

  const status = booking.status as string;
  if (!RESCHEDULABLE.has(status)) {
    return {
      ok: false,
      reason: "not_reschedulable",
      error: `Booking is ${status} — reschedule isn't supported.`,
    };
  }

  const previous = {
    startsAt: (booking.starts_at as string | null) ?? null,
    endsAt: (booking.ends_at as string | null) ?? null,
  };

  // Mirror rows keyed by inquiry — one talent calendar entry per person on the job.
  const inquiryId = (booking.source_inquiry_id as string | null) ?? null;
  let talentRows: Array<{
    id: string;
    talent_profile_id: string;
    title: string;
  }> = [];
  if (inquiryId) {
    const { data: mirrors, error: mirrorErr } = await admin
      .from("talent_bookings")
      .select("id, talent_profile_id, title")
      .eq("inquiry_id", inquiryId)
      .eq("tenant_id", input.tenantId)
      .neq("status", "cancelled");
    if (mirrorErr) {
      logServerError("scheduling.rescheduleBooking/mirrors", mirrorErr);
      return { ok: false, reason: "unavailable", error: "Could not load the calendar entry." };
    }
    talentRows = (mirrors ?? []) as typeof talentRows;
  }

  // Hold EVERY destination first. Partial success rolls back holds already placed.
  const holdIds: string[] = [];
  try {
    for (const row of talentRows) {
      const held = await placeReservationHold(admin as SupabaseClient, {
        talentProfileId: row.talent_profile_id,
        tenantId: input.tenantId,
        inquiryId,
        startsAt: input.newStartsAt,
        endsAt,
        title: (row.title || "Reschedule").trim() || "Reschedule",
        // Short TTL: this hold only guards the exchange, then the booking owns the window.
        ttlSeconds: 15 * 60,
        createdByUserId: input.actorUserId,
      });
      if (!held.ok) {
        for (const id of holdIds) {
          await releaseReservationHold(admin as SupabaseClient, id);
        }
        if (held.code === "slot_taken") {
          return {
            ok: false,
            reason: "slot_taken",
            error: "That time was just taken. Pick another time.",
          };
        }
        return { ok: false, reason: "unavailable", error: held.error };
      }
      holdIds.push(held.holdId);
    }

    const { error: updErr } = await admin
      .from("agency_bookings")
      .update({
        starts_at: input.newStartsAt,
        ends_at: input.newEndsAt ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.bookingId)
      .eq("tenant_id", input.tenantId);
    if (updErr) {
      logServerError("scheduling.rescheduleBooking/agency", updErr);
      for (const id of holdIds) {
        await releaseReservationHold(admin as SupabaseClient, id);
      }
      return { ok: false, reason: "unavailable", error: "Could not move that booking." };
    }

    for (const row of talentRows) {
      const { error: talentErr } = await admin
        .from("talent_bookings")
        .update({
          starts_at: input.newStartsAt,
          ends_at: endsAt,
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("tenant_id", input.tenantId);
      if (talentErr) {
        logServerError("scheduling.rescheduleBooking/talent", talentErr);
        for (const id of holdIds) {
          await releaseReservationHold(admin as SupabaseClient, id);
        }
        // Roll the agency row back so the two spines stay aligned.
        await admin
          .from("agency_bookings")
          .update({
            starts_at: previous.startsAt,
            ends_at: previous.endsAt,
            updated_at: new Date().toISOString(),
          })
          .eq("id", input.bookingId)
          .eq("tenant_id", input.tenantId);
        if (isExclusionViolation(talentErr)) {
          return {
            ok: false,
            reason: "slot_taken",
            error: "That time is already booked for this talent. Pick another time.",
          };
        }
        return { ok: false, reason: "unavailable", error: "Could not move the calendar entry." };
      }
    }
  } finally {
    for (const id of holdIds) {
      const released = await releaseReservationHold(admin as SupabaseClient, id);
      if (!released.ok) {
        logServerError("scheduling.rescheduleBooking/release", released.error);
      }
    }
  }

  return { ok: true, previous };
}
