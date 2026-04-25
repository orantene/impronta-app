/**
 * Capability resolver — `userHasCapability(cap, tenantId)`.
 *
 * Implements the Access Resolution Contract (§5 of the architecture brief).
 * This is the single import every gated action goes through. Replaces:
 *   - `requireCapability` from `lib/saas/capabilities.ts`
 *   - `requirePhase5Capability` from `lib/site-admin/capabilities.ts`
 *   - inline `app_role === 'super_admin'` and role-string branches across the codebase
 *
 * The 10-step contract:
 *   1. Resolve tenant
 *   2. Check tenant servability (status)
 *   3. Resolve user
 *   4. Platform role bypass (super_admin)
 *   5. Active membership
 *   6. Role grants capability
 *   7. Plan grants capability   (permissive Phase 1; Track C tightens)
 *   8. Limit headroom           (caller invokes assertWithinLimit separately)
 *   9. Status-degraded behavior (Phase 1: enforced for onboarding/active/suspended)
 *  10. Allow
 */

import { findTenantMembership } from "@/lib/saas/tenant";
import { getCachedActorSession } from "@/lib/server/request-cache";

import { isKnownCapability, type CapabilityKey } from "./capabilities";
import { isKnownTenantRole, roleGrantsCapability } from "./roles";
import {
  getPlatformRole,
  platformRoleGrantsCapability,
  type ProfileForPlatformRole,
} from "./platform-role";
import {
  isKnownStatus,
  isStatusEnforced,
  isServableStatus,
  STATUS_RULES,
} from "./status-rules";
import { planGrantsCapability } from "./plan-capabilities";
import { isKnownPlan, type PlanKey } from "./plan-catalog";

export type AuthorizeResult =
  | { ok: true }
  | { ok: false; reason: AuthorizeDenialReason; detail?: string };

export type AuthorizeDenialReason =
  | "unknown_capability"
  | "no_user"
  | "no_membership"
  | "membership_inactive"
  | "role_lacks_capability"
  | "plan_lacks_capability"
  | "tenant_not_servable"
  | "status_blocks";

/**
 * Returns `{ ok: true }` if the caller is allowed to perform `capability` on
 * `tenantId`, or a structured denial reason. Use this when the caller wants
 * to render a context-specific UI for the denial (e.g. "upgrade to publish").
 */
export async function authorize(
  capability: CapabilityKey | string,
  tenantId: string,
): Promise<AuthorizeResult> {
  // ── Sanity ─────────────────────────────────────────────────────────
  if (!isKnownCapability(capability)) {
    return {
      ok: false,
      reason: "unknown_capability",
      detail: `capability "${capability}" is not in the registry`,
    };
  }

  // ── Step 3: resolve user ────────────────────────────────────────────
  const session = await getCachedActorSession();
  const profile = session?.profile as ProfileForPlatformRole | null;

  // ── Step 4: platform-role bypass ───────────────────────────────────
  // Platform admins bypass tenant membership / role / plan, but step 2
  // (tenant servability) still applies for non-platform URLs. In the
  // pre-Track-A world we don't yet have the URL split, so a super_admin
  // acting via `/admin/...` is still gated by membership for tenant data.
  // The bypass here applies when `getPlatformRole` returns a role.
  const platformRole = getPlatformRole(profile);
  if (platformRole && platformRoleGrantsCapability(platformRole, capability)) {
    return { ok: true };
  }

  // From here on we need a tenant membership.
  if (!session?.user) {
    return { ok: false, reason: "no_user" };
  }

  // ── Step 5: active membership ──────────────────────────────────────
  const membership = await findTenantMembership(tenantId);
  if (!membership) {
    return { ok: false, reason: "no_membership" };
  }
  if (membership.status !== "active") {
    return { ok: false, reason: "membership_inactive" };
  }

  // ── Step 2 + Step 9: tenant status (only enforced for Phase 1 statuses) ─
  // The membership row carries the agency status. If we know the status and
  // it's enforceable, check servability + per-status behavior.
  const tenantStatus = membership.agency_status;
  if (isKnownStatus(tenantStatus) && isStatusEnforced(tenantStatus)) {
    if (!isServableStatus(tenantStatus)) {
      return {
        ok: false,
        reason: "tenant_not_servable",
        detail: `workspace status "${tenantStatus}"`,
      };
    }
    const rules = STATUS_RULES[tenantStatus];
    // Phase 1 enforced behaviors — coarse check. Track C wires the full
    // capability-to-behavior mapping; for now only block edits/publish on
    // statuses that explicitly say "no".
    const isEditCap =
      capability.includes(".edit") ||
      capability.startsWith("edit_") ||
      capability.startsWith("manage_");
    const isPublishCap =
      capability.includes(".publish") || capability === "publish_cms_pages";
    if (rules.edits === "no" && isEditCap) {
      return { ok: false, reason: "status_blocks", detail: "edits disabled" };
    }
    if (rules.publish === "no" && isPublishCap) {
      return { ok: false, reason: "status_blocks", detail: "publishing disabled" };
    }
  }

  // ── Step 6: role grants capability ─────────────────────────────────
  if (!isKnownTenantRole(membership.role)) {
    // Defensive — DB CHECK constraint should prevent unknown roles.
    return {
      ok: false,
      reason: "role_lacks_capability",
      detail: `unknown role "${membership.role}"`,
    };
  }
  if (!roleGrantsCapability(membership.role, capability)) {
    return { ok: false, reason: "role_lacks_capability" };
  }

  // ── Step 7: plan grants capability ─────────────────────────────────
  // Phase 1 PLAN_CAPABILITIES is permissive (every plan grants every cap);
  // this branch is a no-op until Track C tightens the per-plan subsets.
  // Once tightened, denials surface here automatically.
  const plan = (membership as { agency_plan_tier?: unknown }).agency_plan_tier;
  if (typeof plan === "string" && isKnownPlan(plan)) {
    if (!planGrantsCapability(plan as PlanKey, capability)) {
      return { ok: false, reason: "plan_lacks_capability" };
    }
  }
  // Unknown plan keys fail open — fixed when Track B.4 wires the resolver
  // through `agencies.plan_tier` properly.

  return { ok: true };
}

/** Boolean wrapper around `authorize`. */
export async function userHasCapability(
  capability: CapabilityKey | string,
  tenantId: string,
): Promise<boolean> {
  const result = await authorize(capability, tenantId);
  return result.ok;
}

/**
 * Throws a structured error when the caller lacks `capability` on `tenantId`.
 * Server actions and API routes call this; client code should use the
 * boolean version for UI-state.
 */
export class AccessDeniedError extends Error {
  constructor(
    public readonly capability: string,
    public readonly tenantId: string,
    public readonly reason: AuthorizeDenialReason,
    public readonly detail?: string,
  ) {
    super(
      `forbidden: capability=${capability} tenant=${tenantId} reason=${reason}${detail ? ` detail=${detail}` : ""}`,
    );
    this.name = "AccessDeniedError";
  }
}

export async function requireCapability(
  capability: CapabilityKey | string,
  tenantId: string,
): Promise<void> {
  const result = await authorize(capability, tenantId);
  if (!result.ok) {
    throw new AccessDeniedError(
      String(capability),
      tenantId,
      result.reason,
      result.detail,
    );
  }
}
