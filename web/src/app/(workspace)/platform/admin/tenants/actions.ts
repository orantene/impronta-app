"use server";

/**
 * Platform Admin — tenant management server actions.
 *
 * Membership management (add / change role / remove / transfer owner) and
 * plan-override application/removal for any workspace. Every action is
 * gated to `super_admin` and writes an entry to `platform_audit_log`.
 *
 * Writes use the service-role client (bypasses tenant-scoped RLS) — the
 * super-admin gate here IS the authorization boundary. Never import this
 * file's helpers into client code; only the exported actions are callable.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  computeOverrideExpiry,
  isOverrideDurationKey,
  isWorkspacePlanTier,
  PLAN_TIER_SEAT_LIMIT,
  type WorkspacePlanTier,
} from "@/lib/platform/plan-override";
import { isGrantKind, type GrantKind } from "@/lib/plan-trials";
import {
  loadTenantManagementDetail,
  type TenantManagementDetail,
} from "../../tenant-management-data";

// Internal only — a "use server" file may export ONLY async functions, so
// this result shape stays module-private (it is structurally simple enough
// that callers never need to import it by name).
type TenantActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── Authorization ────────────────────────────────────────────────────────────

type PlatformAdminContext = { ok: true; sb: SupabaseClient; actorId: string };

async function requirePlatformAdmin(): Promise<
  PlatformAdminContext | { ok: false; error: string }
> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "You must be signed in." };
  if (getPlatformRole(session.profile) !== "super_admin") {
    return { ok: false, error: "Forbidden — platform admin only." };
  }
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Platform service client unavailable." };
  return { ok: true, sb, actorId: session.user.id };
}

// ─── Audit ──────────────────────────────────────────────────────────────────

async function recordAudit(
  sb: SupabaseClient,
  args: {
    actorId: string;
    action: string;
    tenantId: string;
    targetType: string;
    targetId: string;
    metadata?: Record<string, unknown>;
    severity?: "info" | "warn" | "emergency";
  },
): Promise<void> {
  try {
    await sb.from("platform_audit_log").insert({
      actor_profile_id: args.actorId,
      actor_role: "super_admin",
      action: args.action,
      target_type: args.targetType,
      target_id: args.targetId,
      tenant_id: args.tenantId,
      severity: args.severity ?? "info",
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    // Audit failure must never block the operation — log and move on.
    logServerError("platform.tenant.audit", err);
  }
}

function revalidateTenantSurfaces(tenantId?: string): void {
  revalidatePath("/platform/admin/tenants");
  if (tenantId) revalidatePath(`/platform/admin/tenants/${tenantId}`);
}

const NOW = () => new Date().toISOString();

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function findProfileIdByEmail(
  sb: SupabaseClient,
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 6; page += 1) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data) break;
    const hit = data.users.find(
      (u) => (u.email ?? "").toLowerCase() === email,
    );
    if (hit) {
      const { data: profile } = await sb
        .from("profiles")
        .select("id")
        .eq("id", hit.id)
        .maybeSingle();
      return profile ? hit.id : null;
    }
    if (data.users.length < 200) break;
  }
  return null;
}

/**
 * Where a workspace should land when an override is removed: a live paid
 * subscription if one exists, otherwise the override's base snapshot.
 * Mirrors the SQL `reconcile_expired_plan_overrides` logic.
 */
async function resolveRestorePlan(
  sb: SupabaseClient,
  tenantId: string,
  baseTier: string | null,
  baseSeat: number | null,
): Promise<{ tier: WorkspacePlanTier; seat: number | null }> {
  const safeBase: WorkspacePlanTier = isWorkspacePlanTier(baseTier)
    ? baseTier
    : "free";

  const { data: sub } = await sb
    .from("workspace_subscriptions")
    .select("plan_key")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "trialing", "past_due"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (
    sub?.plan_key &&
    isWorkspacePlanTier(sub.plan_key) &&
    sub.plan_key !== safeBase
  ) {
    return { tier: sub.plan_key, seat: PLAN_TIER_SEAT_LIMIT[sub.plan_key] };
  }
  return { tier: safeBase, seat: baseSeat ?? null };
}

// ─── Detail loader (drawer) ─────────────────────────────────────────────────

/**
 * Drawer-side detail fetch. Wraps the server-only loader so the client
 * drawer can pull fresh detail on open and after a mutation.
 */
export async function actionGetTenantManagementDetail(
  tenantId: string,
): Promise<TenantActionResult<TenantManagementDetail>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  if (!tenantId) return { ok: false, error: "Missing workspace." };
  const detail = await loadTenantManagementDetail(tenantId);
  if (!detail) return { ok: false, error: "Workspace not found." };
  return { ok: true, data: detail };
}

// ─── Plan override ──────────────────────────────────────────────────────────

export async function actionApplyPlanOverride(input: {
  tenantId: string;
  overridePlanTier: string;
  durationKey: string;
  customExpiresAt?: string | null;
  reason?: string | null;
  note?: string | null;
  /**
   * How the grant should behave for the workspace. `trial` drives the live
   * countdown + post-expiry upgrade nudge in the plan badge; `comp`/`promo`
   * are silent courtesy grants. Defaults to `comp` for backward compatibility.
   */
  grantKind?: string;
}): Promise<TenantActionResult<{ expiresAt: string | null }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  if (!isWorkspacePlanTier(input.overridePlanTier)) {
    return { ok: false, error: "Invalid plan tier." };
  }
  if (!isOverrideDurationKey(input.durationKey)) {
    return { ok: false, error: "Invalid duration." };
  }
  const grantKind: GrantKind = isGrantKind(input.grantKind)
    ? input.grantKind
    : "comp";
  // A trial without an end date can never expire or nudge — it would silently
  // behave like a comp. Force a bounded window so the countdown is meaningful.
  if (grantKind === "trial" && input.durationKey === "indefinite") {
    return { ok: false, error: "A trial needs an end date — pick a duration." };
  }
  const overrideTier = input.overridePlanTier;

  const expiresAt = computeOverrideExpiry(input.durationKey, {
    customISO: input.customExpiresAt,
  });
  if (input.durationKey === "custom") {
    if (!expiresAt) {
      return { ok: false, error: "Enter a valid custom expiry date." };
    }
    if (new Date(expiresAt).getTime() <= Date.now()) {
      return { ok: false, error: "Custom expiry must be in the future." };
    }
  }

  const { data: agency, error: agencyErr } = await sb
    .from("agencies")
    .select("id, plan_tier, talent_seat_limit, display_name")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (agencyErr || !agency) {
    return { ok: false, error: "Workspace not found." };
  }

  // An existing active override is superseded — but its ORIGINAL base is
  // preserved so removal always returns to the true pre-override plan.
  const { data: existing } = await sb
    .from("workspace_plan_overrides")
    .select("id, base_plan_tier, base_talent_seat_limit")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .maybeSingle();

  let basePlanTier: WorkspacePlanTier;
  let baseSeat: number | null;
  if (existing) {
    basePlanTier = isWorkspacePlanTier(existing.base_plan_tier)
      ? existing.base_plan_tier
      : "free";
    baseSeat = existing.base_talent_seat_limit ?? null;
    await sb
      .from("workspace_plan_overrides")
      .update({ status: "revoked", ended_at: NOW(), ended_by: actorId })
      .eq("id", existing.id);
  } else {
    basePlanTier = isWorkspacePlanTier(agency.plan_tier)
      ? agency.plan_tier
      : "free";
    baseSeat = agency.talent_seat_limit ?? null;
  }

  const overrideSeat = PLAN_TIER_SEAT_LIMIT[overrideTier];

  const { data: inserted, error: insErr } = await sb
    .from("workspace_plan_overrides")
    .insert({
      tenant_id: input.tenantId,
      status: "active",
      base_plan_tier: basePlanTier,
      base_talent_seat_limit: baseSeat,
      override_plan_tier: overrideTier,
      override_talent_seat_limit: overrideSeat,
      grant_kind: grantKind,
      starts_at: NOW(),
      expires_at: expiresAt,
      reason: input.reason?.trim() || null,
      note: input.note?.trim() || null,
      created_by: actorId,
    })
    .select("id")
    .single();
  if (insErr || !inserted) {
    logServerError("platform.applyOverride.insert", insErr);
    return { ok: false, error: "Could not record the override." };
  }

  const { error: updErr } = await sb
    .from("agencies")
    .update({
      plan_tier: overrideTier,
      talent_seat_limit: overrideSeat,
      updated_at: NOW(),
    })
    .eq("id", input.tenantId);
  if (updErr) {
    // Compensate so we never leave a recorded-but-not-applied override.
    await sb
      .from("workspace_plan_overrides")
      .update({ status: "revoked", ended_at: NOW(), ended_by: actorId })
      .eq("id", inserted.id);
    logServerError("platform.applyOverride.agency", updErr);
    return { ok: false, error: "Could not apply the plan to the workspace." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.plan_override.apply",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    metadata: {
      override_id: inserted.id,
      base_plan_tier: basePlanTier,
      override_plan_tier: overrideTier,
      grant_kind: grantKind,
      expires_at: expiresAt,
      duration_key: input.durationKey,
      reason: input.reason?.trim() || null,
    },
  });

  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: { expiresAt } };
}

export async function actionRemovePlanOverride(input: {
  tenantId: string;
}): Promise<TenantActionResult<{ restoredTier: WorkspacePlanTier }>> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };

  const { data: ovr } = await sb
    .from("workspace_plan_overrides")
    .select("id, base_plan_tier, base_talent_seat_limit, override_plan_tier")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active")
    .maybeSingle();
  if (!ovr) {
    return { ok: false, error: "This workspace has no active override." };
  }

  const restore = await resolveRestorePlan(
    sb,
    input.tenantId,
    ovr.base_plan_tier,
    ovr.base_talent_seat_limit,
  );

  const { error: updErr } = await sb
    .from("agencies")
    .update({
      plan_tier: restore.tier,
      talent_seat_limit: restore.seat,
      updated_at: NOW(),
    })
    .eq("id", input.tenantId);
  if (updErr) {
    logServerError("platform.removeOverride.agency", updErr);
    return { ok: false, error: "Could not restore the workspace plan." };
  }

  await sb
    .from("workspace_plan_overrides")
    .update({ status: "revoked", ended_at: NOW(), ended_by: actorId })
    .eq("id", ovr.id);

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.plan_override.remove",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    metadata: {
      override_id: ovr.id,
      override_plan_tier: ovr.override_plan_tier,
      restored_plan_tier: restore.tier,
    },
  });

  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: { restoredTier: restore.tier } };
}

// ─── Membership management ──────────────────────────────────────────────────

const ASSIGNABLE_ROLES = ["admin", "manager", "editor", "viewer"] as const;

export async function actionAddWorkspaceMember(input: {
  tenantId: string;
  email: string;
  role: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(input.role)) {
    return {
      ok: false,
      error:
        "Pick a role: admin, coordinator, editor, or viewer. Use Transfer owner to assign ownership.",
    };
  }
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const { data: agency } = await sb
    .from("agencies")
    .select("id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!agency) return { ok: false, error: "Workspace not found." };

  const profileId = await findProfileIdByEmail(sb, email);
  if (!profileId) {
    return {
      ok: false,
      error:
        "No Tulala account uses that email. Ask them to sign up first, then add them.",
    };
  }

  const { data: existing } = await sb
    .from("agency_memberships")
    .select("id, status")
    .eq("tenant_id", input.tenantId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status !== "removed") {
    return {
      ok: false,
      error: "That person is already a member of this workspace.",
    };
  }

  if (existing) {
    const { error } = await sb
      .from("agency_memberships")
      .update({
        role: input.role,
        status: "active",
        accepted_at: NOW(),
        removed_at: null,
        removed_by: null,
        updated_at: NOW(),
      })
      .eq("id", existing.id);
    if (error) {
      logServerError("platform.addMember.reactivate", error);
      return { ok: false, error: "Could not re-add the member." };
    }
  } else {
    // TEAM-SEAT EXEMPTION (deliberate): platform staff seat members without
    // a `checkTeamSeatAvailability` call. The plan cap governs what a
    // workspace can do to itself; a platform override is how support and
    // operations get in, and must never be blocked by the tenant's plan.
    // Tenant-side enforcement lives in lib/saas/team-seat-limit.ts.
    const { error } = await sb.from("agency_memberships").insert({
      tenant_id: input.tenantId,
      profile_id: profileId,
      role: input.role,
      status: "active",
      invited_by: actorId,
      invited_at: NOW(),
      accepted_at: NOW(),
    });
    if (error) {
      logServerError("platform.addMember.insert", error);
      return { ok: false, error: "Could not add the member." };
    }
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.member.add",
    tenantId: input.tenantId,
    targetType: "agency_membership",
    targetId: profileId,
    metadata: { email, role: input.role },
  });

  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionChangeMemberRole(input: {
  membershipId: string;
  role: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!(ASSIGNABLE_ROLES as readonly string[]).includes(input.role)) {
    return {
      ok: false,
      error: "Use Transfer owner to assign the owner role.",
    };
  }

  const { data: m } = await sb
    .from("agency_memberships")
    .select("id, tenant_id, role, status, profile_id")
    .eq("id", input.membershipId)
    .maybeSingle();
  if (!m) return { ok: false, error: "Membership not found." };
  if (m.status === "removed") {
    return { ok: false, error: "That member has been removed." };
  }
  if (m.role === "owner") {
    return {
      ok: false,
      error:
        "The workspace owner's role can't be changed here — use Transfer owner.",
    };
  }
  if (m.role === input.role) {
    return { ok: false, error: `Already ${input.role}.` };
  }

  const { error } = await sb
    .from("agency_memberships")
    .update({ role: input.role, updated_at: NOW() })
    .eq("id", m.id);
  if (error) {
    logServerError("platform.changeRole", error);
    return { ok: false, error: "Could not change the member's role." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.member.role_change",
    tenantId: m.tenant_id,
    targetType: "agency_membership",
    targetId: m.profile_id,
    metadata: { from_role: m.role, to_role: input.role },
  });

  revalidateTenantSurfaces(m.tenant_id);
  return { ok: true, data: undefined };
}

export async function actionRemoveWorkspaceMember(input: {
  membershipId: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const { data: m } = await sb
    .from("agency_memberships")
    .select("id, tenant_id, role, status, profile_id")
    .eq("id", input.membershipId)
    .maybeSingle();
  if (!m) return { ok: false, error: "Membership not found." };
  if (m.status === "removed") {
    return { ok: false, error: "That member is already removed." };
  }
  if (m.role === "owner") {
    return {
      ok: false,
      error:
        "Can't remove the workspace owner. Transfer ownership to another member first.",
    };
  }

  const { error } = await sb
    .from("agency_memberships")
    .update({
      status: "removed",
      removed_at: NOW(),
      removed_by: actorId,
      updated_at: NOW(),
    })
    .eq("id", m.id);
  if (error) {
    logServerError("platform.removeMember", error);
    return { ok: false, error: "Could not remove the member." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.member.remove",
    tenantId: m.tenant_id,
    targetType: "agency_membership",
    targetId: m.profile_id,
    metadata: { role: m.role },
  });

  revalidateTenantSurfaces(m.tenant_id);
  return { ok: true, data: undefined };
}

// ─── Assign owner by email ────────────────────────────────────────────────────
// Unlike Transfer (requires existing member), this creates the membership if
// the person isn't already in the workspace — solving the "no owner" case.

export async function actionAssignOwnerByEmail(input: {
  tenantId: string;
  email: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  if (!input.tenantId) return { ok: false, error: "Missing workspace." };
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const profileId = await findProfileIdByEmail(sb, email);
  if (!profileId) {
    return { ok: false, error: "No Tulala account uses that email." };
  }

  const { data: agency } = await sb
    .from("agencies")
    .select("id")
    .eq("id", input.tenantId)
    .maybeSingle();
  if (!agency) return { ok: false, error: "Workspace not found." };

  // Demote current owner to admin first.
  const { data: currentOwner } = await sb
    .from("agency_memberships")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();
  if (currentOwner) {
    await sb
      .from("agency_memberships")
      .update({ role: "admin", updated_at: NOW() })
      .eq("id", currentOwner.id);
  }

  // Find existing membership row (any status).
  const { data: existing } = await sb
    .from("agency_memberships")
    .select("id, status, role")
    .eq("tenant_id", input.tenantId)
    .eq("profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing && existing.status !== "removed") {
    const { error } = await sb
      .from("agency_memberships")
      .update({ role: "owner", updated_at: NOW() })
      .eq("id", existing.id);
    if (error) {
      logServerError("platform.assignOwner.promote", error);
      return { ok: false, error: "Could not assign ownership." };
    }
  } else if (existing) {
    const { error } = await sb
      .from("agency_memberships")
      .update({
        role: "owner",
        status: "active",
        accepted_at: NOW(),
        removed_at: null,
        removed_by: null,
        updated_at: NOW(),
      })
      .eq("id", existing.id);
    if (error) {
      logServerError("platform.assignOwner.reactivate", error);
      return { ok: false, error: "Could not assign ownership." };
    }
  } else {
    // TEAM-SEAT EXEMPTION (deliberate): platform staff seat members without
    // a `checkTeamSeatAvailability` call. The plan cap governs what a
    // workspace can do to itself; a platform override is how support and
    // operations get in, and must never be blocked by the tenant's plan.
    // Tenant-side enforcement lives in lib/saas/team-seat-limit.ts.
    const { error } = await sb.from("agency_memberships").insert({
      tenant_id: input.tenantId,
      profile_id: profileId,
      role: "owner",
      status: "active",
      invited_by: actorId,
      invited_at: NOW(),
      accepted_at: NOW(),
    });
    if (error) {
      logServerError("platform.assignOwner.insert", error);
      return { ok: false, error: "Could not create owner membership." };
    }
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.owner.assign",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    severity: "warn",
    metadata: { email, profile_id: profileId },
  });

  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

export async function actionTransferWorkspaceOwner(input: {
  tenantId: string;
  newOwnerMembershipId: string;
}): Promise<TenantActionResult> {
  const auth = await requirePlatformAdmin();
  if (!auth.ok) return auth;
  const { sb, actorId } = auth;

  const { data: newM } = await sb
    .from("agency_memberships")
    .select("id, tenant_id, role, status, profile_id")
    .eq("id", input.newOwnerMembershipId)
    .maybeSingle();
  if (!newM || newM.tenant_id !== input.tenantId) {
    return { ok: false, error: "That member isn't part of this workspace." };
  }
  if (newM.status !== "active") {
    return { ok: false, error: "The new owner must be an active member." };
  }
  if (newM.role === "owner") {
    return { ok: false, error: "That member already owns this workspace." };
  }

  const { data: currentOwner } = await sb
    .from("agency_memberships")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("role", "owner")
    .eq("status", "active")
    .maybeSingle();

  // Demote the current owner first — the DB enforces a single active owner
  // per tenant, so both can't hold the role simultaneously.
  if (currentOwner) {
    const { error } = await sb
      .from("agency_memberships")
      .update({ role: "admin", updated_at: NOW() })
      .eq("id", currentOwner.id);
    if (error) {
      logServerError("platform.transferOwner.demote", error);
      return { ok: false, error: "Could not transfer ownership." };
    }
  }

  const { error: promoteErr } = await sb
    .from("agency_memberships")
    .update({ role: "owner", updated_at: NOW() })
    .eq("id", newM.id);
  if (promoteErr) {
    // Roll the demotion back so the workspace keeps an owner.
    if (currentOwner) {
      await sb
        .from("agency_memberships")
        .update({ role: "owner", updated_at: NOW() })
        .eq("id", currentOwner.id);
    }
    logServerError("platform.transferOwner.promote", promoteErr);
    return { ok: false, error: "Could not transfer ownership." };
  }

  await recordAudit(sb, {
    actorId,
    action: "platform.tenant.owner.transfer",
    tenantId: input.tenantId,
    targetType: "workspace",
    targetId: input.tenantId,
    severity: "warn",
    metadata: {
      new_owner_profile_id: newM.profile_id,
      previous_owner_membership_id: currentOwner?.id ?? null,
    },
  });

  revalidateTenantSurfaces(input.tenantId);
  return { ok: true, data: undefined };
}

