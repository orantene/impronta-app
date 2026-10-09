import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

import { loadActiveBookingTransaction, mapRow, type BookingTransaction, type TransactionRow } from "./transactions";

export type PaymentBookingRow = {
  id: string;
  total_client_revenue: number | string | null;
  currency_code: string | null;
  deposit_amount_cents: number | string | null;
  deposit_pct: number | string | null;
  client_revenue_lifecycle: string | null;
};

/**
 * TUL-430: the booking (and its money row) the Pago tab shows for an inquiry.
 *
 * It used to read ONE booking with `.maybeSingle()`: an inquiry with two
 * bookings made that error, the error was dropped, and the tab said "no
 * booking yet" over a paid sale. And it read only ACTIVE money rows, so a
 * refunded payment showed nothing at all.
 *
 * Now: the newest booking that has an active money row wins; else the newest
 * booking that has ANY money row (a refunded or failed one is still the story);
 * else the newest booking with no money row. A failed read is `ok: false`, so
 * the caller can say so instead of "no booking".
 */
export async function loadInquiryPaymentBooking(
  supabase: SupabaseClient,
  input: { tenantId: string; inquiryId: string },
): Promise<{ ok: true; booking: PaymentBookingRow | null; transaction: BookingTransaction | null } | { ok: false }> {
  const { data, error } = await supabase
    .from("agency_bookings")
    .select("id, total_client_revenue, currency_code, deposit_amount_cents, deposit_pct, client_revenue_lifecycle")
    .eq("tenant_id", input.tenantId)
    .eq("source_inquiry_id", input.inquiryId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) {
    logServerError("payment-booking.bookings", error);
    return { ok: false };
  }
  const bookings = (data ?? []) as PaymentBookingRow[];
  if (bookings.length === 0) return { ok: true, booking: null, transaction: null };

  for (const b of bookings) {
    const active = await loadActiveBookingTransaction(b.id, supabase);
    if (active) return { ok: true, booking: b, transaction: active };
  }
  const { data: anyTxn, error: txnError } = await supabase
    .from("booking_transactions")
    .select("*")
    .in("booking_id", bookings.map((b) => b.id))
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (txnError) {
    logServerError("payment-booking.latestTransaction", txnError);
    return { ok: false };
  }
  if (anyTxn) {
    const row = anyTxn as TransactionRow;
    const owner = bookings.find((b) => b.id === (row as unknown as { booking_id: string }).booking_id) ?? bookings[0];
    return { ok: true, booking: owner, transaction: mapRow(row) };
  }
  return { ok: true, booking: bookings[0], transaction: null };
}
