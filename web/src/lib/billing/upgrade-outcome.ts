/**
 * TUL-829 · What the upgrade modal does with the checkout action's answer.
 *
 * The modal (S2, TUL-829 UI) calls `startTalentUpgrade` and hands the result
 * here. Pure, so the three outcomes are unit-tested without a browser:
 *   - a new subscriber goes to Stripe Checkout (hosted, TUL-830);
 *   - an existing subscriber opens the in-app plan change confirm (TUL-831),
 *     never a second checkout;
 *   - an error stays in the modal.
 */

import type { PlanChangeTarget } from "./duplicate-subscription";

export type UpgradeActionResult =
  | { ok: true; redirectUrl: string; planChange?: PlanChangeTarget }
  | { ok: false; error: string };

export type UpgradeOutcome =
  | { kind: "checkout"; url: string }
  | { kind: "plan_change"; target: PlanChangeTarget }
  | { kind: "error"; message: string };

export function upgradeOutcome(result: UpgradeActionResult): UpgradeOutcome {
  if (!result.ok) return { kind: "error", message: result.error };
  if (result.planChange) return { kind: "plan_change", target: result.planChange };
  return { kind: "checkout", url: result.redirectUrl };
}
