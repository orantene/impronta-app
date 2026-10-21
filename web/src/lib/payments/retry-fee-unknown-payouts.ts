/**
 * Retry pass_through payout legs HELD because the real processing fee was not
 * known when the charge settled (transfers.ts records them as status='held',
 * amount_cents=0, last_error 'processing fee ...').
 *
 * For each distinct transaction with such a leg, re-run executeBookingTransfers
 * in skipTransferredLegs mode: the fee is read again from the balance
 * transaction on the platform that took the charge; if it is known now the
 * held legs pay out, otherwise they stay held (never guessed). Any leg already
 * transferred is skipped from the ledger, and Stripe idempotency keys are the
 * same as the original attempt, so the retry is idempotent.
 *
 * A refund-pending hold (TUL-1746: Stripe shows a refund our ledger has not recorded yet) is retried the same way.
 *
 * Cross-platform holds are NOT retried here (amount > 0, their own last_error
 * reason); a human resolves those.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { FEE_UNKNOWN_ERROR_PREFIX, LEDGER_UNREADABLE_ERROR_PREFIX, REFUND_PENDING_ERROR_PREFIX } from "@/lib/payments/balance-payout-refund-net";
import { executeBookingTransfers, type TransferDeps, type TransferOutcome } from "@/lib/payments/transfers";

// FEE_UNKNOWN_ERROR_PREFIX lives in balance-payout-refund-net (light import, shared with the stale-hold alert).
export { FEE_UNKNOWN_ERROR_PREFIX };

export type FeeUnknownRetryResult = {
  transactions: number;
  paid: number;
  stillHeld: number;
  failed: number;
};

export async function retryFeeUnknownPayouts(
  sb: SupabaseClient,
  deps: {
    execute?: (transactionId: string, deps: TransferDeps) => Promise<TransferOutcome[]>;
    limit?: number;
  } = {},
): Promise<FeeUnknownRetryResult> {
  const result: FeeUnknownRetryResult = { transactions: 0, paid: 0, stillHeld: 0, failed: 0 };
  const { data, error } = await sb
    .from("booking_payouts")
    .select("transaction_id")
    .eq("status", "held")
    .eq("amount_cents", 0)
    // Two kinds of zero-amount hold are re-run from scratch: the fee was unknown (pass_through), or a refund was
    // in flight (TUL-1746). Both are recomputed fresh, so a refund that has landed is netted before anything pays.
    .or(
      `last_error.like."${FEE_UNKNOWN_ERROR_PREFIX}%",last_error.like."${REFUND_PENDING_ERROR_PREFIX}%",last_error.like."${LEDGER_UNREADABLE_ERROR_PREFIX}%"`,
    )
    // Oldest touch first: with a cap and no order the same 200 rows could starve the rest forever. A leg that is
    // held again is UPDATEd by recordPayoutLeg, which the booking_payouts touch trigger stamps with a fresh
    // updated_at, so it goes to the back of the line.
    .order("updated_at", { ascending: true })
    .not("transaction_id", "is", null)
    .limit(deps.limit ?? 200);
  if (error) {
    logServerError("payouts.retryFeeUnknown", error);
    return result;
  }
  const txIds = [
    ...new Set(((data ?? []) as Array<{ transaction_id: string | null }>).map((r) => r.transaction_id).filter((x): x is string => !!x)),
  ];
  const execute = deps.execute ?? executeBookingTransfers;
  for (const txId of txIds) {
    result.transactions++;
    const outcomes = await execute(txId, { sb, skipTransferredLegs: true });
    for (const o of outcomes) {
      if (o.status === "transferred") result.paid++;
      else if (o.status === "failed") result.failed++;
      else if (o.status !== "mock" && o.status !== "skipped_zero") result.stillHeld++;
    }
  }
  return result;
}
