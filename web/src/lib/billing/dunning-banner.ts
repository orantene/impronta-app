/**
 * dunning-banner.ts — when the "payment failed" banner shows (TUL-835).
 *
 * invoice.payment_failed re-syncs the subscription through the single plan-state
 * writer (TUL-836), which stores Stripe's `past_due` (and `unpaid`, mapped to
 * past_due). That status IS the grace window: the plan keeps working while
 * Stripe retries the card on its own schedule (Smart Retries in the Stripe
 * dashboard; there is no separate grace config in the app). When retries run
 * out Stripe ends the subscription and customer.subscription.deleted
 * downgrades to the free plan.
 *
 * The banner's only action is the billing portal (TUL-834), where the card can
 * be updated and the open invoice paid.
 */

export type DunningBanner = { accessUntil: string | null } | null;

export function dunningBanner(
  subscription: { status: string | null; currentPeriodEnd: string | null } | null | undefined,
): DunningBanner {
  if (!subscription || subscription.status !== "past_due") return null;
  return { accessUntil: subscription.currentPeriodEnd };
}
