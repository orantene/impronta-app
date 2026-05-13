/**
 * Pitch feature — plan-tier gating.
 *
 * Phase G PR 3. The binding spec
 * (`project_pitch_feature.md` in memory) calls pitches a sellable
 * Studio/Agency-tier feature, but the code shipped without any gate.
 * This module is the single source of truth for who can use pitches.
 *
 * Why pure helpers + a thin server-side check:
 *  - Server actions enforce (createPitchDraftAction, sendPitchAction)
 *  - UI can read the same helper to render the locked / upsell state
 *  - Single place to change the rule when Network or other tiers ship
 */

import type { WorkspaceUrlPlan } from "@/lib/saas/workspace-public-url";

/** Plans that may create + send pitches. Free is deliberately excluded —
 *  pitches are an outbound-marketing feature; Free is the friend-link
 *  case (per `project_agency_exclusivity_model.md`) and doesn't have
 *  the relationship infrastructure to support pitches anyway. */
const PITCH_ELIGIBLE_PLANS: ReadonlySet<WorkspaceUrlPlan> = new Set<WorkspaceUrlPlan>([
  "studio",
  "agency",
  "network",
  // "legacy" plans (pre-tier-rename existing tenants) keep access — they
  // were grandfathered as Agency-equivalent at migration time.
  "legacy",
]);

/** Returns true if the given plan tier can create and send pitches. */
export function canUsePitchFeature(plan: WorkspaceUrlPlan | string | null | undefined): boolean {
  if (!plan) return false;
  return PITCH_ELIGIBLE_PLANS.has(plan as WorkspaceUrlPlan);
}

/** Returns the public-facing reason the feature is locked, suitable for
 *  display in an upsell card. NULL when the plan IS eligible. */
export function pitchLockedReason(plan: WorkspaceUrlPlan | string | null | undefined): string | null {
  if (canUsePitchFeature(plan)) return null;
  if (plan === "free") {
    return "Pitches are a Studio + Agency feature. Upgrade your workspace plan to send curated talent suggestions to clients.";
  }
  return "This workspace is not eligible for pitches. Contact support if you believe this is incorrect.";
}

/** Recommended target plan to upsell to, given a locked plan. */
export function pitchUpgradeTarget(plan: WorkspaceUrlPlan | string | null | undefined): "studio" | "agency" {
  // Free → Studio is the cheapest unlock. Anyone else hitting the lock
  // is on a bespoke plan; Studio still unlocks the feature.
  void plan;
  return "studio";
}

/** Audit log code for telemetry when a request is blocked. */
export const PITCH_PLAN_GATE_REJECT = "plan_gate_locked" as const;
