/**
 * The order status graph, and the one distinction every rule about it needs:
 * does this status mean the order HOLDS A SALE, or not?
 *
 * WHY THIS FILE EXISTS. The identity gate was written as "anything that is not
 * draft", which quietly swept in `cancelled`. A void and an expiry are status
 * writes away from draft, so an anonymous draft holding a ticket that needs a
 * name could not be paid (correct) and could not be voided either (a locked
 * till, because the counter holds one open draft per terminal). The bug was not
 * a missed case; it was a missing concept. Naming the two sides of the graph is
 * what stops the next rule making the same substitution.
 *
 * SELLING vs NOT SELLING, and why each label sits where it does:
 *   draft      - a cart, or a quote still being built. Nothing is owed.
 *   cancelled  - voided at the counter, or reaped by the expiry sweep. The sale
 *                did not happen. This is how a demand that cannot be met gets
 *                resolved, so it can never be the thing a demand refuses.
 *   quoted     - put to a client and awaiting their word: a commitment.
 *   pending_payment, paid, fulfilled - money is held or taken.
 *   refunded, partially_refunded - the sale stood and is being unwound. Only
 *                reachable from paid, so a gate on entry never fires here in
 *                practice; classified as selling because the row still carries
 *                a sale's history and must not be quietly stripped of its name.
 *
 * THE SAME LIST LIVES IN SQL. `public.order_status_is_selling`, added by
 * `20261230002500_identity_gates_selling_not_abandoning.sql`, is the enforcing
 * copy; this one is what the server code reads before it writes.
 * `identity-gate-status.static.test.ts` fails if the two ever disagree, or if a
 * label is added to the enum and not classified here.
 */

/** Every label of `public.order_status`, in the enum's own order. */
export const ORDER_STATUSES = [
  "draft",
  "quoted",
  "pending_payment",
  "paid",
  "fulfilled",
  "cancelled",
  "refunded",
  "partially_refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

/**
 * The statuses that do NOT hold a sale. Deliberately the short list: it is the
 * exhaustive one, and writing the long list instead is how `cancelled` got
 * swept in the first time.
 */
export const NON_SELLING_ORDER_STATUSES = ["draft", "cancelled"] as const;

export type NonSellingOrderStatus = (typeof NON_SELLING_ORDER_STATUSES)[number];

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

/**
 * Does this status mean the order holds a sale?
 *
 * Takes an `OrderStatus`, so an unclassified label is a compile error rather
 * than a silent `false`. Callers holding a raw string from the database narrow
 * with `isOrderStatus` first and decide for themselves what an unknown status
 * means, because "not a status we know" is not the same answer as "not
 * selling" and must not borrow its handling.
 */
export function isSellingOrderStatus(status: OrderStatus): boolean {
  return !(NON_SELLING_ORDER_STATUSES as readonly string[]).includes(status);
}
