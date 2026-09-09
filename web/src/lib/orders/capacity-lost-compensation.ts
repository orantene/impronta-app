import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";

/**
 * Compensation when money lands and the seat cannot be granted.
 *
 * Ticket minting already writes `ticket_refund_intents` for ticket lines.
 * This is the same table and the same unique key (`order_line_id`), used for
 * every capacity-backed line so a menu or reservation order is not left paid
 * with nothing. `ignoreDuplicates` is the duplicate-compensation guard: a
 * second complete, a mint hook, and a cron claim cannot insert a second row.
 *
 * The cron at `/api/cron/ticket-refund-intents` executes the intent. Staff
 * see pending / failed / done on that row (`claimed_at`, `executed_at`,
 * `result`). Already-issued refunds are the executor's problem — it calls
 * `refundOrderLines`, which plans against `refunded_cents`.
 */

export type CompensationInput = {
  tenantId: string;
  orderId: string;
  lineIds: readonly string[];
  /** Transaction that completed the sale. Recorded in result_detail only. */
  transactionId: string | null;
  reason: "seat_lost_after_payment";
};

export type CompensationWrite =
  | { ok: true; wrote: number }
  | { ok: false; reason: "write_failed" };

export function linesNeedingCompensation(input: {
  holdExpiresAt: string | null;
  holdAllocationCount: number;
  commitFailed: boolean;
  committed: number;
}): boolean {
  if (input.commitFailed) return true;
  if (input.holdAllocationCount > 0 && input.committed === 0) return true;
  if (input.holdExpiresAt && input.committed === 0) return true;
  return false;
}

export async function recordCapacityLostCompensation(
  admin: SupabaseClient,
  input: CompensationInput,
): Promise<CompensationWrite> {
  const lineIds = [...new Set(input.lineIds.filter(Boolean))];
  if (lineIds.length === 0) return { ok: true, wrote: 0 };

  const { error } = await admin.from("ticket_refund_intents").upsert(
    lineIds.map((order_line_id) => ({
      tenant_id: input.tenantId,
      order_id: input.orderId,
      order_line_id,
      reason: input.reason,
      result_detail: {
        transaction_id: input.transactionId,
        eligible: "line_total_minus_already_refunded",
        effect: "refund_after_service_or_revoke_if_unused",
      },
    })),
    { onConflict: "order_line_id", ignoreDuplicates: true },
  );
  if (error) {
    logServerError(
      "orders.compensation/SEAT_LOST_INTENT_WRITE_FAILED",
      `${error.message} order=${input.orderId} lines=${lineIds.join(",")}`,
    );
    return { ok: false, reason: "write_failed" };
  }
  return { ok: true, wrote: lineIds.length };
}
