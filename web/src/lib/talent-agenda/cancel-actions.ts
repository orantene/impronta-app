/**
 * T1.9 / A1.7 Cancel with refund preview + confirm.
 * Talent-owned: requireOwnBooking + cancelBookingSet (service role).
 * Surfaces refundableCents after cancel; booking still cancels if refund math fails.
 */

"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { requireOwnBooking } from "./booking-actions";
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
    .select("id, tenant_id")
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

  return {
    ok: true,
    refundableCents: Number(result.refundableCents) || 0,
    already: result.already === true,
  };
}
