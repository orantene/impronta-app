/**
 * duplicate-subscription.ts (TUL-830): one paid subscription per talent and
 * per workspace. Checkout refuses when the subject already holds a subscription
 * that grants access (active, trialing, or past_due in the dunning window); the
 * calling action routes the person to the in-app plan change (TUL-831,
 * `planChangeTarget`), with the Billing Portal URL kept as the fallback.
 * Pure, so talent and workspace checkout share one rule.
 */

/** Statuses that already grant paid access (same set as talent-plan-state). */
const BLOCKING = new Set(["active", "trialing", "past_due"]);

export type ExistingSubscriptionCheck = "blocking" | "clear" | "unknown";

export const ALREADY_SUBSCRIBED_ERROR = "You already have an active plan. Change it from Billing.";
export const SUBSCRIPTION_CHECK_FAILED_ERROR = "We could not check your current plan. Try again.";

export function classifyExistingSubscription(read: {
  data: { status?: string | null } | null;
  error: unknown;
}): ExistingSubscriptionCheck {
  if (read.error) return "unknown";
  const status = read.data?.status ?? null;
  return status && BLOCKING.has(status) ? "blocking" : "clear";
}

export function checkoutGuardError(check: ExistingSubscriptionCheck): string | null {
  if (check === "blocking") return ALREADY_SUBSCRIBED_ERROR;
  if (check === "unknown") return SUBSCRIPTION_CHECK_FAILED_ERROR;
  return null;
}

export function isAlreadySubscribedError(error: string | null | undefined): boolean {
  return error === ALREADY_SUBSCRIBED_ERROR;
}

/** TUL-831: what the in-app plan change flow needs to preview the requested plan. */
export type PlanChangeTarget = { planKey: string; interval: "month" | "year" };

export function planChangeTarget(planKey: string, interval: unknown): PlanChangeTarget {
  return { planKey, interval: interval === "year" ? "year" : "month" };
}
