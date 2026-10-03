/**
 * Talent Money: issue a real Stripe refund for a booking the talent owns.
 *
 * Closes the D-026 gap after cancel-with-pay: Agenda says "refund from Money",
 * Money lists refund-pending rows, and this writer calls `executeBookingRefund`
 * (same engine as Messages / admin). Ledger updates still come from the
 * `charge.refunded` webhook — this only creates the Stripe Refund.
 */

"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { executeBookingRefund } from "@/lib/payments/refund-execute";
import { logServerError } from "@/lib/server/safe-error";
import { logBookingActivity } from "@/lib/server/commercial-audit";
import { BOOKING_AUDIT } from "@/lib/commercial-audit-events";
import { LEDGER_SETTLED_STATUSES } from "./cancel-money";
import { requireOwnBooking } from "./booking-actions";
import type { AgendaActionResult } from "./booking-actions";

export type RefundOwnBookingResult =
  | { ok: true; refundedCents: number; currency: string; already?: boolean }
  | (AgendaActionResult & { ok: false });

type TxnRow = {
  id: string;
  gross_amount_cents: number | null;
  currency: string | null;
  status: string | null;
  provider: string | null;
};

/**
 * Refund every settled card charge still refundable on this booking's order.
 * Cash/transfer (no Stripe charge) is refused by the engine — those need a
 * manual off-platform return, not this button.
 */
export async function refundOwnBookingPayment(input: {
  bookingId: string;
}): Promise<RefundOwnBookingResult> {
  const own = await requireOwnBooking(input.bookingId);
  if (!own.ok) return own;

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: booking, error: bookingErr } = await admin
    .from("agency_bookings")
    .select("id, order_id, tenant_id")
    .eq("id", input.bookingId)
    .maybeSingle();
  if (bookingErr) {
    logServerError("agenda.refundOwnBooking.load", bookingErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!booking) return { ok: false, reason: "not_found" };
  const orderId = booking.order_id ? String(booking.order_id) : null;
  if (!orderId) return { ok: false, reason: "not_found" };

  const { data: txnRows, error: txnErr } = await admin
    .from("booking_transactions")
    .select("id, gross_amount_cents, currency, status, provider")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (txnErr) {
    logServerError("agenda.refundOwnBooking.txns", txnErr);
    return { ok: false, reason: "unavailable" };
  }

  const settled = ((txnRows ?? []) as TxnRow[]).filter((t) =>
    (LEDGER_SETTLED_STATUSES as readonly string[]).includes(String(t.status ?? "")),
  );
  if (settled.length === 0) return { ok: true, refundedCents: 0, currency: "USD", already: true };

  let moved = 0;
  let currency = "USD";
  let lastError: string | null = null;

  for (const txn of settled) {
    const res = await executeBookingRefund({
      transactionId: txn.id,
      amountCents: null,
      reason: "booking_cancelled",
      actorUserId: own.userId,
      note: "Refund from talent Money (paid after cancellation)",
    });
    if (!res.ok) {
      // Already refunded / nothing left: skip; other blocks surface to the UI.
      if (res.code === "already_refunded" || res.code === "not_collected" || res.code === "amount") {
        continue;
      }
      lastError = res.error;
      break;
    }
    moved += res.amountCents;
    currency = res.currency || currency;
  }

  if (moved === 0 && lastError) {
    return { ok: false, reason: lastError };
  }
  if (moved === 0) {
    return { ok: true, refundedCents: 0, currency, already: true };
  }

  await logBookingActivity(admin, {
    bookingId: input.bookingId,
    actorUserId: own.userId,
    eventType: BOOKING_AUDIT.PAYMENT_STATE_CHANGED,
    payload: {
      surface: "talent_money",
      refundedCents: moved,
      currency,
      reason: "booking_cancelled",
    },
  });

  return { ok: true, refundedCents: moved, currency };
}
