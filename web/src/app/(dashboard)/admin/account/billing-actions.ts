"use server";

import { revalidatePath } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { getTenantScope } from "@/lib/saas/scope";
import type { WorkspacePlan } from "@/lib/dashboard/admin-workspace-summary";

/**
 * Default seat caps mirror the public pricing page. Network is unlimited
 * (NULL in the DB). When a tenant moves between tiers we re-set the seat
 * limit to the tier default; bespoke caps for enterprise can override
 * later via a manual UPDATE.
 */
const SEAT_LIMITS: Record<WorkspacePlan, number | null> = {
  free: 10,
  studio: 50,
  agency: 200,
  network: null,
};

const VALID_PLANS = new Set<WorkspacePlan>([
  "free",
  "studio",
  "agency",
  "network",
]);

export type ChangeWorkspacePlanResult =
  | { ok: true; plan: WorkspacePlan }
  | { ok: false; error: string };

/**
 * Updates `agencies.plan_tier` (+ resets `talent_seat_limit` to the tier
 * default) for the active tenant.
 *
 * Pre-Stripe scaffold: the upgrade modal calls this directly so the
 * dashboard reflects plan changes immediately. When real billing lands,
 * paid upgrades route through Stripe Checkout first and this action only
 * runs on the webhook. Free downgrades stay self-service.
 *
 * Authorization: caller must be agency staff with an active tenant scope
 * for the target tenant. We rely on the existing `requireStaff` guard +
 * the cookie-based scope resolver — no extra check beyond that for v0.
 */
export async function changeWorkspacePlan(
  plan: WorkspacePlan,
): Promise<ChangeWorkspacePlanResult> {
  if (!VALID_PLANS.has(plan)) {
    return { ok: false, error: "Unknown plan." };
  }

  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const scope = await getTenantScope();
  if (!scope) {
    return { ok: false, error: "No active workspace." };
  }

  const { error } = await auth.supabase
    .from("agencies")
    .update({
      plan_tier: plan,
      talent_seat_limit: SEAT_LIMITS[plan],
      updated_at: new Date().toISOString(),
    })
    .eq("id", scope.tenantId);

  if (error) {
    logServerError("admin/changeWorkspacePlan", error);
    return { ok: false, error: "Could not update plan. Try again." };
  }

  // Refresh every admin surface that reads the plan — top-bar tier-chip,
  // AccountBillingPanels, capability catalog gates.
  revalidatePath("/admin", "layout");

  return { ok: true, plan };
}
