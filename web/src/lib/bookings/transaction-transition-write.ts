/**
 * lib/bookings/transaction-transition-write.ts
 *
 * The one write of the money state machine, guarded on the status it leaves.
 *
 * `transitionStatus` reads the row, checks the from-status, then writes. The
 * write used to match on `id` alone, and the database trigger allows
 * `paid -> paid`, so two settlements racing for one row (hosted Checkout sends
 * `checkout.session.completed` AND `payment_intent.succeeded`) both passed the
 * read, both wrote, and every follow-on (confirmation and invoice emails,
 * payment notice, chat card, audit event, payout fan-out) ran twice.
 *
 * Guarding the UPDATE on `status IN (from)` makes the database pick exactly one
 * winner. The loser gets zero rows back and an `already_transitioned` answer,
 * which callers treat as "someone else did it": no side effects, no retry storm.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type GuardedTransitionWrite =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; alreadyTransitioned: true }
  | { ok: false; alreadyTransitioned: false; error: { message: string } };

export async function writeGuardedTransition(
  sb: SupabaseClient,
  input: { transactionId: string; fromStatuses: readonly string[]; patch: Record<string, unknown> },
): Promise<GuardedTransitionWrite> {
  const { data, error } = await sb
    .from("booking_transactions")
    .update(input.patch)
    .eq("id", input.transactionId)
    .in("status", [...input.fromStatuses])
    .select("*");
  if (error) return { ok: false, alreadyTransitioned: false, error: { message: String(error.message ?? error) } };
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  if (rows.length === 0) return { ok: false, alreadyTransitioned: true };
  return { ok: true, row: rows[0] };
}
