import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Thread-scoped refund guard (TUL-790).
 *
 * `executeBookingRefund` refunds any `booking_transactions` id it is handed, so
 * an inbox thread must prove the transaction hangs off THAT thread's booking in
 * the caller's workspace before the money moves. Fails closed: any read error,
 * missing row or mismatch is a refusal, never a pass.
 */
export type ThreadRefundScope =
  | { ok: true; bookingId: string }
  | { ok: false; error: string; code: "no_booking" | "wrong_thread" | "unavailable" };

export async function assertTransactionOnThread(
  sb: SupabaseClient,
  input: { tenantId: string; inquiryId: string; transactionId: string },
): Promise<ThreadRefundScope> {
  const { data: booking, error: bookingErr } = await sb
    .from("agency_bookings")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("source_inquiry_id", input.inquiryId)
    .maybeSingle();
  if (bookingErr) return { ok: false, error: "Could not verify this payment.", code: "unavailable" };
  const bookingId = (booking as { id?: string } | null)?.id;
  if (!bookingId) return { ok: false, error: "No booking found for this conversation.", code: "no_booking" };

  const { data: txn, error: txnErr } = await sb
    .from("booking_transactions")
    .select("id, booking_id")
    .eq("id", input.transactionId)
    .maybeSingle();
  if (txnErr) return { ok: false, error: "Could not verify this payment.", code: "unavailable" };
  const row = txn as { id?: string; booking_id?: string } | null;
  if (!row || row.booking_id !== bookingId) {
    return { ok: false, error: "That payment does not belong to this conversation.", code: "wrong_thread" };
  }
  return { ok: true, bookingId };
}

export type ThreadRefundDeps = {
  /** The caller's BILLING permission on the owning workspace (refund or manage_billing). */
  canRefund: () => Promise<boolean>;
  execute: (transactionId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Permission first, then thread scope, then the single Stripe refund path.
 * The inquiry is the thread: a transaction from any other inquiry is refused.
 */
export async function refundOnThread(
  sb: SupabaseClient,
  input: { tenantId: string; inquiryId: string; transactionId: string },
  deps: ThreadRefundDeps,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await deps.canRefund())) return { ok: false, error: "You do not have permission to refund a payment." };
  const scope = await assertTransactionOnThread(sb, input);
  if (!scope.ok) return { ok: false, error: scope.error };
  return deps.execute(input.transactionId);
}
