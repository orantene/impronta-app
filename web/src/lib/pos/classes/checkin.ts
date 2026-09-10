/**
 * checkin.ts — a customer has arrived for their appointment.
 *
 * WHAT "CHECK IN" IS. The booking's own status moving to `in_progress`, the
 * same transition the booking peek panel makes with its status control
 * (`admin-bookings.ts` › `quickUpdateBookingPeek`), written the same way and
 * audited with the same `STATUS_CHANGED` line. No new column, no new table:
 * `agency_bookings.status` already has `in_progress` in its enum and the
 * Appointments board already renders it (D-106). This file adds the one
 * thing a till needs that the peek panel does not have: a CONDITIONAL write.
 *
 * WHY THE WRITE IS CONDITIONAL. Two desks open the same day. One checks the
 * customer in; the other's screen still says "Confirmed" and its operator
 * taps too. The update is filtered on the status the operator SAW
 * (`expectedState`), so the second tap matches no row and is refused as
 * `changed_since_opened` rather than silently re-stamping a booking that a
 * colleague may since have completed or cancelled. Same shape as the
 * `expected_starts_at` guard on `reschedule_booking_set`.
 *
 * REFUSALS ARE DATA. A cancelled booking cannot arrive; a completed one
 * already left; one already in progress is already here. Each is its own
 * word so the screen can say its own sentence.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { appointmentState, CHECKINABLE_STATES, type ClassesAppointmentState } from "./day";

type Admin = Pick<SupabaseClient, "from">;

export type CheckInRefusalReason =
  | "not_found"
  | "changed_since_opened"
  | "already_in"
  | "cancelled"
  | "completed"
  | "not_checkinable"
  | "unavailable";

export type CheckInResult =
  | { ok: true; already: false }
  | { ok: false; reason: CheckInRefusalReason };

/** Pure: what the stored state means for a check-in, before any write. */
export function checkInVerdict(input: {
  stored: ClassesAppointmentState;
  expected: ClassesAppointmentState;
}): CheckInRefusalReason | null {
  if (input.stored !== input.expected) return "changed_since_opened";
  if (input.stored === "in_progress") return "already_in";
  if (input.stored === "cancelled") return "cancelled";
  if (input.stored === "completed") return "completed";
  if (!CHECKINABLE_STATES.includes(input.stored)) return "not_checkinable";
  return null;
}

export async function checkInAppointment(
  admin: Admin,
  input: {
    tenantId: string;
    bookingId: string;
    /** The state the operator's row showed. */
    expectedState: ClassesAppointmentState;
    actorUserId: string;
  },
): Promise<CheckInResult> {
  const read = await admin
    .from("agency_bookings")
    .select("id, status")
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (read.error) {
    logServerError("pos.classes.checkIn/read", read.error);
    return { ok: false, reason: "unavailable" };
  }
  if (!read.data) return { ok: false, reason: "not_found" };

  const stored = appointmentState(typeof read.data.status === "string" ? read.data.status : null);
  const verdict = checkInVerdict({ stored, expected: input.expectedState });
  if (verdict) return { ok: false, reason: verdict };
  if (stored === "unknown") return { ok: false, reason: "not_checkinable" };

  // The condition is IN the statement, not only in the read above: the read
  // and the write are two round trips, and a colleague can land between them.
  const write = await admin
    .from("agency_bookings")
    .update({
      status: "in_progress",
      updated_at: new Date().toISOString(),
      updated_by_staff_id: input.actorUserId,
    })
    .eq("id", input.bookingId)
    .eq("tenant_id", input.tenantId)
    .eq("status", stored)
    .select("id");
  if (write.error) {
    logServerError("pos.classes.checkIn/write", write.error);
    return { ok: false, reason: "unavailable" };
  }
  if (!write.data || write.data.length === 0) return { ok: false, reason: "changed_since_opened" };
  return { ok: true, already: false };
}
