import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

/**
 * TUL-144 (refund idempotency): which Stripe refund does a `charge.refunded`
 * event stand for?
 *
 * Newer Stripe API versions (the test events arrive at 2024-09-30.acacia) no
 * longer put `charge.refunds` on the Charge in the event, so the routing found
 * no refund id and fell back to the CUMULATIVE `amount_refunded`. Recorded rows
 * then had provider_refund_id NULL, the replay guard was only "same transaction,
 * same amount" (so two deliberate identical partials collapsed into one), a
 * second partial was booked at the running total instead of its own slice, and
 * the failed-refund lookup by refund id (#2909) found nothing.
 *
 * Fix: list the charge's refunds from Stripe and take the OLDEST succeeded one
 * not yet on the books. One event books one refund, in order; a redelivery finds
 * nothing new; two identical partials are two ids. A row recorded before this
 * fix without an id still counts as recorded (matched by amount, one row per
 * refund), so deploying it cannot double-book an old partial.
 */

export type StripeRefundLite = { id: string; amount: number; status: string | null; created: number };
export type RecordedRefundRow = { provider_refund_id: string | null; gross_amount_cents: number };

/** Pure: the oldest succeeded refund that is not on the books yet; null when all are. */
export function pickNextUnrecordedRefund(
  refunds: readonly StripeRefundLite[],
  recorded: readonly RecordedRefundRow[],
): StripeRefundLite | null {
  const ids = new Set(recorded.map((r) => r.provider_refund_id).filter((v): v is string => !!v));
  const legacy = new Map<number, number>();
  for (const r of recorded) {
    if (!r.provider_refund_id) legacy.set(r.gross_amount_cents, (legacy.get(r.gross_amount_cents) ?? 0) + 1);
  }
  const oldestFirst = [...refunds]
    .filter((r) => (r.status ?? "succeeded") === "succeeded")
    .sort((a, b) => a.created - b.created || a.id.localeCompare(b.id));
  for (const refund of oldestFirst) {
    if (ids.has(refund.id)) continue;
    const left = legacy.get(refund.amount) ?? 0;
    if (left > 0) {
      legacy.set(refund.amount, left - 1);
      continue;
    }
    return refund;
  }
  return null;
}

export type RefundEventResolution =
  | { kind: "next"; refundId: string; amountCents: number }
  | { kind: "all_recorded" }
  | { kind: "unavailable" };

export async function resolveRefundForEvent(input: {
  stripe: { refunds: { list: (p: { charge: string; limit: number }) => Promise<{ data: StripeRefundLite[] }> } };
  sb: SupabaseClient;
  chargeId: string;
  transactionId: string;
}): Promise<RefundEventResolution> {
  try {
    const listed = await input.stripe.refunds.list({ charge: input.chargeId, limit: 100 });
    const { data: rows, error } = await input.sb
      .from("booking_transactions")
      .select("provider_refund_id, gross_amount_cents")
      .eq("refund_of_transaction_id", input.transactionId)
      .eq("status", "refunded");
    if (error) {
      logServerError("refund-event-resolve.recorded", error);
      return { kind: "unavailable" };
    }
    const next = pickNextUnrecordedRefund(
      listed.data,
      ((rows ?? []) as Array<{ provider_refund_id: string | null; gross_amount_cents: number | string }>).map((r) => ({
        provider_refund_id: r.provider_refund_id,
        gross_amount_cents: Number(r.gross_amount_cents),
      })),
    );
    return next ? { kind: "next", refundId: next.id, amountCents: next.amount } : { kind: "all_recorded" };
  } catch (err) {
    logServerError("refund-event-resolve.read_threw", err);
    return { kind: "unavailable" };
  }
}

/**
 * A delivery that lost the race for a refund (its pick was booked by another
 * delivery) re-resolves once and books the next unrecorded refund. Returns true
 * when it booked one; false on a plain redelivery (nothing left to book).
 */
export async function bookAfterLostRace(
  resolve: () => Promise<RefundEventResolution>,
  book: (refundId: string, amountCents: number) => Promise<boolean>,
): Promise<boolean> {
  const again = await resolve();
  if (again.kind !== "next") return false;
  return book(again.refundId, again.amountCents);
}
