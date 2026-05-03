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

/**
 * How a capability is granted. The resolver inspects this to decide which
 * gate evaluates the capability.
 *
 *   - "role"          — standard tenant-membership role grant. Default.
 *   - "platform_role" — granted via `profiles.platform_role` (super_admin).
 *   - "relationship"  — context-sensitive: requires a talent / agency /
 *                       hub relationship-state evaluator beyond role + plan.
 *                       See docs/talent-relationship-model.md §10.
 *   - "always"        — always granted (e.g. `talent.agency.exit`, the
 *                       escape valve from exclusive relationships).
 */
export type CapabilityGating =
  | "role"
  | "platform_role"
  | "relationship"
  | "always";

export type CapabilityDef = {
  /** Stable key used in code, RLS, plan_capabilities, and audit logs. */
  key: string;
  /** Operator-facing label (admin UI feature lists, audit messages). */
  displayName: string;
  /** End-user description; surfaced in pricing tables and upgrade modals. */
  description: string;
  category: CapabilityCategory;
  scope: CapabilityScope;
  /**
   * How this capability is granted. Defaults to "role" when omitted (the
   * common case) so the legacy 43 capabilities don't need explicit values.
   * Capabilities with non-default gating MUST set this explicitly.
   */
  gating?: CapabilityGating;
  /** True once a capability is being phased out. The resolver logs a warning when checked. */
  deprecated: boolean;
};

/** Resolves the gating for a capability, defaulting to "role" when unset. */
export function capabilityGating(def: CapabilityDef): CapabilityGating {
  return def.gating ?? "role";
}

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

  // ─── Talent relationship model — locked product logic ────────────────
  // See docs/talent-relationship-model.md for the binding rules.
  // Capabilities below are added to the registry NOW so that names are
  // locked. Most have no callers in Phase 1; Track B.5 wires them when
  // the dashboard surfaces are built.

  // ── Phase 3 workspace surface — canonical multi-tenant routes ──────────
  // Added when `(workspace)/[tenantSlug]/admin/*` routes were promoted.
  // Viewer+ (all active members) can enter the workspace. This gates the
  // layout so non-members who land on a tenantSlug URL get 404 rather
  // than a partial render.
  "agency.workspace.view": define({
    key: "agency.workspace.view",
    displayName: "Access workspace",
    description: "Enter this workspace's dashboard. Required for any workspace surface. All active members have this.",
    category: "dashboard",
    scope: "tenant",
    deprecated: false,
  }),

  // ── Agency-side roster + settings (role-granted) ─────────────────────
  "agency.settings.edit_join_mode": define({
    key: "agency.settings.edit_join_mode",
    displayName: "Set roster join mode",
    description: "Choose how new talent join: open, by approval, or exclusive.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.talent.create": define({
    key: "agency.talent.create",
    displayName: "Add talent to roster",
    description: "Create a new talent profile in this workspace's roster.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.talent.invite_to_claim": define({
    key: "agency.talent.invite_to_claim",
    displayName: "Invite talent to claim profile",
    description: "Send an invite link so a talent can claim a profile created on their behalf.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.roster.set_exclusive": define({
    key: "agency.roster.set_exclusive",
    displayName: "Set exclusive representation",
    description: "Mark a talent's relationship with this agency as exclusive.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "agency.roster.set_hub_visibility": define({
    key: "agency.roster.set_hub_visibility",
    displayName: "Set talent hub visibility",
    description: "Control which hubs a talent appears in. Available on exclusive relationships only.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "agency.roster.view_external_relationships": define({
    key: "agency.roster.view_external_relationships",
    displayName: "See where talent is represented elsewhere",
    description: "View other workspaces where a non-exclusive talent is rostered.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),

  // ── Talent-self capabilities (relationship-gated) ────────────────────
  "talent.visibility.manage_self": define({
    key: "talent.visibility.manage_self",
    displayName: "Manage own visibility",
    description: "Toggle your own active/inactive visibility. Disabled while in an exclusive agency.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.hub.apply": define({
    key: "talent.hub.apply",
    displayName: "Apply to a hub",
    description: "Apply for inclusion in a hub matching your category. Disabled while exclusive.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.hub.leave": define({
    key: "talent.hub.leave",
    displayName: "Leave a hub",
    description: "Remove yourself from a hub. Disabled while exclusive.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.agency.apply": define({
    key: "talent.agency.apply",
    displayName: "Apply to an agency",
    description: "Apply to join an open agency. Disabled while in an exclusive relationship.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.agency.exit": define({
    key: "talent.agency.exit",
    displayName: "Exit an agency",
    description: "Leave an agency relationship. The escape valve — always available.",
    category: "talent",
    scope: "tenant",
    gating: "always",
    deprecated: false,
  }),
  "talent.profile.claim": define({
    key: "talent.profile.claim",
    displayName: "Claim your profile",
    description: "Take ownership of a talent profile created on your behalf.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),

  // ── Platform / hub administration ────────────────────────────────────
  "platform.hub.create": define({
    key: "platform.hub.create",
    displayName: "Create hub",
    description: "Create a new criteria-based hub on the platform.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),
  "platform.hub.set_criteria": define({
    key: "platform.hub.set_criteria",
    displayName: "Edit hub criteria",
    description: "Define the criteria that determine which talent qualify for a hub.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),

  // ─── Transactions, payouts, platform fees ────────────────────────────
  // See docs/transaction-architecture.md for the v1 payment model.
  // Capability names are locked product contracts; most have no callers
  // in v1 — Track B.5 (booking detail) wires them when the receiver-
  // selection UI is built.

  "booking.payment.select_receiver": define({
    key: "booking.payment.select_receiver",
    displayName: "Select payout receiver",
    description: "Choose who receives payment for a booking.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "booking.payment.change_receiver": define({
    key: "booking.payment.change_receiver",
    displayName: "Change payout receiver",
    description: "Change the selected payout receiver before payment is received.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "booking.payment.request": define({
    key: "booking.payment.request",
    displayName: "Request payment from client",
    description: "Send the client payment instructions or a payment link.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "booking.payment.mark_received": define({
    key: "booking.payment.mark_received",
    displayName: "Mark payment received",
    description: "Confirm that the client's payment has arrived (manual provider).",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "booking.payment.refund": define({
    key: "booking.payment.refund",
    displayName: "Refund a booking payment",
    description: "Initiate a refund of a paid booking transaction.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "booking.payment.payout_mark_external": define({
    key: "booking.payment.payout_mark_external",
    displayName: "Mark payout sent externally",
    description: "Confirm you've paid the receiver outside the platform (manual provider).",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "payout_account.connect_self": define({
    key: "payout_account.connect_self",
    displayName: "Connect your payout account",
    description: "Connect your own bank or payment provider to receive payouts.",
    category: "billing",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "agency.payout_account.manage": define({
    key: "agency.payout_account.manage",
    displayName: "Manage workspace payout account",
    description: "Configure the agency-level account that receives platform payouts.",
    category: "billing",
    scope: "tenant",
    deprecated: false,
  }),
  "platform.payments.view_all": define({
    key: "platform.payments.view_all",
    displayName: "View all transactions",
    description: "Cross-tenant view of every booking transaction on the platform.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),
  "platform.fee.configure": define({
    key: "platform.fee.configure",
    displayName: "Configure platform fee",
    description: "Set the platform fee rate per plan or per tenant.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),

  // ─── Talent subscriptions / premium-page features ────────────────────
  // See docs/talent-monetization.md for architectural direction.
  // Capability names locked; most have no callers in v1 — Track B.5
  // wires them when premium-page surfaces are built on the talent's
  // solo workspace.

  "talent.subscription.upgrade": define({
    key: "talent.subscription.upgrade",
    displayName: "Upgrade talent subscription",
    description: "Move your talent solo workspace to a higher tier (Pro, Portfolio).",
    category: "billing",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.subscription.downgrade": define({
    key: "talent.subscription.downgrade",
    displayName: "Downgrade talent subscription",
    description: "Move your talent solo workspace to a lower tier.",
    category: "billing",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.page.edit": define({
    key: "talent.page.edit",
    displayName: "Edit personal page",
    description: "Edit the content of your premium personal page.",
    category: "site",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.page.publish": define({
    key: "talent.page.publish",
    displayName: "Publish personal page",
    description: "Take changes to your premium personal page live.",
    category: "site",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.page.set_template": define({
    key: "talent.page.set_template",
    displayName: "Choose page template",
    description: "Pick from premium page templates (Portfolio tier).",
    category: "site",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.page.enable_module": define({
    key: "talent.page.enable_module",
    displayName: "Enable premium modules",
    description: "Turn on video embeds, audio embeds, social surfacing, schedule, and other premium-page modules.",
    category: "site",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.page.connect_custom_domain": define({
    key: "talent.page.connect_custom_domain",
    displayName: "Connect custom domain to personal page",
    description: "Attach your own domain to your premium personal page (Portfolio tier).",
    category: "site",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "platform.talent_plans.configure": define({
    key: "platform.talent_plans.configure",
    displayName: "Configure talent plans",
    description: "Manage the talent-audience plan catalog (Basic / Pro / Portfolio definitions, pricing, capabilities).",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),

  // Exclusivity-distribution refinement (founder, 2026-04-25):
  // Page ownership stays with the talent always; distribution control
  // becomes relationship-dependent under exclusive agency relationships.
  // See docs/talent-monetization.md §7a.
  "agency.roster.set_personal_page_distribution": define({
    key: "agency.roster.set_personal_page_distribution",
    displayName: "Control talent's personal-page distribution",
    description:
      "While an exclusive relationship is active, set whether the talent's personal page is publicly visible, where its inquiries route, and whether contact CTAs are surfaced. Cannot edit page content (talent owns that).",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),

  // ─── Client trust + talent contact controls ──────────────────────────
  // See docs/client-trust-and-contact-controls.md for the four-tier
  // ladder (Basic / Verified / Silver / Gold), talent contact-preferences
  // model, and the inquiry-send gating evaluator.
  // Capability keys are locked; most have no callers in v1 — Track B.5
  // wires them when trust badges + contact-controls surfaces are built.

  "client.account.verify": define({
    key: "client.account.verify",
    displayName: "Verify your client account",
    description: "Complete account verification (card and/or identity) to graduate from Basic to Verified.",
    category: "client",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "client.account.fund": define({
    key: "client.account.fund",
    displayName: "Fund your client account",
    description: "Add funds to your account balance. Reaching configured thresholds promotes you to Silver / Gold.",
    category: "client",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.contact_prefs.set": define({
    key: "talent.contact_prefs.set",
    displayName: "Set contact preferences",
    description: "Choose which client trust tiers (Basic, Verified, Silver, Gold) are allowed to contact you.",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "talent.inquiries.filter_by_trust": define({
    key: "talent.inquiries.filter_by_trust",
    displayName: "Filter inbox by client trust",
    description: "Filter your inquiry inbox by sender trust level (Verified+, Silver+, Gold only, etc.).",
    category: "talent",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "inquiry.send_to_talent": define({
    key: "inquiry.send_to_talent",
    displayName: "Send an inquiry to a talent",
    description:
      "Open an inquiry directed at a specific talent. Gated by both the sender's trust level and the talent's contact preferences (and any active agency-level distribution overrides).",
    category: "inquiry",
    scope: "tenant",
    gating: "relationship",
    deprecated: false,
  }),
  "agency.client_trust.view": define({
    key: "agency.client_trust.view",
    displayName: "View client trust badges on inquiries",
    description: "See client trust badges (Basic / Verified / Silver / Gold) on inquiry rows in workspace admin.",
    category: "client",
    scope: "tenant",
    deprecated: false,
  }),
  "platform.client_trust.configure_thresholds": define({
    key: "platform.client_trust.configure_thresholds",
    displayName: "Configure client trust thresholds",
    description: "Set the funded-balance thresholds that promote clients from Verified → Silver → Gold.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),
  "platform.client_trust.override": define({
    key: "platform.client_trust.override",
    displayName: "Manually override client trust level",
    description:
      "Set a client's trust level explicitly (e.g., for known partners), bypassing auto-evaluation. Audited; reason required.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
    deprecated: false,
  }),

  // ─── Taxonomy + adaptive registration ────────────────────────────────
  // See docs/taxonomy-and-registration.md for the three-layer model
  // (master / workspace-enablement / talent-selection) and the adaptive
  // registration flow. Capability names are locked product contracts;
  // most have no callers in v1 — Track B.5 wires them when the workspace
  // taxonomy settings page + adaptive registration flow are built.

  "workspace.taxonomy.configure": define({
    key: "workspace.taxonomy.configure",
    displayName: "Configure workspace taxonomy",
    description:
      "Choose which talent types, skills, and other vocabulary the workspace exposes. Set per-term visibility (registration / directory), primary/secondary toggles, approval requirements, custom labels, and helper text.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),
  "workspace.registration.configure": define({
    key: "workspace.registration.configure",
    displayName: "Configure registration behavior",
    description:
      "Set workspace-wide registration toggles: default approval requirement, allow secondary roles, allow open applications for non-enabled types.",
    category: "team",
    scope: "tenant",
    deprecated: false,
  }),
  "agency.talent.approve_registration": define({
    key: "agency.talent.approve_registration",
    displayName: "Approve talent registration",
    description:
      "Review and approve a talent's submitted registration. Required when the workspace or specific term has requires_approval set.",
    category: "talent",
    scope: "tenant",
    deprecated: false,
  }),
  "platform.taxonomy.manage": define({
    key: "platform.taxonomy.manage",
    displayName: "Manage master taxonomy vocabulary",
    description:
      "Add, edit, deprecate, or merge terms in the master vocabulary (talent_types, tags, skills, event_types, etc.). Defines field groups for new talent types.",
    category: "platform",
    scope: "platform",
    gating: "platform_role",
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
