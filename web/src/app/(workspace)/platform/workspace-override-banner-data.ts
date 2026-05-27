import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { type WorkspacePlanTier } from "@/lib/platform/plan-override";
import { coerceTenantPlanTier } from "./tenant-management-data";

export type WorkspaceOverrideBanner = {
  overridePlanTier: WorkspacePlanTier;
  basePlanTier: WorkspacePlanTier;
  expiresAt: string | null;
  startedAt: string;
  reason: string | null;
};

/**
 * Active plan-override summary for a workspace's own billing page. Returns
 * null when there is no active override. Uses the service-role client because
 * the override table is platform-admin-only under RLS.
 */
export async function loadWorkspaceOverrideBanner(
  tenantId: string,
): Promise<WorkspaceOverrideBanner | null> {
  const sb = createServiceRoleClient();
  if (!sb) return null;
  try {
    await sb.rpc("reconcile_expired_plan_overrides", { p_tenant_id: tenantId });
    const { data, error } = await sb
      .from("workspace_plan_overrides")
      .select("override_plan_tier, base_plan_tier, expires_at, starts_at, reason")
      .eq("tenant_id", tenantId)
      .eq("status", "active")
      .maybeSingle();
    if (error || !data) return null;
    return {
      overridePlanTier: coerceTenantPlanTier(data.override_plan_tier),
      basePlanTier: coerceTenantPlanTier(data.base_plan_tier),
      expiresAt: data.expires_at,
      startedAt: data.starts_at,
      reason: data.reason,
    };
  } catch (err) {
    logServerError("platform_data.overrideBanner", err);
    return null;
  }
}
