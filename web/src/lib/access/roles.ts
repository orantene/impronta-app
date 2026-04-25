/**
 * Tenant role registry + role → capability mapping.
 *
 * Five roles, additive: every higher role is a strict superset of the lower.
 * Mirrors the existing matrix in `web/src/lib/saas/capabilities.ts` and
 * `web/src/lib/site-admin/capabilities.ts` exactly so the migration is a
 * lift-and-shift, not a behavior change.
 *
 * Adding a role or changing what a role can do = code change here = code review.
 * Roles are stable product policy, not per-tenant configuration.
 */

import type { CapabilityKey } from "./capabilities";

export const TENANT_ROLE_KEYS = [
  "viewer",
  "editor",
  "coordinator",
  "admin",
  "owner",
] as const;

export type TenantRoleKey = (typeof TENANT_ROLE_KEYS)[number];

export type TenantRoleDef = {
  key: TenantRoleKey;
  displayName: string;
  description: string;
  /** Used for ordering in UI (low to high). Not a strict hierarchy check. */
  rank: number;
  /** false reserves the role for special-path assignment (e.g. `owner` requires ownership transfer). */
  isAssignable: boolean;
};

export const TENANT_ROLES: Record<TenantRoleKey, TenantRoleDef> = {
  viewer: {
    key: "viewer",
    displayName: "Viewer",
    description: "Read-only access to your workspace.",
    rank: 0,
    isAssignable: true,
  },
  editor: {
    key: "editor",
    displayName: "Editor",
    description: "Edit talent, client, and site content. Cannot publish or manage billing.",
    rank: 1,
    isAssignable: true,
  },
  coordinator: {
    key: "coordinator",
    displayName: "Coordinator",
    description: "Run inquiries and bookings end-to-end. Publish site updates.",
    rank: 2,
    isAssignable: true,
  },
  admin: {
    key: "admin",
    displayName: "Admin",
    description: "Full workspace control except billing and ownership transfer.",
    rank: 3,
    isAssignable: true,
  },
  owner: {
    key: "owner",
    displayName: "Owner",
    description: "Full control including billing and workspace lifecycle.",
    rank: 4,
    /** Owner is granted on workspace creation or via explicit ownership transfer. */
    isAssignable: false,
  },
};

// ── Role → capability matrix (additive, mirrors current behavior) ─────

const VIEWER_CAPS: readonly CapabilityKey[] = [
  "view_dashboard",
  "view_talent_roster",
  "view_client_list",
  "view_analytics",
];

const EDITOR_CAPS: readonly CapabilityKey[] = [
  ...VIEWER_CAPS,
  "edit_talent_overlay",
  "edit_client_relationship",
  "edit_cms_pages",
  "edit_navigation",
  // Phase 5 site-admin edits
  "agency.site_admin.navigation.edit",
  "agency.site_admin.pages.edit",
  "agency.site_admin.sections.edit",
  "agency.site_admin.homepage.compose",
  "agency.site_admin.media.upload",
];

const COORDINATOR_CAPS: readonly CapabilityKey[] = [
  ...EDITOR_CAPS,
  "view_private_client_data",
  "manage_talent_roster",
  "publish_talent_to_storefront",
  "submit_hub_visibility",
  "create_inquiry",
  "coordinate_inquiry",
  "send_client_offer",
  "approve_offer_internal",
  "convert_to_booking",
  "cancel_inquiry",
  "publish_cms_pages",
  // Phase 5 publish surfaces
  "agency.site_admin.pages.publish",
  "agency.site_admin.sections.publish",
  "agency.site_admin.homepage.publish",
  "agency.site_admin.navigation.publish",
  "agency.site_admin.media.delete",
];

const ADMIN_CAPS: readonly CapabilityKey[] = [
  ...COORDINATOR_CAPS,
  "delete_client_relationship",
  "edit_branding",
  "edit_storefront_layout",
  "manage_memberships",
  "manage_field_catalog",
  "manage_storefront_settings",
  "manage_agency_settings",
  // Phase 5 admin-only
  "agency.site_admin.identity.edit",
  "agency.site_admin.branding.edit",
  "agency.site_admin.design.edit",
  "agency.site_admin.design.publish",
];

const OWNER_CAPS: readonly CapabilityKey[] = [
  ...ADMIN_CAPS,
  "manage_billing",
  "transfer_ownership",
  "suspend_tenant",
];

export const ROLE_CAPABILITIES: Record<TenantRoleKey, ReadonlySet<CapabilityKey>> = {
  viewer: new Set(VIEWER_CAPS),
  editor: new Set(EDITOR_CAPS),
  coordinator: new Set(COORDINATOR_CAPS),
  admin: new Set(ADMIN_CAPS),
  owner: new Set(OWNER_CAPS),
};

export function roleGrantsCapability(
  role: TenantRoleKey,
  cap: CapabilityKey,
): boolean {
  return ROLE_CAPABILITIES[role].has(cap);
}

export function isKnownTenantRole(role: string): role is TenantRoleKey {
  return (TENANT_ROLE_KEYS as readonly string[]).includes(role);
}
