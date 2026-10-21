/**
 * TUL-1518 · The Stripe half of a workspace plan DOWNGRADE. commitPlanDowngrade used to archive the roster and write
 * `agencies.plan_tier` and never contacted Stripe, so the customer kept being billed the old price (and the next
 * subscription webhook put the old tier back). Now, when the workspace has a live Stripe subscription, Stripe is told
 * FIRST and the caller does nothing local unless Stripe accepted:
 *   - to a lower PAID plan: a period-end schedule through the existing in-app plan-change code (confirmPlanChange:
 *     no proration, new price from the next period, idempotent keys, an existing schedule is reused);
 *   - to FREE: cancel at period end through the existing cancel flow.
 * Stripe decides when the tier changes and the webhook writes it (the single writer), so the caller must NOT write
 * plan_tier when `hadSubscription` is true. A workspace with no live subscription (free, comped) is the caller's
 * direct write, as before. Everything is injectable so it is tested with a fake Stripe client.
 */
import type Stripe from "stripe";

import { confirmPlanChange, type PlanChangeStripe } from "./plan-change";
import { planChangePolicy, planRank } from "./plan-change-policy";
import { parseBillingInterval } from "@/lib/pricing/interval-pricing";
import { isActionableSubscriptionStatus, isExistingSubscriptionStatus } from "./subscription-live-status";

export type WorkspaceDowngradeTarget = "free" | "website" | "studio" | "agency" | "network";

export type WorkspaceDowngradeStripeResult =
  | { ok: true; hadSubscription: false }
  | { ok: true; hadSubscription: true; mode: "schedule" | "cancel_at_period_end"; effectiveAt: string | null }
  | { ok: false; error: string };

export type WorkspaceDowngradeDeps = {
  /** null = no live subscription. Throws on an unreadable row (fail closed). */
  readSubscriptionId(tenantId: string): Promise<string | null>;
  stripe(): (PlanChangeStripe & { subscriptions: Pick<Stripe["subscriptions"], "retrieve" | "update"> }) | null;
  /** Catalog price for (plan, interval); null = not sold. */
  resolvePriceId(plan: string, interval: "month" | "year"): Promise<string | null>;
  /**
   * TUL-1737: persist the owner's keep-list with the pending change. Called AFTER the downgrade is validated and BEFORE
   * the first Stripe write, so a persistence failure stops everything with zero Stripe calls (no duplicate attempt is
   * possible) and a Stripe success is never followed by a local write that can fail. Not called when there is no live
   * subscription (the caller archives immediately then).
   */
  recordPending(tenantId: string): Promise<{ ok: true } | { ok: false }>;
  cancelAtPeriodEnd(tenantId: string): Promise<{ ok: true; effectiveAt: string | null } | { ok: false; error: string }>;
  now(): number;
};

const PERSIST_FAIL = { ok: false as const, error: "We could not save your plan change. Nothing was changed. Try again." };
const FAIL = { ok: false as const, error: "We could not change your Stripe subscription. Nothing was changed. Try again." };

/** One stable proration date per 15 minute window, so a retry or double click reuses the same idempotency keys. */
export function downgradeProrationDate(nowMs: number): number {
  return Math.floor(nowMs / 900_000) * 900;
}

export async function applyWorkspaceDowngradeAtStripe(
  tenantId: string,
  target: WorkspaceDowngradeTarget,
  deps: WorkspaceDowngradeDeps,
): Promise<WorkspaceDowngradeStripeResult> {
  let subscriptionId: string | null;
  try {
    subscriptionId = await deps.readSubscriptionId(tenantId);
  } catch {
    return FAIL; // unreadable: never look like "no subscription"
  }
  if (!subscriptionId) return { ok: true, hadSubscription: false };

  const stripe = deps.stripe();
  if (!stripe) return { ok: false, error: "Billing is not available right now. Nothing was changed." };

  try {
    const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["items.data.price"] });
    if (!isExistingSubscriptionStatus(sub.status)) {
      // Ended at Stripe (canceled / incomplete_expired): nothing to downgrade there; the caller's local write is correct.
      return { ok: true, hadSubscription: false };
    }
    if (!isActionableSubscriptionStatus(sub.status)) {
      // unpaid / incomplete / paused is a LIVE subscription that Stripe still owns: never fall through to a local tier
      // write (that would downgrade a customer Stripe has not agreed to downgrade). Resolve the payment first.
      return { ok: false, error: "Your subscription needs attention before the plan can change. Fix the payment first. Nothing was changed." };
    }
    const item = sub.items.data[0];
    const currentPlan = sub.metadata?.plan_key ?? "";
    const interval = item?.price?.recurring?.interval === "year" ? "year" : "month";

    if (target === "free") {
      const recorded = await deps.recordPending(tenantId);
      if (!recorded.ok) return PERSIST_FAIL;
      // A plan-change schedule already pending (an earlier paid downgrade) controls the subscription: Stripe will not
      // take cancel_at_period_end while it is attached. Release it first so there is ONE pending state, the cancel.
      const scheduleId = typeof sub.schedule === "string" ? sub.schedule : sub.schedule?.id ?? null;
      if (scheduleId) {
        await stripe.subscriptionSchedules.release(scheduleId, {}, { idempotencyKey: `ws_downgrade_free_release:${subscriptionId}:${scheduleId}` });
      }
      const out = await deps.cancelAtPeriodEnd(tenantId);
      if (!out.ok) return { ok: false, error: out.error };
      return { ok: true, hadSubscription: true, mode: "cancel_at_period_end", effectiveAt: out.effectiveAt };
    }

    // Only a real downgrade of what Stripe is actually billing: never an upgrade through this door.
    const policy = planChangePolicy({ plan: currentPlan, interval }, { plan: target, interval: parseBillingInterval(interval) });
    if (policy.kind !== "downgrade" || planRank(target) >= planRank(currentPlan)) {
      return { ok: false, error: "That is not a downgrade of your current billing plan. Nothing was changed." };
    }
    const toPriceId = await deps.resolvePriceId(target, interval);
    if (!toPriceId) return { ok: false, error: "That plan is not available right now. Nothing was changed." };
    const recorded = await deps.recordPending(tenantId);
    if (!recorded.ok) return PERSIST_FAIL;
    const result = await confirmPlanChange(
      stripe,
      { kind: "workspace", subjectId: tenantId, subscriptionId, toPlan: target, toInterval: parseBillingInterval(interval), toPriceId },
      downgradeProrationDate(deps.now()),
      deps.now(),
    );
    if (!result.ok) return { ok: false, error: result.error };
    return { ok: true, hadSubscription: true, mode: "schedule", effectiveAt: result.effectiveAt };
  } catch {
    return FAIL;
  }
}
