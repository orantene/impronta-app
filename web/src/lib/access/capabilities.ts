/**
 * Capability registry — single source of truth for every gated action in the system.
 *
 * Capabilities are checked through `userHasCapability(cap, tenantId)` in
 * `web/src/lib/access/has-capability.ts`. Adding a capability means adding a
 * row here, then granting it to the right roles (`roles.ts`) and plans
 * (`plan-capabilities.ts`).
 *
 * Naming convention:
 *   - Legacy keys (snake_case, no namespace): `view_dashboard`, `manage_billing`
 *   - Phase 5 site-admin keys (dotted): `agency.site_admin.{surface}.{action}`
 *
 * Renaming a capability key is forbidden once shipped. Capability keys are
 * permanent product contracts. To "rename": create a new key, migrate
 * grants over, mark the old one `deprecated: true`, retire after one release.
 *
 * This file is the canonical capability registry. Validate every DB
 * `plan_capabilities.capability_key` value against `CAPABILITIES` via
 * `npm run check:capability-keys` (CI).
 */

export const CAPABILITY_CATEGORIES = [
  "dashboard",
  "talent",
  "client",
  "inquiry",
  "site",
  "team",
  "billing",
  "platform",
] as const;

export type CapabilityCategory = (typeof CAPABILITY_CATEGORIES)[number];

export type CapabilityScope = "tenant" | "platform";

export type CapabilityDef = {
  /** Stable key used in code, RLS, plan_capabilities, and audit logs. */
  key: string;
  /** Operator-facing label (admin UI feature lists, audit messages). */
  displayName: string;
  /** End-user description; surfaced in pricing tables and upgrade modals. */
  description: string;
  category: CapabilityCategory;
  scope: CapabilityScope;
  /** True once a capability is being phased out. The resolver logs a warning when checked. */
  deprecated: boolean;
};

const define = (def: CapabilityDef): CapabilityDef => def;

/**
 * The full capability catalog. Order is presentation-stable: the pricing page
 * groups by `category` and renders within each category in the order below.
 */
export const CAPABILITIES = {
  // ─── Dashboard / visibility ──────────────────────────────────────────
  view_dashboard: define({
    key: "view_dashboard",
    displayName: "Open the workspace",
    description: "See your dashboard, recent activity, and roster overview.",
    category: "dashboard",
    scope: "tenant",
    deprecated: false,
  }),
  view_analytics: define({
    key: "view_analytics",
    displayName: "View analytics",
    description: "Track inquiries, bookings, and roster performance over time.",
    category: "dashboard",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Talent ──────────────────────────────────────────────────────────
  view_talent_roster: define({
    key: "view_talent_roster",
    displayName: "View talent roster",
    description: "See the talent assigned to your workspace.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  edit_talent_overlay: define({
    key: "edit_talent_overlay",
    displayName: "Edit talent profiles",
    description: "Update your roster's editorial copy, media, and tags.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  manage_talent_roster: define({
    key: "manage_talent_roster",
    displayName: "Manage roster membership",
    description: "Add, remove, and reassign talent on your roster.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  publish_talent_to_storefront: define({
    key: "publish_talent_to_storefront",
    displayName: "Publish talent",
    description: "Make a talent profile visible on your public site.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  submit_hub_visibility: define({
    key: "submit_hub_visibility",
    displayName: "Submit talent to the hub",
    description: "Request cross-agency discovery for a talent.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Client ──────────────────────────────────────────────────────────
  view_client_list: define({
    key: "view_client_list",
    displayName: "View clients",
    description: "Browse the clients connected to your workspace.",
    category: "client",
    scope: "tenant",
    deprecated: false,
  }),
  view_private_client_data: define({
    key: "view_private_client_data",
    displayName: "View private client data",
    description: "Access contact details, billing notes, and private comms history.",
    category: "client",
    scope: "tenant",
    deprecated: false,
  }),
  edit_client_relationship: define({
    key: "edit_client_relationship",
    displayName: "Edit client records",
    description: "Update client contact info, notes, and account details.",
    category: "client",
    scope: "tenant",
    deprecated: false,
  }),
  delete_client_relationship: define({
    key: "delete_client_relationship",
    displayName: "Delete client records",
    description: "Permanently remove a client from your workspace.",
    category: "client",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Inquiry / booking engine ───────────────────────────────────────
  create_inquiry: define({
    key: "create_inquiry",
    displayName: "Create inquiries",
    description: "Open new inquiries on behalf of clients.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),
  coordinate_inquiry: define({
    key: "coordinate_inquiry",
    displayName: "Coordinate inquiries",
    description: "Move inquiries through review, talent suggestion, and follow-up.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),
  send_client_offer: define({
    key: "send_client_offer",
    displayName: "Send client offers",
    description: "Propose talent and pricing to a client.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),
  approve_offer_internal: define({
    key: "approve_offer_internal",
    displayName: "Approve offers internally",
    description: "Sign off on draft offers before they go to clients.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),
  convert_to_booking: define({
    key: "convert_to_booking",
    displayName: "Convert inquiries to bookings",
    description: "Lock in a confirmed booking from an accepted offer.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),
  cancel_inquiry: define({
    key: "cancel_inquiry",
    displayName: "Cancel inquiries",
    description: "Close inquiries with a cancellation reason.",
    category: "inquiry",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Site / CMS / branding ──────────────────────────────────────────
  edit_cms_pages: define({
    key: "edit_cms_pages",
    displayName: "Edit pages and posts",
    description: "Draft changes to your site's pages and editorial content.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  publish_cms_pages: define({
    key: "publish_cms_pages",
    displayName: "Publish pages and posts",
    description: "Take page and post drafts live on your site.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  edit_navigation: define({
    key: "edit_navigation",
    displayName: "Edit navigation",
    description: "Reorder menu items and footer links.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  edit_branding: define({
    key: "edit_branding",
    displayName: "Edit branding",
    description: "Change your logo, palette, and typography.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  edit_storefront_layout: define({
    key: "edit_storefront_layout",
    displayName: "Edit storefront layout",
    description: "Configure the directory grid and section composition.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  manage_storefront_settings: define({
    key: "manage_storefront_settings",
    displayName: "Manage site settings",
    description: "Configure SEO defaults, redirects, and storefront behavior.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.identity.edit": define({
    key: "agency.site_admin.identity.edit",
    displayName: "Edit business identity",
    description: "Update your public name, contact email, and social links.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.branding.edit": define({
    key: "agency.site_admin.branding.edit",
    displayName: "Edit site branding",
    description: "Apply theme presets, brand colors, and typography.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.navigation.edit": define({
    key: "agency.site_admin.navigation.edit",
    displayName: "Edit site navigation",
    description: "Compose your header and footer navigation menus.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.navigation.publish": define({
    key: "agency.site_admin.navigation.publish",
    displayName: "Publish site navigation",
    description: "Take navigation changes live.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.pages.edit": define({
    key: "agency.site_admin.pages.edit",
    displayName: "Edit site pages",
    description: "Draft changes to standalone pages.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.pages.publish": define({
    key: "agency.site_admin.pages.publish",
    displayName: "Publish site pages",
    description: "Take page drafts live.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.sections.edit": define({
    key: "agency.site_admin.sections.edit",
    displayName: "Edit site sections",
    description: "Compose reusable section blocks.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.sections.publish": define({
    key: "agency.site_admin.sections.publish",
    displayName: "Publish site sections",
    description: "Promote section drafts to the live composition.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.homepage.compose": define({
    key: "agency.site_admin.homepage.compose",
    displayName: "Compose homepage",
    description: "Arrange the sections that make up your homepage.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.homepage.publish": define({
    key: "agency.site_admin.homepage.publish",
    displayName: "Publish homepage",
    description: "Take homepage changes live.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.design.edit": define({
    key: "agency.site_admin.design.edit",
    displayName: "Edit site design",
    description: "Tune theme tokens, spacing, and design foundations.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.design.publish": define({
    key: "agency.site_admin.design.publish",
    displayName: "Publish design changes",
    description: "Take design-foundation changes live.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.media.upload": define({
    key: "agency.site_admin.media.upload",
    displayName: "Upload media",
    description: "Upload images and assets to your media library.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.site_admin.media.delete": define({
    key: "agency.site_admin.media.delete",
    displayName: "Delete media",
    description: "Remove unused assets from your media library.",
    category: "site",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Team / memberships / fields ────────────────────────────────────
  manage_memberships: define({
    key: "manage_memberships",
    displayName: "Manage team",
    description: "Invite, role-assign, and remove members from your workspace.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),
  manage_field_catalog: define({
    key: "manage_field_catalog",
    displayName: "Manage field catalog",
    description: "Define custom talent attributes and options.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),
  manage_agency_settings: define({
    key: "manage_agency_settings",
    displayName: "Manage workspace settings",
    description: "Configure workspace-wide preferences and policies.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),

  // ─── Billing / lifecycle (owner-class) ──────────────────────────────
  manage_billing: define({
    key: "manage_billing",
    displayName: "Manage billing",
    description: "Change plans, update payment methods, and view invoices.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  transfer_ownership: define({
    key: "transfer_ownership",
    displayName: "Transfer ownership",
    description: "Pass workspace ownership to another member.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  suspend_tenant: define({
    key: "suspend_tenant",
    displayName: "Suspend workspace",
    description: "Temporarily take this workspace offline.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
} as const;

export type CapabilityKey = keyof typeof CAPABILITIES;

export const CAPABILITY_KEYS: readonly CapabilityKey[] = Object.keys(
  CAPABILITIES,
) as CapabilityKey[];

export function isKnownCapability(key: string): key is CapabilityKey {
  return key in CAPABILITIES;
}

export function getCapability(key: CapabilityKey): CapabilityDef {
  return CAPABILITIES[key];
}
