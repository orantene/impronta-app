/**
 * T1.9 Cancel with refund preview + confirm.
 * Surfaces refundableCents before money moves; booking still cancels if refund fails.
 */

"use server";

import { cancelBookingSetAction } from "@/lib/server-actions/scheduling-engine";
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
  const operationKey =
    input.operationKey?.trim() ||
    `agenda-cancel-${input.bookingId}-${Date.now().toString(36)}`;

  const result = await cancelBookingSetAction({
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
