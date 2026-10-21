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
import { applyWorkspaceDowngrade } from "@/lib/billing/plan-change.server";
import { downgradeWorkspaceToFree } from "@/lib/billing/workspace-free-downgrade";

const PAID_PLANS = new Set<WorkspacePlan>([
  "website",
  "studio",
  "agency",
  "network",
]);

export type ChangeWorkspacePlanResult = ServerActionResult<{
  plan: WorkspacePlan;
  /** TUL-1291: true when the workspace has a Stripe subscription, so Free starts at the end of the paid period. */
  scheduledForPeriodEnd: boolean;
  effectiveAt: string | null;
}>;

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

  // TUL-1291: with a live Stripe subscription Stripe is told FIRST (cancel at period end) and nothing local is written:
  // the webhook is the single writer of plan_tier. Only a workspace Stripe does not bill gets the direct write.
  const outcome = await downgradeWorkspaceToFree(auth.tenantId, auth.user.id, {
    async listRosterIds(tenantId) {
      const { data, error } = await admin
        .from("agency_talent_roster")
        .select("talent_profile_id")
        .eq("tenant_id", tenantId)
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as Array<{ talent_profile_id: string }>).map((r) => r.talent_profile_id);
    },
    freeSeatCap: () => seatCapForPlan("free"),
    newEventId: () => crypto.randomUUID(),
    nowIso: () => new Date().toISOString(),
    applyAtStripe: (tenantId, pending) => applyWorkspaceDowngrade(tenantId, "free", pending),
    async writeFreeNow(tenantId) {
      const { error } = await admin
        .from("agencies")
        .update({
          plan_tier: plan,
          talent_seat_limit: seatCapForPlan(plan),
          updated_at: new Date().toISOString(),
        })
        .eq("id", tenantId);
      if (error) {
        logServerError("admin/changeWorkspacePlan", error);
        return { ok: false };
      }
      return { ok: true };
    },
  });
  if (!outcome.ok) return { ok: false, error: outcome.error };

  // TUL-1737: a stored keep-list from an earlier scheduled downgrade must never archive anyone after this plan change.
  // Only on the immediate path: with a Stripe schedule the pending row IS the change and the webhook consumes it.
  if (outcome.applied === "now") {
    const cleared = await clearPendingDowngrade(admin, auth.tenantId);
    if (!cleared.ok) logServerError("admin/changeWorkspacePlan.clearPending", cleared.error);
  }

  // Refresh every admin surface that reads the plan — top-bar tier-chip,
  // AccountBillingPanels, capability catalog gates.
  revalidatePath("/admin", "layout");

  return {
    ok: true,
    data: { plan, scheduledForPeriodEnd: outcome.applied === "period_end", effectiveAt: outcome.applied === "period_end" ? outcome.effectiveAt : null },
  };
}
