/**
 * Phase 5 — Agency Site Admin capability registry.
 *
 * Locked at plan kickoff. Bare-string permission checks are banned in
 * Phase 5 code paths: any capability check must pass one of these exact
 * strings, imported from this module.
 *
 * Naming convention (dotted): agency.site_admin.{surface}.{action}
 *
 * Role grants follow Phase 5 governance:
 *   - owner:       all 12 (billing-level role retains full site-admin surface)
 *   - admin:       all 12
 *   - coordinator: edit + publish surfaces (but not identity/branding/design
 *                  which are admin-owned)
 *   - editor:      edit surfaces only (no publish)
 *   - viewer:      none
 *
 * This module wires into the existing web/src/lib/saas/capabilities.ts so the
 * same requireCapability(cap, tenantId) works for both legacy and Phase-5
 * capabilities.
 */

import { requireCapability as requireLegacyCapability } from "@/lib/saas/capabilities";
import type { MembershipRole } from "@/lib/saas/tenant";
import { findTenantMembership } from "@/lib/saas/tenant";

export const PHASE_5_CAPABILITIES = [
  "agency.site_admin.identity.edit",
  "agency.site_admin.branding.edit",
  "agency.site_admin.navigation.edit",
  "agency.site_admin.navigation.publish",
  "agency.site_admin.pages.edit",
  "agency.site_admin.pages.publish",
  "agency.site_admin.sections.edit",
  "agency.site_admin.sections.publish",
  "agency.site_admin.homepage.compose",
  "agency.site_admin.homepage.publish",
  "agency.site_admin.design.edit",
  "agency.site_admin.design.publish",
  "agency.site_admin.media.upload",
  "agency.site_admin.media.delete",
] as const;

export type Phase5Capability = (typeof PHASE_5_CAPABILITIES)[number];

const VIEWER_CAPS: readonly Phase5Capability[] = [];

const EDITOR_CAPS: readonly Phase5Capability[] = [
  "agency.site_admin.navigation.edit",
  "agency.site_admin.pages.edit",
  "agency.site_admin.sections.edit",
  "agency.site_admin.homepage.compose",
  "agency.site_admin.media.upload",
];

const COORDINATOR_CAPS: readonly Phase5Capability[] = [
  ...EDITOR_CAPS,
  "agency.site_admin.pages.publish",
  "agency.site_admin.sections.publish",
  "agency.site_admin.homepage.publish",
  "agency.site_admin.navigation.publish",
  "agency.site_admin.media.delete",
];

const ADMIN_CAPS: readonly Phase5Capability[] = [
  ...COORDINATOR_CAPS,
  "agency.site_admin.identity.edit",
  "agency.site_admin.branding.edit",
  "agency.site_admin.design.edit",
  "agency.site_admin.design.publish",
];

const OWNER_CAPS: readonly Phase5Capability[] = ADMIN_CAPS;

const ROLE_PHASE5_CAPS: Record<MembershipRole, ReadonlySet<Phase5Capability>> = {
  viewer: new Set(VIEWER_CAPS),
  editor: new Set(EDITOR_CAPS),
  coordinator: new Set(COORDINATOR_CAPS),
  admin: new Set(ADMIN_CAPS),
  owner: new Set(OWNER_CAPS),
};

export function rolePhase5HasCapability(
  role: MembershipRole,
  cap: Phase5Capability,
): boolean {
  return ROLE_PHASE5_CAPS[role].has(cap);
}

export async function hasPhase5Capability(
  cap: Phase5Capability,
  tenantId: string,
): Promise<boolean> {
  const membership = await findTenantMembership(tenantId);
  if (!membership) return false;
  if (membership.status !== "active") return false;
  return rolePhase5HasCapability(membership.role, cap);
}

export async function requirePhase5Capability(
  cap: Phase5Capability,
  tenantId: string,
): Promise<void> {
  const ok = await hasPhase5Capability(cap, tenantId);
  if (!ok) {
    throw new Error(
      `forbidden: missing capability ${cap} on tenant ${tenantId}`,
    );
  }
}

/**
 * Bridge to the legacy capability enforcement for non-Phase-5 work. Preserves
 * a single mutation entry point: callers pick the right function by the type
 * of capability they check.
 */
export { requireLegacyCapability };
