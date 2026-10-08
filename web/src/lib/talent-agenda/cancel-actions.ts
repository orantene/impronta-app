/**
 * T1.9 / A1.7 Cancel with refund preview + confirm.
 * Talent-owned: requireOwnBooking + cancelBookingSet (service role).
 * Surfaces refundableCents after cancel; booking still cancels if refund math fails.
 */

"use server";

import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { cancelBookingSet } from "@/lib/scheduling/cancel-booking";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { requireOwnBooking } from "./booking-actions";
import { talentBookingMirrorEq } from "./ownership";
import { logServerError } from "@/lib/server/safe-error";
import type { AgendaActionResult } from "./booking-actions";
import { ledgerPaidCents, paymentInFlightForOrder, settleMoneyOnCancel } from "./cancel-money";

export type CancelWithRefundResult =
  | {
      ok: true;
      refundableCents: number;
      already?: boolean;
      refundFailed?: boolean;
      /** Settled money on the booking's order, read from the ledger. */
      paidCents: number;
      /** A Checkout session completed while the cancel ran: money is arriving. */
      paymentInFlight?: boolean;
    }
  | AgendaActionResult & { ok: false };

/**
 * What the client has paid on this booking, from the ledger, for the cancel
 * dialog. null when it cannot be read: the dialog then never claims "nothing
 * was paid".
 */
export async function cancelPaymentPreview(
  bookingId: string,
): Promise<{ ok: true; paidCents: number; paymentInFlight: boolean } | { ok: false; reason: string }> {
  const own = await requireOwnBooking(bookingId);
  if (!own.ok) return { ok: false, reason: own.reason };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("order_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) {
    logServerError("agenda.cancelPaymentPreview", error);
    return { ok: false, reason: "unavailable" };
  }
  const paid = await ledgerPaidCents(admin, row?.order_id ? String(row.order_id) : null);
  if (paid === null) return { ok: false, reason: "unavailable" };
  // A completed Checkout session that is not in the ledger yet is money
  // arriving: the dialog must not say "nothing was paid" (same detection the
  // post-cancel path uses). Unknown counts as in flight: never claim "nothing".
  const inFlight = await paymentInFlightForOrder(admin, row?.order_id ? String(row.order_id) : null);
  return { ok: true, paidCents: paid, paymentInFlight: inFlight !== false };
}

export async function cancelBookingWithRefund(input: {
  bookingId: string;
  cancelledBy: "talent" | "client";
  reason?: string;
  operationKey?: string;
}): Promise<CancelWithRefundResult> {
  await requireNotImpersonating();
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: row, error } = await admin
    .from("agency_bookings")
    .select("id, tenant_id, status, order_id")
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
    // Persist the real role (talent|client), not the old staff/customer alias.
    by: input.cancelledBy,
    actorUserId: own.userId,
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

  // The money around the booking: open pay links come down (their Checkout
  // sessions expire first), an unpaid order is voided, a paid one is left for
  // a manual refund from Money. Runs on "already" too, so a retry heals a
  // cancel whose money step failed.
  const { cancelPaymentLink } = await import("@/lib/payments/links");
  const money = await settleMoneyOnCancel(
    admin,
    { tenantId: String(row.tenant_id), orderId: row.order_id ? String(row.order_id) : null },
    { cancelPaymentLink },
  );
  if (!money.ok) {
    logServerError("agenda.cancelBookingWithRefund.money", `booking ${input.bookingId}: payment cleanup incomplete`);
  }

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
        paidCents: money.paidCents,
        linksVoided: money.linksVoided,
        orderVoided: money.orderVoided,
      },
    });
  }

  return {
    ok: true,
    refundableCents: Number(result.refundableCents) || 0,
    already: result.already === true,
    paidCents: money.paidCents,
    paymentInFlight: money.paymentInFlight,
  };
}
