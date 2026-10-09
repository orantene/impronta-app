/**
 * A payment that lands on a booking already cancelled (QA on Jor, 2026-10-01:
 * a client paid 300 MXN through `/pay/<code>` after the talent cancelled).
 *
 * The cancel takes the links down and expires their Checkout sessions, but a
 * session that completed while the cancel ran still settles here. The money is
 * real, so it is RECORDED (the ledger row is paid). It must not act like a
 * sale: no booking sync, no "booking confirmed", no payout to the talent, no
 * order completion. Instead the row is marked as needing a person: paid after
 * cancellation, refund manually from Money.
 */

import "server-only";

import { logServerError } from "@/lib/server/safe-error";
import { notifyPaymentNeedsAttention } from "@/lib/notifications/producers/payment-notify";
import { PAID_AFTER_CANCEL_ATTENTION } from "@/lib/payments/paid-after-cancel-attention";

export { PAID_AFTER_CANCEL_ATTENTION } from "@/lib/payments/paid-after-cancel-attention";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

/** True when the booking or the order behind this money row was cancelled. */
export async function isPaidAfterCancellation(
  admin: Admin,
  input: { bookingId: string | null; orderId: string | null },
): Promise<boolean> {
  if (input.bookingId) {
    const { data, error } = await admin
      .from("agency_bookings")
      .select("status")
      .eq("id", input.bookingId)
      .maybeSingle();
    if (error) logServerError("payments.paidAfterCancel.booking", error);
    if ((data as { status?: string } | null)?.status === "cancelled") return true;
  }
  if (input.orderId) {
    const { data, error } = await admin
      .from("orders")
      .select("status")
      .eq("id", input.orderId)
      .maybeSingle();
    if (error) logServerError("payments.paidAfterCancel.order", error);
    if ((data as { status?: string } | null)?.status === "cancelled") return true;
  }
  return false;
}

/** Stamp the money row so Money lists it for a manual refund. Idempotent. */
export async function flagPaidAfterCancellation(
  admin: Admin,
  input: { transactionId: string; nowIso?: string },
): Promise<{ ok: boolean }> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("metadata, source_tenant_id, booking_id, source_inquiry_id, gross_amount_cents, currency")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) {
    logServerError("payments.paidAfterCancel.read", error);
    return { ok: false };
  }
  const row = data as {
    metadata?: unknown;
    source_tenant_id?: string | null;
    booking_id?: string | null;
    source_inquiry_id?: string | null;
    gross_amount_cents?: number | null;
    currency?: string | null;
  } | null;
  const meta = (row?.metadata ?? {}) as Record<string, unknown>;
  if (meta.needs_attention === PAID_AFTER_CANCEL_ATTENTION) return { ok: true };
  const note = "Paid after cancellation. Refund manually from Money.";
  const { error: updErr } = await admin
    .from("booking_transactions")
    .update({
      metadata: {
        ...meta,
        needs_attention: PAID_AFTER_CANCEL_ATTENTION,
        needs_attention_note: note,
        needs_attention_at: input.nowIso ?? new Date().toISOString(),
      },
    })
    .eq("id", input.transactionId);
  if (updErr) {
    logServerError("payments.paidAfterCancel.flag", updErr);
    return { ok: false };
  }
  logServerError(
    "payments.PAID_AFTER_CANCELLATION",
    `transaction ${input.transactionId} was paid after its booking was cancelled. Refund manually.`,
  );
  // TUL-391 — in-app Money bell (dedupe on transactionId + reason).
  const tenantId = row?.source_tenant_id ?? null;
  if (tenantId) {
    notifyPaymentNeedsAttention({
      tenantId,
      transactionId: input.transactionId,
      bookingId: row?.booking_id ?? null,
      inquiryId: row?.source_inquiry_id ?? null,
      reason: PAID_AFTER_CANCEL_ATTENTION,
      note,
      amountCents: row?.gross_amount_cents ?? null,
      currency: row?.currency ?? null,
    });
  }
  return { ok: true };
}

/**
 * The settle-time guard `markPaid` calls on a fresh paid transition: reads the
 * row's order, decides, and flags. Returns true when the payment is late.
 */
export async function guardPaidAfterCancellation(
  admin: Admin,
  input: { transactionId: string; bookingId: string | null },
): Promise<boolean> {
  const { data, error } = await admin
    .from("booking_transactions")
    .select("order_id")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (error) logServerError("payments.paidAfterCancel.txn", error);
  const orderId = (data as { order_id?: string | null } | null)?.order_id ?? null;
  const late = await isPaidAfterCancellation(admin, { bookingId: input.bookingId, orderId });
  if (late) await flagPaidAfterCancellation(admin, { transactionId: input.transactionId });
  return late;
}
