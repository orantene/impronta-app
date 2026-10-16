/**
 * plan-gating.ts: may this promo go live on this plan? (decision Q2)
 *
 * Paid plans: anything. Free plan: one lifetime trial, public + auto unlock,
 * at most 7 days, at most 5 uses. Drafts are always allowed (the caller only
 * asks this at "Go live").
 */

import { dayDiff, boundKey } from "./local-time";
import type { Promo } from "./types";

export const TRIAL_MAX_DAYS = 7;
export const TRIAL_MAX_USES = 5;

export type PlanGateReason =
  | "paid_plan"
  | "trial"
  | "trial_used"
  | "trial_public_auto_only"
  | "trial_needs_dates"
  | "trial_too_long"
  | "trial_needs_use_limit";

export type PlanGateInput = {
  plan: "free" | "paid";
  /** True once the workspace has ever launched its trial promo. */
  trialUsed: boolean;
  promo: Pick<Promo, "audience" | "unlock" | "starts_at" | "ends_at" | "tz" | "max_uses" | "is_single_use">;
};

export function canGoLive(input: PlanGateInput): { allowed: boolean; reason: PlanGateReason } {
  if (input.plan === "paid") return { allowed: true, reason: "paid_plan" };
  if (input.trialUsed) return { allowed: false, reason: "trial_used" };
  const p = input.promo;
  if (p.audience !== "public" || p.unlock !== "auto" || p.is_single_use) {
    return { allowed: false, reason: "trial_public_auto_only" };
  }
  if (!p.starts_at || !p.ends_at) return { allowed: false, reason: "trial_needs_dates" };
  const start = boundKey(p.starts_at, p.tz, "start").slice(0, 10);
  const end = boundKey(p.ends_at, p.tz, "end").slice(0, 10);
  // Calendar days, both ends inclusive.
  if (dayDiff(start, end) + 1 > TRIAL_MAX_DAYS) return { allowed: false, reason: "trial_too_long" };
  if (p.max_uses == null || p.max_uses > TRIAL_MAX_USES) return { allowed: false, reason: "trial_needs_use_limit" };
  return { allowed: true, reason: "trial" };
}
