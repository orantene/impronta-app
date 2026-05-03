/**
 * @deprecated Phase 2 — thin re-export shim. `hasCapability` and
 * `requireCapability` now delegate to `lib/access/`. New code should
 * import `userHasCapability` / `requireCapability` from `@/lib/access`
 * directly. This shim will be removed in Phase 4.
 */
import {
  userHasCapability,
  requireCapability as accessRequireCapability,
} from "@/lib/access";
import type { MembershipRole } from "@/lib/saas/tenant";

/**
 * Capability model (Plan §4 + Phase 0 deliverable 2).
 *
 * Capabilities are checked in app code (`requireCapability(ctx, cap, tenantId)`)
 * and enforced server-side via the SQL `is_staff_of_tenant` + future
 * `current_user_has_capability` helpers. Role → capability is additive:
 * lower roles are strict subsets of higher roles for Phase 2.
 *
 * Rule of thumb:
 *  - viewer        read-only
 *  - editor        + mutate talent/client overlay + CMS content
 *  - coordinator   + engine actions (offers/approvals/bookings) + inquiries
 *  - admin         + settings/branding/memberships
 *  - owner         + billing + tenant lifecycle (suspend/restore/transfer)
 */
export type Capability =
  // Visibility
  | "view_dashboard"
  | "view_talent_roster"
  | "view_client_list"
  | "view_analytics"
  | "view_private_client_data"
  // Talent workspace
  | "edit_talent_overlay"
  | "manage_talent_roster"
  | "publish_talent_to_storefront"
  | "submit_hub_visibility"
  // Client workspace
  | "edit_client_relationship"
  | "delete_client_relationship"
  // Inquiry / booking engine
  | "create_inquiry"
  | "coordinate_inquiry"
  | "send_client_offer"
  | "approve_offer_internal"
  | "convert_to_booking"
  | "cancel_inquiry"
  // CMS / storefront
  | "edit_cms_pages"
  | "publish_cms_pages"
  | "edit_navigation"
  | "edit_branding"
  | "edit_storefront_layout"
  // Settings / admin
  | "manage_memberships"
  | "manage_field_catalog"
  | "manage_storefront_settings"
  | "manage_agency_settings"
  // Tenant lifecycle / billing (owner only)
  | "manage_billing"
  | "transfer_ownership"
  | "suspend_tenant";

const VIEWER: Capability[] = [
  "view_dashboard",
  "view_talent_roster",
  "view_client_list",
  "view_analytics",
];

const EDITOR: Capability[] = [
  ...VIEWER,
  "edit_talent_overlay",
  "edit_client_relationship",
  "edit_cms_pages",
  "edit_navigation",
];

const COORDINATOR: Capability[] = [
  ...EDITOR,
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
];

const ADMIN: Capability[] = [
  ...COORDINATOR,
  "delete_client_relationship",
  "edit_branding",
  "edit_storefront_layout",
  "manage_memberships",
  "manage_field_catalog",
  "manage_storefront_settings",
  "manage_agency_settings",
];

const OWNER: Capability[] = [
  ...ADMIN,
  "manage_billing",
  "transfer_ownership",
  "suspend_tenant",
];

const ROLE_CAPS: Record<MembershipRole, ReadonlySet<Capability>> = {
  viewer: new Set(VIEWER),
  editor: new Set(EDITOR),
  coordinator: new Set(COORDINATOR),
  admin: new Set(ADMIN),
  owner: new Set(OWNER),
};

export function roleHasCapability(role: MembershipRole, cap: Capability): boolean {
  return ROLE_CAPS[role].has(cap);
}

/**
 * @deprecated Use `userHasCapability` from `@/lib/access` directly.
 * Thin shim — delegates to the canonical 10-step resolver.
 *
 * Pending-acceptance memberships have the same read surface as their role
 * but should NOT be trusted for mutations; mutation checks go through
 * {@link requireCapability} which enforces `status = 'active'`.
 */
export async function hasCapability(
  cap: Capability,
  tenantId: string,
): Promise<boolean> {
  return userHasCapability(cap, tenantId);
}

/**
 * @deprecated Use `requireCapability` from `@/lib/access` directly.
 * Thin shim — delegates to the canonical 10-step resolver.
 */
export async function requireCapability(
  cap: Capability,
  tenantId: string,
): Promise<void> {
  return accessRequireCapability(cap, tenantId);
}
