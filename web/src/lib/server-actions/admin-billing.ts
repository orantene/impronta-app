"use server";

import { revalidatePath } from "next/cache";

import { logServerError } from "@/lib/server/safe-error";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import type { WorkspacePlan } from "@/lib/dashboard/admin-workspace-summary";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";
import type { ServerActionResult } from "@/lib/server-actions/result";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { clearPendingDowngrade } from "@/lib/billing/workspace-downgrade-archive";
import { WORKSPACE_MONEY_GATES } from "@/lib/billing/workspace-money-gates";

const PAID_PLANS = new Set<WorkspacePlan>([
  "website",
  "studio",
  "agency",
  "network",
]);

export type ChangeWorkspacePlanResult = ServerActionResult<{ plan: WorkspacePlan }>;

/**
 * Free downgrade only. Paid upgrades go through Stripe Checkout
 * (`startWorkspaceUpgrade`); this action must not stamp a paid tier.
 *
 * Authorization: `manage_billing` on the active tenant.
 */
export async function changeWorkspacePlan(
  plan: WorkspacePlan,
): Promise<ChangeWorkspacePlanResult> {
  await requireNotImpersonating();
  if (PAID_PLANS.has(plan)) {
    return { ok: false, error: "Paid upgrades go through billing." };
  }
  if (plan !== "free") {
    return { ok: false, error: "Unknown plan." };
  }

  const auth = await requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.planChange });
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  // plan_tier / talent_seat_limit are platform-owned (held M1 trigger
  // 20261231418100 refuses them from a member's own session), so the write
  // runs on the service role after the owner-only check above.
  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, error: "Could not update plan. Try again." };
  }

  const { error } = await admin
    .from("agencies")
    .update({
      plan_tier: plan,
      talent_seat_limit: seatCapForPlan(plan),
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.tenantId);

  if (error) {
    logServerError("admin/changeWorkspacePlan", error);
    return { ok: false, error: "Could not update plan. Try again." };
  }

  // TUL-1737: a stored keep-list from an earlier scheduled downgrade must never archive anyone after this plan change.
  const cleared = await clearPendingDowngrade(admin, auth.tenantId);
  if (!cleared.ok) logServerError("admin/changeWorkspacePlan.clearPending", cleared.error);

  // Refresh every admin surface that reads the plan — top-bar tier-chip,
  // AccountBillingPanels, capability catalog gates.
  revalidatePath("/admin", "layout");

  return { ok: true, data: { plan } };
}
