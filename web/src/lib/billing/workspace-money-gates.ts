/**
 * Role gates for the workspace-side money settings (TUL-1269 M2).
 *
 * Each value is the capability `requireWorkspaceStaffAction({ capability })`
 * must hold before the action touches Stripe or the database. Role grants live
 * in lib/access/roles.ts:
 *   - manage_billing          owner only ("Change plans, update payment methods")
 *   - manage_agency_settings  owner + admin
 * Viewers, editors and managers are workspace staff too and pass none of them.
 *
 * Pure module (no "use server"), so server actions and tests can both import it.
 */
import { planRank } from "@/lib/billing/plan-change-policy";
import { isKnownPlan } from "@/lib/access/plan-catalog";

export const WORKSPACE_MONEY_GATES = {
  /** Add a card, set the default card, remove a card. */
  paymentMethods: "manage_billing",
  /** Move the plan: free downgrade, roster-archiving downgrade, restore. */
  planChange: "manage_billing",
  /** Default deposit %, refund policy preset, instant book. */
  commercialTerms: "manage_agency_settings",
} as const;

/**
 * True only when `target` is a known plan ranked strictly below the known
 * `current` plan. The downgrade action used to accept any tier, so a member
 * could "downgrade" free -> network and take a paid tier without paying.
 */
export function isStrictPlanDowngrade(
  current: string | null | undefined,
  target: string,
): boolean {
  if (!current || !isKnownPlan(current) || !isKnownPlan(target)) return false;
  return planRank(target) < planRank(current);
}
