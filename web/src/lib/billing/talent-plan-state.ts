/**
 * lib/billing/talent-plan-state.ts (TUL-836)
 *
 * One decision for every Stripe event that touches a talent plan. Checkout,
 * customer.subscription.created/updated/deleted and invoice paid/failed all
 * end up here, so `talent_subscriptions` + `talent_profiles.talent_plan_key`
 * have a single writer and a single rule set.
 *
 * Pure on purpose: no Stripe, no Supabase. The writer in talent-billing.ts
 * feeds it the stored row and applies the result. Replaying the same event
 * yields the same write, which is what makes the sync idempotent on top of
 * the event-id claim in event-idempotency.ts.
 */

export type TalentPaidPlanKey = "talent_pro" | "talent_portfolio" | (string & {});

export type StoredTalentPlanRow = {
  status: string | null;
  plan_key: string | null;
  stripe_subscription_id: string | null;
};

export type TalentPlanDecisionInput = {
  /** Stripe event type, or "sync" for checkout / invoice re-syncs. */
  eventType: string;
  subscriptionId: string;
  /** Already mapped through mapStripeStatus. */
  status: string;
  /** Plan the subscription is for, from metadata or price. */
  planKey: string;
  existing: StoredTalentPlanRow | null;
  /** talent_profiles.talent_plan_key before this event. */
  previousProfilePlan: string | null;
};

export type TalentPlanDecision =
  | { kind: "skip_stale"; reason: string }
  /**
   * TUL-1835: a DIFFERENT, non-terminal subscription arrived for a talent whose
   * row already holds a live one (active / trialing / past_due). The row is
   * kept; the caller logs `duplicate_talent_subscription` and writes nothing.
   */
  | { kind: "duplicate_live"; existingSubscriptionId: string; reason: string }
  | {
      kind: "write";
      /** Plan recorded on the subscription row (last paid tier). */
      rowPlan: string;
      /** Plan the talent actually has access to now. */
      profilePlan: string;
      status: string;
      /** True when access changed, so site provisioning must re-run. */
      planChanged: boolean;
    };

export const FREE_TALENT_PLAN = "talent_basic";

const TERMINAL = new Set(["cancelled", "incomplete_expired"]);
/** Statuses that keep paid access. past_due is the dunning grace window (TUL-835). */
const GRANTS_ACCESS = new Set(["active", "trialing", "past_due"]);

export function isTerminalTalentStatus(status: string | null | undefined): boolean {
  return status != null && TERMINAL.has(status);
}

export function decideTalentPlanState(input: TalentPlanDecisionInput): TalentPlanDecision {
  const deleted = input.eventType === "customer.subscription.deleted";
  const status = deleted ? "cancelled" : input.status;
  const terminal = isTerminalTalentStatus(status);
  const existing = input.existing;
  const sameSubscription =
    !existing?.stripe_subscription_id || existing.stripe_subscription_id === input.subscriptionId;

  // Out-of-order delivery: an old subscription's late event must not touch a
  // newer subscription's row, and a terminal row must not be re-promoted by a
  // stale "updated" for the same subscription. A NEW subscription id after a
  // cancel is a resubscribe and is allowed through.
  if (existing && !sameSubscription && terminal) {
    return { kind: "skip_stale", reason: `event for replaced subscription ${input.subscriptionId}` };
  }
  if (existing && sameSubscription && isTerminalTalentStatus(existing.status) && !terminal) {
    return { kind: "skip_stale", reason: `subscription ${input.subscriptionId} already ${existing.status}` };
  }

  // TUL-1835: never overwrite a live subscription's row with a different one.
  // Before this, a second checkout's subscription replaced the first id and the
  // first kept billing in Stripe, orphaned. A terminal existing row is a
  // legitimate resubscribe and falls through.
  if (
    existing?.stripe_subscription_id &&
    !sameSubscription &&
    !terminal &&
    existing.status != null &&
    GRANTS_ACCESS.has(existing.status)
  ) {
    return {
      kind: "duplicate_live",
      existingSubscriptionId: existing.stripe_subscription_id,
      reason: `talent already has live subscription ${existing.stripe_subscription_id} (${existing.status}); got ${input.subscriptionId}`,
    };
  }

  const paidPlan = input.planKey && input.planKey !== FREE_TALENT_PLAN ? input.planKey : "talent_pro";
  const rowPlan = terminal ? (existing?.plan_key ?? paidPlan) : paidPlan;

  const previous = input.previousProfilePlan ?? FREE_TALENT_PLAN;
  let profilePlan: string;
  if (terminal) profilePlan = FREE_TALENT_PLAN;
  else if (GRANTS_ACCESS.has(status)) profilePlan = paidPlan;
  // incomplete: the first payment has not cleared, so grant nothing new.
  else profilePlan = previous;

  return { kind: "write", rowPlan, profilePlan, status, planChanged: profilePlan !== previous };
}
