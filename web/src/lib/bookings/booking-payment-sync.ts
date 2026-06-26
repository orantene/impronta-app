import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Syncing `agency_bookings` (what talent earnings + workspace financials read)
 * after a payment lands. Extracted from transactions.ts markPaid so the
 * monotonic guard below is unit-testable.
 *
 * THE GUARD (fixes a paid→partial regression race): a booking with separate
 * deposit + balance transactions receives two Stripe webhooks. The deposit sync
 * writes `payment_status='partial'`; the balance sync writes `'paid'`. If the
 * balance webhook lands first and the deposit webhook lands second, the deposit's
 * write would REGRESS a fully-paid booking back to 'partial' — making talent +
 * workspace financials read wrong. We prevent that with an ATOMIC conditional
 * UPDATE (a `WHERE payment_status NOT IN (terminal…)` clause on the deposit
 * branch), which is correct-by-construction and avoids any read-modify-write race.
 */

/** Terminal payment states a later (possibly stale) deposit sync must never overwrite. */
export const BOOKING_TERMINAL_PAYMENT_STATUSES = ["paid", "refunded", "cancelled"] as const;

/** Build the agency_bookings patch for a paid transaction (deposit vs balance/full). */
export function buildBookingPaymentPatch(
  isDeposit: boolean,
  nowIso: string,
): Record<string, string> {
  return isDeposit
    ? {
        payment_status: "partial",
        client_revenue_lifecycle: "deposit_paid",
        deposit_paid_at: nowIso,
        balance_due_at: nowIso,
        updated_at: nowIso,
      }
    : {
        payment_status: "paid",
        client_revenue_lifecycle: "fully_paid",
        updated_at: nowIso,
      };
}

/**
 * Apply the booking payment sync. For a deposit it adds the atomic monotonic
 * guard so it can never regress a booking already in a terminal paid/refunded/
 * cancelled state (the balance/full branch is itself terminal, so it needs no
 * guard). Returns the Supabase result so the caller can log an error.
 */
export async function applyBookingPaymentSync(
  sb: SupabaseClient,
  opts: { bookingId: string; isDeposit: boolean; nowIso: string },
): Promise<{ error: unknown }> {
  const patch = buildBookingPaymentPatch(opts.isDeposit, opts.nowIso);
  let q = sb.from("agency_bookings").update(patch).eq("id", opts.bookingId);
  if (opts.isDeposit) {
    q = q.not(
      "payment_status",
      "in",
      `(${BOOKING_TERMINAL_PAYMENT_STATUSES.join(",")})`,
    );
  }
  const { error } = await q;
  return { error };
}
