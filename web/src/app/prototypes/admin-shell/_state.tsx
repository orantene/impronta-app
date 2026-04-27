"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// ─── Surface dimensions ──────────────────────────────────────────────

export type Surface = "workspace" | "talent" | "client" | "platform";
export type Plan = "free" | "studio" | "agency" | "network";
export type Role = "viewer" | "editor" | "coordinator" | "admin" | "owner";
/**
 * Tenant entity model. Orthogonal to Plan tier — both shapes can exist on
 * any plan, though hubs lean to higher tiers. Drives roster vocabulary,
 * coordinator visibility, and inquiry routing semantics:
 *  - agency: direct representation. Curated roster. Coordinator owns inquiry,
 *    negotiates on behalf of talent. Branded portal.
 *  - hub: open network. Independent talent. Hub provides distribution + tools;
 *    inquiries route to talent (or talent's agency) directly. Listing-fee model.
 */
export type EntityType = "agency" | "hub";
export type WorkspacePage =
  | "overview"
  | "inbox"
  | "calendar"
  | "work"
  | "talent"
  | "clients"
  | "site"
  | "billing"
  | "workspace";

// Talent surface — relationship-based (no separate plan ladder; talent inherits
// the agency they belong to). Keep dimensions minimal: which agency, which page.
export type TalentPage =
  | "today"
  | "profile"
  | "inbox"
  | "calendar"
  | "activity"
  | "reach"
  | "settings";

// Client surface — its own plan ladder. Free is browse-only, Pro adds active
// outbound inquiry & shortlists, Enterprise adds team + integrations.
export type ClientPlan = "free" | "pro" | "enterprise";
export type ClientPage =
  | "today"
  | "discover"
  | "shortlists"
  | "inquiries"
  | "bookings"
  | "settings";

// Platform / Tulala HQ — internal tooling. HQ roles are NOT additive in the
// same way tenant roles are; each role has a different scope (Support sees
// audit + impersonate; Billing sees revenue; Ops sees flags + jobs; Exec sees
// everything). For the prototype we treat them as separate "lenses".
export type HqRole = "support" | "ops" | "billing" | "exec";
export type PlatformPage =
  | "today"
  | "tenants"
  | "users"
  | "network"
  | "billing"
  | "operations"
  | "settings";

export const SURFACES: Surface[] = ["workspace", "talent", "client", "platform"];
export const PLANS: Plan[] = ["free", "studio", "agency", "network"];
export const ROLES: Role[] = ["viewer", "editor", "coordinator", "admin", "owner"];
export const ENTITY_TYPES: EntityType[] = ["agency", "hub"];
export const CLIENT_PLANS: ClientPlan[] = ["free", "pro", "enterprise"];
export const HQ_ROLES: HqRole[] = ["support", "ops", "billing", "exec"];
export const WORKSPACE_PAGES: WorkspacePage[] = [
  "overview",
  "inbox",
  "calendar",
  "work",
  "talent",
  "clients",
  "site",
  "billing",
  "workspace",
];
export const TALENT_PAGES: TalentPage[] = [
  "today",
  "profile",
  "inbox",
  "calendar",
  "activity",
  "reach",
  "settings",
];
export const CLIENT_PAGES: ClientPage[] = [
  "today",
  "discover",
  "shortlists",
  "inquiries",
  "bookings",
  "settings",
];
export const PLATFORM_PAGES: PlatformPage[] = [
  "today",
  "tenants",
  "users",
  "network",
  "billing",
  "operations",
  "settings",
];

// ─── Semantics ───────────────────────────────────────────────────────

export const PLAN_META: Record<Plan, { label: string; theme: string; rank: number }> = {
  free: { label: "Free", theme: "Join the ecosystem", rank: 0 },
  studio: { label: "Studio", theme: "Gain control", rank: 1 },
  agency: { label: "Agency", theme: "Branded operation", rank: 2 },
  network: { label: "Network", theme: "Multi-brand · hub", rank: 3 },
};

/** Canonical plan price string. Used in upgrade modal, locked cards, billing. */
export function planPrice(plan: Plan): string {
  return plan === "free"
    ? "Free forever"
    : plan === "studio"
      ? "$29 / month"
      : plan === "agency"
        ? "$149 / month"
        : "Custom pricing";
}

/** Compact price (no "/ month" suffix, used inside chips). */
export function planPriceCompact(plan: Plan): string {
  return plan === "free"
    ? "Free"
    : plan === "studio"
      ? "$29/mo"
      : plan === "agency"
        ? "$149/mo"
        : "Custom";
}

/**
 * Format a date relative to "now" for short-list display.
 *   < 1m   → "just now"
 *   < 60m  → "Xm ago"
 *   < 24h  → "Xh ago"
 *   < 7d   → "Xd ago"
 *   else   → "Mon DD" / "Mon DD, YYYY" if not current year
 *
 * Use this everywhere a timestamp shows in a list. Spec inconsistency
 * across surfaces was a 5-format mess before this lived.
 */
export function relativeTime(date: Date | string | number, now: Date = new Date()): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const diffMs = now.getTime() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
}

/**
 * Pluralization helper. `pluralize(2, "draft", "drafts")` → "2 drafts",
 * `pluralize(1, "draft", "drafts")` → "1 draft". With `withNumber=false`,
 * returns just the noun. Used wherever a number-driven string previously
 * hardcoded the plural form, leading to "1 messages" / "1 items" bugs.
 */
export function pluralize(
  n: number,
  singular: string,
  plural: string,
  withNumber: boolean = true,
): string {
  const word = n === 1 ? singular : plural;
  return withNumber ? `${n} ${word}` : word;
}

/**
 * Entity-type semantics. The vocabulary differences are intentional and
 * surface across the app: agency talks about its "roster" of "talent" it
 * "represents"; a hub talks about its "network" of "members" it "lists".
 * The substance is also different: agencies operate on inquiries, hubs
 * forward them.
 */
export const ENTITY_TYPE_META: Record<
  EntityType,
  {
    label: string;
    /** Short tagline for cards & detail panels. */
    tagline: string;
    /** What the workspace's roster page is called. */
    rosterLabel: string;
    /** Singular noun for a roster entry. */
    rosterMemberLabel: string;
    /** Verb describing the relationship from tenant → talent. */
    relationVerb: string;
    /** Inquiry routing model. */
    inquiryModel: string;
    /** Revenue model. */
    revenueModel: string;
  }
> = {
  agency: {
    label: "Agency",
    tagline: "Direct representation · curated roster",
    rosterLabel: "Roster",
    rosterMemberLabel: "talent",
    relationVerb: "represents",
    inquiryModel: "Coordinator-owned. Inquiries land with the agency, who negotiates on behalf of talent.",
    revenueModel: "Booking commission · subscription",
  },
  hub: {
    label: "Hub",
    tagline: "Open network · distribution-first",
    rosterLabel: "Network",
    rosterMemberLabel: "member",
    relationVerb: "lists",
    inquiryModel: "Forwarded. Inquiries route to the talent (or their agency) directly; hub provides tools + reach.",
    revenueModel: "Listing fees · platform subscription",
  },
};

export const ROLE_META: Record<Role, { label: string; rank: number }> = {
  viewer: { label: "Viewer", rank: 0 },
  editor: { label: "Editor", rank: 1 },
  coordinator: { label: "Coordinator", rank: 2 },
  admin: { label: "Admin", rank: 3 },
  owner: { label: "Owner", rank: 4 },
};

export const SURFACE_META: Record<
  Surface,
  { label: string; short: string; ready: boolean }
> = {
  workspace: { label: "Workspace Admin", short: "Workspace", ready: true },
  talent: { label: "Talent", short: "Talent", ready: true },
  client: { label: "Client", short: "Client", ready: true },
  platform: { label: "Platform · Super Admin", short: "Platform", ready: true },
};

export const PAGE_META: Record<WorkspacePage, { label: string }> = {
  overview: { label: "Overview" },
  inbox: { label: "Inbox" },
  calendar: { label: "Calendar" },
  // "Pipeline" was confusing to non-sales users (sales jargon for
  // "work-in-progress organized by stage"). "Workflow" reads naturally:
  // it's the set of inquiries currently flowing through the agency,
  // grouped by where they're stuck. Inbox is the personal "needs me"
  // filter; Workflow is the team-wide view.
  work: { label: "Workflow" },
  talent: { label: "Talent" },
  clients: { label: "Clients" },
  // "Storefront" is industry jargon — the public site that clients land
  // on. "Public site" is plain English and matches what the user sees.
  site: { label: "Public site" },
  billing: { label: "Billing" },
  workspace: { label: "Settings" },
};

export const TALENT_PAGE_META: Record<TalentPage, { label: string }> = {
  today: { label: "Today" },
  profile: { label: "Edit profile" },
  inbox: { label: "Inbox" },
  calendar: { label: "Calendar" },
  activity: { label: "Activity" },
  reach: { label: "Reach" },
  settings: { label: "Settings" },
};

export const CLIENT_PAGE_META: Record<ClientPage, { label: string }> = {
  today: { label: "Today" },
  discover: { label: "Discover" },
  shortlists: { label: "Shortlists" },
  inquiries: { label: "Inquiries" },
  bookings: { label: "Bookings" },
  settings: { label: "Settings" },
};

export const PLATFORM_PAGE_META: Record<PlatformPage, { label: string }> = {
  today: { label: "Today" },
  tenants: { label: "Tenants" },
  users: { label: "Users" },
  network: { label: "Network" },
  billing: { label: "Billing" },
  operations: { label: "Operations" },
  settings: { label: "Settings" },
};

export const CLIENT_PLAN_META: Record<
  ClientPlan,
  { label: string; theme: string; rank: number; price: string }
> = {
  free: { label: "Free", theme: "Browse openly", rank: 0, price: "$0" },
  pro: { label: "Pro", theme: "Active outreach", rank: 1, price: "$49 / month" },
  enterprise: {
    label: "Enterprise",
    theme: "Team & controls",
    rank: 2,
    price: "Custom",
  },
};

export const HQ_ROLE_META: Record<
  HqRole,
  { label: string; tagline: string; canImpersonate: boolean; canRefund: boolean; canFlag: boolean }
> = {
  support: {
    label: "Support",
    tagline: "Help tenants. View audit. Impersonate read-only.",
    canImpersonate: true,
    canRefund: false,
    canFlag: false,
  },
  ops: {
    label: "Ops",
    tagline: "Feature flags. Moderation. System jobs.",
    canImpersonate: true,
    canRefund: false,
    canFlag: true,
  },
  billing: {
    label: "Billing",
    tagline: "Revenue. Refunds. Plan overrides.",
    canImpersonate: false,
    canRefund: true,
    canFlag: false,
  },
  exec: {
    label: "Exec",
    tagline: "Everything. Read-mostly.",
    canImpersonate: true,
    canRefund: true,
    canFlag: true,
  },
};

export function meetsPlan(current: Plan, required: Plan): boolean {
  return PLAN_META[current].rank >= PLAN_META[required].rank;
}

export function meetsRole(current: Role, required: Role): boolean {
  return ROLE_META[current].rank >= ROLE_META[required].rank;
}

export function meetsClientPlan(current: ClientPlan, required: ClientPlan): boolean {
  return CLIENT_PLAN_META[current].rank >= CLIENT_PLAN_META[required].rank;
}

// ─── Drawer + modal IDs ──────────────────────────────────────────────

export type DrawerId =
  // — Workspace surface drawers ————————————————————————————————————
  | "branding"
  | "identity"
  | "domain"
  | "team"
  | "plan-billing"
  | "talent-profile"
  | "inquiry-peek"
  | "booking-peek"
  | "new-inquiry"
  | "new-booking"
  | "new-talent"
  | "my-profile"
  | "design"
  | "homepage"
  | "pages"
  | "posts"
  | "navigation"
  | "media"
  | "translations"
  | "seo"
  | "field-catalog"
  | "taxonomy"
  | "workspace-settings"
  | "client-profile"
  | "site-health"
  | "team-activity"
  | "talent-activity"
  | "today-pulse"
  | "pipeline"
  | "drafts-holds"
  | "awaiting-client"
  | "confirmed-bookings"
  | "archived-work"
  | "representation-requests"
  | "storefront-visibility"
  | "hub-distribution"
  | "client-list"
  | "relationship-history"
  | "private-client-data"
  | "filter-config"
  | "danger-zone"
  | "activation-checklist"
  | "tenant-summary"
  | "site-setup"
  | "theme-foundations"
  | "widgets"
  | "api-keys"
  | "notifications"
  // — Talent surface drawers ————————————————————————————————————
  | "talent-today-pulse"
  | "talent-offer-detail"
  | "talent-request-detail"
  | "talent-booking-detail"
  | "talent-closed-booking"
  | "talent-add-event"
  | "talent-hub-detail"
  | "talent-profile-edit"
  | "talent-profile-section"
  | "talent-availability"
  | "talent-block-dates"
  | "talent-portfolio"
  | "talent-polaroids"
  | "talent-photo-edit"
  | "talent-credits"
  | "talent-skills"
  | "talent-limits"
  | "talent-rate-card"
  | "talent-travel"
  | "talent-links"
  | "talent-reviews"
  | "talent-showreel"
  | "talent-measurements"
  | "talent-documents"
  | "talent-emergency-contact"
  | "talent-public-preview"
  // — Talent personal-page (premium) drawers ————————————————————
  | "talent-tier-compare"
  | "talent-personal-page"
  | "talent-page-template"
  | "talent-media-embeds"
  | "talent-press"
  | "talent-media-kit"
  | "talent-custom-domain"
  | "talent-agency-relationship"
  | "talent-leave-agency"
  | "talent-notifications"
  | "talent-privacy"
  | "talent-payouts"
  | "talent-contact-preferences"
  | "talent-earnings-detail"
  // — Phase D scaffolds (verification, referrals, hub compare) —
  | "talent-verification"
  | "talent-referrals"
  | "talent-hub-compare"
  // — Client surface drawers ————————————————————————————————————
  | "client-today-pulse"
  | "client-talent-card"
  | "client-saved-search"
  | "client-shortlist-detail"
  | "client-new-shortlist"
  | "client-share-shortlist"
  | "client-send-inquiry"
  | "client-inquiry-detail"
  | "client-counter-offer"
  | "client-booking-detail"
  | "client-contracts"
  | "client-team"
  | "client-billing"
  | "client-brand-switcher"
  | "client-settings"
  | "client-quick-question"
  // — Cross-cutting upgrade surfaces ————————————————————————————————
  | "plan-compare"
  // — Payments / payouts ——————————————————————————————————
  | "payments-setup"
  | "payout-receiver-picker"
  | "payment-detail"
  // — Platform / HQ drawers ————————————————————————————————————
  | "platform-today-pulse"
  | "platform-tenant-detail"
  | "platform-tenant-impersonate"
  | "platform-tenant-suspend"
  | "platform-tenant-plan-override"
  | "platform-user-detail"
  | "platform-user-merge"
  | "platform-user-reset"
  | "platform-hub-submission"
  | "platform-hub-rules"
  | "platform-billing-invoice"
  | "platform-refund"
  | "platform-dunning"
  | "platform-feature-flag"
  | "platform-moderation-item"
  | "platform-system-job"
  | "platform-incident"
  | "platform-support-ticket"
  | "platform-audit-export"
  | "platform-hq-team"
  | "platform-region-config"
  // — Shared messaging-first workspace ——————————————————————————————————
  | "inquiry-workspace"
  // — Wave-2 additions ——————————————————————————————————
  | "inbox-snippets"
  | "notifications-prefs"
  | "data-export"
  | "audit-log"
  | "tenant-switcher"
  | "talent-share-card"
  | "whats-new"
  | "help";

export type DrawerContext = {
  drawerId: DrawerId | null;
  payload?: Record<string, unknown>;
};

// ─── Upgrade modal ───────────────────────────────────────────────────

export type UpgradeOffer = {
  open: boolean;
  feature?: string;
  why?: string;
  requiredPlan?: Plan;
  unlocks?: string[];
  /** Outcome-framed one-liner shown under the headline ("Stop turning away clients at 5 talents"). */
  outcome?: string;
  /** Hard-limit context to show a "you are at X of Y" stripe above the upgrade CTA. */
  currentUsage?: { label: string; current: number; cap: number };
  /** Override the trial / refund line in the pricing block. */
  pricingNote?: string;
};

// ════════════════════════════════════════════════════════════════════
// Inquiry / messaging / coordinator / offers — the CORE product.
// Stages, schema, and terminology mirror the production system at
// `web/src/lib/inquiry/*` + `supabase/migrations/2026052*`.
// ════════════════════════════════════════════════════════════════════

/**
 * Authoritative inquiry stages (per `project_inquiry_flow_spec.md` and the
 * `inquiry_status` enum). The legacy values `new`, `waiting_for_client`,
 * `in_progress` are deliberately NOT used in the prototype.
 */
export type InquiryStage =
  | "draft"
  | "submitted"
  | "coordination"
  | "offer_pending"
  | "approved"
  | "booked"
  | "rejected"
  | "expired";

export const INQUIRY_STAGES: InquiryStage[] = [
  "draft",
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
  "booked",
  "rejected",
  "expired",
];

export const INQUIRY_STAGE_META: Record<
  InquiryStage,
  { label: string; tone: "ink" | "amber" | "green" | "dim" | "red"; description: string }
> = {
  draft: { label: "Draft", tone: "dim", description: "Started — not yet sent." },
  submitted: { label: "Submitted", tone: "amber", description: "Client request received. Needs a coordinator." },
  coordination: { label: "With coordinator", tone: "amber", description: "Coordinator working with client + selecting talent." },
  offer_pending: { label: "Offer pending", tone: "amber", description: "Offer sent — waiting on client + talent approvals." },
  approved: { label: "Approved", tone: "green", description: "All parties approved. Ready to book." },
  booked: { label: "Booked", tone: "green", description: "Converted to a booking. Inquiry is read-only." },
  rejected: { label: "Rejected", tone: "red", description: "Closed without converting." },
  expired: { label: "Expired", tone: "dim", description: "Lapsed past response window." },
};

/** Multi-role rosters: an inquiry can need hosts + models + promoters + general talent. */
export type RequirementRole = "talent" | "host" | "model" | "promoter";

export const REQUIREMENT_ROLE_META: Record<
  RequirementRole,
  { label: string; pluralLabel: string }
> = {
  talent: { label: "Talent", pluralLabel: "Talent" },
  host: { label: "Host", pluralLabel: "Hosts" },
  model: { label: "Model", pluralLabel: "Models" },
  promoter: { label: "Promoter", pluralLabel: "Promoters" },
};

/** Per-talent line-item status inside an offer (from `inquiry_offer_line_items`). */
export type LineItemStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "superseded";

export type OfferLineItem = {
  talentName: string;
  thumb: string;
  role: RequirementRole;
  fee: string;
  status: LineItemStatus;
};

/** Two-thread messaging model:
 *  - "private": client ↔ assigned coordinator(s)
 *  - "group":   coordinator + selected talents (logistics)
 */
export type ThreadType = "private" | "group";

export type MessageSenderRole =
  | "client"
  | "coordinator"
  | "admin"
  | "talent"
  | "system";

export type ThreadMessage = {
  id: string;
  threadType: ThreadType;
  senderName: string;
  senderRole: MessageSenderRole;
  senderInitials: string;
  body: string;
  ts: string; // human-readable, e.g. "Tue 9:14"
  isYou?: boolean;
  attachment?: string;
};

export type CoordinatorAssignment = {
  id: string;
  name: string;
  initials: string;
  email: string;
  acceptedAt: string | null; // null = invited / awaiting accept
  isPrimary: boolean;
};

export type RequirementGroup = {
  id: string;
  role: RequirementRole;
  needed: number;
  approved: number;
  talents: { name: string; thumb: string; status: LineItemStatus }[];
};

export type Offer = {
  id: string;
  version: number;
  status: "draft" | "sent" | "accepted" | "rejected" | "superseded";
  total: string;
  sentAt: string | null;
  lineItems: OfferLineItem[];
  clientApproval: "pending" | "accepted" | "rejected";
  /** Superseded offer versions — oldest first. Used for version history trail (C19). */
  history?: Array<{ version: number; total: string; sentAt: string; note: string }>;
};

/**
 * Rich inquiry record — replaces the old prototype-only `Inquiry` for the
 * messaging-first surfaces (Workspace pipeline, Client portal, Talent inbox).
 * Carries the full conversation, coordinator, requirement groups, and live
 * offer so the same record can render the workspace from any role's POV.
 */
/**
 * Where an inquiry originated. The pipeline cares about this because:
 *  - direct: inquiry came in via the agency's branded portal (acme-models.com).
 *    Highest-intent. Coordinator fully owns it.
 *  - hub: inquiry was forwarded by a hub (Tulala Hub or a partner network).
 *    Coordinator owns it but hub may take a slice; keeps origin visible.
 *  - manual: coordinator created it from a phone call / email / WhatsApp.
 *    No traceable URL.
 *  - marketplace: open-network inquiry routed by the platform itself.
 */
export type InquirySource =
  | { kind: "direct"; domain: string }
  | { kind: "hub"; hubName: string; domain: string }
  | { kind: "manual"; channel: "phone" | "email" | "whatsapp" | "in-person" }
  | { kind: "marketplace"; platform: string }
  /**
   * Inquiry originated on the talent's own premium personal page (Tulala-direct
   * subscription product). Per project_talent_subscriptions.md §5: talent owns
   * the inquiry; representing agency is notified per representation status.
   * URL is canonical `tulala.digital/t/<slug>` regardless of tier; Portfolio-
   * tier talents may also receive inquiries via their custom domain.
   */
  | { kind: "talent-page"; talentSlug: string; customDomain?: string };

// ─── Client trust ladder (project_client_trust_badges.md) ────────────
//
// Four-tier ladder describing how trustworthy a client is. Driven by
// real verification + funded-account events, NOT by subscription. Talent
// gate inbound contact per their `TalentContactPolicy`. Agencies surface
// the chip on inboxes / inquiry workspaces / client profiles so a
// coordinator knows the tier at triage time. Never appears on public
// roster pages or booking detail.

export type ClientTrustLevel = "basic" | "verified" | "silver" | "gold";

export const CLIENT_TRUST_LEVELS: ClientTrustLevel[] = ["basic", "verified", "silver", "gold"];

export const CLIENT_TRUST_META: Record<
  ClientTrustLevel,
  {
    /** Full name shown in legends and detail panels. */
    label: string;
    /** Compact name used inside chips. */
    short: string;
    /** Palette tone — see ClientTrustChip palette. Stays subtle. */
    tone: "dim" | "ink" | "silver" | "gold";
    /** One-line hint shown on hover — explains what gets you here. */
    hint: string;
    /** Plain-English explainer for the talent contact-preferences card. */
    rationale: string;
  }
> = {
  basic: {
    label: "Basic",
    short: "Basic",
    tone: "dim",
    hint: "Free signup, no verification yet. Default trust level.",
    rationale:
      "Anyone with a Tulala client account. No verification yet, so identity isn't confirmed.",
  },
  verified: {
    label: "Verified",
    short: "Verified",
    tone: "ink",
    hint: "Identity verified — card on file or completed account verification.",
    rationale:
      "Has verified their identity (card on file or account verification). A real, traceable client — not anonymous.",
  },
  silver: {
    label: "Silver",
    short: "Silver",
    tone: "silver",
    hint: "Funded account above the standard threshold. Serious buying intent.",
    rationale:
      "Has funded their account above the Silver threshold. Real budget already on the platform — meaningful financial readiness.",
  },
  gold: {
    // Visible label deliberately "Trusted" rather than "Gold" — the
    // internal type stays `gold` for back-compat (palette key, data shape,
    // existing references in copy / unlock prose), but customer-facing
    // surfaces don't carry the gold metaphor (per the no-gold/rust palette
    // direction in feedback_admin_aesthetics.md).
    label: "Trusted",
    short: "Trusted",
    tone: "gold",
    hint: "High funded balance + sustained activity. Highest trust signal.",
    rationale:
      "High funded balance plus sustained booking activity. The strongest trust signal Tulala issues.",
  },
};

/**
 * Per-talent contact policy — which client trust tiers may send
 * inquiries to this talent. Default opens all tiers. Talent can flip
 * any tier off in the contact-preferences drawer.
 */
export type TalentContactPolicy = Record<ClientTrustLevel, boolean>;

export const DEFAULT_CONTACT_POLICY: TalentContactPolicy = {
  basic: true,
  verified: true,
  silver: true,
  gold: true,
};

/**
 * "Most selective" preset — only Verified+ allowed. Useful for the
 * preferences drawer to offer a one-click suggestion.
 */
export const SELECTIVE_CONTACT_POLICY: TalentContactPolicy = {
  basic: false,
  verified: true,
  silver: true,
  gold: true,
};

export type RichInquiry = {
  id: string;
  // identity
  agencyName: string;
  clientName: string;
  /**
   * Client trust tier at the time the inquiry was sent. Drives the
   * ClientTrustChip in the inbox / workspace header. See
   * project_client_trust_badges.md.
   */
  clientTrust: ClientTrustLevel;
  brief: string;
  // shoot
  date: string | null;
  location: string | null;
  // origin
  source: InquirySource;
  // lifecycle
  stage: InquiryStage;
  ageDays: number;
  unreadPrivate: number;
  unreadGroup: number;
  nextActionBy: "client" | "coordinator" | "talent" | "ops" | null;
  /** Hours since last message or activity in any thread — for "Updated Xh ago" display */
  lastActivityHrs: number;
  /** Number of prior confirmed bookings with this client — 0 = first time */
  repeatBookings: number;
  // structure
  requirementGroups: RequirementGroup[];
  coordinator: CoordinatorAssignment | null;
  offer: Offer | null;
  bookingId: string | null;
  // conversation
  messages: ThreadMessage[];
  // shortlist context (client side)
  shortlistName?: string;
};

/**
 * Helper for rendering the source chip. Returns the short "via …" label
 * the pipeline shows next to the agency name, plus a longer descriptor
 * for tooltips and detail panels.
 */
export function describeSource(s: InquirySource): { short: string; long: string; chip: string } {
  if (s.kind === "direct") {
    return {
      short: `via ${s.domain}`,
      long: `Direct inquiry via the agency's portal at ${s.domain}.`,
      chip: s.domain,
    };
  }
  if (s.kind === "hub") {
    return {
      short: `via ${s.hubName}`,
      long: `Forwarded from ${s.hubName} (${s.domain}). Hub takes a referral fee.`,
      chip: s.hubName,
    };
  }
  if (s.kind === "marketplace") {
    return {
      short: `via ${s.platform}`,
      long: `Open-network inquiry routed by ${s.platform}.`,
      chip: s.platform,
    };
  }
  if (s.kind === "talent-page") {
    const host = s.customDomain ?? `tulala.digital/t/${s.talentSlug}`;
    return {
      short: `via personal page`,
      long: `Direct inquiry from the talent's premium personal page (${host}). Talent owns the inquiry; representing agency is notified per representation status.`,
      chip: host,
    };
  }
  const channelLabel = {
    phone: "phone",
    email: "email",
    whatsapp: "WhatsApp",
    "in-person": "in person",
  }[s.channel];
  return {
    short: `added by ${channelLabel}`,
    long: `Manually entered by the coordinator (originally ${channelLabel}).`,
    chip: channelLabel,
  };
}

// ─── Rich inquiry mock dataset ────────────────────────────────────────
// Five inquiries that each show a different point in the lifecycle, so the
// prototype can demonstrate every state. Stage hand-picked to surface
// realistic edges: a coordinator-pending one, a draft, a multi-role gala,
// an approved/ready-to-book one, and a booked one.

export const RICH_INQUIRIES: RichInquiry[] = [
  {
    id: "RI-201",
    agencyName: "Acme Models",
    clientName: "Mango",
    clientTrust: "gold",
    brief: "Spring lookbook · 3 talent · 1 day",
    date: "Tue, May 6",
    location: "Madrid · Estudio Roca",
    source: { kind: "direct", domain: "acme-models.com" },
    stage: "coordination",
    ageDays: 1,
    lastActivityHrs: 3,
    repeatBookings: 2,
    unreadPrivate: 2,
    unreadGroup: 0,
    nextActionBy: "coordinator",
    requirementGroups: [
      {
        id: "rg-201-talent",
        role: "talent",
        needed: 3,
        approved: 1,
        talents: [
          { name: "Marta Reyes", thumb: "🌸", status: "accepted" },
          { name: "Tomás Navarro", thumb: "🍃", status: "pending" },
          { name: "Zara Habib", thumb: "🌹", status: "pending" },
        ],
      },
    ],
    coordinator: {
      id: "co-1",
      name: "Sara Bianchi",
      initials: "SB",
      email: "sara@acme-models.com",
      acceptedAt: "1d ago",
      isPrimary: true,
    },
    offer: null,
    bookingId: null,
    messages: [
      {
        id: "m1",
        threadType: "private",
        senderName: "Joana Rivera",
        senderInitials: "JR",
        senderRole: "client",
        body: "Hi! We'd love to book Marta and 2 more for the spring lookbook on May 6. Can you put together a shortlist by tomorrow EOD?",
        ts: "Mon 16:42",
      },
      {
        id: "m2",
        threadType: "private",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "coordinator",
        body: "Got it — pulling 3 candidates. Marta's already a soft yes. Will share the lineup and rates within 2 hrs.",
        ts: "Mon 16:58",
        isYou: true,
      },
      {
        id: "m3",
        threadType: "private",
        senderName: "Joana Rivera",
        senderInitials: "JR",
        senderRole: "client",
        body: "Perfect. We're flexible on talent #3. Budget cap is €2,500/day each.",
        ts: "Tue 09:12",
      },
      {
        id: "m4",
        threadType: "group",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "coordinator",
        body: "Hi all — Mango spring lookbook, Tue May 6 in Madrid. Estudio Roca, full day. Putting you on hold while we lock the lineup. Anyone with a hard conflict please flag now.",
        ts: "Mon 17:05",
        isYou: true,
      },
      {
        id: "m5",
        threadType: "group",
        senderName: "Marta Reyes",
        senderInitials: "MR",
        senderRole: "talent",
        body: "All clear from me — happy to confirm.",
        ts: "Mon 17:22",
      },
    ],
  },
  {
    id: "RI-202",
    agencyName: "Acme Models",
    clientName: "Vogue Italia",
    clientTrust: "gold",
    brief: "Editorial spread · 2 talent · 2 days",
    date: "May 14–15",
    location: "Milan · Studio 5",
    source: { kind: "hub", hubName: "Tulala Hub", domain: "tulala.app/discover" },
    stage: "offer_pending",
    ageDays: 2,
    lastActivityHrs: 22,
    repeatBookings: 0,
    unreadPrivate: 0,
    unreadGroup: 1,
    nextActionBy: "client",
    requirementGroups: [
      {
        id: "rg-202-talent",
        role: "talent",
        needed: 2,
        approved: 2,
        talents: [
          { name: "Marta Reyes", thumb: "🌸", status: "accepted" },
          { name: "Lina Park", thumb: "🌷", status: "accepted" },
        ],
      },
    ],
    coordinator: {
      id: "co-2",
      name: "Daniel Ferrer",
      initials: "DF",
      email: "daniel@acme-models.com",
      acceptedAt: "2d ago",
      isPrimary: true,
    },
    offer: {
      id: "of-202-v2",
      version: 2,
      status: "sent",
      total: "€7,400",
      sentAt: "yesterday",
      clientApproval: "pending",
      lineItems: [
        { talentName: "Marta Reyes", thumb: "🌸", role: "talent", fee: "€3,200", status: "accepted" },
        { talentName: "Lina Park", thumb: "🌷", role: "talent", fee: "€2,800", status: "accepted" },
        { talentName: "Yuna Park", thumb: "🌼", role: "talent", fee: "€1,400", status: "pending" },
      ],
      history: [
        { version: 1, total: "€5,600", sentAt: "3d ago", note: "Initial offer — Marta solo, 2-day rate" },
      ],
    },
    bookingId: null,
    messages: [
      {
        id: "m21",
        threadType: "private",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "client",
        body: "Reviewing the v2 offer with our producer — should have a decision by EOD.",
        ts: "Today 09:15",
      },
      {
        id: "m22",
        threadType: "group",
        senderName: "Daniel Ferrer",
        senderInitials: "DF",
        senderRole: "coordinator",
        body: "Hi Marta + Lina — just sent the v2 offer to Vogue. Same dates (May 14–15). Will ping the second the client approves.",
        ts: "Yesterday 18:02",
        isYou: true,
      },
      {
        id: "m23",
        threadType: "group",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Payment receiver set to Acme Models · €7,141 net after platform fee.",
        ts: "Yesterday 18:04",
      },
    ],
  },
  {
    id: "RI-203",
    agencyName: "Acme Models",
    clientName: "Bvlgari",
    clientTrust: "silver",
    brief: "Jewelry campaign · 1 talent · multi-day",
    date: "May 18–20",
    location: "Rome · Cinecittà 7",
    source: { kind: "manual", channel: "email" },
    stage: "approved",
    ageDays: 4,
    lastActivityHrs: 48,
    repeatBookings: 1,
    unreadPrivate: 0,
    unreadGroup: 0,
    nextActionBy: "coordinator",
    requirementGroups: [
      {
        id: "rg-203-talent",
        role: "talent",
        needed: 1,
        approved: 1,
        talents: [{ name: "Kai Lin", thumb: "🌊", status: "accepted" }],
      },
    ],
    coordinator: {
      id: "co-2",
      name: "Daniel Ferrer",
      initials: "DF",
      email: "daniel@acme-models.com",
      acceptedAt: "3d ago",
      isPrimary: true,
    },
    offer: {
      id: "of-203-v3",
      version: 3,
      status: "accepted",
      total: "€8,200",
      sentAt: "2d ago",
      clientApproval: "accepted",
      lineItems: [
        { talentName: "Kai Lin", thumb: "🌊", role: "talent", fee: "€8,200", status: "accepted" },
      ],
      history: [
        { version: 1, total: "€6,400", sentAt: "6d ago", note: "Initial offer — standard day rate" },
        { version: 2, total: "€9,500", sentAt: "4d ago", note: "Client counter — added usage rights" },
      ],
    },
    bookingId: null,
    messages: [
      {
        id: "m31",
        threadType: "private",
        senderName: "Marco Conti",
        senderInitials: "MC",
        senderRole: "client",
        body: "All approved on our side. Please convert to booking and send the contract today if possible.",
        ts: "Today 11:48",
      },
      {
        id: "m32",
        threadType: "group",
        senderName: "Daniel Ferrer",
        senderInitials: "DF",
        senderRole: "coordinator",
        body: "Kai — Bvlgari is a YES. Locking the booking now. Call sheet by EOD.",
        ts: "Today 12:00",
        isYou: true,
      },
      {
        id: "m33",
        threadType: "group",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Payment receiver set to Kai Lin. Kai will distribute the agency commission off-platform.",
        ts: "Today 12:01",
      },
      {
        id: "m34",
        threadType: "private",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Payment requested — €8,200 to Bvlgari. Card link sent.",
        ts: "Today 12:02",
      },
    ],
  },
  {
    id: "RI-204",
    agencyName: "Acme Models",
    clientName: "Estudio Roca",
    clientTrust: "verified",
    brief: "Brand gala · 6 hosts + 4 models + 2 promoters",
    date: "Sat, May 24",
    location: "Madrid · Palacio Vistalegre",
    source: { kind: "direct", domain: "acme-models.com" },
    stage: "coordination",
    ageDays: 0,
    lastActivityHrs: 1,
    repeatBookings: 0,
    unreadPrivate: 1,
    unreadGroup: 0,
    nextActionBy: "coordinator",
    requirementGroups: [
      {
        id: "rg-204-host",
        role: "host",
        needed: 6,
        approved: 4,
        talents: [
          { name: "Iris Volpe", thumb: "🌺", status: "accepted" },
          { name: "Léa Mercier", thumb: "🌷", status: "accepted" },
          { name: "Yuna Park", thumb: "🪷", status: "accepted" },
          { name: "Ola Brandt", thumb: "🌾", status: "accepted" },
          { name: "Rafa Ortega", thumb: "🍂", status: "pending" },
          { name: "—", thumb: "·", status: "pending" },
        ],
      },
      {
        id: "rg-204-model",
        role: "model",
        needed: 4,
        approved: 4,
        talents: [
          { name: "Marta Reyes", thumb: "🌸", status: "accepted" },
          { name: "Lina Park", thumb: "🌷", status: "accepted" },
          { name: "Tomás Navarro", thumb: "🍃", status: "accepted" },
          { name: "Zara Habib", thumb: "🌹", status: "accepted" },
        ],
      },
      {
        id: "rg-204-promoter",
        role: "promoter",
        needed: 2,
        approved: 0,
        talents: [
          { name: "—", thumb: "·", status: "pending" },
          { name: "—", thumb: "·", status: "pending" },
        ],
      },
    ],
    coordinator: {
      id: "co-1",
      name: "Sara Bianchi",
      initials: "SB",
      email: "sara@acme-models.com",
      acceptedAt: "8h ago",
      isPrimary: true,
    },
    offer: null,
    bookingId: null,
    messages: [
      {
        id: "m41",
        threadType: "private",
        senderName: "Estudio Roca",
        senderInitials: "ER",
        senderRole: "client",
        body: "We need this fully cast by Friday. 6 hosts, 4 models, 2 promoters. Diverse lineup.",
        ts: "Today 08:15",
      },
      {
        id: "m42",
        threadType: "private",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "coordinator",
        body: "On it. Models locked. Hosts at 4/6 — pulling 2 more candidates today. Promoters by tomorrow.",
        ts: "Today 09:02",
        isYou: true,
      },
    ],
  },
  {
    id: "RI-205",
    agencyName: "Acme Models",
    clientName: "Net-a-Porter",
    clientTrust: "silver",
    brief: "Editorial · 1 talent · 1 day",
    date: "Apr 10",
    location: "London · Hackney",
    source: { kind: "marketplace", platform: "Tulala marketplace" },
    stage: "booked",
    ageDays: 18,
    lastActivityHrs: 120,
    repeatBookings: 3,
    unreadPrivate: 0,
    unreadGroup: 0,
    nextActionBy: null,
    requirementGroups: [
      {
        id: "rg-205-talent",
        role: "talent",
        needed: 1,
        approved: 1,
        talents: [{ name: "Marta Reyes", thumb: "🌸", status: "accepted" }],
      },
    ],
    coordinator: {
      id: "co-1",
      name: "Sara Bianchi",
      initials: "SB",
      email: "sara@acme-models.com",
      acceptedAt: "20d ago",
      isPrimary: true,
    },
    offer: {
      id: "of-205-v1",
      version: 1,
      status: "accepted",
      total: "€3,400",
      sentAt: "21d ago",
      clientApproval: "accepted",
      lineItems: [
        { talentName: "Marta Reyes", thumb: "🌸", role: "talent", fee: "€3,400", status: "accepted" },
      ],
    },
    bookingId: "BK-205",
    messages: [
      {
        id: "m51",
        threadType: "private",
        senderName: "Helena Ross",
        senderInitials: "HR",
        senderRole: "client",
        body: "Wrapped beautifully. Invoice received, payment going out today.",
        ts: "Apr 11",
      },
      {
        id: "m52",
        threadType: "private",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Client paid €3,400 · Visa •• 4411. Payout queued to Acme Models.",
        ts: "Apr 11",
      },
      {
        id: "m53",
        threadType: "group",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Payout sent — €3,281 to Acme Models. Distribution handled off-platform.",
        ts: "Apr 11",
      },
    ],
  },
];

export function getRichInquiry(id: string): RichInquiry | undefined {
  return RICH_INQUIRIES.find((r) => r.id === id);
}

// ─── Mock data ───────────────────────────────────────────────────────

export type TalentProfile = {
  id: string;
  name: string;
  state: "draft" | "invited" | "published" | "awaiting-approval" | "claimed";
  height?: string;
  city?: string;
  thumb?: string;
  isYou?: boolean;
  /**
   * Representation status for this roster entry. Most agency-managed
   * talent is `exclusive` to that agency. Kept optional so the basic
   * roster fixtures can stay terse — drawers should default to
   * `exclusive` with the current tenant when missing.
   */
  representation?: RepresentationStatus;
};

export const TALENT_STATE_LABEL: Record<TalentProfile["state"], string> = {
  draft: "Draft",
  invited: "Invited",
  published: "Published",
  "awaiting-approval": "Awaiting approval",
  claimed: "Claimed",
};

export const TALENT_STATE_TONE: Record<
  TalentProfile["state"],
  "ink" | "amber" | "green" | "dim"
> = {
  draft: "dim",
  invited: "amber",
  published: "green",
  "awaiting-approval": "amber",
  claimed: "ink",
};

export const ROSTER_FREE: TalentProfile[] = [
  { id: "t1", name: "Marta Reyes", state: "published", height: "5'9\"", city: "Madrid", thumb: "🌸" },
  { id: "t2", name: "Kai Lin", state: "awaiting-approval", height: "5'11\"", city: "Berlin", thumb: "🌊" },
  { id: "t3", name: "Amelia Dorsey", state: "invited", height: "5'8\"", city: "Lisbon", thumb: "🌿" },
  // Seeded close to the Free cap (5) so the cap-nudge surfaces in the prototype.
  { id: "t4", name: "Tomás Navarro", state: "draft", height: "6'0\"", city: "Barcelona", thumb: "🌾" },
];

export const ROSTER_AGENCY: TalentProfile[] = [
  {
    id: "t1",
    name: "Marta Reyes",
    state: "published",
    height: "5'9\"",
    city: "Madrid",
    thumb: "🌸",
    representation: { kind: "exclusive", agencyName: "Acme Models" },
  },
  {
    id: "t2",
    name: "Kai Lin",
    state: "published",
    height: "5'11\"",
    city: "Berlin",
    thumb: "🌊",
    representation: { kind: "exclusive", agencyName: "Acme Models" },
  },
  {
    id: "t3",
    name: "Tomás Navarro",
    state: "published",
    height: "6'1\"",
    city: "Lisbon",
    thumb: "🍃",
    representation: {
      kind: "non-exclusive",
      agencyNames: ["Acme Models", "Studio Iberia"],
    },
  },
  {
    id: "t4",
    name: "Lina Park",
    state: "awaiting-approval",
    height: "5'7\"",
    city: "Paris",
    thumb: "🌷",
    representation: { kind: "exclusive", agencyName: "Acme Models" },
  },
  {
    id: "t5",
    name: "Amelia Dorsey",
    state: "invited",
    height: "5'8\"",
    city: "Lisbon",
    thumb: "🌿",
    representation: { kind: "freelance" },
  },
  {
    id: "t6",
    name: "Sven Olafsson",
    state: "draft",
    height: "6'0\"",
    city: "Oslo",
    thumb: "🌲",
    representation: { kind: "exclusive", agencyName: "Acme Models" },
  },
  {
    id: "t7",
    name: "Zara Habib",
    state: "published",
    height: "5'10\"",
    city: "London",
    thumb: "🌹",
    representation: { kind: "exclusive", agencyName: "Acme Models" },
  },
];

export type Inquiry = {
  id: string;
  client: string;
  brief: string;
  stage: "draft" | "awaiting-client" | "confirmed" | "archived" | "hold";
  ageDays: number;
  talent: string[];
  amount?: string;
  date?: string;
};

export const INQUIRIES_AGENCY: Inquiry[] = [
  { id: "iq1", client: "Vogue Italia", brief: "Editorial · spring spread", stage: "awaiting-client", ageDays: 2, talent: ["Marta Reyes"], amount: "€4,200", date: "May 14" },
  { id: "iq2", client: "Zara", brief: "Lookbook · capsule collection", stage: "awaiting-client", ageDays: 1, talent: ["Kai Lin"], amount: "€2,800", date: "May 18" },
  { id: "iq3", client: "Mango", brief: "Lookbook shoot", stage: "draft", ageDays: 0, talent: ["Marta Reyes", "Tomás Navarro", "Zara Habib"], amount: "€6,400" },
  { id: "iq4", client: "Bvlgari", brief: "Editorial campaign", stage: "hold", ageDays: 4, talent: ["Marta Reyes"], amount: "€8,000" },
  { id: "iq5", client: "Mango", brief: "Spring lookbook", stage: "confirmed", ageDays: 6, talent: ["Marta Reyes", "Tomás Navarro", "Zara Habib"], amount: "€6,400", date: "Tue · this week" },
  { id: "iq6", client: "Bvlgari", brief: "Jewelry campaign", stage: "confirmed", ageDays: 3, talent: ["Kai Lin"], amount: "€8,200", date: "Thu · this week" },
  { id: "iq7", client: "Editorial Studio", brief: "Editorial · 2 talent", stage: "confirmed", ageDays: 1, talent: ["Lina Park", "Marta Reyes"], amount: "€4,000", date: "Fri · this week" },
];

export const INQUIRIES_FREE: Inquiry[] = [
  { id: "iq1", client: "Friend referral", brief: "Test booking", stage: "draft", ageDays: 0, talent: ["Marta Reyes"] },
];

export type Client = {
  id: string;
  name: string;
  contact: string;
  bookingsYTD: number;
  status: "active" | "dormant";
  /**
   * Tulala-issued trust level. Drives the ClientTrustChip on inboxes /
   * inquiry workspaces / client profile drawers. Optional on free-plan
   * fixtures since the trust system is gated on having a real client
   * identity. See project_client_trust_badges.md.
   */
  trust?: ClientTrustLevel;
};

export const CLIENTS_AGENCY: Client[] = [
  { id: "c1", name: "Vogue Italia", contact: "Sara Bianchi", bookingsYTD: 6, status: "active", trust: "gold" },
  { id: "c2", name: "Mango", contact: "Joana Rivera", bookingsYTD: 4, status: "active", trust: "gold" },
  { id: "c3", name: "Zara", contact: "Lucas Vidal", bookingsYTD: 3, status: "active", trust: "silver" },
  { id: "c4", name: "Bvlgari", contact: "Marco Conti", bookingsYTD: 2, status: "active", trust: "gold" },
  { id: "c5", name: "Net-a-Porter", contact: "Helena Ross", bookingsYTD: 1, status: "dormant", trust: "silver" },
];

export const CLIENTS_FREE: Client[] = [
  { id: "c1", name: "Friend referral", contact: "—", bookingsYTD: 0, status: "active", trust: "basic" },
];

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: "active" | "invited";
  initials: string;
};

export const TEAM_AGENCY: TeamMember[] = [
  { id: "u1", name: "Oran Tene", email: "oran@acme-models.com", role: "owner", status: "active", initials: "OT" },
  { id: "u2", name: "Sara Bianchi", email: "sara@acme-models.com", role: "admin", status: "active", initials: "SB" },
  { id: "u3", name: "Daniel Ferrer", email: "daniel@acme-models.com", role: "coordinator", status: "active", initials: "DF" },
  { id: "u4", name: "Mira Soto", email: "mira@acme-models.com", role: "viewer", status: "active", initials: "MS" },
  { id: "u5", name: "Andrés Lopez", email: "andres@acme-models.com", role: "editor", status: "invited", initials: "AL" },
];

export const TEAM_FREE: TeamMember[] = [
  { id: "u1", name: "You", email: "you@acme-models.com", role: "owner", status: "active", initials: "OT" },
];

export type SitePage = {
  id: string;
  title: string;
  status: "published" | "draft";
  updatedAgo: string;
};

export const SITE_PAGES: SitePage[] = [
  { id: "p1", title: "Home", status: "published", updatedAgo: "2d" },
  { id: "p2", title: "Roster", status: "published", updatedAgo: "5d" },
  { id: "p3", title: "About us", status: "published", updatedAgo: "1mo" },
  { id: "p4", title: "Contact", status: "published", updatedAgo: "2mo" },
  { id: "p5", title: "Press kit", status: "draft", updatedAgo: "1d" },
];

/**
 * First-10-minutes activation arc. The order is intentional — each step
 * produces something tangible (a profile, a live URL, a real inquiry) so
 * the user feels real value before they hit any quota. This is the
 * conversion lever, not a setup wizard.
 */
export const ACTIVATION_TASKS: Array<{
  id: string;
  label: string;
  hint: string;
  drawer: DrawerId | null;
  est: string;
}> = [
  { id: "add-talent", label: "Add your first talent", hint: "Name + 3 photos. You can edit later.", drawer: "new-talent", est: "2 min" },
  { id: "publish", label: "Publish a profile", hint: "Once published, the public link works.", drawer: "talent-profile", est: "30 sec" },
  { id: "share-url", label: "Copy your storefront link", hint: "Share with a client — it's live now.", drawer: null, est: "15 sec" },
  { id: "try-inquiry", label: "Walk through a demo inquiry", hint: "See how a coordinator works a brief.", drawer: "inquiry-workspace", est: "3 min" },
  { id: "invite-team", label: "Invite a teammate (optional)", hint: "Up to 1 collaborator on Free.", drawer: "team", est: "1 min" },
];

// ─── Plan ladder (operational compare, not a checkbox list) ──────────
/**
 * The plan-compare table. Shape is intentional — each row is an
 * **operational dimension** (what your agency can DO), not a feature
 * checkbox. This frames upgrade decisions as scaling decisions, which is
 * the correct mental model for the buyer.
 *
 * Cells are short phrases the buyer can compare at a glance. The headline
 * for each plan is shown as the plan name (Free → Network), the price,
 * and an "ideal for" subtitle.
 */
export type PlanLadderRow = {
  /** What axis we're comparing on. */
  dimension: string;
  /** One-line explanation of WHY this matters for an agency. */
  why: string;
  /** Per-plan cell content — short phrase, comparable side-by-side. */
  values: Record<Plan, string>;
};

export const PLAN_LADDER_HEADER: Record<Plan, { price: string; idealFor: string }> = {
  free: { price: "$0", idealFor: "Your first roster, a single coordinator, listed on the public directory." },
  studio: { price: "$79/mo", idealFor: "Private inbox, your own client list, room for a couple of teammates." },
  agency: { price: "$149/mo", idealFor: "Branded site, team workflows, and negotiation tools." },
  network: { price: "$899/mo", idealFor: "Multi-brand hubs, network distribution, and partner API access." },
};

export const PLAN_LADDER: PlanLadderRow[] = [
  {
    dimension: "Active roster",
    why: "How much talent your agency can list at once.",
    values: {
      free: "Up to 5 talent",
      studio: "Up to 25 talent",
      agency: "Up to 200 talent",
      network: "Unlimited",
    },
  },
  {
    dimension: "Inquiry throughput",
    why: "Concurrent live inquiries before workflow hand-offs strain.",
    values: {
      free: "5 / month",
      studio: "50 / month",
      agency: "Unlimited · queue priority",
      network: "Unlimited · multi-tenant queue",
    },
  },
  {
    dimension: "Distribution",
    why: "Where clients can find you and which doorways stay open.",
    values: {
      free: "Public directory listing",
      studio: "Public directory + custom domain",
      agency: "Branded domain · embedded widgets · API",
      network: "Multi-domain · partner network · sub-tenants",
    },
  },
  {
    dimension: "Coordinator scale",
    why: "How many people on your side can run the pipeline together.",
    values: {
      free: "1 seat",
      studio: "3 seats",
      agency: "12 seats · roles & ownership",
      network: "Unlimited seats · cross-brand",
    },
  },
  {
    dimension: "Branding",
    why: "How much of your visual identity carries through.",
    values: {
      free: "Tulala-branded storefront",
      studio: "Custom domain + your logo",
      agency: "Full design system · typography · layout",
      network: "Per-brand design systems · multi-identity",
    },
  },
  {
    dimension: "Inquiry ownership",
    why: "Who owns the client relationship and the inbox.",
    values: {
      free: "Shared (forwarded via Tulala)",
      studio: "Private — your own inbox",
      agency: "Private + coordinator handoffs",
      network: "Per-brand isolated, hub-aggregated",
    },
  },
  {
    dimension: "Multi-entity control",
    why: "Ability to operate as multiple agencies / a hub.",
    values: {
      free: "—",
      studio: "—",
      agency: "Single entity · agency or hub",
      network: "Multiple entities · hubs of agencies",
    },
  },
  {
    dimension: "Platform fee",
    why: "Tulala's cut of every payment processed through the platform.",
    values: {
      free: "6.5% + $0.50 per booking",
      studio: "4.5% + $0.50 · faster payout",
      agency: "3.5% + $0.50 · custom receipts",
      network: "Negotiated · per-brand schedule",
    },
  },
  {
    dimension: "Payment controls",
    why: "How much flexibility coordinators get over who receives the payout.",
    values: {
      free: "Single receiver · standard schedule",
      studio: "Receiver presets · faster payouts",
      agency: "Coordinator-assigned receivers · talent self-payout",
      network: "Multi-entity payouts · reseller economics",
    },
  },
  {
    dimension: "Insights",
    why: "What you can measure across roster, clients, throughput.",
    values: {
      free: "Profile views · basic counts",
      studio: "Inquiry funnel · reply times",
      agency: "Booking velocity · agency reliability",
      network: "Hub-level aggregates · cohort analytics",
    },
  },
];

// ─── Free-plan value surface ─────────────────────────────────────────
/**
 * What the Free plan actually gives you. Surfaced in the Free overview as
 * "Today on Free" so users see real abilities rather than just locks. The
 * caps are soft — when a user is at 80%+ we nudge an upgrade, but never
 * hard-block until they exceed.
 */
export const FREE_PLAN_VALUE: Array<{
  id: string;
  label: string;
  detail: string;
  used?: { current: number; cap: number; unit: string };
}> = [
  {
    id: "roster",
    label: "Public roster",
    detail: "Searchable across the Tulala network.",
    used: { current: 3, cap: 5, unit: "talent" },
  },
  {
    id: "inquiries",
    label: "Inbound inquiries",
    detail: "Clients message you through your storefront.",
    used: { current: 1, cap: 5, unit: "this month" },
  },
  {
    id: "storefront",
    label: "Storefront page",
    detail: "Lives at acme-models.tulala.app.",
  },
  {
    id: "messaging",
    label: "Talent + client messaging",
    detail: "Two-thread conversations on every inquiry.",
  },
  {
    id: "discovery",
    label: "Listed in the public directory",
    detail: "Brands looking for talent can find you.",
  },
];

// ─── Payments / Payout receiver / Platform fee ───────────────────────
/**
 * v1 payment model — one booking = one payment = one payout receiver.
 * The client pays via card, Tulala takes a platform fee, and the net
 * payout goes to ONE selected receiver (agency owner, agency admin,
 * coordinator, or one of the booked talent — whoever is set up to
 * receive). Any further split (talent share, agent commission, etc.) is
 * the receiver's responsibility offline. The platform does NOT route
 * money to multiple destinations in v1.
 */
export type PayoutConnectionStatus =
  | "connected-bank"
  | "connected-transfer"
  | "not-connected"
  | "pending-verification"
  | "restricted";

export const PAYOUT_STATUS_META: Record<
  PayoutConnectionStatus,
  { label: string; short: string; tone: "green" | "amber" | "dim" | "red"; canReceive: boolean; hint: string }
> = {
  "connected-bank": {
    label: "Bank connected",
    short: "Bank",
    tone: "green",
    canReceive: true,
    hint: "Direct deposit. Lowest fee, 1–2 business days.",
  },
  "connected-transfer": {
    label: "Transfer connected",
    short: "Transfer",
    tone: "green",
    canReceive: true,
    hint: "Card / wallet payout. Same day, slightly higher fee.",
  },
  "not-connected": {
    label: "Not connected",
    short: "Not set up",
    tone: "dim",
    canReceive: false,
    hint: "Cannot be selected as payout receiver yet.",
  },
  "pending-verification": {
    label: "Pending verification",
    short: "Pending",
    tone: "amber",
    canReceive: false,
    hint: "Stripe is reviewing the submitted documents. Usually < 24h.",
  },
  restricted: {
    label: "Action needed",
    short: "Restricted",
    tone: "red",
    canReceive: false,
    hint: "Stripe paused the payout. Re-submit ID or address to unlock.",
  },
};

/** Who is the legal recipient of this payment in the platform's eyes. */
export type PayoutReceiverKind =
  | "agency-owner"
  | "agency-admin"
  | "coordinator"
  | "talent";

export const PAYOUT_RECEIVER_KIND_LABEL: Record<PayoutReceiverKind, string> = {
  "agency-owner": "Agency owner",
  "agency-admin": "Agency admin",
  coordinator: "Coordinator",
  talent: "Talent",
};

export type PayoutReceiver = {
  kind: PayoutReceiverKind;
  /** Display name — agency name when kind is agency-*, person name for coordinator/talent. */
  displayName: string;
  /** Optional sub-line, e.g. legal entity, account holder. */
  legalName?: string;
  initials: string;
  status: PayoutConnectionStatus;
};

/**
 * Lifecycle of money for a booking. Drives chips in the booking detail
 * and system messages in the thread.
 *  - "not-set"       — no receiver picked yet. Booking can still be
 *                       created; payment cannot yet be requested.
 *  - "ready"         — receiver picked + verified. Coordinator can send
 *                       the payment request to the client.
 *  - "requested"     — payment link sent to the client. Awaiting card.
 *  - "paid"          — client charged successfully. Funds held by
 *                       Tulala until payout clears.
 *  - "payout-sent"   — Tulala paid out to the receiver. Anything beyond
 *                       this is offline.
 *  - "external"      — booking exists but client paid offline. Tulala
 *                       isn't holding funds; we just record the receipt.
 *  - "refunded"      — client refunded after charge. Receiver clawed back.
 *  - "dispute"       — client filed a chargeback. On hold pending review.
 */
export type BookingPaymentStatus =
  | "not-set"
  | "ready"
  | "requested"
  | "paid"
  | "payout-sent"
  | "external"
  | "refunded"
  | "dispute";

export const PAYMENT_STATUS_META: Record<
  BookingPaymentStatus,
  { label: string; tone: "ink" | "amber" | "green" | "dim" | "red"; description: string }
> = {
  "not-set": { label: "No receiver", tone: "dim", description: "Pick a payout receiver before requesting payment." },
  ready: { label: "Ready to request", tone: "ink", description: "Receiver verified. Send the payment request to the client." },
  requested: { label: "Payment requested", tone: "amber", description: "Awaiting client card payment." },
  paid: { label: "Paid", tone: "amber", description: "Client paid. Tulala holding funds — payout queued." },
  "payout-sent": { label: "Payout sent", tone: "green", description: "Net payout delivered to receiver. Distribution is their responsibility." },
  external: { label: "External", tone: "dim", description: "Tracked offline. Tulala is not holding or routing funds." },
  refunded: { label: "Refunded", tone: "red", description: "Client refunded. Funds returned." },
  dispute: { label: "In dispute", tone: "red", description: "Client filed a chargeback. Payout on hold." },
};

/**
 * Platform-fee economics by plan. Free pays the most because they get
 * no subscription floor. Network is "Contact" — usually < 2.5%.
 * Fee = pct of gross + flat per transaction.
 */
export const PLAN_FEE_META: Record<
  Plan,
  { pct: number; flat: string; label: string; controlsHint: string }
> = {
  free: {
    pct: 6.5,
    flat: "$0.50",
    label: "6.5% + $0.50",
    controlsHint: "Single payout receiver. Standard payout schedule.",
  },
  studio: {
    pct: 4.5,
    flat: "$0.50",
    label: "4.5% + $0.50",
    controlsHint: "Receiver presets per client. Faster payout schedule.",
  },
  agency: {
    pct: 3.5,
    flat: "$0.50",
    label: "3.5% + $0.50",
    controlsHint: "Coordinator-assigned receivers. Custom receipts. Talent self-payout request.",
  },
  network: {
    pct: 0,
    flat: "Custom",
    label: "Negotiated",
    controlsHint: "Per-brand fee schedule. Reseller economics. Multi-entity payout.",
  },
};

export type PaymentSummary = {
  bookingId: string;
  /** Total client charge, formatted with currency symbol. */
  total: string;
  /** Numeric total in minor units of the currency (cents) — for math. */
  totalMinor: number;
  /** ISO currency code, e.g. EUR, GBP, USD. */
  currency: "EUR" | "GBP" | "USD";
  /** Display string for the platform fee line. */
  platformFee: string;
  platformFeeMinor: number;
  /** Display string for the net payout. */
  netPayout: string;
  netPayoutMinor: number;
  /** Plan that produced the fee — used for "X % on Studio" annotation. */
  pricedOnPlan: Plan;
  /** The selected receiver. Null until coordinator picks. */
  receiver: PayoutReceiver | null;
  status: BookingPaymentStatus;
  /** Card details for the "Paid via" line, if charged. */
  paidVia?: { brand: "Visa" | "Mastercard" | "Amex"; last4: string };
  /** The default downstream-distribution note shown to all parties. */
  downstreamNote: string;
  /** Free-form note from coordinator about how the receiver intends to split. */
  distributionNote?: string;
  /** Audit trail entries for the payment (system-message backing). */
  history: Array<{ ts: string; label: string }>;
};

/**
 * Mock workspace-level payout connection. The active tenant's own
 * default receiver — agency owner Oran's Stripe-connected bank account.
 * Coordinators can override per-booking.
 */
export type WorkspacePayout = {
  defaultReceiver: PayoutReceiver;
  acceptCards: boolean;
  recentVolume30d: string;
  pendingPayouts: string;
  setupComplete: boolean;
};

export const WORKSPACE_PAYOUT: WorkspacePayout = {
  defaultReceiver: {
    kind: "agency-owner",
    displayName: "Acme Models",
    legalName: "Acme Models S.L.",
    initials: "A",
    status: "connected-bank",
  },
  acceptCards: true,
  recentVolume30d: "€18,400",
  pendingPayouts: "€7,400",
  setupComplete: true,
};

/** Free-plan equivalent — used when state.plan === "free". */
export const WORKSPACE_PAYOUT_FREE: WorkspacePayout = {
  defaultReceiver: {
    kind: "agency-owner",
    displayName: "You (Acme Models)",
    legalName: undefined,
    initials: "A",
    status: "not-connected",
  },
  acceptCards: false,
  recentVolume30d: "€0",
  pendingPayouts: "€0",
  setupComplete: false,
};

export function getWorkspacePayout(plan: Plan): WorkspacePayout {
  return plan === "free" ? WORKSPACE_PAYOUT_FREE : WORKSPACE_PAYOUT;
}

/**
 * Eligible payout-receiver candidates for a booking. In production this
 * is derived from the team + booked talent; here we hardcode plausible
 * options with realistic connection states.
 */
export const PAYOUT_RECEIVER_CANDIDATES: PayoutReceiver[] = [
  {
    kind: "agency-owner",
    displayName: "Acme Models",
    legalName: "Acme Models S.L.",
    initials: "A",
    status: "connected-bank",
  },
  {
    kind: "agency-admin",
    displayName: "Sara Bianchi",
    legalName: "Sara Bianchi (sole trader)",
    initials: "SB",
    status: "connected-bank",
  },
  {
    kind: "coordinator",
    displayName: "Daniel Ferrer",
    legalName: "Daniel Ferrer",
    initials: "DF",
    status: "connected-transfer",
  },
  {
    kind: "talent",
    displayName: "Marta Reyes",
    legalName: "Marta Reyes Studio",
    initials: "MR",
    status: "connected-bank",
  },
  {
    kind: "talent",
    displayName: "Kai Lin",
    legalName: "Kai Lin",
    initials: "KL",
    status: "pending-verification",
  },
  {
    kind: "talent",
    displayName: "Tomás Navarro",
    legalName: "—",
    initials: "TN",
    status: "not-connected",
  },
];

/** Per-booking payment summary fixtures, keyed by inquiry id (RI-…). */
export const PAYMENT_SUMMARIES: Record<string, PaymentSummary> = {
  "RI-202": {
    bookingId: "—",
    total: "€7,400",
    totalMinor: 740000,
    currency: "EUR",
    platformFee: "€259",
    platformFeeMinor: 25900,
    netPayout: "€7,141",
    netPayoutMinor: 714100,
    pricedOnPlan: "agency",
    receiver: {
      kind: "agency-owner",
      displayName: "Acme Models",
      legalName: "Acme Models S.L.",
      initials: "A",
      status: "connected-bank",
    },
    status: "ready",
    downstreamNote: "Receiver handles distribution to talent off-platform.",
    distributionNote: "Standard split: 60/40 talent / agency, paid out by Acme.",
    history: [
      { ts: "Yesterday", label: "Payout receiver set to Acme Models" },
    ],
  },
  "RI-203": {
    bookingId: "BK-203",
    total: "€8,200",
    totalMinor: 820000,
    currency: "EUR",
    platformFee: "€287",
    platformFeeMinor: 28700,
    netPayout: "€7,913",
    netPayoutMinor: 791300,
    pricedOnPlan: "agency",
    receiver: {
      kind: "talent",
      displayName: "Kai Lin",
      legalName: "Kai Lin",
      initials: "KL",
      status: "pending-verification",
    },
    status: "requested",
    downstreamNote: "Receiver handles distribution to agency off-platform.",
    distributionNote: "Talent will Wise the agency commission once paid.",
    history: [
      { ts: "2d ago", label: "Payout receiver set to Kai Lin" },
      { ts: "Today", label: "Payment requested — €8,200" },
    ],
  },
  "RI-205": {
    bookingId: "BK-205",
    total: "€3,400",
    totalMinor: 340000,
    currency: "EUR",
    platformFee: "€119",
    platformFeeMinor: 11900,
    netPayout: "€3,281",
    netPayoutMinor: 328100,
    pricedOnPlan: "agency",
    receiver: {
      kind: "agency-owner",
      displayName: "Acme Models",
      legalName: "Acme Models S.L.",
      initials: "A",
      status: "connected-bank",
    },
    status: "payout-sent",
    paidVia: { brand: "Visa", last4: "4411" },
    downstreamNote: "Acme distributed to Marta Reyes off-platform.",
    history: [
      { ts: "Apr 8", label: "Payout receiver set to Acme Models" },
      { ts: "Apr 9", label: "Payment requested — €3,400" },
      { ts: "Apr 10", label: "Client paid · Visa •• 4411" },
      { ts: "Apr 11", label: "Payout sent to Acme — €3,281" },
    ],
  },
};

export function getPaymentSummary(inquiryId: string): PaymentSummary | undefined {
  return PAYMENT_SUMMARIES[inquiryId];
}

/**
 * Recent payment activity for the workspace billing page. Mirrors the
 * status enum so the page can show a real lifecycle. Uses BOOKING_…
 * IDs that loosely match the rich inquiries.
 */
export type WorkspacePaymentRow = {
  id: string;
  ref: string;
  client: string;
  brief: string;
  total: string;
  fee: string;
  netPayout: string;
  receiverName: string;
  status: BookingPaymentStatus;
  date: string;
};

export const WORKSPACE_PAYMENTS: WorkspacePaymentRow[] = [
  {
    id: "wp1",
    ref: "BK-205",
    client: "Net-a-Porter",
    brief: "Editorial · 1 day",
    total: "€3,400",
    fee: "€119",
    netPayout: "€3,281",
    receiverName: "Acme Models",
    status: "payout-sent",
    date: "Apr 11",
  },
  {
    id: "wp2",
    ref: "BK-203",
    client: "Bvlgari",
    brief: "Jewelry campaign",
    total: "€8,200",
    fee: "€287",
    netPayout: "€7,913",
    receiverName: "Kai Lin",
    status: "requested",
    date: "Today",
  },
  {
    id: "wp3",
    ref: "RI-202",
    client: "Vogue Italia",
    brief: "Editorial · 2 day",
    total: "€7,400",
    fee: "€259",
    netPayout: "€7,141",
    receiverName: "Acme Models",
    status: "ready",
    date: "Yesterday",
  },
  {
    id: "wp4",
    ref: "BK-128",
    client: "Zara",
    brief: "Capsule lookbook",
    total: "€2,000",
    fee: "€70",
    netPayout: "€1,930",
    receiverName: "Acme Models",
    status: "payout-sent",
    date: "Apr 4",
  },
  {
    id: "wp5",
    ref: "BK-117",
    client: "Editorial Studio",
    brief: "Test shoot · single",
    total: "€600",
    fee: "—",
    netPayout: "€600",
    receiverName: "Off-platform",
    status: "external",
    date: "Mar 22",
  },
];

// ─── Workspace info ──────────────────────────────────────────────────

export const TENANT: {
  slug: string;
  name: string;
  domain: string;
  customDomain: string;
  initials: string;
  entityType: EntityType;
} = {
  // "Atelier Roma" reads as a real boutique agency. Was "Acme Models" —
  // generic placeholder triggered "this is a demo" pattern-match.
  slug: "atelier-roma",
  name: "Atelier Roma",
  domain: "atelier-roma.tulala.app",
  customDomain: "atelier-roma.com",
  initials: "A",
  entityType: "agency",
};

// ════════════════════════════════════════════════════════════════════
// Talent surface mock data
// ════════════════════════════════════════════════════════════════════

/**
 * Talent profile — everything a model surface needs to look like a real
 * comp card / agency book entry. Fields are grouped by what an agency
 * actually books off:
 *  · identity & visual (photos, pronouns)
 *  · physicality (measurements + features)
 *  · capability (skills · languages · specialties · wardrobe limits)
 *  · history (credits · runway · stats · reviews)
 *  · trust (verification badges · union · documents)
 *  · commercial (rates · travel · usage)
 */

/** Detailed measurement card — separate from `physical features` so we
 *  can show units cleanly (Imperial / Metric toggle in production). */
export type TalentMeasurements = {
  heightImperial: string; // 5'9"
  heightMetric: string;   // 175 cm
  weight?: string;        // 60 kg (optional — many agencies drop it)
  bust: string;           // 86 cm
  waist: string;          // 62 cm
  hips: string;           // 91 cm
  inseam?: string;        // 81 cm
  shoeEU: string;
  shoeUS: string;
  shoeUK: string;
  dress: string;          // EU 36
  suit?: string;
  hairColor: string;
  hairLength: "short" | "medium" | "long";
  eyeColor: string;
  skinTone: string;
  hasTattoos: boolean;
  tattoosNote?: string;
  hasPiercings: boolean;
  piercingsNote?: string;
  scarsNote?: string;
};

export type TalentSpecialty =
  | "fashion"
  | "editorial"
  | "commercial"
  | "fitness"
  | "lifestyle"
  | "runway"
  | "parts"     // hands, feet, hair
  | "plus"
  | "petite"
  | "kid"
  | "teen"
  | "mature"    // 50+
  | "classic"
  | "alt"
  | "voice"
  | "host"
  | "actor"
  | "dancer";

export const TALENT_SPECIALTY_LABEL: Record<TalentSpecialty, string> = {
  fashion: "Fashion",
  editorial: "Editorial",
  commercial: "Commercial",
  fitness: "Fitness",
  lifestyle: "Lifestyle",
  runway: "Runway",
  parts: "Parts (hands/feet)",
  plus: "Plus",
  petite: "Petite",
  kid: "Kid",
  teen: "Teen",
  mature: "Mature 50+",
  classic: "Classic",
  alt: "Alt / Tattoos",
  voice: "Voiceover",
  host: "Host / Presenter",
  actor: "Actor",
  dancer: "Dancer",
};

export type TalentCredit = {
  id: string;
  /** Year (string for messy "Spring 2026" entries). */
  year: string;
  /** Top line — Vogue Italia, Mango SS27, Burberry F/W… */
  brand: string;
  /** What kind of work — "Editorial cover", "Campaign", "Runway", "Lookbook". */
  type:
    | "Cover"
    | "Editorial"
    | "Campaign"
    | "Lookbook"
    | "Runway"
    | "Music video"
    | "Film"
    | "TVC";
  /** Photographer / director / stylist credit (single string). */
  credit?: string;
  /** Featured / starring / supporting / part of. */
  role?: string;
  /** True if this is a tear-sheet (cover / spread) — gets a star marker. */
  pinned?: boolean;
};

export type TalentLanguage = {
  language: string;
  level: "native" | "fluent" | "intermediate" | "basic";
};

export type TalentSkill = {
  category: "movement" | "voice" | "instrument" | "sport" | "performance" | "other";
  label: string;
  /** Optional level/qualifier — "Advanced", "Trained 8y", "Intermediate". */
  level?: string;
};

export type TalentLink = {
  kind: "instagram" | "tiktok" | "imdb" | "site" | "linkedin" | "youtube" | "spotify" | "other";
  label: string;
  url: string;
  followers?: string; // "142K" — rendered if present
};

/** Wardrobe / limits that a coordinator MUST honour when pitching. */
export type TalentLimit = {
  id: string;
  category: "nudity" | "wardrobe" | "lifestyle" | "religious" | "ethical" | "other";
  label: string;
  /** Hard = blocks pitch. Soft = needs explicit confirmation. */
  enforcement: "hard" | "soft";
};

export type TalentBadge = {
  kind:
    | "id-verified"
    | "age-verified"
    | "union"
    | "top-rated"
    | "tulala-featured"
    | "agency-verified"
    | "background-check";
  label: string;
  hint: string;
  earnedAt: string;
};

export type TalentReview = {
  id: string;
  reviewerName: string;
  reviewerRole: string;       // "Producer · Vogue Italia"
  brand: string;
  rating: number;             // 1-5
  body: string;
  shootDate: string;
};

/** Public day-rate card — what shows on the profile. The actual offer
 *  fee is per-booking, but a baseline gives clients a reference. */
export type TalentRateCard = {
  visibility: "public" | "agency-only" | "on-request";
  /** Each line is a usage tier (commercial vs. editorial vs. e-com). */
  lines: Array<{
    label: string;
    range: string;
    note?: string;
  }>;
  /** Buyout / usage philosophy in one sentence. */
  usagePolicy: string;
};

/** Travel + work-authorization band — what countries / regions can
 *  book the talent without visa drama. */
export type TalentTravel = {
  basedIn: string;
  willingTravel: "city" | "country" | "region" | "global";
  homeRadius?: string; // "Within 200 km of Madrid"
  passports: string[];
  workAuth: string[];   // "Schengen", "United States (B1/B2 + ESTA)"
  lastTrip?: string;
  preferredClass?: "economy" | "premium-economy" | "business";
};

export type TalentDocument = {
  id: string;
  label: string;
  state: "uploaded" | "missing" | "expired";
  expiresOn?: string;
};

export type MyTalentProfile = {
  // — identity ─────────────────────────────────────────────
  name: string;
  legalName?: string;
  initials: string;
  pronouns: "she/her" | "he/him" | "they/them" | "she/they" | "he/they" | "any";
  age: number;            // calculated from DoB; for v1 we hardcode
  /** "Madrid · willing to travel" — primary location summary string.
   *  Synced with `currentLocation` for the talent's home city + base. */
  city: string;
  /**
   * Where the talent IS RIGHT NOW. Often differs from `city` — models
   * travel constantly (Paris fashion week, NYC market, Mexico for winter).
   * Drives the Talent Today hero ("Available to work in {currentLocation}")
   * and helps coordinators pitch the right local jobs first.
   *
   * Format: "City · Country" (e.g. "Madrid · Spain", "Playa del Carmen · Mexico").
   */
  currentLocation: string;
  /**
   * Master availability toggle. When false, hidden from new pitches —
   * existing bookings keep working. Visible to agencies on roster views.
   */
  availableForWork: boolean;
  /**
   * Open to travel for work. When false, only sees pitches in the talent's
   * `currentLocation` region. When true, accepts inquiries from anywhere
   * (subject to TalentTravel rate-card / costs-covered preferences).
   * Distinct from `availableForWork` — a talent can be available locally
   * but not willing to fly for a 2-day shoot.
   */
  availableToTravel: boolean;
  // — visual ────────────────────────────────────────────────
  /** Cover photo emoji placeholder (the prototype uses emoji art). */
  coverPhoto: string;
  /** Profile/headshot emoji placeholder. */
  profilePhoto: string;
  /** Optional 30-sec showreel — emoji placeholder for the thumbnail. */
  showreelThumb?: string;
  showreelDuration?: string;
  // — physical ──────────────────────────────────────────────
  measurements: TalentMeasurements;
  /** "5'9\" · 86-62-91" — short summary string for headers. */
  measurementsSummary: string;
  // — capability ────────────────────────────────────────────
  specialties: TalentSpecialty[];
  languages: TalentLanguage[];
  skills: TalentSkill[];
  limits: TalentLimit[];
  // — history ──────────────────────────────────────────────
  credits: TalentCredit[];
  reviews: TalentReview[];
  /** Booking stats — surfaced on the public profile + on the My profile dashboard. */
  bookingStats: {
    completedBookings: number;
    onTimeRate: number;       // 0–100
    repeatClients: number;
    yearsActive: number;
  };
  // — trust ────────────────────────────────────────────────
  badges: TalentBadge[];
  documents: TalentDocument[];
  // — commercial ───────────────────────────────────────────
  rateCard: TalentRateCard;
  travel: TalentTravel;
  // — connectivity ─────────────────────────────────────────
  links: TalentLink[];
  emergencyContact: {
    name: string;
    relation: string;
    phone: string; // masked in public; visible during active booking only
  };
  // — agency ───────────────────────────────────────────────
  primaryAgency: string;
  /**
   * Representation status — the binding rule for source-aware inquiry
   * ownership (Architecture #5). Page ownership is always the talent;
   * this controls distribution + visibility + agency notification.
   * See project_talent_subscriptions.md §5.
   */
  representation: RepresentationStatus;
  /**
   * Per-tier contact gate. Talent decides which client trust tiers may
   * send inquiries. Default is all-on. See project_client_trust_badges.md.
   * Enforced server-side at inquiry-create time so embed widgets and
   * the API can't bypass it.
   */
  contactPolicy: TalentContactPolicy;
  // — engagement ───────────────────────────────────────────
  publishedAt: string;        // "Apr 12, 2026"
  profileViews7d: number;
  inquiries7d: number;
  /** Search-result rank on the Tulala discover surface — 1 = top. */
  discoverRank: number;
  /** Trend vs. last week, +/- pct. */
  viewsTrend: number;
  completeness: number;       // 0–100
  missing: string[];
  publicUrl: string;
  // — personal page (premium) ──────────────────────────────
  /** The Tulala-direct subscription on top of the standard ecosystem
   *  profile. Affects template choice, embed availability, custom
   *  domain, EPK / media-kit, SEO control. Crucially: orthogonal to
   *  agency / hub relationships — those keep working regardless. */
  subscription: TalentSubscription;
};

// ────────────────────────────────────────────────────────────────────
// Talent subscriptions (premium personal pages)
// ────────────────────────────────────────────────────────────────────
//
// Talent can choose to upgrade their *own* personal Tulala page on top
// of whatever rosters / hubs they live in. Three tiers:
//
//   basic      — included with any free workspace. Simple template,
//                no embeds, no custom domain, basic discovery only.
//   pro        — richer template options, social embeds (Spotify /
//                IG / TikTok / YouTube), press band, media-kit PDF,
//                SEO controls. ~ $12 / mo.
//   portfolio  — page-builder-lite with multiple sections, video hero,
//                custom domain (yourname.com), press kit, EPK download,
//                priority discovery placement. ~ $29 / mo. Custom domain
//                is RESERVED FOR PORTFOLIO ONLY — Pro stays on the
//                canonical tulala.digital/t/<slug> route.
//
// Tiers are ADDITIVE, not exclusive. A talent on Portfolio still
// appears on agency rosters and hubs the same way — the personal
// page is a parallel surface, not a replacement.

export type TalentSubscriptionTier = "basic" | "pro" | "portfolio";

export const TALENT_TIER_META: Record<
  TalentSubscriptionTier,
  {
    label: string;
    tagline: string;
    monthlyPrice: string;
    /** Subset of features unlocked at this tier. Each feature lists
     *  its first-available tier — used to render lock badges. */
    blurb: string;
    accent: "ink" | "gold" | "deep";
  }
> = {
  basic: {
    label: "Basic",
    tagline: "Standard public profile",
    monthlyPrice: "Free",
    blurb: "Roster-style profile. Good for agency-led talent who don't need a personal destination.",
    accent: "ink",
  },
  pro: {
    label: "Pro",
    tagline: "Richer personal page",
    monthlyPrice: "$12 / mo",
    blurb: "Template choices, larger gallery, social + video embeds, press band, downloadable media kit.",
    accent: "gold",
  },
  portfolio: {
    label: "Portfolio",
    tagline: "Mini personal site",
    monthlyPrice: "$29 / mo",
    blurb: "Multi-section page-builder, custom domain, EPK kit, SEO controls, priority discover placement.",
    accent: "deep",
  },
};

/** Atomic feature flag — used to render lock badges on premium modules. */
export type TalentTierFeature =
  | "template-picker"
  | "media-embeds"
  | "press-band"
  | "media-kit"
  | "video-hero"
  | "custom-domain"
  | "extra-sections"
  | "seo-controls"
  | "priority-discovery";

/** Lookup: which feature is first available at which tier. */
export const TALENT_TIER_FEATURE_AT: Record<TalentTierFeature, TalentSubscriptionTier> = {
  "template-picker": "pro",
  "media-embeds": "pro",
  "press-band": "pro",
  "media-kit": "pro",
  "video-hero": "portfolio",
  "custom-domain": "portfolio",
  "extra-sections": "portfolio",
  "seo-controls": "portfolio",
  "priority-discovery": "portfolio",
};

/** Returns true if the talent's current tier unlocks the given feature. */
export function tierAllows(current: TalentSubscriptionTier, feature: TalentTierFeature): boolean {
  const order: TalentSubscriptionTier[] = ["basic", "pro", "portfolio"];
  const required = TALENT_TIER_FEATURE_AT[feature];
  return order.indexOf(current) >= order.indexOf(required);
}

/** Page-builder template — only the "Roster" template ships at Basic. */
export type TalentPageTemplate = {
  id: string;
  label: string;
  blurb: string;
  thumb: string;          // emoji preview
  /** First tier this template is available on. */
  availableAt: TalentSubscriptionTier;
};

export const TALENT_PAGE_TEMPLATES: TalentPageTemplate[] = [
  { id: "roster", label: "Roster", blurb: "Classic comp-card layout — what agencies use.", thumb: "🎴", availableAt: "basic" },
  { id: "editorial", label: "Editorial", blurb: "Magazine spread feel — large hero, generous white space.", thumb: "📰", availableAt: "pro" },
  { id: "studio", label: "Studio", blurb: "Tight grid, big imagery — for fashion + lifestyle.", thumb: "🖼️", availableAt: "pro" },
  { id: "stage", label: "Stage", blurb: "Video-first hero with show / tour / gig dates.", thumb: "🎤", availableAt: "portfolio" },
  { id: "creator", label: "Creator", blurb: "Social-first — TikTok / IG / YouTube embeds drive the page.", thumb: "📱", availableAt: "portfolio" },
  { id: "epk", label: "EPK", blurb: "Press-kit feel — bio, credits, downloads, contact CTA.", thumb: "📄", availableAt: "portfolio" },
];

/** A media embed shown on the personal page. Pro+. */
export type TalentMediaEmbed = {
  id: string;
  kind: "spotify" | "youtube" | "tiktok" | "instagram" | "soundcloud" | "vimeo";
  label: string;
  url: string;
  /** Emoji thumbnail for the prototype. */
  thumb: string;
};

/** Press / clippings — agency-blog mentions, magazine features. Pro+. */
export type TalentPressClip = {
  id: string;
  outlet: string;       // "Vogue Italia"
  headline: string;
  date: string;
  url: string;
  /** Quote pull from the article. */
  quote?: string;
};

/** EPK / media-kit downloadable PDF. Pro+. */
export type TalentMediaKit = {
  filename: string;
  size: string;
  updatedAt: string;
  /** Preview emoji. */
  thumb: string;
};

export type TalentSubscription = {
  tier: TalentSubscriptionTier;
  /** Active personal page template. */
  template: string;
  /** Personal page enabled? Even on Basic the page exists, just simpler. */
  personalPageEnabled: boolean;
  /** Custom domain (Portfolio only). */
  customDomain?: string;
  /** Custom-domain verification state. */
  customDomainStatus?: "verified" | "pending" | "failed" | "not-set";
  /** Personal page URL — what the talent can share. Falls back to
   *  the canonical Tulala /t/<slug> path when no custom domain is set.
   *  All tiers (Basic / Pro / Portfolio) use the same canonical route;
   *  custom domain is reserved for Portfolio only. */
  personalPageUrl: string;
  /** Embedded media. */
  embeds: TalentMediaEmbed[];
  /** Press clippings. */
  press: TalentPressClip[];
  /** Downloadable media kit. */
  mediaKit?: TalentMediaKit;
  /** Renewal / billing date for paid tiers. */
  renewsOn?: string;
  /** True while in trial (Pro/Portfolio) — affects badge styling. */
  inTrial?: boolean;
};

// ────────────────────────────────────────────────────────────────────
// Architecture #5 — Representation status + source-aware inquiry ownership
// ────────────────────────────────────────────────────────────────────
//
// THE BINDING RULE (per project_talent_subscriptions.md §5):
//   Page ownership = talent ALWAYS.
//   Distribution / visibility / contact-routing = relationship-dependent.
//
// A talent can simultaneously appear on:
//   • an agency roster page  (source kind = "direct" with agency domain)
//   • a hub page             (source kind = "hub")
//   • their own personal page (source kind = "talent-page")
//
// Each public surface generates its own inquiry source. The source +
// the talent's representation status together determine who *owns* the
// inquiry and who else gets *notified*. Ownership is not a contradiction
// of representation — it's the platform's value: multiple surfaces, one
// identity, source-attributed routing.

export type RepresentationStatus =
  | { kind: "exclusive"; agencyName: string }
  | { kind: "non-exclusive"; agencyNames: string[] }
  | { kind: "freelance" };

export const REPRESENTATION_META: Record<
  RepresentationStatus["kind"],
  { label: string; short: string; tone: "ink" | "amber" | "green" | "dim"; hint: string }
> = {
  exclusive: {
    label: "Exclusive representation",
    short: "Exclusive",
    tone: "ink",
    hint: "One agency holds primary representation. They control distribution + visibility while the relationship is active.",
  },
  "non-exclusive": {
    label: "Non-exclusive representation",
    short: "Non-exclusive",
    tone: "amber",
    hint: "Multiple agencies represent this talent. Each agency is notified on direct-page inquiries; none has a blocking claim.",
  },
  freelance: {
    label: "Freelance",
    short: "Freelance",
    tone: "dim",
    hint: "No active agency representation. The talent has full direct control of their personal page and inquiry routing.",
  },
};

/**
 * The party that takes primary ownership of an inquiry — i.e. the one
 * whose workspace the inquiry lands in by default and who has the
 * authority to accept / decline / coordinate.
 */
export type InquiryOwner = "talent" | "agency" | "hub-operator";

export type InquiryOwnershipResolution = {
  primaryOwner: InquiryOwner;
  /** Display name of the primary owner (agency name, hub name, or talent name). */
  primaryOwnerLabel: string;
  /** Other parties notified per representation rules. */
  notify: InquiryOwner[];
  /** Plain-language explanation suitable for tooltips / detail panels. */
  rationale: string;
};

/**
 * Source-aware inquiry ownership resolver.
 *
 * Given the public surface that originated the inquiry, the talent's
 * current representation status, and (for context) the talent's
 * subscription tier, returns who owns the inquiry and who gets
 * notified.
 *
 * Tier is passed through but does NOT change ownership in v1 — it's
 * available for future rules (e.g., Portfolio talent on freelance status
 * may eventually opt into an "agency-blind" mode, but that is not
 * specified yet).
 */
export function resolveInquiryOwnership(
  source: InquirySource,
  representation: RepresentationStatus,
  tier: TalentSubscriptionTier,
  talentName: string,
): InquiryOwnershipResolution {
  // Suppress unused-warning while the parameter is reserved for future rules.
  void tier;

  // 1. Talent personal page — talent always owns. Agency is notified
  //    per representation status while the relationship is active.
  if (source.kind === "talent-page") {
    if (representation.kind === "exclusive") {
      return {
        primaryOwner: "talent",
        primaryOwnerLabel: talentName,
        notify: ["agency"],
        rationale: `Inquiry came in via ${talentName}'s personal page. Talent owns the inquiry. ${representation.agencyName} is notified per exclusive representation.`,
      };
    }
    if (representation.kind === "non-exclusive") {
      return {
        primaryOwner: "talent",
        primaryOwnerLabel: talentName,
        notify: ["agency"],
        rationale: `Inquiry came in via ${talentName}'s personal page. Talent owns the inquiry. Representing agencies (${representation.agencyNames.join(", ")}) are notified.`,
      };
    }
    return {
      primaryOwner: "talent",
      primaryOwnerLabel: talentName,
      notify: [],
      rationale: `Inquiry came in via ${talentName}'s personal page. Freelance — no agency notified.`,
    };
  }

  // 2. Hub page — hub operator owns. Agency notified if represented.
  if (source.kind === "hub") {
    return {
      primaryOwner: "hub-operator",
      primaryOwnerLabel: source.hubName,
      notify: representation.kind === "freelance" ? ["talent"] : ["talent", "agency"],
      rationale: `Inquiry came in via ${source.hubName}. Hub operator owns the inquiry. ${representation.kind === "freelance" ? "Talent is notified." : "Talent and representing agency are notified."}`,
    };
  }

  // 3. Direct (agency portal) — agency owns. Talent notified.
  if (source.kind === "direct") {
    const agencyName =
      representation.kind === "exclusive"
        ? representation.agencyName
        : representation.kind === "non-exclusive"
          ? representation.agencyNames[0] ?? source.domain
          : source.domain;
    return {
      primaryOwner: "agency",
      primaryOwnerLabel: agencyName,
      notify: ["talent"],
      rationale: `Inquiry came in via the agency portal at ${source.domain}. Agency owns the inquiry; talent is notified.`,
    };
  }

  // 4. Marketplace — platform-routed. Default to agency-owned if
  //    represented, talent-owned if freelance.
  if (source.kind === "marketplace") {
    if (representation.kind === "freelance") {
      return {
        primaryOwner: "talent",
        primaryOwnerLabel: talentName,
        notify: [],
        rationale: `Marketplace inquiry routed to freelance talent ${talentName}.`,
      };
    }
    const agencyName =
      representation.kind === "exclusive"
        ? representation.agencyName
        : representation.agencyNames[0];
    return {
      primaryOwner: "agency",
      primaryOwnerLabel: agencyName,
      notify: ["talent"],
      rationale: `Marketplace inquiry on ${source.platform}. Routed to representing agency ${agencyName}; talent is notified.`,
    };
  }

  // 5. Manual (coordinator-entered) — assumed agency-side action.
  return {
    primaryOwner: representation.kind === "freelance" ? "talent" : "agency",
    primaryOwnerLabel:
      representation.kind === "exclusive"
        ? representation.agencyName
        : representation.kind === "non-exclusive"
          ? representation.agencyNames[0]
          : talentName,
    notify: representation.kind === "freelance" ? [] : ["talent"],
    rationale: `Coordinator-entered inquiry (${source.channel}). ${representation.kind === "freelance" ? "Routed to talent directly." : "Routed via the representing agency."}`,
  };
}

export const MY_TALENT_PROFILE: MyTalentProfile = {
  name: "Marta Reyes",
  legalName: "Marta Reyes Sánchez",
  initials: "MR",
  pronouns: "she/her",
  age: 24,
  city: "Madrid · willing to travel",
  // Marta is currently on a winter-month base in Mexico — the prototype
  // surfaces this so we can demonstrate the "current location ≠ home city"
  // pattern that real models live with.
  currentLocation: "Playa del Carmen · Mexico",
  availableForWork: true,
  availableToTravel: true,
  coverPhoto: "🌅",
  profilePhoto: "🌸",
  showreelThumb: "🎞️",
  showreelDuration: "0:42",
  measurements: {
    heightImperial: "5'9\"",
    heightMetric: "175 cm",
    weight: "58 kg",
    bust: "86 cm",
    waist: "62 cm",
    hips: "91 cm",
    inseam: "81 cm",
    shoeEU: "39",
    shoeUS: "8.5",
    shoeUK: "6",
    dress: "EU 36 · US 4",
    suit: "—",
    hairColor: "Dark brown",
    hairLength: "long",
    eyeColor: "Brown",
    skinTone: "Olive",
    hasTattoos: true,
    tattoosNote: "Small wrist tattoo (right) · easily covered",
    hasPiercings: true,
    piercingsNote: "Lobes only",
    scarsNote: "—",
  },
  measurementsSummary: '5\'9" · 86-62-91 · EU 39',
  specialties: ["fashion", "editorial", "commercial", "lifestyle"],
  languages: [
    { language: "Spanish", level: "native" },
    { language: "English", level: "fluent" },
    { language: "Italian", level: "fluent" },
    { language: "French", level: "intermediate" },
  ],
  skills: [
    { category: "movement", label: "Yoga", level: "Advanced · 8y" },
    { category: "movement", label: "Contemporary dance", level: "Intermediate · trained" },
    { category: "sport", label: "Horseback riding", level: "Intermediate" },
    { category: "sport", label: "Swimming", level: "Strong" },
    { category: "voice", label: "Castilian + neutral Spanish accent" },
    { category: "instrument", label: "Piano", level: "Intermediate" },
    { category: "performance", label: "On-camera dialogue (ES · EN · IT)" },
  ],
  limits: [
    { id: "lim1", category: "nudity", label: "No nudity", enforcement: "hard" },
    { id: "lim2", category: "wardrobe", label: "No fur", enforcement: "hard" },
    { id: "lim3", category: "wardrobe", label: "Lingerie · case-by-case", enforcement: "soft" },
    { id: "lim4", category: "lifestyle", label: "No tobacco / vape product shots", enforcement: "hard" },
    { id: "lim5", category: "ethical", label: "No fast-fashion campaign exclusives", enforcement: "soft" },
  ],
  credits: [
    { id: "cr1", year: "Spring 2026", brand: "Vogue Italia", type: "Editorial", credit: "Photo · Lina Park", role: "Featured", pinned: true },
    { id: "cr2", year: "2026", brand: "Mango", type: "Campaign", credit: "Photo · Joana Rivera", role: "Lead", pinned: true },
    { id: "cr3", year: "F/W 25", brand: "Bvlgari", type: "Cover", credit: "Cover · Italian edition", role: "Cover", pinned: true },
    { id: "cr4", year: "2025", brand: "Net-a-Porter", type: "Editorial", credit: "Photo · Helena Ross", role: "Featured" },
    { id: "cr5", year: "S/S 25", brand: "Estudio Roca", type: "Lookbook" },
    { id: "cr6", year: "2024", brand: "Zara", type: "Lookbook", credit: "Capsule SS24" },
    { id: "cr7", year: "MFW '24", brand: "Maison Sud", type: "Runway", role: "Walk · 4 looks" },
    { id: "cr8", year: "2024", brand: "Praline London", type: "Editorial" },
  ],
  reviews: [
    {
      id: "rv1",
      reviewerName: "Joana Rivera",
      reviewerRole: "Producer · Mango",
      brand: "Mango SS25 capsule",
      rating: 5,
      body: "Calm on a chaotic set. Held the look through 11 hours of changes without losing energy. Would book again tomorrow.",
      shootDate: "Feb 2026",
    },
    {
      id: "rv2",
      reviewerName: "Lina Park",
      reviewerRole: "Photographer",
      brand: "Vogue Italia spring spread",
      rating: 5,
      body: "Direction-light shoot — Marta brought the editorial. Strong instincts, fast iterations.",
      shootDate: "Mar 2026",
    },
    {
      id: "rv3",
      reviewerName: "Marco Conti",
      reviewerRole: "Creative director · Bvlgari",
      brand: "Bvlgari jewelry cover",
      rating: 5,
      body: "Hand and gesture control of someone twice her experience. Repeat for SS27.",
      shootDate: "Jan 2026",
    },
  ],
  bookingStats: {
    completedBookings: 38,
    onTimeRate: 100,
    repeatClients: 9,
    yearsActive: 4,
  },
  badges: [
    { kind: "id-verified", label: "ID verified", hint: "Government ID checked Mar 2026.", earnedAt: "Mar 2026" },
    { kind: "age-verified", label: "Age verified", hint: "Birth date confirmed by passport.", earnedAt: "Mar 2026" },
    { kind: "agency-verified", label: "Agency-verified", hint: "Acme Models confirms exclusive rep.", earnedAt: "Mar 2024" },
    { kind: "top-rated", label: "Top-rated", hint: "100% on-time across 38 bookings.", earnedAt: "Apr 2026" },
    { kind: "tulala-featured", label: "Featured on Tulala", hint: "Curated pick on the Tulala hub.", earnedAt: "Apr 2026" },
    { kind: "background-check", label: "Background check", hint: "Standard work-history check passed.", earnedAt: "Mar 2026" },
  ],
  documents: [
    { id: "doc1", label: "Government ID (passport)", state: "uploaded", expiresOn: "May 2032" },
    { id: "doc2", label: "Comp card PDF", state: "uploaded" },
    { id: "doc3", label: "W-8BEN (US tax)", state: "missing" },
    { id: "doc4", label: "Health & safety form", state: "uploaded", expiresOn: "Apr 2027" },
    { id: "doc5", label: "VAT certificate (ES)", state: "uploaded" },
  ],
  rateCard: {
    visibility: "agency-only",
    lines: [
      { label: "Editorial · day", range: "€1,800 – €3,200", note: "Print + 6mo digital usage" },
      { label: "Commercial · day", range: "€3,500 – €6,500", note: "Region + duration sets buyout" },
      { label: "E-commerce · day", range: "€1,200 – €2,400" },
      { label: "Runway", range: "€800 – €1,500", note: "Per show + fittings" },
      { label: "Hand / parts", range: "€600 – €1,200" },
    ],
    usagePolicy: "Standard 12-month, single-region buyout included. Global / extended via offer.",
  },
  travel: {
    basedIn: "Madrid",
    willingTravel: "global",
    homeRadius: "Same-day across Iberian peninsula · global with 2 wk lead",
    passports: ["Spain"],
    workAuth: ["Schengen", "United Kingdom (Tier 5)", "United States (B1/B2 + ESTA)"],
    lastTrip: "Milan · 2 wks ago",
    preferredClass: "economy",
  },
  links: [
    { kind: "instagram", label: "@marta.reyes", url: "instagram.com/marta.reyes", followers: "142K" },
    { kind: "tiktok", label: "@marta.reyes", url: "tiktok.com/@marta.reyes", followers: "38K" },
    { kind: "site", label: "marta-reyes.com", url: "marta-reyes.com" },
    { kind: "imdb", label: "IMDb", url: "imdb.com/name/nm9999999" },
  ],
  emergencyContact: {
    name: "Pilar Reyes",
    relation: "Mother",
    phone: "+34 ••• ••• 412",
  },
  primaryAgency: "Acme Models",
  representation: { kind: "exclusive", agencyName: "Acme Models" },
  contactPolicy: { ...DEFAULT_CONTACT_POLICY },
  publishedAt: "Apr 12, 2026",
  profileViews7d: 142,
  inquiries7d: 4,
  discoverRank: 12,
  viewsTrend: 18,
  completeness: 84,
  missing: [
    "Add 3 portfolio shots from 2026",
    "W-8BEN tax form",
    "Set polaroids set (5 naturals)",
  ],
  publicUrl: "acme-models.com/talent/marta-reyes",
  subscription: {
    // Marta is currently on Pro — she trialled it after agency-side
    // told her "your IG following deserves a real page." Pro gives
    // her embeds + a press band. Portfolio would unlock a custom
    // domain (marta-reyes.com) + EPK + extra layout sections.
    tier: "pro",
    template: "editorial",
    personalPageEnabled: true,
    customDomain: undefined,
    customDomainStatus: "not-set",
    personalPageUrl: "tulala.digital/t/marta-reyes",
    embeds: [
      { id: "em1", kind: "instagram", label: "@marta.reyes", url: "instagram.com/marta.reyes", thumb: "📷" },
      { id: "em2", kind: "tiktok", label: "@marta.reyes", url: "tiktok.com/@marta.reyes", thumb: "🎵" },
      { id: "em3", kind: "youtube", label: "Marta · 'Behind the Bvlgari cover'", url: "youtu.be/abc123", thumb: "▶️" },
    ],
    press: [
      {
        id: "pr1",
        outlet: "Vogue Italia",
        headline: "Three to watch — Spring 2026",
        date: "Mar 2026",
        url: "vogue.it/three-to-watch",
        quote: "An instinctive editorial presence with a runway calmness rare for her generation.",
      },
      {
        id: "pr2",
        outlet: "El País · Moda",
        headline: "Madrid's quiet new face",
        date: "Feb 2026",
        url: "elpais.com/moda/marta-reyes",
      },
    ],
    mediaKit: {
      filename: "Marta Reyes · 2026 media kit.pdf",
      size: "4.2 MB",
      updatedAt: "Apr 4, 2026",
      thumb: "📄",
    },
    renewsOn: "May 12, 2026",
    inTrial: false,
  },
};

/** Polaroid set — separate from the styled portfolio. Industry standard
 *  is 5: front, side, back, smile, no-makeup. The set proves what the
 *  talent looks like without lighting / styling.
 */
export type Polaroid = { id: string; angle: string; thumb: string; updatedAgo: string };

export const POLAROID_SET: Polaroid[] = [
  { id: "p1", angle: "Front", thumb: "👤", updatedAgo: "2 wks" },
  { id: "p2", angle: "Side", thumb: "👤", updatedAgo: "2 wks" },
  { id: "p3", angle: "Back", thumb: "👤", updatedAgo: "2 wks" },
  { id: "p4", angle: "Smile", thumb: "👤", updatedAgo: "2 wks" },
  { id: "p5", angle: "No makeup", thumb: "—", updatedAgo: "missing" },
];

/** Languages helper — returns "Native ES · Fluent EN · IT · Int FR" style string. */
export function summarizeLanguages(langs: TalentLanguage[]): string {
  const groups: Record<TalentLanguage["level"], string[]> = {
    native: [],
    fluent: [],
    intermediate: [],
    basic: [],
  };
  langs.forEach((l) => {
    const code = l.language.slice(0, 2).toUpperCase();
    groups[l.level].push(code);
  });
  const parts: string[] = [];
  if (groups.native.length) parts.push(`Native ${groups.native.join(" · ")}`);
  if (groups.fluent.length) parts.push(`Fluent ${groups.fluent.join(" · ")}`);
  if (groups.intermediate.length) parts.push(`Int. ${groups.intermediate.join(" · ")}`);
  if (groups.basic.length) parts.push(`Basic ${groups.basic.join(" · ")}`);
  return parts.join(" · ");
}

export type TalentAgency = {
  id: string;
  name: string;
  slug: string;
  joinedAt: string;
  isPrimary: boolean;
  status: "active" | "exclusive" | "non-exclusive" | "ended";
  bookingsYTD: number;
  /**
   * The agency's own Tulala plan tier. Drives the exclusivity rules:
   *   - free      No exclusivity allowed. Friend-shares-link case. 0% take.
   *   - studio    Studio-level admin. Auto-exclusive when admin adds talent.
   *               Take-rate applies on bookings the studio brings.
   *   - agency    Full agency. Same as studio but with broader capability +
   *               typically a higher take-rate.
   */
  planTier: "free" | "studio" | "agency";
  /** % the agency takes on bookings they bring (0 for free plan). */
  commissionRate: number;
};

export const MY_AGENCIES: TalentAgency[] = [
  { id: "ag1", name: "Acme Models", slug: "acme-models", joinedAt: "Mar 2024", isPrimary: true, status: "exclusive", bookingsYTD: 6, planTier: "agency", commissionRate: 0.18 },
  { id: "ag2", name: "Praline London", slug: "praline-london", joinedAt: "Jan 2025", isPrimary: false, status: "non-exclusive", bookingsYTD: 2, planTier: "studio", commissionRate: 0.12 },
  // Friend-on-free case — demonstrates the "free plan, no exclusivity, no
  // commission" tier per the agency-exclusivity spec.
  { id: "ag3", name: "Estudio Solé (friend)", slug: "estudio-sole", joinedAt: "Apr 2026", isPrimary: false, status: "active", bookingsYTD: 0, planTier: "free", commissionRate: 0 },
];

export type TalentRequest = {
  id: string;
  kind: "offer" | "hold" | "casting" | "request";
  agency: string;
  client: string;
  /**
   * Trust tier of the requesting client at the time the request landed.
   * See project_client_trust_badges.md — surfaces in talent inbox cards
   * so the talent can triage tier alongside agency / fee / date.
   */
  clientTrust: ClientTrustLevel;
  brief: string;
  date?: string;
  amount?: string;
  ageHrs: number;
  status: "needs-answer" | "viewed" | "accepted" | "declined" | "expired";
};

export const TALENT_REQUESTS: TalentRequest[] = [
  { id: "rq1", kind: "offer", agency: "Acme Models", client: "Mango", clientTrust: "gold", brief: "Lookbook · spring capsule · 1 day", date: "Tue · May 6", amount: "€1,800", ageHrs: 5, status: "needs-answer" },
  { id: "rq2", kind: "hold", agency: "Acme Models", client: "Bvlgari", clientTrust: "silver", brief: "Editorial · jewelry campaign", date: "May 18–20", amount: "€4,000–6,000", ageHrs: 18, status: "needs-answer" },
  { id: "rq3", kind: "casting", agency: "Praline London", client: "Net-a-Porter", clientTrust: "silver", brief: "Casting call · video lookbook", date: "Apr 30", amount: "TBC", ageHrs: 36, status: "viewed" },
  { id: "rq4", kind: "offer", agency: "Acme Models", client: "Vogue Italia", clientTrust: "gold", brief: "Editorial spread · 2 day shoot", date: "May 14–15", amount: "€3,200", ageHrs: 60, status: "accepted" },
  // Conflicted hold — overlaps with confirmed bk2 (Vogue Italia · May 14–15).
  // Surfaces the conflict-resolution UI on the calendar so Marta sees the
  // collision before either party expects her to commit.
  { id: "rq5", kind: "hold", agency: "Acme Models", client: "Stella McCartney", clientTrust: "verified", brief: "Lookbook · single day", date: "May 14", amount: "€2,200", ageHrs: 4, status: "needs-answer" },
  // Cancelled / fell-through inquiries — surface in the new "Cancelled"
  // calendar filter alongside cancelled bookings.
  { id: "rq6", kind: "casting", agency: "Acme Models", client: "H&M", clientTrust: "verified", brief: "Online catalogue · 3 talent shortlist", date: "Apr 24", amount: "€900", ageHrs: 96, status: "declined" },
  { id: "rq7", kind: "hold", agency: "Praline London", client: "Topshop", clientTrust: "basic", brief: "Pop-up activation · weekend", date: "Apr 12", amount: "£600", ageHrs: 240, status: "expired" },
];

export type TalentBooking = {
  id: string;
  agency: string;
  client: string;
  brief: string;
  startDate: string;
  endDate?: string;
  location: string;
  amount: string;
  status: "confirmed" | "in-progress" | "wrapped" | "paid" | "cancelled";
  call: string;
  /** Who cancelled — only set when status === "cancelled". Drives the
   *  cancelled-row microcopy ("Client cancelled · 3d before shoot"). */
  cancelledBy?: "client" | "talent" | "agency" | "system";
  /** Optional reason microcopy, surfaced under the row title. */
  cancelReason?: string;
  /** When cancellation happened — relative phrase ("3d before shoot",
   *  "day-of", "after wrap"). */
  cancelTiming?: string;
};

export const TALENT_BOOKINGS: TalentBooking[] = [
  { id: "bk1", agency: "Acme Models", client: "Mango", brief: "Lookbook · spring capsule", startDate: "Tue, May 6", location: "Madrid · ESTUDIO ROCA", amount: "€1,800", status: "confirmed", call: "08:30" },
  { id: "bk2", agency: "Acme Models", client: "Vogue Italia", brief: "Editorial spread", startDate: "May 14", endDate: "May 15", location: "Milan · Studio 5", amount: "€3,200", status: "confirmed", call: "07:00" },
  { id: "bk3", agency: "Praline London", client: "Burberry", brief: "Lookbook", startDate: "Apr 18", location: "London · Hackney", amount: "£2,400", status: "wrapped", call: "—" },
  { id: "bk4", agency: "Acme Models", client: "Zara", brief: "Capsule lookbook", startDate: "Mar 28", location: "Madrid", amount: "€2,000", status: "paid", call: "—" },
  // Cancellation examples — surface in the new "Cancelled" filter on
  // Calendar so the talent has a record of what fell through.
  { id: "bk5", agency: "Acme Models", client: "Hugo Boss", brief: "AW campaign", startDate: "May 9", location: "Berlin · Studio Mitte", amount: "€2,400", status: "cancelled", call: "08:00", cancelledBy: "client", cancelReason: "Client postponed campaign · no kill fee due", cancelTiming: "3d before shoot" },
  { id: "bk6", agency: "Praline London", client: "Selfridges", brief: "Editorial · summer spread", startDate: "Apr 22", location: "London · Studio 2C", amount: "£1,800", status: "cancelled", call: "—", cancelledBy: "talent", cancelReason: "Travel conflict · settled with hold-day fee", cancelTiming: "day before shoot" },
];

export type AvailabilityBlock = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: "blocked" | "travel" | "personal";
};

export const AVAILABILITY_BLOCKS: AvailabilityBlock[] = [
  { id: "av1", startDate: "Apr 28", endDate: "May 2", reason: "Travel · Lisbon trip", type: "travel" },
  { id: "av2", startDate: "May 22", endDate: "May 26", reason: "Personal", type: "personal" },
];

/**
 * Where a booking came from. Drives the source chip on closed-booking
 * drawer + earnings activity reports.
 *
 *   agency      — booked via a roster agency. Standard agency-routed flow.
 *   hub         — Tulala Hub or external aggregator (Models.com, etc.)
 *   personal    — direct via the talent's premium personal page
 *                 (Pro / Portfolio tier; tulala.digital/t/{slug} or own domain)
 *   studio      — booked via a studio / free-book partner
 *   marketplace — open marketplace inquiry (talent.com etc.)
 */
export type EarningSource =
  | { kind: "agency" }
  | { kind: "hub"; name: string }
  | { kind: "personal" }
  | { kind: "studio"; name: string }
  | { kind: "marketplace"; name: string }
  | { kind: "manual" }; // off-platform booking added manually by the talent

/**
 * How the talent actually got paid. Tax + bookkeeping-relevant.
 *
 *   transfer  Bank transfer (default for agency-routed work).
 *   card      Credit/debit card payment.
 *   cash      Cash in hand. Common in some markets — esp Latin America.
 *   in-kind   Product / service / gift in lieu of cash. Tax-treatable
 *             differently and worth tracking explicitly. (e.g. a watch
 *             from Bvlgari, clothing from Mango, hotel stay, etc.)
 *   mixed     Combination (e.g. partial cash + partial in-kind).
 */
export type EarningsPaymentMethod = "transfer" | "card" | "cash" | "in-kind" | "mixed";

export type EarningsRow = {
  id: string;
  /** Date of the shoot / booking */
  workDate: string;
  /** Date the payout landed in the talent's account */
  payoutDate: string;
  agency: string;
  client: string;
  amount: string;
  status: "paid" | "invoiced" | "pending";
  /** Where the booking originated. Drives the source chip in the
   *  closed-booking drawer + earnings activity reports. */
  source: EarningSource;
  /** How the talent was paid — transfer / card / cash / in-kind / mixed.
   *  Drives the payment-method chip on Past calendar rows + earnings rows.
   *  Tax-relevant: in-kind especially (gifts, products) reports differently. */
  paymentMethod: EarningsPaymentMethod;
  /** Optional note describing in-kind payment value or mixed-method
   *  composition (e.g. "+ Bvlgari watch · est €1,200" or "60% transfer +
   *  40% product"). */
  paymentNote?: string;
  /** Other talent on this booking (excluding self). Empty for solo gigs. */
  team?: string[];
  /**
   * True when the talent acted as the de-facto coordinator and brought
   * the team. Surfaces a "You brought Carla" chip in the closed-booking
   * drawer — a real signal of agency on freelance / personal-page work.
   */
  broughtTeam?: boolean;
};

export const EARNINGS_ROWS: EarningsRow[] = [
  // Most recent two added: a personal-page solo gig, and a personal-page
  // gig where Marta brought a friend. They demonstrate the freelance /
  // talent-coordinator path that exists even for an agency-rostered talent
  // with a Pro+ personal page (page ownership = talent always; routing
  // depends on representation. See project_talent_subscriptions.md §5.)
  {
    id: "e7",
    workDate: "Apr 12, 2026",
    payoutDate: "Apr 25, 2026",
    agency: "Direct (personal page)",
    client: "Loewe",
    amount: "€3,600",
    status: "paid",
    source: { kind: "personal" },
    paymentMethod: "transfer",
    team: ["Carla Vega"],
    broughtTeam: true,
  },
  {
    id: "e6",
    workDate: "Apr 5, 2026",
    payoutDate: "Apr 18, 2026",
    agency: "Tulala Hub",
    client: "Bumble",
    amount: "€1,200",
    status: "paid",
    source: { kind: "hub", name: "Tulala Hub" },
    paymentMethod: "transfer",
  },
  // Mix of payment methods seeded so the Past calendar / earnings views
  // can showcase the full method taxonomy: transfer (default), card,
  // cash (efectivo — common in Latin America), in-kind (gifts / products).
  { id: "e1", workDate: "Mar 28, 2026", payoutDate: "Apr 4, 2026", agency: "Acme Models", client: "Zara", amount: "€2,000", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
  { id: "e2", workDate: "Mar 10, 2026", payoutDate: "Mar 21, 2026", agency: "Praline London", client: "Burberry", amount: "£2,400", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
  { id: "e3", workDate: "Mar 1, 2026", payoutDate: "Mar 12, 2026", agency: "Acme Models", client: "Vogue Italia", amount: "€2,800", status: "paid", source: { kind: "agency" }, paymentMethod: "mixed", paymentNote: "Transfer + Vogue editorial credit" },
  // Mango paid in product (clothing capsule) — tax-relevant in-kind example.
  { id: "e4", workDate: "Feb 14, 2026", payoutDate: "Feb 28, 2026", agency: "Acme Models", client: "Mango", amount: "€1,600", status: "paid", source: { kind: "agency" }, paymentMethod: "in-kind", paymentNote: "Capsule wardrobe · est. value" },
  { id: "e5", workDate: "Jan 30, 2026", payoutDate: "Feb 14, 2026", agency: "Acme Models", client: "Net-a-Porter", amount: "€3,400", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
];

/**
 * Display label per payment method. Used in chips + microcopy.
 */
export const PAYMENT_METHOD_META: Record<EarningsPaymentMethod, {
  label: string;
  short: string;
  hint: string;
}> = {
  transfer: { label: "Bank transfer", short: "Transfer", hint: "Paid via bank transfer (default for agency-routed work)." },
  card:     { label: "Card payment", short: "Card", hint: "Paid via credit/debit card." },
  cash:     { label: "Cash · efectivo", short: "Cash", hint: "Paid in cash. Track for tax reporting." },
  "in-kind":{ label: "In-kind · gift", short: "In-kind", hint: "Paid in product, service, or gift instead of cash. Tax-treated differently." },
  mixed:    { label: "Mixed", short: "Mixed", hint: "Combination of cash + in-kind or multiple methods." },
};

// ════════════════════════════════════════════════════════════════════
// REACH — distribution channels
// ════════════════════════════════════════════════════════════════════
//
// The talent's "Reach" is the set of channels through which inquiries
// can find them. Five lanes, each with its own ownership model:
//
//   personal    Talent's own premium page (Pro/Portfolio tier)
//   tulala-hub  Tulala's curated discovery directory
//   agency      Agencies the talent is on roster with
//   external    External hubs / aggregators (Models.com etc.)
//   studio      Studio / free-book partners (creative communities)
//
// Each ChannelEntry has performance counts so the talent SEES the
// inquiry / view yield per channel and can make informed decisions.

export type ChannelKind = "personal" | "tulala-hub" | "agency" | "external" | "studio";

export type ChannelEntry = {
  id: string;
  kind: ChannelKind;
  name: string;
  /** "tulala.digital/t/marta-reyes" or "models.com/marta-reyes" */
  url?: string;
  /** Live state — published / off / pending invite / paused (A8).
   *  Paused = stay listed but not accepting NEW pitches. Distinct from
   *  off (which fully removes the talent from the channel). */
  status: "live" | "off" | "pending" | "published" | "invited" | "paused";
  /** Last-7d signal counts. Drives the value-of-channel display. */
  views7d: number;
  /** Trend vs prior 7d — drives the +/- delta caption on Reach stats. */
  views7dDelta?: number;
  inquiries7d: number;
  inquiries7dDelta?: number;
  bookings90d: number;
  /**
   * Earnings attributable to this channel over the last 90 days. The
   * single most important Reach metric — answers "what did this channel
   * actually earn me?" Drives every distribution decision.
   */
  earnings90d: number;
  /** ISO currency symbol for earnings90d display. */
  earningsCurrency?: string;
  /** Whether the talent can toggle this channel on/off themselves. */
  toggleable: boolean;
  /** Optional verified flag for external hubs (Tulala-vetted partners). */
  verified?: boolean;
  /** Optional badge ("Pro tier", "Trusted", etc.) shown next to name. */
  badge?: string;
  /** Brief description shown in the hub-detail mini-drawer. */
  description?: string;
  /** Standard fee/take rate the platform charges (0 = none, .15 = 15%). */
  feeRate?: number;
};

export type ExposurePreset = "selective" | "curated" | "wide" | "maximum";

export const EXPOSURE_PRESET_META: Record<
  ExposurePreset,
  { label: string; description: string; recommended?: boolean }
> = {
  selective: {
    label: "Selective",
    description: "Personal page only. Highest control, lowest volume.",
  },
  curated: {
    label: "Curated",
    description: "Tulala Hub + agencies you're on. Vetted channels only.",
  },
  wide: {
    label: "Wide",
    description: "All verified channels including trusted external hubs.",
    recommended: true,
  },
  maximum: {
    label: "Maximum",
    description: "Every available channel, including marketplace inquiries from Basic clients.",
  },
};

export const TALENT_CHANNELS: ChannelEntry[] = [
  // 1 — Personal page
  {
    id: "ch-personal",
    kind: "personal",
    name: "Personal page",
    url: "tulala.digital/t/marta-reyes",
    status: "live",
    views7d: 48,
    views7dDelta: 12,
    inquiries7d: 3,
    inquiries7dDelta: 1,
    bookings90d: 1,
    earnings90d: 3600,
    earningsCurrency: "€",
    toggleable: true,
    badge: "Pro tier",
    description:
      "Your premium personal page on Tulala. The only channel you fully own — clients reach you directly, no platform routing. Custom domain available on Portfolio tier.",
    feeRate: 0,
  },
  // 2 — Tulala Hub
  {
    id: "ch-tulala-hub",
    kind: "tulala-hub",
    name: "Tulala Hub",
    status: "live",
    views7d: 12,
    views7dDelta: 4,
    inquiries7d: 1,
    inquiries7dDelta: 0,
    bookings90d: 1,
    earnings90d: 1200,
    earningsCurrency: "€",
    toggleable: true,
    verified: true,
    description:
      "Tulala's curated discovery directory. Editorially vetted talent only. Inquiries are pre-filtered by client trust tier and subject to your contact policy.",
    feeRate: 0,
  },
  // 3 — Agencies on roster
  {
    id: "ch-agency-acme",
    kind: "agency",
    name: "Acme Models",
    url: "acme-models.tulala.app",
    status: "published",
    views7d: 22,
    views7dDelta: -3,
    inquiries7d: 2,
    inquiries7dDelta: 0,
    bookings90d: 4,
    earnings90d: 9800,
    earningsCurrency: "€",
    toggleable: false, // agency contract, not solo-toggleable
    badge: "Primary · exclusive",
  },
  {
    id: "ch-agency-praline",
    kind: "agency",
    name: "Praline London",
    url: "praline-london.tulala.app",
    status: "published",
    views7d: 9,
    views7dDelta: 1,
    inquiries7d: 1,
    inquiries7dDelta: 0,
    bookings90d: 1,
    earnings90d: 2400,
    earningsCurrency: "£",
    toggleable: false,
    badge: "Non-exclusive",
  },
  // 4 — External hubs
  {
    id: "ch-ext-models",
    kind: "external",
    name: "Models.com",
    url: "models.com/marta-reyes",
    status: "live",
    views7d: 14,
    views7dDelta: 6,
    inquiries7d: 4,
    inquiries7dDelta: 2,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    verified: true,
    description:
      "Industry-standard talent directory. Long-running platform with strong client base in editorial / fashion. Higher inquiry volume than booking yield.",
    feeRate: 0.1,
  },
  {
    id: "ch-ext-talent",
    kind: "external",
    name: "talent.com",
    status: "live",
    views7d: 6,
    views7dDelta: 1,
    inquiries7d: 2,
    inquiries7dDelta: 1,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    verified: true,
    description:
      "Open marketplace with broader audience. Mixed quality — many Basic-tier clients. Filter via your contact policy.",
    feeRate: 0.15,
  },
  {
    id: "ch-ext-bookem",
    kind: "external",
    name: "BookEm.app",
    status: "off",
    views7d: 0,
    inquiries7d: 0,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    verified: false,
    description:
      "Newer platform focused on direct-to-talent booking. Not yet Tulala-verified — caveat emptor.",
    feeRate: 0.2,
  },
  // 5 — Studios / free books
  {
    id: "ch-studio-roca",
    kind: "studio",
    name: "Estudio Roca community",
    status: "live",
    views7d: 4,
    views7dDelta: 0,
    inquiries7d: 0,
    inquiries7dDelta: 0,
    bookings90d: 1,
    earnings90d: 2000,
    earningsCurrency: "€",
    toggleable: true,
    description:
      "Madrid-based creative community. Free books + studio referrals. Slower but high-quality leads from local creatives.",
    feeRate: 0,
  },
  {
    id: "ch-studio-mitte",
    kind: "studio",
    name: "Studio Mitte Berlin",
    status: "off",
    views7d: 0,
    inquiries7d: 0,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    description: "Berlin photography studio collective. Editorial + commercial referrals.",
    feeRate: 0,
  },
];

// Channels NOT yet joined — surfaced in the "Browse more" affordances
// so the talent can grow their reach without leaving the page.
export const AVAILABLE_CHANNELS: ChannelEntry[] = [
  {
    id: "ch-ext-cast",
    kind: "external",
    name: "Cast Iron Network",
    status: "off",
    views7d: 0,
    inquiries7d: 0,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    verified: true,
    description:
      "Editorial + indie fashion network. Strong art-direction sensibility, lower volume but premium clients.",
    feeRate: 0.12,
  },
  {
    id: "ch-ext-network",
    kind: "external",
    name: "The Industry Network",
    status: "off",
    views7d: 0,
    inquiries7d: 0,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    verified: true,
    description:
      "London / NYC industry directory. Producer + casting director focus. Bookings tend to be larger campaigns.",
    feeRate: 0.1,
  },
  {
    id: "ch-studio-paris",
    kind: "studio",
    name: "Atelier Paris collective",
    status: "off",
    views7d: 0,
    inquiries7d: 0,
    bookings90d: 0,
    earnings90d: 0,
    earningsCurrency: "€",
    toggleable: true,
    description:
      "Paris-based stylist + photographer collective. Co-op style — talent split a small monthly fee for shared studio + referrals.",
    feeRate: 0,
  },
];

// ════════════════════════════════════════════════════════════════════
// Client surface mock data
// ════════════════════════════════════════════════════════════════════

export type ClientBrand = {
  id: string;
  name: string;
  initials: string;
  industry: string;
  /**
   * Tulala-issued trust tier the brand has earned. Drives the trust-badge
   * upsell on the client dashboard, plus how talent contact-policy filters
   * surface this brand's inquiries. See project_client_trust_badges.md.
   */
  trustLevel: ClientTrustLevel;
};

export const MY_CLIENT_BRAND: ClientBrand = {
  id: "br1",
  name: "Estudio Solé",
  initials: "ES",
  industry: "Fashion · creative studio",
  trustLevel: "basic",
};

/**
 * Pricing & lead time per trust tier. Verification (Basic → Verified) is the
 * only conversion-priced step; Silver/Gold are earned via funded balance and
 * activity, not paid for. See project_client_trust_badges.md.
 */
export const TRUST_TIER_UPGRADE: Record<
  ClientTrustLevel,
  { nextLabel: string | null; price: string | null; leadTime: string | null; pitch: string }
> = {
  basic: {
    nextLabel: "Verified",
    price: "$29 · one-time",
    leadTime: "Instant — most ID checks complete in under a minute",
    pitch:
      "Talent that filters out anonymous inquiries will see your next message. Verification confirms a real, traceable buyer.",
  },
  verified: {
    nextLabel: "Silver",
    price: null,
    leadTime: "Earned",
    pitch:
      "Earned automatically once your funded balance crosses the Silver threshold — no extra fee, just a signal of buying readiness.",
  },
  silver: {
    nextLabel: "Trusted",
    price: null,
    leadTime: "Earned",
    pitch:
      "Earned through sustained activity + a high funded balance. The strongest trust signal Tulala issues.",
  },
  gold: {
    nextLabel: null,
    price: null,
    leadTime: null,
    pitch: "You're at the highest trust tier Tulala issues. Talent inboxes treat your inquiries as priority.",
  },
};

export type DiscoverTalent = {
  id: string;
  name: string;
  agency: string;
  city: string;
  height: string;
  thumb: string;
  available: boolean;
};

export const DISCOVER_TALENT: DiscoverTalent[] = [
  { id: "dt1", name: "Marta Reyes", agency: "Acme Models", city: "Madrid", height: "5'9\"", thumb: "🌸", available: true },
  { id: "dt2", name: "Kai Lin", agency: "Acme Models", city: "Berlin", height: "5'11\"", thumb: "🌊", available: true },
  { id: "dt3", name: "Tomás Navarro", agency: "Acme Models", city: "Lisbon", height: "6'1\"", thumb: "🍃", available: true },
  { id: "dt4", name: "Yuna Park", agency: "Praline London", city: "London", height: "5'10\"", thumb: "🪷", available: false },
  { id: "dt5", name: "Léa Mercier", agency: "Maison Sud", city: "Paris", height: "5'8\"", thumb: "🌷", available: true },
  { id: "dt6", name: "Ola Brandt", agency: "Nord Talent", city: "Copenhagen", height: "5'11\"", thumb: "🌾", available: true },
  { id: "dt7", name: "Rafa Ortega", agency: "Acme Models", city: "Madrid", height: "6'0\"", thumb: "🍂", available: false },
  { id: "dt8", name: "Iris Volpe", agency: "Bottega Roma", city: "Rome", height: "5'9\"", thumb: "🌺", available: true },
];

export type Shortlist = {
  id: string;
  name: string;
  brief: string;
  count: number;
  updatedAgo: string;
  status: "draft" | "shared" | "inquiry-sent" | "booked";
  thumbs: string[];
};

export const MY_SHORTLISTS: Shortlist[] = [
  { id: "sl1", name: "Spring lookbook · Estudio Solé SS27", brief: "Editorial · 4 talent", count: 6, updatedAgo: "2h", status: "shared", thumbs: ["🌸","🌊","🍃","🌷"] },
  { id: "sl2", name: "Bridal capsule", brief: "Lookbook · 3 talent", count: 4, updatedAgo: "1d", status: "draft", thumbs: ["🌷","🪷","🌹"] },
  { id: "sl3", name: "Press kit launch", brief: "Editorial · 2 talent", count: 3, updatedAgo: "5d", status: "inquiry-sent", thumbs: ["🌸","🍃"] },
  { id: "sl4", name: "Winter '25 (archived)", brief: "Wrapped · 5 bookings", count: 7, updatedAgo: "4mo", status: "booked", thumbs: ["🌊","🌷","🍃","🌹","🌾"] },
];

export type ClientInquiry = {
  id: string;
  shortlistName: string;
  agency: string;
  brief: string;
  ageDays: number;
  stage: "draft" | "sent" | "agency-replied" | "talent-confirmed" | "negotiating" | "confirmed" | "declined";
  amount?: string;
  date?: string;
};

export const CLIENT_INQUIRIES: ClientInquiry[] = [
  { id: "ci1", shortlistName: "Spring lookbook", agency: "Acme Models", brief: "Marta Reyes · 1 day", ageDays: 1, stage: "agency-replied", amount: "€1,800", date: "Tue · May 6" },
  { id: "ci2", shortlistName: "Spring lookbook", agency: "Acme Models", brief: "Tomás Navarro · 1 day", ageDays: 1, stage: "negotiating", amount: "€2,400", date: "Tue · May 6" },
  { id: "ci3", shortlistName: "Press kit launch", agency: "Acme Models", brief: "Kai Lin · 2 day", ageDays: 5, stage: "confirmed", amount: "€3,200", date: "May 14–15" },
  { id: "ci4", shortlistName: "Bridal capsule", agency: "Maison Sud", brief: "Léa Mercier · 1 day", ageDays: 0, stage: "draft" },
  { id: "ci5", shortlistName: "Spring lookbook", agency: "Praline London", brief: "Yuna Park · 1 day", ageDays: 3, stage: "declined", amount: "£2,400" },
];

export type ClientBookingPostStatus =
  | "contract-pending"
  | "contract-signed"
  | "call-sheet-sent"
  | "confirmed"
  | "wrapped"
  | "invoice-pending"
  | "paid";

export type ClientBooking = {
  id: string;
  shortlistName: string;
  agency: string;
  talent: string;
  date: string;
  location: string;
  amount: string;
  status: "confirmed" | "in-progress" | "wrapped" | "invoiced";
  /** Granular post-booking state — the production state machine lives here */
  postStatus: ClientBookingPostStatus;
};

export const CLIENT_BOOKINGS: ClientBooking[] = [
  { id: "cb1", shortlistName: "Spring lookbook", agency: "Acme Models", talent: "Marta Reyes", date: "Tue, May 6", location: "Madrid · Estudio Roca", amount: "€1,800", status: "confirmed", postStatus: "call-sheet-sent" },
  { id: "cb2", shortlistName: "Press kit launch", agency: "Acme Models", talent: "Kai Lin", date: "May 14–15", location: "Milan · Studio 5", amount: "€3,200", status: "confirmed", postStatus: "contract-pending" },
  { id: "cb3", shortlistName: "Winter '25", agency: "Acme Models", talent: "Tomás Navarro", date: "Feb 22, 2026", location: "Madrid", amount: "€2,400", status: "invoiced", postStatus: "paid" },
];

/** Client Q2 budget — for the budget-vs-actual strip (C15) */
export const CLIENT_Q2_BUDGET = { total: 50000, spent: 18400, currency: "€", label: "Q2 2026" };

/** Agency reliability data — on-time deliveries + cancellation history (C20) */
export type AgencyReliability = {
  agencyName: string;
  bookingsCompleted: number;
  onTimeRate: number;   // 0–100
  cancellations: number;
  repeatBookings: number;
};

export const AGENCY_RELIABILITY: AgencyReliability[] = [
  { agencyName: "Acme Models", bookingsCompleted: 12, onTimeRate: 100, cancellations: 0, repeatBookings: 9 },
  { agencyName: "Praline London", bookingsCompleted: 3, onTimeRate: 100, cancellations: 0, repeatBookings: 1 },
  { agencyName: "Maison Sud", bookingsCompleted: 1, onTimeRate: 100, cancellations: 0, repeatBookings: 0 },
];

// ════════════════════════════════════════════════════════════════════
// Platform / Tulala HQ mock data
// ════════════════════════════════════════════════════════════════════

export type PlatformTenant = {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  /** Entity model — orthogonal to plan. Hubs lean to higher tiers but are not tier-locked. */
  entityType: EntityType;
  seats: number;
  talentCount: number;
  mrr: string;
  health: "healthy" | "at-risk" | "churning";
  signupAt: string;
  lastActivity: string;
};

export const PLATFORM_TENANTS: PlatformTenant[] = [
  { id: "tn1", name: "Acme Models", slug: "acme-models", plan: "agency", entityType: "agency", seats: 8, talentCount: 47, mrr: "$149", health: "healthy", signupAt: "Jan 2025", lastActivity: "2m ago" },
  { id: "tn2", name: "Praline London", slug: "praline-london", plan: "agency", entityType: "agency", seats: 12, talentCount: 84, mrr: "$149", health: "healthy", signupAt: "Sep 2024", lastActivity: "12m ago" },
  { id: "tn3", name: "Maison Sud", slug: "maison-sud", plan: "studio", entityType: "agency", seats: 3, talentCount: 18, mrr: "$79", health: "healthy", signupAt: "Mar 2026", lastActivity: "1h ago" },
  { id: "tn4", name: "Nord Talent", slug: "nord-talent", plan: "studio", entityType: "agency", seats: 5, talentCount: 22, mrr: "$79", health: "at-risk", signupAt: "Nov 2025", lastActivity: "11d ago" },
  { id: "tn5", name: "Bottega Roma", slug: "bottega-roma", plan: "free", entityType: "agency", seats: 1, talentCount: 4, mrr: "$0", health: "at-risk", signupAt: "Apr 2026", lastActivity: "2d ago" },
  { id: "tn6", name: "Coast & Co", slug: "coast-co", plan: "free", entityType: "hub", seats: 1, talentCount: 1, mrr: "$0", health: "churning", signupAt: "Feb 2026", lastActivity: "21d ago" },
  { id: "tn7", name: "Tokyo Faces", slug: "tokyo-faces", plan: "network", entityType: "hub", seats: 22, talentCount: 312, mrr: "$899", health: "healthy", signupAt: "Aug 2024", lastActivity: "4m ago" },
];

export type PlatformUser = {
  id: string;
  name: string;
  email: string;
  primaryTenant: string;
  tenants: number;
  isTalent: boolean;
  signupAt: string;
  lastSeen: string;
};

export const PLATFORM_USERS: PlatformUser[] = [
  { id: "pu1", name: "Oran Tene", email: "oran@acme-models.com", primaryTenant: "Acme Models", tenants: 1, isTalent: false, signupAt: "Jan 2025", lastSeen: "now" },
  { id: "pu2", name: "Marta Reyes", email: "marta@reyes.studio", primaryTenant: "Acme Models", tenants: 2, isTalent: true, signupAt: "Mar 2024", lastSeen: "1h ago" },
  { id: "pu3", name: "Sara Bianchi", email: "sara@vogueitalia.com", primaryTenant: "(client) Vogue Italia", tenants: 1, isTalent: false, signupAt: "Feb 2026", lastSeen: "12m ago" },
  { id: "pu4", name: "Kai Lin", email: "kai@lin.studio", primaryTenant: "Acme Models", tenants: 1, isTalent: true, signupAt: "Jun 2024", lastSeen: "3h ago" },
  { id: "pu5", name: "Helena Ross", email: "helena@netaporter.com", primaryTenant: "(client) Net-a-Porter", tenants: 1, isTalent: false, signupAt: "Apr 2026", lastSeen: "2d ago" },
];

export type HubSubmission = {
  id: string;
  talentName: string;
  agency: string;
  submittedAt: string;
  status: "pending" | "featured" | "declined";
  reason?: string;
};

export const HUB_SUBMISSIONS: HubSubmission[] = [
  { id: "hs1", talentName: "Marta Reyes", agency: "Acme Models", submittedAt: "2h ago", status: "pending" },
  { id: "hs2", talentName: "Yuna Park", agency: "Praline London", submittedAt: "5h ago", status: "pending" },
  { id: "hs3", talentName: "Léa Mercier", agency: "Maison Sud", submittedAt: "1d ago", status: "featured" },
  { id: "hs4", talentName: "Ola Brandt", agency: "Nord Talent", submittedAt: "2d ago", status: "pending" },
  { id: "hs5", talentName: "Rafa Ortega", agency: "Acme Models", submittedAt: "3d ago", status: "declined", reason: "Profile under-developed" },
];

export type PlatformInvoice = {
  id: string;
  tenant: string;
  amount: string;
  date: string;
  plan: Plan;
  status: "paid" | "failed" | "refunded" | "pending";
};

export const PLATFORM_INVOICES: PlatformInvoice[] = [
  { id: "inv1", tenant: "Acme Models", amount: "$149", date: "Apr 12, 2026", plan: "agency", status: "paid" },
  { id: "inv2", tenant: "Praline London", amount: "$149", date: "Apr 9, 2026", plan: "agency", status: "paid" },
  { id: "inv3", tenant: "Tokyo Faces", amount: "$899", date: "Apr 8, 2026", plan: "network", status: "paid" },
  { id: "inv4", tenant: "Maison Sud", amount: "$79", date: "Apr 4, 2026", plan: "studio", status: "paid" },
  { id: "inv5", tenant: "Nord Talent", amount: "$79", date: "Apr 2, 2026", plan: "studio", status: "failed" },
  { id: "inv6", tenant: "Coast & Co", amount: "$79", date: "Mar 28, 2026", plan: "studio", status: "refunded" },
];

export type FeatureFlag = {
  id: string;
  name: string;
  state: "on" | "off" | "rollout";
  rollout?: string; // "12% — agency plan"
  owner: string;
  description: string;
};

export const FEATURE_FLAGS: FeatureFlag[] = [
  { id: "ff1", name: "ai_inquiry_drafts", state: "on", owner: "Ops", description: "AI-assisted inquiry response drafts" },
  { id: "ff2", name: "hub_publishing_v2", state: "rollout", rollout: "30% · network", owner: "Product", description: "New hub-publishing UI with featured rotation" },
  { id: "ff3", name: "client_workspace_seats", state: "rollout", rollout: "12% · enterprise", owner: "Product", description: "Multi-seat client workspace" },
  { id: "ff4", name: "talent_self_serve_portfolio", state: "off", owner: "Trust", description: "Let talent edit portfolio without agency review" },
  { id: "ff5", name: "instant_book", state: "off", owner: "Product", description: "One-click booking for verified clients" },
];

export type ModerationItem = {
  id: string;
  kind: "talent-profile" | "media-upload" | "client-profile" | "report";
  subject: string;
  reportedAt: string;
  reason: string;
  severity: "low" | "med" | "high";
};

export const MODERATION_QUEUE: ModerationItem[] = [
  { id: "m1", kind: "media-upload", subject: "Sven Olafsson · 4 portfolio shots", reportedAt: "1h ago", reason: "Auto-flag · low resolution", severity: "low" },
  { id: "m2", kind: "talent-profile", subject: "Coast & Co · Anna T", reportedAt: "3h ago", reason: "Possible underage profile", severity: "high" },
  { id: "m3", kind: "report", subject: "Bottega Roma → Iris V", reportedAt: "1d ago", reason: "Talent reports unwanted contact", severity: "high" },
  { id: "m4", kind: "client-profile", subject: "Generic Co", reportedAt: "2d ago", reason: "Suspected impersonation", severity: "med" },
];

export type SystemJob = {
  id: string;
  name: string;
  state: "running" | "queued" | "failed" | "succeeded";
  duration: string;
  lastRun: string;
};

export const SYSTEM_JOBS: SystemJob[] = [
  { id: "j1", name: "embed-talents · vector index refresh", state: "succeeded", duration: "4m 12s", lastRun: "8m ago" },
  { id: "j2", name: "send-weekly-digest", state: "running", duration: "2m 04s", lastRun: "started 2m ago" },
  { id: "j3", name: "process-stripe-webhooks", state: "queued", duration: "—", lastRun: "—" },
  { id: "j4", name: "expire-stale-holds", state: "failed", duration: "0m 18s", lastRun: "1h ago" },
];

export type PlatformIncident = {
  id: string;
  title: string;
  severity: "p1" | "p2" | "p3";
  state: "open" | "monitoring" | "resolved";
  startedAt: string;
};

export const PLATFORM_INCIDENTS: PlatformIncident[] = [
  { id: "in1", title: "Slow image uploads (eu-west)", severity: "p3", state: "monitoring", startedAt: "37m ago" },
  { id: "in2", title: "Stripe webhook latency", severity: "p2", state: "open", startedAt: "1h ago" },
];

export type SupportTicket = {
  id: string;
  tenant: string;
  subject: string;
  reportedBy: string;
  ageHrs: number;
  state: "new" | "open" | "waiting" | "resolved";
};

export const SUPPORT_TICKETS: SupportTicket[] = [
  { id: "tk1", tenant: "Coast & Co", subject: "Can't connect custom domain", reportedBy: "anna@coast-co.com", ageHrs: 3, state: "new" },
  { id: "tk2", tenant: "Maison Sud", subject: "Lost access to admin", reportedBy: "founder@maison.sud", ageHrs: 6, state: "open" },
  { id: "tk3", tenant: "Nord Talent", subject: "Refund request — March", reportedBy: "ole@nord.dk", ageHrs: 24, state: "waiting" },
];

export const PLATFORM_HQ_TEAM: TeamMember[] = [
  { id: "hq1", name: "Oran Tene", email: "oran@tulala.digital", role: "owner", status: "active", initials: "OT" },
  { id: "hq2", name: "Eli Park", email: "eli@tulala.digital", role: "admin", status: "active", initials: "EP" },
  { id: "hq3", name: "Sam Liu", email: "sam@tulala.digital", role: "admin", status: "active", initials: "SL" },
  { id: "hq4", name: "Nora Diaz", email: "nora@tulala.digital", role: "coordinator", status: "active", initials: "ND" },
];

// ─── Provider ────────────────────────────────────────────────────────

type Toast = { id: number; message: string; undo?: () => void };

export type Impersonation = {
  tenantSlug: string;
  tenantName: string;
  asPlan: Plan;
  asRole: Role;
  asEntityType: EntityType;
  readOnly: boolean;
} | null;

export type ProtoState = {
  surface: Surface;
  // workspace dimensions
  plan: Plan;
  role: Role;
  /**
   * Workspace entity model. Drives copy ("Roster" vs "Network"), inquiry
   * routing on the pipeline page, and a few coordinator behaviours. The
   * default mock TENANT is an agency, but the ControlBar can flip this to
   * preview the hub experience without seeding a different tenant.
   */
  entityType: EntityType;
  alsoTalent: boolean;
  page: WorkspacePage;
  // talent dimensions
  talentPage: TalentPage;
  // client dimensions
  clientPlan: ClientPlan;
  clientPage: ClientPage;
  // platform dimensions
  hqRole: HqRole;
  platformPage: PlatformPage;
  impersonating: Impersonation;
  // shared
  drawer: DrawerContext;
  upgrade: UpgradeOffer;
  toasts: Toast[];
  completedTasks: Set<string>;
  /** Comfortable (default) vs compact list density. Persisted to localStorage. */
  density: Density;
};

export type Density = "comfortable" | "compact";

type Ctx = {
  state: ProtoState;
  setSurface: (s: Surface) => void;
  /**
   * Hybrid-mode toggle for talents who also own a workspace.
   * Flips between surface="talent" (their personal page) and
   * surface="workspace" (their agency/studio cockpit). Carries the
   * "I came from talent" return chip so the user has a one-click way
   * back. No-op when alsoTalent is false.
   */
  flipMode: () => void;
  setPlan: (p: Plan) => void;
  setRole: (r: Role) => void;
  setEntityType: (e: EntityType) => void;
  setAlsoTalent: (b: boolean) => void;
  setDensity: (d: Density) => void;
  setPage: (p: WorkspacePage) => void;
  setTalentPage: (p: TalentPage) => void;
  setClientPlan: (p: ClientPlan) => void;
  setClientPage: (p: ClientPage) => void;
  setHqRole: (r: HqRole) => void;
  setPlatformPage: (p: PlatformPage) => void;
  startImpersonation: (i: NonNullable<Impersonation>) => void;
  stopImpersonation: () => void;
  openDrawer: (id: DrawerId, payload?: Record<string, unknown>) => void;
  closeDrawer: () => void;
  /** Pop the drawer back-stack — reopens the previous drawer. */
  popDrawer: () => void;
  /** The chain of drawers the user opened to get here (excluding current). */
  drawerStack: DrawerContext[];
  openUpgrade: (offer: Omit<UpgradeOffer, "open">) => void;
  closeUpgrade: () => void;
  toast: (message: string, opts?: { undo?: () => void }) => void;
  dismissToast: (id: number) => void;
  completeTask: (id: string) => void;
};

const ProtoContext = createContext<Ctx | null>(null);

export function ProtoProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>("workspace");
  // workspace
  const [plan, setPlan] = useState<Plan>("free");
  const [role, setRole] = useState<Role>("owner");
  const [entityType, setEntityType] = useState<EntityType>(TENANT.entityType);
  const [alsoTalent, setAlsoTalent] = useState<boolean>(true);
  const [page, setPage] = useState<WorkspacePage>("overview");
  // talent
  const [talentPage, setTalentPage] = useState<TalentPage>("today");
  // client
  const [clientPlan, setClientPlan] = useState<ClientPlan>("pro");
  const [clientPage, setClientPage] = useState<ClientPage>("today");
  // platform
  const [hqRole, setHqRole] = useState<HqRole>("exec");
  const [platformPage, setPlatformPage] = useState<PlatformPage>("today");
  const [impersonating, setImpersonating] = useState<Impersonation>(null);
  // shared
  const [drawer, setDrawer] = useState<DrawerContext>({ drawerId: null });
  const [upgrade, setUpgrade] = useState<UpgradeOffer>({ open: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  const [density, setDensityState] = useState<Density>("comfortable");
  const toastIdRef = useRef(0);

  // Hydrate density from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tulala_density");
      if (v === "comfortable" || v === "compact") setDensityState(v);
    } catch {
      /* ignore — quota / private mode */
    }
  }, []);
  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    try {
      window.localStorage.setItem("tulala_density", d);
    } catch {
      /* ignore */
    }
  }, []);
  // Mirror density onto <html> so global CSS can target it without
  // touching every component. Cleared on unmount.
  useEffect(() => {
    document.documentElement.dataset.tulalaDensity = density;
    return () => {
      delete document.documentElement.dataset.tulalaDensity;
    };
  }, [density]);

  // Read initial state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("surface");
    const pl = params.get("plan");
    const r = params.get("role");
    const et = params.get("entityType");
    const at = params.get("alsoTalent");
    const pg = params.get("page");
    const tpg = params.get("talentPage");
    const cpl = params.get("clientPlan");
    const cpg = params.get("clientPage");
    const hr = params.get("hqRole");
    const ppg = params.get("platformPage");
    const dr = params.get("drawer");
    const drp = params.get("drawerPayload");
    if (s && SURFACES.includes(s as Surface)) setSurface(s as Surface);
    if (pl && PLANS.includes(pl as Plan)) setPlan(pl as Plan);
    if (r && ROLES.includes(r as Role)) setRole(r as Role);
    if (et && ENTITY_TYPES.includes(et as EntityType)) setEntityType(et as EntityType);
    if (at === "true" || at === "false") setAlsoTalent(at === "true");
    if (pg && WORKSPACE_PAGES.includes(pg as WorkspacePage)) setPage(pg as WorkspacePage);
    if (tpg && TALENT_PAGES.includes(tpg as TalentPage)) setTalentPage(tpg as TalentPage);
    if (cpl && CLIENT_PLANS.includes(cpl as ClientPlan)) setClientPlan(cpl as ClientPlan);
    if (cpg && CLIENT_PAGES.includes(cpg as ClientPage)) setClientPage(cpg as ClientPage);
    if (hr && HQ_ROLES.includes(hr as HqRole)) setHqRole(hr as HqRole);
    if (ppg && PLATFORM_PAGES.includes(ppg as PlatformPage)) setPlatformPage(ppg as PlatformPage);
    // Drawer is a wide string-literal union (~150 ids); we trust the URL
    // rather than enumerating a runtime list. If the id is unknown,
    // DrawerRoot's switch falls through and renders nothing — same as a
    // closed drawer. Payload survives only if it's JSON-serializable
    // primitives (the common case: string ids, numbers, booleans).
    if (dr) {
      let payload: Record<string, unknown> | undefined;
      if (drp) {
        try {
          const parsed = JSON.parse(drp);
          if (parsed && typeof parsed === "object") payload = parsed as Record<string, unknown>;
        } catch {
          // ignore malformed payload — open the drawer empty
        }
      }
      setDrawer({ drawerId: dr as DrawerId, payload });
    }
  }, []);

  // Persist to URL (replace, not push). Only sync the dimensions relevant to
  // the active surface to keep URLs short and shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("surface", surface);
    if (surface === "workspace") {
      params.set("plan", plan);
      params.set("role", role);
      params.set("entityType", entityType);
      params.set("alsoTalent", String(alsoTalent));
      params.set("page", page);
    } else if (surface === "talent") {
      params.set("talentPage", talentPage);
    } else if (surface === "client") {
      params.set("clientPlan", clientPlan);
      params.set("clientPage", clientPage);
    } else if (surface === "platform") {
      params.set("hqRole", hqRole);
      params.set("platformPage", platformPage);
    }
    // Drawer (cross-surface): persist the open drawer + JSON-encoded
    // payload of primitives. Skipped if no drawer is open so closed-state
    // URLs stay clean.
    if (drawer.drawerId) {
      params.set("drawer", drawer.drawerId);
      if (drawer.payload && Object.keys(drawer.payload).length > 0) {
        try {
          // Strip non-serializable values (functions, undefined). JSON.stringify
          // already drops them, so we only need to guard against circular
          // references — rare in this prototype but cheap to handle.
          params.set("drawerPayload", JSON.stringify(drawer.payload));
        } catch {
          // omit payload silently
        }
      }
    }
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [
    surface,
    plan,
    role,
    entityType,
    alsoTalent,
    page,
    talentPage,
    clientPlan,
    clientPage,
    hqRole,
    platformPage,
    drawer,
  ]);

  // Drawer history stack — supports a "back" affordance in nested
  // drawer flows. Push the *current* drawer onto the stack whenever a
  // new drawer is opened on top of it; pop on close. Reset whenever a
  // drawer is opened from a closed state.
  const [drawerStack, setDrawerStack] = useState<DrawerContext[]>([]);
  const openDrawer = useCallback(
    (id: DrawerId, payload?: Record<string, unknown>) => {
      setDrawer((current) => {
        // If a drawer is already open and we're switching to a different
        // one, push the current one onto the back-stack.
        if (current.drawerId && current.drawerId !== id) {
          setDrawerStack((s) => [...s, current]);
        }
        return { drawerId: id, payload };
      });
    },
    [],
  );
  const closeDrawer = useCallback(() => {
    setDrawer({ drawerId: null });
    setDrawerStack([]);
  }, []);
  /**
   * Pop the back-stack and reopen the previous drawer. If the stack is
   * empty this is a no-op; the consumer should hide the back affordance
   * in that case.
   */
  const popDrawer = useCallback(() => {
    setDrawerStack((s) => {
      if (s.length === 0) return s;
      const prev = s[s.length - 1]!;
      setDrawer(prev);
      return s.slice(0, -1);
    });
  }, []);

  const openUpgrade = useCallback((offer: Omit<UpgradeOffer, "open">) => {
    setUpgrade({ open: true, ...offer });
  }, []);
  const closeUpgrade = useCallback(() => {
    setUpgrade({ open: false });
  }, []);

  const toast = useCallback((message: string, opts?: { undo?: () => void }) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, undo: opts?.undo }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, opts?.undo ? 5000 : 2400); // undo toasts stay longer
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const completeTask = useCallback((id: string) => {
    setCompletedTasks((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  // When surface changes, reset to a sensible default page for that surface.
  const handleSetSurface = useCallback((s: Surface) => {
    setSurface(s);
    if (s === "workspace") setPage("overview");
    if (s === "talent") setTalentPage("today");
    if (s === "client") setClientPage("today");
    if (s === "platform") setPlatformPage("today");
    setDrawer({ drawerId: null });
  }, []);

  // Hybrid-mode toggle. Only meaningful for a user who is BOTH talent and
  // workspace owner. Flips between the two surfaces, preserving the rest of
  // the state shape. The reset-to-default-page rule from handleSetSurface
  // is intentional — switching modes implies switching context.
  const flipMode = useCallback(() => {
    if (!alsoTalent) return; // gated to hybrid users only
    if (surface === "talent") {
      handleSetSurface("workspace");
    } else if (surface === "workspace") {
      handleSetSurface("talent");
    }
  }, [alsoTalent, surface, handleSetSurface]);

  // Impersonation: HQ user starts viewing a tenant's workspace. We jump to
  // the workspace surface in read-only mode, with a banner overlay (rendered
  // by SurfaceRouter when state.impersonating is set).
  const startImpersonation = useCallback(
    (i: NonNullable<Impersonation>) => {
      setImpersonating(i);
      setSurface("workspace");
      setPlan(i.asPlan);
      setRole(i.asRole);
      setEntityType(i.asEntityType);
      setPage("overview");
      setDrawer({ drawerId: null });
    },
    [],
  );
  const stopImpersonation = useCallback(() => {
    setImpersonating(null);
    setSurface("platform");
    setPlatformPage("tenants");
    setDrawer({ drawerId: null });
  }, []);

  const value: Ctx = useMemo(
    () => ({
      state: {
        surface,
        plan,
        role,
        entityType,
        alsoTalent,
        page,
        talentPage,
        clientPlan,
        clientPage,
        hqRole,
        platformPage,
        impersonating,
        drawer,
        upgrade,
        toasts,
        completedTasks,
        density,
      },
      setSurface: handleSetSurface,
      flipMode,
      setPlan,
      setRole,
      setEntityType,
      setAlsoTalent,
      setDensity,
      setPage,
      setTalentPage,
      setClientPlan,
      setClientPage,
      setHqRole,
      setPlatformPage,
      startImpersonation,
      stopImpersonation,
      openDrawer,
      closeDrawer,
      popDrawer,
      drawerStack,
      openUpgrade,
      closeUpgrade,
      toast,
      dismissToast,
      completeTask,
    }),
    [
      surface,
      plan,
      role,
      entityType,
      alsoTalent,
      page,
      talentPage,
      clientPlan,
      clientPage,
      hqRole,
      platformPage,
      impersonating,
      drawer,
      drawerStack,
      upgrade,
      toasts,
      completedTasks,
      density,
      setDensity,
      handleSetSurface,
      flipMode,
      startImpersonation,
      stopImpersonation,
      openDrawer,
      closeDrawer,
      popDrawer,
      openUpgrade,
      closeUpgrade,
      toast,
      dismissToast,
      completeTask,
    ],
  );

  return <ProtoContext.Provider value={value}>{children}</ProtoContext.Provider>;
}

export function useProto(): Ctx {
  const v = useContext(ProtoContext);
  if (!v) throw new Error("useProto outside ProtoProvider");
  return v;
}

// ─── Helpers ─────────────────────────────────────────────────────────

export function getRoster(plan: Plan): TalentProfile[] {
  return plan === "free" ? ROSTER_FREE : ROSTER_AGENCY;
}

export function getInquiries(plan: Plan): Inquiry[] {
  return plan === "free" ? INQUIRIES_FREE : INQUIRIES_AGENCY;
}

export function getClients(plan: Plan): Client[] {
  return plan === "free" ? CLIENTS_FREE : CLIENTS_AGENCY;
}

export function getTeam(plan: Plan): TeamMember[] {
  return plan === "free" ? TEAM_FREE : TEAM_AGENCY;
}

// Visual tokens used by both _primitives and _pages and _drawers
export const COLORS = {
  // Surfaces
  surface: "#FAFAF7",
  /** Neutral warm-gray wash. Replaces the old cream. Used by hero / starter cards. */
  surfaceAlt: "#F2F2EE",
  card: "#FFFFFF",

  // Ink
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",

  // Borders — borderStrong is for hover/active card states
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  borderStrong: "rgba(24,24,27,0.20)",

  // Accent — deep forest. Replaces the old brass-gold. Used for primary CTAs,
  // the "Gold" trust tier (still called Gold internally; the metaphor is
  // "trusted / verified ascendant," not bling), and any "premium / trusted"
  // accent moment. See feedback_admin_aesthetics.md — gold/rust accents were
  // explicitly flagged as a recurring problem.
  accent: "#0F4F3E",
  accentDeep: "#093328",
  accentSoft: "rgba(15,79,62,0.10)",

  // Status
  green: "#2E7D5B",
  // Cautionary/in-progress. Was a warm gold (#C68A1E) — flagged repeatedly
  // as gold/rust drift. Shifted to a muted slate so soft warnings read as
  // "attention" without competing with the forest accent or carrying any
  // luxury connotation. See feedback_admin_aesthetics.md.
  amber: "#52606D",
  red: "#B0303A",
  // Coral — needs-action / soft warning, warmer than slate. Different
  // from gold/rust per the design memo; reads as "incomplete, touch
  // me" without luxury connotations. Use for: incomplete profile,
  // pending offers, awaiting action.
  coral: "#C26A45",
  coralSoft: "rgba(194,106,69,0.10)",
  coralDeep: "#7A4128",
  // Indigo — insights / analytics / metrics. Cool counterpoint to
  // forest. Use for: profile views, conversion stats, anything
  // "informational" not "actionable".
  indigo: "#5B6BA0",
  indigoSoft: "rgba(91,107,160,0.10)",
  indigoDeep: "#3F4870",

  // ─── Semantic system (additive — see docs/admin-redesign/color-system.md) ──
  // The product's color language has 9 roles. Hue = identity, intensity = volume.
  // Default to soft fills + medium text. Step up only when consequence demands.
  //
  //   brand     forest   identity / wayfinding / primary CTA / focus rings
  //                     → ≤5 hits per screen. NOT a "good" signal.
  //   success   sage     completed / paid / confirmed / approved
  //                     → distinct from brand so forest stops doing double duty.
  //   caution   slate    needs attention, no risk (drafts, missing fields)
  //   coral     coral    soft urgency, "your move" (awaiting reply, expiring)
  //   critical  red      destructive / broken / irreversible
  //                     → 0–1 hits per WEEK for typical user. Rarity = meaning.
  //   info      indigo   analytics / in-flight / system messaging
  //   royal     violet   paid tier / AI assist / unlock — premium without bling.
  //                     Replaces the gold instinct that doesn't fit the brand.
  //   locked    NO HUE   tier-gated / archived → muted ink + lock icon.
  //                     Locked is opportunity, not error. Hover reveals royal.
  //   focus     brand    keyboard ring — always brand, regardless of element.

  // Brand alias — same value as `accent`, semantic name. Migrate at use site.
  brand: "#0F4F3E",
  brandSoft: "rgba(15,79,62,0.10)",
  brandDeep: "#093328",

  // Success — sage, currently same hex as `green`. Aliased so callers can
  // express semantic intent. The role: completed/paid/confirmed/approved.
  success: "#2E7D5B",
  successSoft: "rgba(46,125,91,0.10)",
  successDeep: "#1F5D43",

  // Critical — same hex as `red`, semantic name. Aliased.
  critical: "#B0303A",
  criticalSoft: "rgba(176,48,58,0.10)",
  criticalDeep: "#7E1F26",

  // Royal — premium / elevated / paid tier / AI assist / unlock moments.
  // Deep cool violet. Distinct from indigo (info) — quality, not data.
  // Always paired with crown / sparkle iconography. Rare: 0–2 per screen.
  royal: "#5F4B8B",
  royalSoft: "rgba(95,75,139,0.10)",
  royalDeep: "#3D2F61",

  // Elevation
  shadow: "0 1px 2px rgba(11,11,13,0.04)",
  shadowHover: "0 6px 18px rgba(11,11,13,0.08)",

  navyBg: "#0B0B0D",
};

/**
 * Border-radius scale. Was scattered across 8/9/10/12/14/16 in the
 * prototype before this lived. Pick one tier per use case:
 *   sm  — chips, inline pills, small inputs
 *   md  — buttons, dense cards
 *   lg  — cards, modals
 *   xl  — hero / spotlight cards
 */
export const RADIUS = { sm: 7, md: 10, lg: 12, xl: 16 } as const;

/**
 * Vertical-rhythm spacing scale. Replace magic-number `<div height: N>`
 * spacers with `SPACE.section` and friends.
 */
export const SPACE = {
  /** Between dense sibling cards in a tight strip. */
  tight: 8,
  /** Default gap between siblings. */
  block: 12,
  /** Between a hero metric strip and the rich panels below. */
  group: 24,
  /** Between top-level page sections. */
  section: 32,
} as const;

/**
 * Z-index ladder. Tight bands (40-80) collide easily as new layers get
 * added — this scale leaves 100-unit gaps between purposes so future
 * components can slot in without renumbering. Order is bottom → top.
 */
export const Z = {
  topbar: 40,
  controlBar: 100,
  drawerBackdrop: 200,
  drawerPanel: 210,
  modalBackdrop: 300,
  modalPanel: 310,
  toast: 400,
} as const;

export const FONTS = {
  // Display = clean modern sans (Geist), loaded globally via next/font in src/app/layout.tsx.
  // The prototype intentionally drops the editorial serif (Cormorant Garamond) — admin
  // dashboards read better in a neutral SaaS-grade sans. Page H1, drawer titles, and
  // hero numbers still use FONTS.display, but the visual register is now sans-serif.
  display:
    'var(--font-geist-sans), "Inter", -apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
  body: '"Inter", system-ui, sans-serif',
  mono: 'ui-monospace, "SF Mono", Menlo, monospace',
};
