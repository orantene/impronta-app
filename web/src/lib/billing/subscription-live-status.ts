/**
 * TUL-1737: which Stripe / local subscription statuses mean "this workspace still HAS a subscription".
 * Only an ended one does not. unpaid / incomplete / paused are live-but-troubled: they must never be treated as "no
 * subscription", because that lets a local plan_tier write downgrade (or a second checkout duplicate) a customer
 * Stripe still knows about.
 */
const ENDED = new Set(["canceled", "cancelled", "incomplete_expired"]);

/** True when a subscription row/object with this status still exists for billing purposes. */
export function isExistingSubscriptionStatus(status: string | null | undefined): boolean {
  return !ENDED.has(String(status ?? ""));
}

/** Stripe statuses a period-end schedule / cancel can safely be applied to. */
const ACTIONABLE = new Set(["active", "trialing", "past_due"]);
export function isActionableSubscriptionStatus(status: string | null | undefined): boolean {
  return ACTIONABLE.has(String(status ?? ""));
}
