/**
 * talent-plan-change.ts — in-app upgrade / downgrade of a talent's existing
 * personal-page subscription, with proration (TUL-831).
 *
 * Rules:
 *   - The price is changed ON the existing subscription
 *     (`stripe.subscriptions.update`, `proration_behavior: "create_prorations"`),
 *     never by opening a second checkout, so the talent is billed once and
 *     credited for the unused part of the old plan.
 *   - OWNERSHIP exactly like TUL-832: the row is loaded by the server-resolved
 *     talent profile id and must belong to the signed-in user. The browser only
 *     names a target plan, never a subscription or price id.
 *   - No local plan write here. The resulting customer.subscription.updated
 *     webhook runs the single plan-state writer (TUL-836), so the UI and the
 *     DB can never disagree about which plan a talent has.
 *   - A past_due subscription must settle its open invoice first (TUL-835);
 *     changing plans on top of a failed payment just stacks prorations.
 *
 * Pure decision + dependency-injected runner, testable without Stripe or a DB.
 */

import type { TalentPlanKey } from "@/lib/stripe/price-ids";

export type TalentPlanChangeRow = {
  user_id: string | null;
  stripe_subscription_id: string | null;
  status: string | null;
  plan_key: string | null;
};

export type TalentPlanChangeErrorCode =
  | "not_found"
  | "no_subscription"
  | "already_ended"
  | "past_due"
  | "same_plan"
  | "price_unavailable"
  | "unavailable"
  | "stripe_failed";

export type TalentPlanChangeDecision =
  | { kind: "stripe"; subscriptionId: string }
  | { kind: "error"; code: TalentPlanChangeErrorCode };

const ENDED = new Set(["canceled", "cancelled", "incomplete_expired"]);
const CHANGEABLE = new Set(["active", "trialing"]);

export function decideTalentPlanChange(
  row: TalentPlanChangeRow | null,
  callerUserId: string,
  target: TalentPlanKey,
): TalentPlanChangeDecision {
  // Someone else's row reads exactly like no row.
  if (!row || !callerUserId || row.user_id !== callerUserId) return { kind: "error", code: "not_found" };
  if (!row.stripe_subscription_id) return { kind: "error", code: "no_subscription" };
  const status = row.status ?? "";
  if (ENDED.has(status)) return { kind: "error", code: "already_ended" };
  if (status === "past_due") return { kind: "error", code: "past_due" };
  if (!CHANGEABLE.has(status)) return { kind: "error", code: "no_subscription" };
  if (row.plan_key === target) return { kind: "error", code: "same_plan" };
  return { kind: "stripe", subscriptionId: row.stripe_subscription_id };
}

export type TalentPlanChangeDeps = {
  loadRow: (talentProfileId: string) => Promise<TalentPlanChangeRow | null>;
  /**
   * Swaps the subscription's price for the target plan's price on the same
   * billing interval, with proration. Returns false when the target plan has
   * no sellable price. Throws when Stripe refuses.
   */
  changePrice: (subscriptionId: string, target: TalentPlanKey) => Promise<boolean>;
};

export type TalentPlanChangeResult =
  | { ok: true; planKey: TalentPlanKey }
  | { ok: false; code: TalentPlanChangeErrorCode };

export async function runTalentPlanChange(
  deps: TalentPlanChangeDeps,
  input: { talentProfileId: string; callerUserId: string; target: TalentPlanKey },
): Promise<TalentPlanChangeResult> {
  const row = await deps.loadRow(input.talentProfileId);
  const decision = decideTalentPlanChange(row, input.callerUserId, input.target);
  if (decision.kind === "error") return { ok: false, code: decision.code };
  try {
    const changed = await deps.changePrice(decision.subscriptionId, input.target);
    if (!changed) return { ok: false, code: "price_unavailable" };
  } catch {
    return { ok: false, code: "stripe_failed" };
  }
  return { ok: true, planKey: input.target };
}

/** The Stripe interval of the current price, mapped to our catalog interval. */
export function catalogIntervalFor(stripeInterval: string | null | undefined): "monthly" | "annual" {
  return stripeInterval === "year" ? "annual" : "monthly";
}
