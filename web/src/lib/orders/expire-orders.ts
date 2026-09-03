/**
 * Order expiry — two fuses, because two things are being wasted.
 *
 * THE DISTINCTION, from the Front Door Manager and it is the right one:
 * an abandoned cart HOLDING CAPACITY is denying a real seat to a real person,
 * and wants a short fuse. A cart holding nothing costs nobody anything and can
 * live for days. Reaping both on age alone would either strand seats or throw
 * away carts people are still filling.
 *
 * WHY THE ORDER SIDE NEEDS ITS OWN SWEEP. Capacity's `reap_capacity_allocations`
 * already releases lapsed allocations, so the seat comes back on its own. But
 * nothing moves the ORDER, so it sits in `pending_payment` for ever: a row that
 * claims a payment is in flight, holding nothing, that no reconciliation will
 * ever close. The seat is not the only thing that leaks.
 *
 * Pure decision, no I/O. The runner is `sweepExpiredOrders`.
 */

/** A cart still being filled deserves longer than one holding a seat. */
export const HELD_ORDER_GRACE_MINUTES = 0;
export const IDLE_DRAFT_TTL_HOURS = 72;

export type ExpiringOrder = {
  id: string;
  status: string;
  /** Set only while a payment is in flight against held capacity. */
  holdExpiresAt: string | null;
  createdAt: string;
  updatedAt: string | null;
};

export type ExpiryDecision =
  | { action: "cancel"; reason: "hold_lapsed" | "draft_abandoned" }
  | { action: "keep"; reason: "hold_live" | "draft_fresh" | "not_expirable" };

/**
 * Decide one order's fate.
 *
 * Only `draft` and `pending_payment` are ever touched. An order that reached
 * `paid` is money and is never swept, whatever its hold says — the hold lapsing
 * after a successful charge is a real branch (Capacity's `commit_capacity`
 * refuses an expired hold), and the answer to it is an alert for a human, never
 * a cancellation of a paid order.
 */
export function decideOrderExpiry(order: ExpiringOrder, now: Date = new Date()): ExpiryDecision {
  if (order.status === "pending_payment") {
    if (!order.holdExpiresAt) {
      // Awaiting payment with no hold: nothing is being denied to anyone, so
      // the short fuse does not apply. Left alone deliberately — cancelling a
      // payment someone may still be completing is worse than a stale row.
      return { action: "keep", reason: "not_expirable" };
    }
    const expiry = Date.parse(order.holdExpiresAt);
    if (!Number.isFinite(expiry)) return { action: "keep", reason: "not_expirable" };
    const graceMs = HELD_ORDER_GRACE_MINUTES * 60_000;
    return expiry + graceMs < now.getTime()
      ? { action: "cancel", reason: "hold_lapsed" }
      : { action: "keep", reason: "hold_live" };
  }

  if (order.status === "draft") {
    const touched = Date.parse(order.updatedAt ?? order.createdAt);
    if (!Number.isFinite(touched)) return { action: "keep", reason: "not_expirable" };
    // Measured from the LAST TOUCH, not creation. A cart someone is still
    // adding to is not abandoned, however long ago they started it.
    const ageHours = (now.getTime() - touched) / 3_600_000;
    return ageHours > IDLE_DRAFT_TTL_HOURS
      ? { action: "cancel", reason: "draft_abandoned" }
      : { action: "keep", reason: "draft_fresh" };
  }

  return { action: "keep", reason: "not_expirable" };
}
