/**
 * Platform Users Control Center — A.2 Origin Resolver.
 *
 * Resolves "how did this person/talent end up on the platform?" for the
 * C.2 Origin & Provenance drawer section.
 *
 * Five kinds:
 *   - agency_signup          — created by owner/admin of an agency/network workspace
 *   - studio_signup          — created by owner/admin of a studio workspace
 *   - platform_admin_signup  — created by platform staff with no workspace context
 *   - self_signup            — user created their own account (no creator)
 *   - claim_invite           — talent row whose user_id was set after creation
 *
 * Fast path: if `origin_kind` is already populated on the row (M0.4 denorm),
 * just hydrate the display fields. Slow path: compute live from
 * `created_by_user_id_provenance` + `agency_memberships` + `agencies.plan_tier`.
 *
 * Pure-ish: takes a SupabaseClient; does not throw — returns a sensible
 * fallback on any error.
 *
 * Ref: web/docs/platform-users-control-center-plan-2026-05-23.md §3 (A.2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type OriginKind =
  | "agency_signup"
  | "studio_signup"
  | "platform_admin_signup"
  | "self_signup"
  | "claim_invite";

export interface OriginInfo {
  kind: OriginKind;
  createdByUserId: string | null;
  createdByDisplayName: string | null;
  workspaceId: string | null;
  workspaceName: string | null;
  createdAt: string;
}

/**
 * Minimal row shape we accept. Loose-typed so callers can pass either a
 * talent_profiles row or a profiles row without conversion.
 */
export interface OriginResolvableRow {
  id: string;
  created_at?: string | null;
  // talent_profiles fields
  user_id?: string | null;
  created_by_user_id_provenance?: string | null;
  source_type?: string | null;
  // denorm (M0.4) — fast path
  origin_kind?: string | null;
  origin_workspace_id?: string | null;
  origin_created_by_user_id?: string | null;
}

const FALLBACK = (createdAt: string): OriginInfo => ({
  kind: "platform_admin_signup",
  createdByUserId: null,
  createdByDisplayName: null,
  workspaceId: null,
  workspaceName: null,
  createdAt,
});

function isOriginKind(value: unknown): value is OriginKind {
  return (
    value === "agency_signup" ||
    value === "studio_signup" ||
    value === "platform_admin_signup" ||
    value === "self_signup" ||
    value === "claim_invite"
  );
}

async function lookupProfileDisplayName(
  supabase: SupabaseClient,
  profileId: string | null
): Promise<string | null> {
  if (!profileId) return null;
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", profileId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { display_name: string | null }).display_name ?? null;
  } catch {
    return null;
  }
}

async function lookupWorkspaceName(
  supabase: SupabaseClient,
  workspaceId: string | null
): Promise<string | null> {
  if (!workspaceId) return null;
  try {
    const { data, error } = await supabase
      .from("agencies")
      .select("name")
      .eq("id", workspaceId)
      .maybeSingle();
    if (error || !data) return null;
    return (data as { name: string | null }).name ?? null;
  } catch {
    return null;
  }
}

/**
 * Look up the creator's "primary" workspace + plan_tier — earliest active
 * owner/admin membership, falling back to any active row.
 */
async function lookupCreatorWorkspace(
  supabase: SupabaseClient,
  creatorProfileId: string | null
): Promise<{ workspaceId: string | null; planTier: string | null }> {
  if (!creatorProfileId) return { workspaceId: null, planTier: null };
  try {
    const { data, error } = await supabase
      .from("agency_memberships")
      .select("tenant_id, role, accepted_at, created_at, agencies!inner(plan_tier)")
      .eq("profile_id", creatorProfileId)
      .eq("status", "active");
    if (error || !data || data.length === 0) {
      return { workspaceId: null, planTier: null };
    }
    type Row = {
      tenant_id: string | null;
      role: string | null;
      accepted_at: string | null;
      created_at: string | null;
      agencies: { plan_tier: string | null } | { plan_tier: string | null }[] | null;
    };
    const rows = data as unknown as Row[];
    const sorted = [...rows].sort((a, b) => {
      const aPriv = a.role === "owner" || a.role === "admin" ? 0 : 1;
      const bPriv = b.role === "owner" || b.role === "admin" ? 0 : 1;
      if (aPriv !== bPriv) return aPriv - bPriv;
      const aT = a.accepted_at ?? a.created_at ?? "";
      const bT = b.accepted_at ?? b.created_at ?? "";
      return aT.localeCompare(bT);
    });
    const pick = sorted[0];
    const agencies = pick.agencies;
    const planTier = Array.isArray(agencies)
      ? agencies[0]?.plan_tier ?? null
      : agencies?.plan_tier ?? null;
    return { workspaceId: pick.tenant_id, planTier };
  } catch {
    return { workspaceId: null, planTier: null };
  }
}

function kindFromPlanTier(planTier: string | null): OriginKind {
  if (planTier === "agency" || planTier === "network") return "agency_signup";
  if (planTier === "studio") return "studio_signup";
  return "platform_admin_signup";
}

/**
 * Resolve origin for a talent_profiles or profiles row.
 *
 * Never throws — on any error returns the platform_admin_signup fallback
 * with the createdAt timestamp preserved.
 */
export async function resolveOrigin(
  row: OriginResolvableRow,
  supabase: SupabaseClient
): Promise<OriginInfo> {
  const createdAt = row.created_at ?? new Date(0).toISOString();
  try {
    // Fast path: denorm columns populated.
    if (isOriginKind(row.origin_kind)) {
      const [createdByDisplayName, workspaceName] = await Promise.all([
        lookupProfileDisplayName(supabase, row.origin_created_by_user_id ?? null),
        lookupWorkspaceName(supabase, row.origin_workspace_id ?? null),
      ]);
      return {
        kind: row.origin_kind,
        createdByUserId: row.origin_created_by_user_id ?? null,
        createdByDisplayName,
        workspaceId: row.origin_workspace_id ?? null,
        workspaceName,
        createdAt,
      };
    }

    // Slow path: compute live.
    const creatorId = row.created_by_user_id_provenance ?? null;
    const userId = row.user_id ?? null;

    // claim_invite — talent row whose user_id was assigned to a different
    // human than the creator (i.e. the talent later claimed their seat).
    if (creatorId && userId && creatorId !== userId) {
      const [{ workspaceId }, createdByDisplayName] = await Promise.all([
        lookupCreatorWorkspace(supabase, creatorId),
        lookupProfileDisplayName(supabase, creatorId),
      ]);
      const workspaceName = await lookupWorkspaceName(supabase, workspaceId);
      // Override kind only when the row clearly came from a claim flow; we
      // still keep workspace context if available.
      return {
        kind: "claim_invite",
        createdByUserId: creatorId,
        createdByDisplayName,
        workspaceId,
        workspaceName,
        createdAt,
      };
    }

    // No creator known.
    if (!creatorId) {
      // Talent freelancer self-signup OR profile self-signup.
      if (userId || row.source_type === "freelancer_signup") {
        return {
          kind: "self_signup",
          createdByUserId: null,
          createdByDisplayName: null,
          workspaceId: null,
          workspaceName: null,
          createdAt,
        };
      }
      // Profile row with no link to anything talent-side — assume platform.
      return FALLBACK(createdAt);
    }

    // Creator known — distinguish agency/studio/platform from plan_tier.
    const [{ workspaceId, planTier }, createdByDisplayName] = await Promise.all([
      lookupCreatorWorkspace(supabase, creatorId),
      lookupProfileDisplayName(supabase, creatorId),
    ]);
    const workspaceName = await lookupWorkspaceName(supabase, workspaceId);
    return {
      kind: kindFromPlanTier(planTier),
      createdByUserId: creatorId,
      createdByDisplayName,
      workspaceId,
      workspaceName,
      createdAt,
    };
  } catch {
    return FALLBACK(createdAt);
  }
}
