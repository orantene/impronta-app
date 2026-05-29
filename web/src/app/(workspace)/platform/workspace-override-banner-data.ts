import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { type WorkspacePlanTier } from "@/lib/platform/plan-override";
import { type GrantKind, isGrantKind } from "@/lib/plan-trials";
import { coerceTenantPlanTier } from "./tenant-management-data";

export type WorkspaceOverrideBanner = {
  overridePlanTier: WorkspacePlanTier;
  basePlanTier: WorkspacePlanTier;
  expiresAt: string | null;
  startedAt: string;
  reason: string | null;
};

/** A normalized workspace plan-grant row (active OR ended), audience-shaped. */
export type WorkspacePlanGrant = {
  status: "active" | "expired" | "revoked";
  grantKind: GrantKind;
  overridePlanTier: WorkspacePlanTier;
  basePlanTier: WorkspacePlanTier;
  startsAt: string;
  expiresAt: string | null;
  endedAt: string | null;
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

function coerceGrantKind(value: unknown): GrantKind {
  return isGrantKind(value) ? value : "comp";
}

function normalizeGrantRow(row: {
  status: string;
  grant_kind: unknown;
  override_plan_tier: unknown;
  base_plan_tier: unknown;
  starts_at: string;
  expires_at: string | null;
  ended_at: string | null;
  reason: string | null;
}): WorkspacePlanGrant {
  return {
    status:
      row.status === "expired" || row.status === "revoked" ? row.status : "active",
    grantKind: coerceGrantKind(row.grant_kind),
    overridePlanTier: coerceTenantPlanTier(row.override_plan_tier),
    basePlanTier: coerceTenantPlanTier(row.base_plan_tier),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
    reason: row.reason,
  };
}

/**
 * Full trial picture for a workspace: the ACTIVE grant (if any) and the
 * most-recent naturally-EXPIRED trial (so a just-ended trial can still show
 * its upgrade nudge). Reconciles first so the effective plan + statuses are
 * current. Service-role because the override table is platform-admin-only.
 */
export async function loadWorkspacePlanGrants(tenantId: string): Promise<{
  active: WorkspacePlanGrant | null;
  endedTrial: WorkspacePlanGrant | null;
}> {
  const sb = createServiceRoleClient();
  if (!sb) return { active: null, endedTrial: null };
  try {
    await sb.rpc("reconcile_expired_plan_overrides", { p_tenant_id: tenantId });

    const cols =
      "status, grant_kind, override_plan_tier, base_plan_tier, starts_at, expires_at, ended_at, reason";

    const [activeRes, endedRes] = await Promise.all([
      sb
        .from("workspace_plan_overrides")
        .select(cols)
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .maybeSingle(),
      sb
        .from("workspace_plan_overrides")
        .select(cols)
        .eq("tenant_id", tenantId)
        .eq("status", "expired")
        .eq("grant_kind", "trial")
        .order("ended_at", { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    return {
      active: activeRes.data ? normalizeGrantRow(activeRes.data) : null,
      endedTrial: endedRes.data ? normalizeGrantRow(endedRes.data) : null,
    };
  } catch (err) {
    logServerError("platform_data.planGrants", err);
    return { active: null, endedTrial: null };
  }
}
