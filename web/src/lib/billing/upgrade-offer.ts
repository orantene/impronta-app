/**
 * upgrade-offer.ts: what the shared in-app upgrade modal shows and which path
 * its one button takes (TUL-829). Pure, no React, no Stripe.
 *
 *   - Someone with no live subscription goes to Checkout (TUL-830) on the
 *     interval they picked.
 *   - An active / trialing subscriber switches plan in place with proration
 *     (TUL-831): a second Checkout would create a second subscription.
 *   - past_due must settle first (TUL-835), so the button opens billing.
 *   - Yearly is offered only when the catalog has a yearly price for the plan;
 *     the displayed yearly figure comes from the catalog row too.
 */

import {
  yearlySavingsPercent,
  type BillingInterval,
} from "@/lib/pricing/interval-pricing";

export type UpgradeRoute = "checkout" | "plan_change" | "fix_payment" | "current";

const LIVE = new Set(["active", "trialing"]);

export function decideUpgradeRoute(input: {
  currentPlanKey: string | null;
  subscriptionStatus: string | null;
  target: string;
}): UpgradeRoute {
  const status = input.subscriptionStatus ?? "";
  if (status === "past_due") return "fix_payment";
  if (LIVE.has(status)) {
    return input.currentPlanKey === input.target ? "current" : "plan_change";
  }
  return "checkout";
}

export type UpgradeOfferPrice = {
  interval: BillingInterval;
  /** Whole-dollar monthly equivalent, e.g. "$15". */
  perMonth: string;
  /** Total billed per interval, e.g. "$150". Equals perMonth for monthly. */
  billed: string;
  savingsPercent: number;
};

function dollars(cents: number): string {
  const whole = cents / 100;
  return Number.isInteger(whole) ? `$${whole}` : `$${whole.toFixed(2)}`;
}

/** Intervals the toggle may show. Plan change keeps the current interval. */
export function offerIntervals(input: {
  yearlyAvailable: boolean;
  route: UpgradeRoute;
}): BillingInterval[] {
  return input.yearlyAvailable && input.route === "checkout" ? ["month", "year"] : ["month"];
}

export function upgradeOfferPrice(input: {
  monthlyCents: number | null;
  annualCents: number | null;
  interval: BillingInterval;
  yearlyAvailable: boolean;
}): UpgradeOfferPrice | null {
  const { monthlyCents, annualCents } = input;
  const useYearly =
    input.interval === "year" && input.yearlyAvailable && typeof annualCents === "number" && annualCents > 0;
  if (useYearly) {
    return {
      interval: "year",
      perMonth: dollars(Math.round(annualCents / 12)),
      billed: dollars(annualCents),
      savingsPercent: typeof monthlyCents === "number" ? yearlySavingsPercent(monthlyCents, annualCents) : 0,
    };
  }
  if (typeof monthlyCents !== "number" || monthlyCents <= 0) return null;
  return { interval: "month", perMonth: dollars(monthlyCents), billed: dollars(monthlyCents), savingsPercent: 0 };
}
