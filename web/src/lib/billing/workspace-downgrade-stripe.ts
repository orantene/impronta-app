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
  cancelAtPeriodEnd(tenantId: string): Promise<{ ok: true; effectiveAt: string | null } | { ok: false; error: string }>;
  now(): number;
};

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
    if (!["active", "trialing", "past_due"].includes(sub.status)) {
      // Already ended or unusable at Stripe: nothing to downgrade there; the caller's local write is correct.
      return { ok: true, hadSubscription: false };
    }
    const item = sub.items.data[0];
    const currentPlan = sub.metadata?.plan_key ?? "";
    const interval = item?.price?.recurring?.interval === "year" ? "year" : "month";

    if (target === "free") {
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
