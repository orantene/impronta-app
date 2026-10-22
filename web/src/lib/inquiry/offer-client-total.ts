/**
 * The client total of an offer: the priced lines PLUS the workspace's own
 * coordination fee (TUL-1306).
 *
 * The editor always described the fee as "added on top of the line items", and
 * saved it in `inquiry_offers.coordinator_fee`, but every total was the line
 * sum alone: the fee was shown to staff as agency revenue and never charged.
 * One function now derives the number the client sees, accepts and pays, so the
 * editor, the draft save and the send self-heal cannot drift apart.
 *
 * Major units in, major units out, rounded to the currency's own decimals. A
 * negative or non-finite fee adds nothing.
 */
import { minorUnitDivisor } from "@/lib/orders/money-format";

export function offerClientTotalMajor(lineSumMajor: number, coordinatorFeeMajor: number, currency: string | null | undefined): number {
  const lines = Number.isFinite(lineSumMajor) ? lineSumMajor : 0;
  const fee = Number.isFinite(coordinatorFeeMajor) && coordinatorFeeMajor > 0 ? coordinatorFeeMajor : 0;
  if (lines <= 0) return lines;
  const divisor = minorUnitDivisor((currency ?? "").trim() || "USD");
  return Math.round((lines + fee) * divisor) / divisor;
}
