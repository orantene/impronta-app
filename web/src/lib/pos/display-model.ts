/**
 * display-model.ts — the customer display's state, derived from the sale.
 *
 * The customer display (design boards D01 to D08) is a second screen for the
 * SAME sale the cashier has open at the counter. It has no state of its own
 * to keep: what it shows is a projection of the order's real status and the
 * money rows under it, read every couple of seconds through the counter's
 * own reader (`loadPosSale`). This file is the projection, as a pure
 * function, so the eight screens and their order can be proven without a
 * browser. No React, no I/O.
 *
 * THE ONLY RULE ABOUT MONEY HERE IS THAT THERE IS NONE. Every figure on the
 * display (`totalCents`, `depositPaidCents`, `outstandingCents`) is the
 * reader's own, computed by the same `cartTotals` the counter charges with;
 * the display never adds, subtracts or rounds a cent. A tip line would need a
 * line kind the engine does not have (D-POS-11), so tips are rendered as not
 * offered, in a sentence, rather than as a number this screen invents.
 */

/** A sale as the display reads it. A subset of `PosSaleView`, plus who it is for. */
export type DisplaySale = {
  readonly orderId: string;
  readonly version: number;
  readonly paymentState: "unpaid" | "pending" | "paid" | "cancelled";
  readonly lineCount: number;
};

/**
 * The newest money row under the sale, by `requested_at`. Its status is one
 * of `booking_transactions.status`: `draft`, `payment_requested`, `pending`,
 * `paid`, `failed`, `cancelled`, and the payout states after `paid`.
 */
export type DisplayTransaction = {
  readonly status: string;
};

export type DisplayState =
  /** D01: nothing open, or an open sale with nothing on it yet. */
  | "idle"
  /** D02: lines and totals, waiting for the counter to charge. */
  | "review"
  /** D05: a payment has been requested and nothing has settled. */
  | "waiting"
  /** D06: the newest attempt failed and the sale has not moved since. */
  | "declined"
  /** D07: the order is paid. */
  | "paid";

const IN_FLIGHT = new Set(["payment_requested", "pending"]);
const FAILED = new Set(["failed", "cancelled"]);

/**
 * Which screen the display shows.
 *
 * `declinedSeenAtVersion` is the sale version the display was showing when it
 * first rendered a decline. A failed money row stays the newest row forever
 * unless another attempt is made, so without this the screen would say
 * "declined" while the cashier adds a line and prepares to charge again; the
 * version bump from that edit is what returns the display to the review.
 */
export function displayStateFor(input: {
  sale: DisplaySale | null;
  latestTransaction: DisplayTransaction | null;
  declinedSeenAtVersion: number | null;
}): DisplayState {
  const { sale, latestTransaction } = input;
  if (!sale) return "idle";
  if (sale.paymentState === "paid") return "paid";
  if (sale.paymentState === "cancelled") return "idle";
  if (sale.paymentState === "pending") return "waiting";
  if (latestTransaction && IN_FLIGHT.has(latestTransaction.status)) return "waiting";
  if (sale.lineCount === 0) return "idle";
  if (latestTransaction && FAILED.has(latestTransaction.status)) {
    const seen = input.declinedSeenAtVersion;
    if (seen === null || seen === sale.version) return "declined";
  }
  return "review";
}

/**
 * Which sale the display should follow next.
 *
 * The display follows the counter it was opened from: the counter writes the
 * id of the sale it has open (`counter-display-beacon.tsx`), and that id wins
 * whenever it is present. A display on another device sees no beacon, so it
 * follows the workspace's newest open sale instead. A sale the display has
 * just finished with (paid, receipt offered) is never re-adopted from the
 * beacon, or the thank-you screen would come straight back after clearing.
 */
export function nextFollowedOrder(input: {
  beacon: string | null;
  newestOpen: string | null;
  finished: string | null;
}): string | null {
  // A beacon, even one naming the finished sale, means a counter is on this
  // device: the display never wanders off to another till's sale.
  if (input.beacon) return input.beacon === input.finished ? null : input.beacon;
  if (input.newestOpen && input.newestOpen !== input.finished) return input.newestOpen;
  return null;
}
