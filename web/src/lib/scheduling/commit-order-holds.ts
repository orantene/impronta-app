/**
 * commit-order-holds.ts — a settled order keeps the person it booked.
 *
 * THE DEFECT THIS CLOSES (found in the database, 2026-09-10)
 * ═══════════════════════════════════════════════════════════
 * A guest booked a gel manicure on the public page and the order settled. The
 * room's allocation was committed, the booking went on the board with its
 * time, and the TALENT'S HOLD — the row that says this person is busy from
 * 9:00 to 9:45 — kept the fifteen-minute expiry it was written with.
 * `reserve_resource_set_v2` stamps every hold `expires_at = now() + ttl`
 * because at that moment nothing has been paid, and `settleOrHoldOrder` then
 * commits the capacity legs and never touches the person legs. Fifteen
 * minutes later `load-busy` stops counting the hold, the public page offers
 * 9:00 again, and `cron/expire-calendar-holds` deletes the row outright.
 * So a confirmed appointment held the room and lost the person.
 *
 * The capacity engine already has the right shape: `commit_capacity` turns a
 * `hold` into `committed` and the reaper leaves it alone. This is the same
 * step for `talent_holds`, where "committed" is `expires_at IS NULL` — the
 * value `hold-expiry.ts` documents as "never lapses".
 *
 * KEYED BY THE ORDER, because that is the only link an instant booking has:
 * the purchase writes its holds under `order:<id>:reserve` and no inquiry
 * exists to hang them from. The inquiry path converts its hold into a
 * `talent_bookings` mirror instead (`reservation-convert.ts`) and does not
 * pass through here.
 *
 * A HOLD THAT IS ALREADY GONE IS REPORTED, NOT INVENTED. If the cron reaped
 * the row before the money landed, the time may already belong to somebody
 * else, and re-inserting a hold over their booking would be the double-booking
 * this file exists to prevent. The caller logs it as capacity's
 * `CAPACITY_LOST_AFTER_PAYMENT` is logged: loudly, for a human.
 */

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // Tests inject a fake PostgREST builder. Same seam as booking-shell.ts and
  // expire-orders.ts, so the write can be checked without a database.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/** The key `createPurchase` reserves under. One place, so a reader and a writer cannot drift. */
export function orderReserveOperationKey(orderId: string): string {
  return `order:${orderId}:reserve`;
}

export type CommitOrderHoldsResult =
  | { ok: true; committed: number }
  | { ok: false; error: string };

/**
 * Make every talent hold this order placed permanent.
 *
 * Idempotent by the value it writes: NULL over NULL is the same row, so a
 * retry after a lost response changes nothing and reports the same count.
 * Returns the number of holds under the order's key.
 */
export async function commitOrderTalentHolds(
  admin: Admin,
  input: { readonly tenantId: string; readonly orderId: string },
): Promise<CommitOrderHoldsResult> {
  if (!input.tenantId || !input.orderId) return { ok: false, error: "missing order" };
  const { data, error } = await admin
    .from("talent_holds")
    .update({ expires_at: null })
    .eq("tenant_id", input.tenantId)
    .eq("operation_key", orderReserveOperationKey(input.orderId))
    .select("id");
  if (error) {
    logServerError("scheduling.commitOrderTalentHolds", error);
    return { ok: false, error: error.message };
  }
  return { ok: true, committed: (data ?? []).length };
}
