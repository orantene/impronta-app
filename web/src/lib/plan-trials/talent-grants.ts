import "server-only";

/**
 * Talent plan-grant loader — the talent-side analog of
 * `loadWorkspacePlanGrants` (workspace-override-banner-data.ts).
 *
 * Reads `talent_plan_overrides` (platform-admin-only under RLS → service-role)
 * and reconciles expiry first, so the effective `talent_plan_key` and the row
 * statuses are current before we derive the trial view. Returns the ACTIVE
 * grant (if any) plus the most-recent naturally-EXPIRED trial, so a just-ended
 * trial can still drive the post-expiry upgrade nudge on the talent surface.
 *
 * Feeds the shared pure engine (`deriveTrialView`) via `talentGrantToInput`.
 */

import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { type GrantKind, isGrantKind, type PlanGrantInput } from "@/lib/plan-trials";

const TALENT_PLAN_KEYS = ["talent_basic", "talent_pro", "talent_portfolio"] as const;
type TalentPlanKey = (typeof TALENT_PLAN_KEYS)[number];

function coerceTalentPlanKey(value: unknown): TalentPlanKey {
  return typeof value === "string" &&
    (TALENT_PLAN_KEYS as readonly string[]).includes(value)
    ? (value as TalentPlanKey)
    : "talent_basic";
}

function coerceGrantKind(value: unknown): GrantKind {
  return isGrantKind(value) ? value : "comp";
}

/** A normalized talent plan-grant row (active OR ended). */
export type TalentPlanGrant = {
  status: "active" | "expired" | "revoked";
  grantKind: GrantKind;
  overridePlanKey: TalentPlanKey;
  basePlanKey: TalentPlanKey;
  startsAt: string;
  expiresAt: string | null;
  endedAt: string | null;
  reason: string | null;
};

function normalizeGrantRow(row: {
  status: string;
  grant_kind: unknown;
  override_plan_key: unknown;
  base_plan_key: unknown;
  starts_at: string;
  expires_at: string | null;
  ended_at: string | null;
  reason: string | null;
}): TalentPlanGrant {
  return {
    status:
      row.status === "expired" || row.status === "revoked" ? row.status : "active",
    grantKind: coerceGrantKind(row.grant_kind),
    overridePlanKey: coerceTalentPlanKey(row.override_plan_key),
    basePlanKey: coerceTalentPlanKey(row.base_plan_key),
    startsAt: row.starts_at,
    expiresAt: row.expires_at,
    endedAt: row.ended_at,
    reason: row.reason,
  };
}

/** Convert a normalized talent grant into the audience-agnostic engine input. */
export function talentGrantToInput(
  grant: TalentPlanGrant | null,
): PlanGrantInput | null {
  if (!grant) return null;
  return {
    status: grant.status,
    grantKind: grant.grantKind,
    grantedPlan: grant.overridePlanKey,
    basePlan: grant.basePlanKey,
    startsAt: grant.startsAt,
    expiresAt: grant.expiresAt,
    endedAt: grant.endedAt,
  };
}

/**
 * Full trial picture for a talent profile: the ACTIVE grant (if any) and the
 * most-recent naturally-EXPIRED trial. Reconciles first so the effective plan +
 * statuses are current. Service-role because the override table is
 * platform-admin-only under RLS.
 */
export async function loadTalentPlanGrants(talentProfileId: string): Promise<{
  active: TalentPlanGrant | null;
  endedTrial: TalentPlanGrant | null;
}> {
  const sb = createServiceRoleClient();
  if (!sb) return { active: null, endedTrial: null };
  try {
    await sb.rpc("reconcile_expired_talent_plan_overrides", {
      p_talent_profile_id: talentProfileId,
    });

    const cols =
      "status, grant_kind, override_plan_key, base_plan_key, starts_at, expires_at, ended_at, reason";

    const [activeRes, endedRes] = await Promise.all([
      sb
        .from("talent_plan_overrides")
        .select(cols)
        .eq("talent_profile_id", talentProfileId)
        .eq("status", "active")
        .maybeSingle(),
      sb
        .from("talent_plan_overrides")
        .select(cols)
        .eq("talent_profile_id", talentProfileId)
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
    logServerError("plan_trials.talentGrants", err);
    return { active: null, endedTrial: null };
  }
}
