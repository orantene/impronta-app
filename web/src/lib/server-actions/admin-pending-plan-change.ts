"use server";

import { revalidatePath } from "next/cache";

import { cancelPendingPlanChangeFor, loadPendingPlanChangeFor } from "@/lib/billing/plan-change.server";
import type { PendingPlanChange } from "@/lib/billing/plan-change-pending";
import { clearPendingDowngrade } from "@/lib/billing/workspace-downgrade-archive";
import { keepWorkspacePlan } from "@/lib/billing/workspace-keep-plan";
import { WORKSPACE_MONEY_GATES } from "@/lib/billing/workspace-money-gates";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** TUL-1914: the plan change waiting for the end of this workspace's paid period, read from Stripe. Owner only, like the change itself. */
export async function loadWorkspacePendingPlanChange(): Promise<
  { ok: true; pending: PendingPlanChange | null } | { ok: false; error: string }
> {
  const auth = await requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.planChange });
  if (!auth.ok) return { ok: false, error: auth.error };
  return loadPendingPlanChangeFor("workspace", auth.tenantId);
}

/** TUL-1914: "Keep my plan". Same guards as changeWorkspacePlan: not impersonating, owner (manage_billing). */
export async function keepWorkspaceCurrentPlan(): Promise<{ ok: true; hadPending: boolean } | { ok: false; error: string }> {
  await requireNotImpersonating();
  const auth = await requireWorkspaceStaffAction({ capability: WORKSPACE_MONEY_GATES.planChange });
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Could not update plan. Try again." };
  const out = await keepWorkspacePlan(auth.tenantId, {
    cancelPending: (id) => cancelPendingPlanChangeFor("workspace", id),
    clearPending: (id) => clearPendingDowngrade(admin, id).then((r) => (r.ok ? { ok: true as const } : { ok: false as const })),
    onClearFailed: (id) => logServerError("admin/keepWorkspaceCurrentPlan.clearPending", new Error(`pending_downgrade not cleared for ${id}`)),
  });
  if (out.ok) revalidatePath("/admin", "layout");
  return out;
}
