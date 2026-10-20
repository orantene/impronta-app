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
 * `no_currency`  something is owed but the booking has no currency: nothing is
 *                written (fail closed), the cancel stands and it is logged
 * `unavailable`  the write failed or the table is not there yet (code-first):
 *                the cancel stands, the amount is still returned to the caller
 */
export type BookingRefundIntentOutcome = "opened" | "already" | "none" | "no_currency" | "unavailable";

export type StoredBookingRefundIntent = {
  refundCents: number;
  paidCents: number;
  currency: string;
};

/**
 * The intent recorded at cancel time, if any. A replayed cancel reads this
 * back instead of recomputing the amount at replay time (TUL-1454): after the
 * window closes, or after staff refunded by hand, a recompute would be stale.
 * `null` = no row; `"error"` = could not be read (missing table included).
 */
export async function readBookingRefundIntent(
  admin: Admin,
  bookingId: string,
): Promise<StoredBookingRefundIntent | null | "error"> {
  const { data, error } = await admin
    .from("booking_refund_intents")
    .select("refund_cents, paid_cents, currency_code")
    .eq("booking_id", bookingId)
    .maybeSingle();
  if (error) {
    const code = String((error as { code?: unknown }).code ?? "");
    if (code !== "42P01") logServerError("scheduling.bookingRefundIntent.read", error);
    return "error";
  }
  if (!data) return null;
  const row = data as { refund_cents: number; paid_cents: number; currency_code: string };
  return {
    refundCents: Number(row.refund_cents) || 0,
    paidCents: Number(row.paid_cents) || 0,
    currency: String(row.currency_code ?? ""),
  };
}

/**
 * Record the refund a booking cancel owes (MONEY BUG 4). Records the amount
 * only; no money moves here. Never throws: a cancel that was accepted must not
 * fail because the intent could not be written. Refuses to write an amount
 * without its currency (the column is NOT NULL; the code fails closed first).
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
  const currency = typeof input.currency === "string" ? input.currency.trim().toUpperCase() : "";
  if (!currency) {
    logServerError(
      "scheduling.bookingRefundIntent.noCurrency",
      `booking ${input.bookingId}: ${refund} cents owed but the booking has no currency; intent not written`,
    );
    return "no_currency";
  }
  const { error } = await admin.from("booking_refund_intents").insert({
    tenant_id: input.tenantId,
    booking_id: input.bookingId,
    order_id: input.orderId,
    refund_cents: refund,
    paid_cents: Math.max(0, Math.trunc(input.paidCents)),
    currency_code: currency,
    cancelled_by: input.by,
  });
  if (!error) return "opened";
  const code = String((error as { code?: unknown }).code ?? "");
  if (code === "23505") return "already";
  logServerError("scheduling.bookingRefundIntent.insert", error);
  return "unavailable";
}
