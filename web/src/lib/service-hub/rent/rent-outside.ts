/**
 * TUL-1646 · Rent paid outside Tulala: cash or bank transfer (pure). The owner records that a month's rent was received
 * directly. No Tulala fee (the money never went through Tulala; same rule as a card payment taken in person). A month
 * already paid by link, card or outside is refused, so nothing is paid or recorded twice. The owner types the amount
 * actually received (a percentage month varies); it is stored as is.
 */
import { MAX_RENT_CENTS, currentRentPeriod, isRentPeriod, nextRentPeriodOf, type RentPlan } from "./rent-cycle";

export const OUTSIDE_METHODS = ["cash", "transfer"] as const;
export type OutsideMethod = (typeof OUTSIDE_METHODS)[number];

export type OutsideContext = {
  plan: RentPlan;
  period: string;
  method: OutsideMethod;
  amountCents: number;
  /** Status of the (plan, month) invoice row if one exists. */
  existingStatus: string | null;
  now: Date;
  /**
   * `invoice.created` is subscribed on the Stripe endpoints (RENT_AUTOPAY_INVOICE_CREATED_SUBSCRIBED=1). Without it the
   * webhook never sees next month's draft, so a future month paid outside could not be voided in time.
   */
  invoiceCreatedSubscribed?: boolean;
};

export type OutsideRefusal = "bad_period" | "bad_method" | "bad_amount" | "not_accepted" | "not_active" | "before_start" | "future_period" | "already_paid" | "autopay_future_month";

export function decideMarkPaidOutside(c: OutsideContext): { ok: true } | { ok: false; reason: OutsideRefusal } {
  if (!isRentPeriod(c.period)) return { ok: false, reason: "bad_period" };
  if (!OUTSIDE_METHODS.includes(c.method)) return { ok: false, reason: "bad_method" };
  if (!Number.isInteger(c.amountCents) || c.amountCents <= 0 || c.amountCents > MAX_RENT_CENTS) return { ok: false, reason: "bad_amount" };
  if (c.plan.acceptedAt == null) return { ok: false, reason: "not_accepted" };
  if (c.plan.status !== "active" && c.plan.status !== "paused") return { ok: false, reason: "not_active" };
  if (c.period < c.plan.startsOn.slice(0, 7)) return { ok: false, reason: "before_start" };
  // This month, or NEXT month paid ahead (the case that matters on automatic payments: before the 1st charge).
  if (c.period > nextRentPeriod(c.now)) return { ok: false, reason: "future_period" };
  if (c.existingStatus === "paid") return { ok: false, reason: "already_paid" };
  // On live automatic payments a FUTURE month can only be stopped by the webhook voiding its draft.
  if (["pending", "active", "past_due", "paused"].includes(c.plan.autopayStatus ?? "off") && c.period > currentRentPeriod(c.now) && !c.invoiceCreatedSubscribed) {
    return { ok: false, reason: "autopay_future_month" };
  }
  return { ok: true };
}

/** The month after the current one (rent months are America/Mexico_City months). */
export function nextRentPeriod(now: Date): string {
  return nextRentPeriodOf(currentRentPeriod(now));
}

/** The webhook voids the automatic invoice of a month the owner recorded as paid outside. */
export function shouldSkipAutopayInvoice(skipPeriods: readonly string[], invoicePeriod: string): boolean {
  return skipPeriods.includes(invoicePeriod);
}
