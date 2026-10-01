/**
 * T1.9 / A1.7 Cancel with refund preview + confirm.
 * Talent-owned: requireOwnBooking + cancelBookingSet (service role).
 * Surfaces refundableCents after cancel; booking still cancels if refund math fails.
 */

"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { requireOwnBooking } from "./booking-actions";
import { talentBookingMirrorEq } from "./ownership";
import { logServerError } from "@/lib/server/safe-error";
import type { AgendaActionResult } from "./booking-actions";

export type CancelWithRefundResult =
  | { ok: true; refundableCents: number; already?: boolean; refundFailed?: boolean }
  | AgendaActionResult & { ok: false };

export async function cancelBookingWithRefund(input: {
  bookingId: string;
  cancelledBy: "talent" | "client";
  reason?: string;
  operationKey?: string;
}): Promise<CancelWithRefundResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, status")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (error || !row?.tenant_id) {
    return { ok: false, reason: error ? "unavailable" : "not_found" };
  }

  const operationKey =
    input.operationKey?.trim() ||
    `agenda-cancel-${input.bookingId}-${Date.now().toString(36)}`;

  const result = await cancelBookingSet(admin, {
    tenantId: String(row.tenant_id),
    bookingId: input.bookingId,
    operationKey,
    reason: input.reason?.trim() || "Cancelled from talent agenda",
    by: input.cancelledBy === "client" ? "customer" : "staff",
  });

  if (!result || result.ok !== true) {
    return {
      ok: false,
      reason: (result && "reason" in result && result.reason) || "unavailable",
    };
  }

  // cancel_booking_set only syncs the calendar mirror by source_inquiry_id. A
  // booking added from the agenda has no inquiry; its talent_bookings copy
  // shares the booking id, so without this it stayed "confirmed" and kept the
  // slot blocked on the public profile (QA on Jor, 2026-10-01). Same shared-id
  // sync as no-show / complete. Idempotent, so it also heals an "already" row.
  const mirror = talentBookingMirrorEq(input.bookingId, own.talentId);
  const { error: mirrorErr } = await admin
    .from("talent_bookings")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", mirror.id)
    .eq("talent_profile_id", mirror.talent_profile_id)
    .neq("status", "cancelled");
  if (mirrorErr) logServerError("agenda.cancelBookingWithRefund.mirror", mirrorErr);

  if (!result.already) {
    await logBookingActivity(admin, {
      bookingId: input.bookingId,
      actorUserId: own.userId,
      eventType: BOOKING_AUDIT.STATUS_CHANGED,
      payload: {
        from: row.status,
        to: "cancelled",
        surface: "talent_agenda",
        cancelledBy: input.cancelledBy,
        refundableCents: Number(result.refundableCents) || 0,
      },
    });
  }

  return {
    ok: true,
    refundableCents: Number(result.refundableCents) || 0,
    already: result.already === true,
  };
}
