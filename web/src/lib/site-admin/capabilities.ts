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

/**
 * @deprecated Phase 2 — thin re-export shim. `hasPhase5Capability` and
 * `requirePhase5Capability` now delegate to `lib/access/`. New code should
 * import `userHasCapability` / `requireCapability` from `@/lib/access`
 * directly. This shim will be removed in Phase 4.
 */
import {
  userHasCapability,
  requireCapability as accessRequireCapability,
} from "@/lib/access";
import type { MembershipRole } from "@/lib/saas/tenant";

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

/**
 * @deprecated Use `userHasCapability` from `@/lib/access` directly.
 * Thin shim — delegates to the canonical 10-step resolver.
 */
export async function hasPhase5Capability(
  cap: Phase5Capability,
  tenantId: string,
): Promise<boolean> {
  return userHasCapability(cap, tenantId);
}

/**
 * @deprecated Use `requireCapability` from `@/lib/access` directly.
 * Thin shim — delegates to the canonical 10-step resolver.
 */
export async function requirePhase5Capability(
  cap: Phase5Capability,
  tenantId: string,
): Promise<void> {
  return accessRequireCapability(cap, tenantId);
}
