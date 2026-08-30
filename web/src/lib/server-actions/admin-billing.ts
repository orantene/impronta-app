"use server";

import { revalidatePath } from "next/cache";

import { logServerError } from "@/lib/server/safe-error";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import type { WorkspacePlan } from "@/lib/dashboard/admin-workspace-summary";
import { seatCapForPlan } from "@/lib/saas/plan-seat-caps";
import type { ServerActionResult } from "@/lib/server-actions/result";

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
  if (PAID_PLANS.has(plan)) {
    return { ok: false, error: "Paid upgrades go through billing." };
  }
  if (plan !== "free") {
    return { ok: false, error: "Unknown plan." };
  }

  const auth = await requireWorkspaceStaffAction({
    capability: "manage_billing",
  });
  if (!auth.ok) {
    return { ok: false, error: auth.error };
  }

  const { error } = await auth.supabase
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

  // Refresh every admin surface that reads the plan — top-bar tier-chip,
  // AccountBillingPanels, capability catalog gates.
  revalidatePath("/admin", "layout");

  return { ok: true, data: { plan } };
}
