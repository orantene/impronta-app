import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * `opened`       a row was written for the owed amount
 * `already`      a row for this booking exists (a replayed cancel)
 * `none`         nothing is owed, so nothing is opened
 * `unavailable`  the write failed or the table is not there yet (code-first):
 *                the cancel stands, the amount is still returned to the caller
 */
export type BookingRefundIntentOutcome = "opened" | "already" | "none" | "unavailable";

/**
 * Record the refund a booking cancel owes (MONEY BUG 4). Records the amount
 * only; no money moves here. Never throws: a cancel that was accepted must not
 * fail because the intent could not be written.
 */
export async function recordBookingRefundIntent(
  admin: Admin,
  input: {
    tenantId: string;
    bookingId: string;
    orderId: string | null;
    refundCents: number;
    paidCents: number;
    currency: string | null;
    by: "talent" | "client" | "staff" | "system";
  },
): Promise<BookingRefundIntentOutcome> {
  const refund = Math.trunc(input.refundCents);
  if (!(refund > 0)) return "none";
  const { error } = await admin.from("booking_refund_intents").insert({
    tenant_id: input.tenantId,
    booking_id: input.bookingId,
    order_id: input.orderId,
    refund_cents: refund,
    paid_cents: Math.max(0, Math.trunc(input.paidCents)),
    currency_code: input.currency,
    cancelled_by: input.by,
  });
  if (!error) return "opened";
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "23505") return "already";
  logServerError("scheduling.bookingRefundIntent.insert", error);
  return "unavailable";
}
