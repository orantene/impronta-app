/**
 * move.ts — the free times a booking could MOVE to (board A09).
 *
 * A booking's person is the offering on its order's first line (an instant
 * booking, the walk-in's kind), or else the `talent_bookings` mirror behind
 * its source inquiry (the rows `rescheduleBooking` reads the buffers from);
 * its length is its own window. The free starts are `freeStartsForPerson`, the
 * walk-in's composition, so the till offers a move only onto a time the
 * website would also sell. The booking's CURRENT time is busy in that read,
 * which is the board's rule: "her 13:00 stays until the new time is
 * confirmed".
 *
 * A booking with no person behind it (a hand-opened shell, a booking whose
 * mirror was never written) gets `no_person`: the operator can still type a
 * time by hand, and the engine's own reschedule decides.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { nameForTalent } from "@/lib/scheduling/appointments-lookups";
import { logServerError } from "@/lib/server/safe-error";

import { freeStartsForPerson, type WalkInSlotsResult } from "./walkin";

export type MoveSlotsResult =
  | { ok: true; starts: string[]; timeZone: string; reason: string | null; durationMinutes: number | null; personName: string | null }
  | { ok: false; reason: "not_found" | "no_person" | "no_booking_hours" | "hours_unreadable" | "unavailable" };

export async function loadMoveSlots(
  admin: SupabaseClient,
  input: { tenantId: string; bookingId: string; now: Date; timeZone: string; dayOffset: number },
): Promise<MoveSlotsResult> {
  const booking = await admin
    .from("agency_bookings")
    .select("id, starts_at, ends_at, source_inquiry_id, order_id")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.bookingId)
    .maybeSingle();
  if (booking.error) {
    logServerError("pos.classes.move/booking", booking.error);
    return { ok: false, reason: "unavailable" };
  }
  const row = booking.data;
  if (!row) return { ok: false, reason: "not_found" };
  const talentProfileId = await personBehind(admin, input.tenantId, row);
  if (!talentProfileId) return { ok: false, reason: "no_person" };

  const startsAt = typeof row.starts_at === "string" ? Date.parse(row.starts_at) : Number.NaN;
  const endsAt = typeof row.ends_at === "string" ? Date.parse(row.ends_at) : Number.NaN;
  const durationMinutes =
    Number.isFinite(startsAt) && Number.isFinite(endsAt) && endsAt > startsAt ? Math.round((endsAt - startsAt) / 60_000) : null;

  const [free, personName] = await Promise.all([
    freeStartsForPerson(admin, { talentProfileId, durationMinutes, now: input.now, timeZone: input.timeZone, dayOffset: input.dayOffset }),
    nameForTalent(admin, talentProfileId),
  ]);
  return withPerson(free, durationMinutes, personName);
}

type BookingRow = { source_inquiry_id: string | null; order_id: string | null };

/** The professional a booking is with, or null when no row names one. */
async function personBehind(admin: SupabaseClient, tenantId: string, row: BookingRow): Promise<string | null> {
  if (typeof row.order_id === "string") {
    const lines = await admin
      .from("order_lines")
      .select("offering_id, sort_order")
      .eq("tenant_id", tenantId)
      .eq("order_id", row.order_id)
      .not("offering_id", "is", null)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (lines.error) {
      logServerError("pos.classes.move/lines", lines.error);
      return null;
    }
    const offeringId = typeof lines.data?.offering_id === "string" ? lines.data.offering_id : null;
    if (offeringId) {
      const offering = await admin.from("talent_offerings").select("talent_profile_id").eq("id", offeringId).eq("tenant_id", tenantId).maybeSingle();
      if (offering.error) {
        logServerError("pos.classes.move/offering", offering.error);
        return null;
      }
      if (typeof offering.data?.talent_profile_id === "string") return offering.data.talent_profile_id;
    }
  }
  if (typeof row.source_inquiry_id !== "string") return null;
  const mirror = await admin
    .from("talent_bookings")
    .select("talent_profile_id")
    .eq("tenant_id", tenantId)
    .eq("inquiry_id", row.source_inquiry_id)
    .neq("status", "cancelled")
    .limit(1)
    .maybeSingle();
  if (mirror.error) {
    logServerError("pos.classes.move/mirror", mirror.error);
    return null;
  }
  return typeof mirror.data?.talent_profile_id === "string" ? mirror.data.talent_profile_id : null;
}

function withPerson(free: WalkInSlotsResult, durationMinutes: number | null, personName: string | null): MoveSlotsResult {
  if (!free.ok) return free;
  return { ok: true, starts: free.starts, timeZone: free.timeZone, reason: free.reason, durationMinutes, personName };
}
