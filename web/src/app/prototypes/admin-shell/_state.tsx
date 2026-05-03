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
import type { ToastTone } from "./_primitives";
// Type-only import — `_data-bridge.ts` is a server-only module guarded
// by `import "server-only"`. The `import type` form is erased at compile
// time and emits no runtime JS, so the client bundle stays clean.
import type { BridgeData } from "./_data-bridge";

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
// WS-3.1 — Consolidated from 9 → 6 pages.
// Legacy names (inbox, work, site, billing, workspace) kept in the union
// for URL backward-compat; they are NOT shown in the sidebar nav.
// WS-3.6 — URL aliases: inbox→messages, work→messages, talent→roster,
//           site→settings, billing→settings, workspace→settings.
export type WorkspacePage =
  | "overview"
  | "messages"   // replaces inbox + absorbs work as a "By stage" view filter
  | "calendar"
  | "roster"     // replaces talent
  | "clients"
  | "operations" // WS-19/20: analytics + workflow automation
  | "production" // WS-28/29/30/33/34/35: casting, crew, on-set, rights, safety
  | "website"    // 2026 — premium site management (pages, posts, redirects, custom code, tracking, SEO, domain, maintenance, announcement)
  | "settings"   // replaces workspace; billing folded in via anchor nav
  // ── legacy aliases (hidden from nav, kept for URL compat) ──
  | "inbox"
  | "work"
  | "talent"
  | "site"
  | "billing"
  | "workspace";

// Talent surface — relationship-based (no separate plan ladder; talent inherits
// the agency they belong to). Keep dimensions minimal: which agency, which page.
export type TalentPage =
  | "today"
  | "messages"      // Chat-first inquiry/booking surface (replaces inbox)
  | "profile"
  | "inbox"         // Legacy list view — kept for URL compat, not in nav
  | "calendar"
  | "activity"      // Legacy — kept for URL compat; nav routes to settings tab
  | "reach"         // Legacy — kept for URL compat; nav routes to agencies
  | "agencies"      // WS-8.2: split from reach
  | "public-page"   // WS-8.2: split from reach (personal page editor)
  | "settings";

// Client surface — its own plan ladder. Free is browse-only, Pro adds active
// outbound inquiry & shortlists, Enterprise adds team + integrations.
export type ClientPlan = "free" | "pro" | "enterprise";
export type ClientPage =
  | "today"
  | "messages"      // Chat-first inquiry/booking surface (mirrors talent)
  | "discover"
  | "shortlists"
  | "inquiries"     // Legacy list view — kept for URL compat
  | "bookings"
  | "notifications" // #15 — real notifications surface (was a drawer)
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
// WS-3.1 — The 6 canonical nav pages. Legacy aliases excluded.
export const WORKSPACE_PAGES: WorkspacePage[] = [
  "overview",
  "messages",
  "calendar",
  "roster",
  "clients",
  "operations",
  "production",
  "website",   // 2026 — premium site management (pages, posts, redirects, custom code, tracking, SEO, domain). Sits between Production and Settings.
  "settings",
];

// WS-3.6 — resolve a legacy URL alias to its canonical page.
export function resolveWorkspacePage(raw: string): WorkspacePage {
  const aliases: Record<string, WorkspacePage> = {
    inbox:     "messages",
    work:      "messages",
    talent:    "roster",
    site:      "website",   // 2026 — legacy /site URL now lands on the new Website page
    billing:   "settings",
    workspace: "settings",
  };
  return (aliases[raw] as WorkspacePage | undefined) ?? (raw as WorkspacePage) ?? "overview";
}
// Messages replaces Inbox as the canonical chat-first surface. Inbox
// stays in the type union for URL backward-compat but is hidden from
// the topbar nav.
// WS-8.1: activity removed from primary nav; WS-8.2: reach split into agencies + public-page
export const TALENT_PAGES: TalentPage[] = [
  "today",
  "messages",
  "profile",
  "calendar",
  "agencies",
  "public-page",
  "settings",
];
// Messages replaces Inquiries as the canonical chat-first surface for
// clients (mirrors talent). Inquiries remains for URL compat.
export const CLIENT_PAGES: ClientPage[] = [
  "today",
  "messages",
  "discover",
  "shortlists",
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
 * Canonical absolute date format. "15 Apr" in current year, "15 Apr 2024"
 * otherwise. Use for shoot dates, deadlines, and any date that needs to
 * be unambiguous rather than relative.
 */
export function fmtDate(date: Date | string | number, now: Date = new Date()): string {
  const d = typeof date === "string" || typeof date === "number" ? new Date(date) : date;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: sameYear ? undefined : "numeric",
  });
}

/**
 * Canonical money format. Always EUR (€), no decimals for whole amounts.
 * "€4,200" not "€4200.00" or "4.200 €".
 */
export function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("en-EU", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
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

// WS-3.2 — canonical page metadata.  Legacy aliases included so code that
// still references them doesn't throw; they redirect immediately in nav.
export const PAGE_META: Record<WorkspacePage, { label: string; icon: string; description?: string }> = {
  // ── canonical 6 ──
  overview:  { label: "Overview",  icon: "home",     description: "Today's snapshot: unread, pending actions, recent activity" },
  messages:  { label: "Messages",  icon: "mail",     description: "All threads across active inquiries and bookings" },
  calendar:  { label: "Calendar",  icon: "calendar", description: "Scheduled shoots, holds, and deadlines" },
  roster:    { label: "Roster",    icon: "users",    description: "Your talent, availability, and performance" },
  clients:   { label: "Clients",   icon: "briefcase", description: "Client accounts, trust tiers, and booking history" },
  operations:{ label: "Operations",icon: "layers",   description: "Analytics, queues, SLAs, automations, and team workload" },
  production:{ label: "Production",icon: "camera",   description: "Casting, crew bookings, call sheets, rights, and safety" },
  website:   { label: "Website",   icon: "globe",    description: "Pages, posts, redirects, custom code, tracking, SEO, domain" },
  settings:  { label: "Settings",  icon: "settings", description: "Account, plan, branding, integrations, team, and danger zone" },
  // ── legacy aliases (hidden from nav) ──
  inbox:     { label: "Inbox",     icon: "mail" },
  work:      { label: "Workflow",  icon: "layers" },
  talent:    { label: "Talent",    icon: "users" },
  site:      { label: "Public site", icon: "globe" },
  billing:   { label: "Billing",   icon: "credit-card" },
  workspace: { label: "Settings",  icon: "settings" },
};

export const TALENT_PAGE_META: Record<TalentPage, { label: string }> = {
  today:       { label: "Today" },
  messages:    { label: "Messages" },
  profile:     { label: "Profile" },
  inbox:       { label: "Inbox" },         // legacy
  calendar:    { label: "Calendar" },
  activity:    { label: "Activity" },      // legacy — redirects to settings
  reach:       { label: "Reach" },         // legacy — redirects to agencies
  agencies:    { label: "Agencies" },      // WS-8.2
  "public-page": { label: "Public page" }, // WS-8.2
  settings:    { label: "Settings" },
};

export const CLIENT_PAGE_META: Record<ClientPage, { label: string }> = {
  today: { label: "Today" },
  messages: { label: "Messages" },
  discover: { label: "Discover" },
  shortlists: { label: "Shortlists" },
  inquiries: { label: "Inquiries" },
  bookings: { label: "Bookings" },
  notifications: { label: "Notifications" },
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
  | "talent-types"   // Phase 2 — workspace taxonomy settings
  | "talent-registration" // Phase 3 — mobile-first talent registration wizard
  | "talent-profile-shell" // Phase 4 — full talent profile builder (admin + talent self-edit)
  | "talent-approvals"     // Phase H — admin approval queue for pending registrations
  | "plan-billing"
  | "talent-profile"
  | "inquiry-peek"
  | "booking-peek"
  | "new-inquiry"
  | "new-booking"
  | "new-talent"
  // WS-25.2 — Bulk client import via CSV (mirrors talent import)
  | "client-csv-bulk-add"
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
  | "field-privacy"
  | "trust-verification-queue"
  | "trust-disputed-claims"
  | "platform-verification-methods"
  | "talent-trust-detail"
  | "talent-claim-invite"
  | "talent-phone-verify"
  | "talent-id-verify"
  | "talent-business-verify"
  | "talent-domain-verify"
  | "talent-payment-verify"
  | "taxonomy"
  | "workspace-settings"
  | "client-profile"
  | "site-health"
  | "team-activity"
  | "talent-activity"
  | "my-activity"
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
  // — Final 21 push: D3 tax + E2/E4/E5 strategic + X6 network plan + F8 archive
  | "talent-tax-docs"
  | "talent-conflict-resolve"
  | "talent-network"
  | "talent-voice-reply"
  | "talent-multi-agency-picker"
  | "talent-chat-archive"
  | "talent-receive-review"     // WS-8.13 — after-booking rating prompt
  | "talent-agency-analytics"   // WS-8.14 — top agencies by booking volume
  | "talent-career-analytics"   // WS-8.5  — quarterly career stats
  // — Audit r3: reply templates (#53)
  | "reply-templates"
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
  | "client-review"
  | "client-booking-detail"
  | "client-contracts"
  | "client-team"
  | "client-billing"
  | "client-brand-switcher"
  | "client-settings"
  | "client-quick-question"
  | "client-my-talent"        // WS-8.9  — repeat bookings + quick-rebook
  | "client-spend-report"     // WS-8.11 — spend by talent / by agency
  | "client-budget"           // WS-8.12 — budget cap + alert threshold
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
  | "day-detail"
  | "inbox-snippets"
  | "notifications-prefs"
  | "data-export"
  | "audit-log"
  | "tenant-switcher"
  | "talent-share-card"
  | "whats-new"
  | "help"
  // ── WS-5 Money & Trust ──────────────────────────────────────────────
  | "client-trust-detail"    // WS-5.9 — trust-tier explanation + upgrade path
  | "escrow-detail"          // WS-5.1 — escrow state machine visualiser
  | "refund-flow"            // WS-5.3 — multi-party refund orchestration
  | "dispute-flow"           // WS-5.8 — chargeback / dispute resolution
  | "kyc-verification"       // WS-5.10 — talent ID upload + status
  | "proof-of-funds"         // WS-5.11 — client bank-link / wire verification
  | "payout-method-failure"  // WS-5.7 — IBAN / card recovery flow
  | "subscription-lifecycle" // WS-5.14 — trial → paid → pause → cancel + win-back
  // ── WS-11 Notifications ─────────────────────────────────────────────
  | "notification-detail"
  // ── WS-18 AI assist ─────────────────────────────────────────────────
  | "ai-draft-assist"
  | "ai-search-explain"
  | "ai-weekly-digest"
  // ── WS-19 Reporting & analytics ────────────────────────────────────
  | "workspace-revenue"
  | "conversion-funnel"
  | "top-performers"
  | "coordinator-workload"
  // ── WS-20 Operations & workflow ──────────────────────────────────────
  | "my-queue"            // coordinator's personal inquiry queue
  | "sla-timers"          // SLA breach monitor across all active inquiries
  | "rules-builder"       // automation rules engine
  | "saved-replies"       // saved reply templates for messaging
  | "vacation-handover"   // reassign workload during absence
  | "on-call-rotation"    // on-call schedule + escalation config
  // ── WS-21 Compliance, legal, audit ──────────────────────────────────
  | "gdpr-export"         // per-data-type GDPR / CCPA export
  | "consent-log"         // marketing consent log per channel + timestamp
  | "contract-templates"  // workspace contract template library
  | "report-content"      // report content / user flow → moderation queue
  // ── WS-22 Email + transactional comms ───────────────────────────────
  | "email-templates"     // email template catalog (30+ types)
  | "email-branding"      // workspace branded email customization
  | "email-sequences"     // onboarding / dunning / win-back sequence config
  | "notification-prefs"  // granular notification & email preference center
  // ── WS-23 Marketing & growth ────────────────────────────────────────
  | "invite-flow"         // invite talent / client / agency
  | "referral-dashboard"  // per-referrer dashboard + reward tiers
  | "calendar-sync"       // iCal URL + Google / Outlook two-way sync
  | "system-status"       // Tulala public status page + incident log
  // ── WS-24 Quality & release engineering ─────────────────────────────
  | "telemetry-dashboard" // prod metrics: errors, Web Vitals, event funnel
  | "beta-program"        // feature flag cohort enrollment + rollout %
  // ── WS-25 Bulk operations + migration ───────────────────────────────
  | "csv-import"          // CSV import for talent / clients with column mapping
  | "migration-assistant" // AI-assisted Excel / WhatsApp migration
  // ── WS-26 Brand & creative tools ────────────────────────────────────
  | "brief-builder"       // client brief authoring: scope, dates, deliverables
  | "brand-assets"        // workspace brand-asset library
  | "approval-flow"       // multi-stakeholder brief / booking approval
  // ── WS-27 Site & page-builder management ────────────────────────────
  | "site-context-switcher" // multi-context site picker (agency/talent/hub)
  | "page-scheduler"      // schedule page publish/unpublish
  // ── WS-28 Casting director ──────────────────────────────────────────
  | "casting-flow"        // open/closed casting with multi-round callbacks
  | "callback-tracker"    // per-round talent status + structured feedback
  // ── WS-29 Production team & multi-discipline bookings ───────────────
  | "crew-booking"        // multi-resource booking (talent + crew + studio)
  | "production-timeline" // shoot day call-sheet and timeline
  // ── WS-30 Image rights & post-booking lifecycle ──────────────────────
  | "usage-tracker"       // licensed usage per booking: region, media, expiry
  | "relicense-flow"      // extend or re-license usage after expiry
  // ── WS-31 Account lifecycle ─────────────────────────────────────────
  | "ownership-transfer"  // transfer workspace to new owner with audit trail
  | "minor-account"       // parent/guardian co-pilot account for under-18 talent
  // ── WS-32 Discovery & marketplace ────────────────────────────────────
  | "discovery-feed"      // trending talent + editor's picks curation
  | "avail-search"        // date-aware geo + availability search
  // ── WS-33 On-set / production-day live ───────────────────────────────
  | "call-sheet"          // live call sheet with check-in status
  | "onset-checkin"       // talent/crew check-in for shoot day
  // ── WS-34 Safety, disputes, incident handling ────────────────────────
  | "incident-report"     // on-set incident report + whistleblower channel
  | "dispute-resolution"  // dispute stages: Filed → Mediation → Decision
  // ── WS-35 Production-feature reconciliation ──────────────────────────
  | "locations-drawer"    // shoot locations, studios, recurring venues
  | "ai-workspace"        // AI workspace: provider registry + usage controls
  // ── Feature controls ─────────────────────────────────────────────────
  | "feature-controls"    // agency-admin on/off toggles for every platform feature
  // ── Talent circle ────────────────────────────────────────────────────
  | "circle-manage"       // talent's personal circle of trusted collaborators
  | "circle-recommend"    // recommend a circle member into a booking
  // ── Phase E workspace field settings ─────────────────────────────────
  | "workspace-field-settings"  // per-tenant field catalog customisation
  // ── Phase B workspace profile shell ──────────────────────────────────
  | "workspace-profile";        // workspace own identity / branding summary

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
  | "system"
  /** Agency identity — messages attributed to the workspace rather than
   *  a specific staff member. Used for system-attributed coordinator messages
   *  in the canonical inquiry model and workspace AI-drafted replies. */
  | "workspace";

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
  // WS-1.E — system messages that need an immediate action from the user.
  // Renders a coral inline-banner with a "Resolve →" CTA below the message.
  requiresAction?: boolean;
  requiresActionLabel?: string; // e.g. "Review offer before it expires" — defaults to body
  requiresActionCta?: string;   // e.g. "Review offer" — defaults to "Resolve →"
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
  // WS-1.F.2 — last-said snippet for roster cards in group thread header
  talents: {
    name: string;
    thumb: string;
    status: LineItemStatus;
    lastSaidTs?: string;
    lastSaidSnippet?: string;
  }[];
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
  /** Whether this inquiry has been seen by the viewing coordinator.
   *  false = brand-new, requires "new" badge in the inbox sort tier.
   *  undefined = pre-seen-model data (treated as seen). */
  seen?: boolean;
};

// ═══════════════════════════════════════════════════════════════════════
// CANONICAL INQUIRY MODEL — the foundation that every shell consumes.
//
// Why this exists: the prototype historically grew three parallel models
// (`RichInquiry` for workspace, `Conversation` for talent/client, plus
// the offer mocks) and two parallel creation drawers (client-send-inquiry
// vs admin "New inquiry"). The result was field drift, hand-rolled
// per-pov panels, and the impossible task of unifying the shell.
//
// `Inquiry` is the canonical record. Every shell — workspace, talent,
// client — renders the same model, only the *face* changes by pov. The
// same record evolves into the booking shell (status flips to "booked",
// tab config swaps; data persists).
//
// Migration strategy: define here, expose `toInquiry(rich)` adapter so
// existing UI keeps working unchanged while new UI consumes `Inquiry`
// directly. We retire `RichInquiry` once the last consumer is migrated.
// ═══════════════════════════════════════════════════════════════════════

export type InquiryUnitType = "hour" | "day" | "contract" | "event";

export type InquirySourceKind = "client_form" | "workspace_manual" | "hub" | "agency_referral";

export type InquiryStatus =
  | "draft"             // creator hasn't sent yet
  | "submitted"         // sent, no coordinator action
  | "coordinating"      // coordinator working it
  | "offer_pending"     // offer with client
  | "offer_countered"   // counter in flight
  | "approved"          // client approved offer
  | "booked"            // converted to booking
  | "wrapped"           // post-shoot
  | "rejected" | "expired" | "cancelled";

export type InquiryClientRef = {
  id: string;
  name: string;             // brand or person name
  contactName?: string;     // primary contact at the client
  email?: string;
  phone?: string;
  trust?: ClientTrustLevel;
};

export type InquiryCoordinatorRef = {
  id: string;
  name: string;
  initials: string;
  role: "owner" | "coordinator";   // owner = workspace admin acting as coord
  alsoTalentId?: string;            // when a talent is also coordinator
};

export type InquiryTalentInvite = {
  talentId: string;
  name: string;
  initials: string;
  /** Photo URL — for showing the actual face in lineup strips +
   *  drawers. Falls back to initials in Avatar when absent. */
  photoUrl?: string;
  state: "invited" | "selected" | "hold" | "confirmed" | "declined" | "withdrawn";
  // The talent's own private offer row — only visible to that talent,
  // any coordinator on this inquiry, and workspace admin.
  myRow?: {
    unitType: InquiryUnitType;
    units: number;
    costRate: number;        // their take-home
    clientRate: number;      // what client pays for this row
    notes?: string;
    status: "pending" | "submitted" | "approved" | "countered" | "declined";
  };
};

export type InquirySchedule = {
  start: string;              // ISO date or human label ("May 6")
  end?: string;
  callTime?: string;
  wrapTime?: string;
  flexible?: boolean;
  timezone?: string;
};

export type InquiryLocation = {
  mode: "on_site" | "remote" | "travel" | "tbc";
  city?: string;
  venue?: string;
  address?: string;
  mapUrl?: string;
};

export type InquiryBrief = {
  summary: string;            // headline brief — "3 promo models for a beach club launch"
  notes?: string;             // long-form
  requirements?: string[];    // wardrobe / language / skill
  deliverables?: string[];
  files: { name: string; size: string; addedBy: string; addedAt: string }[];
};

export type InquiryClientBudget = {
  amount: number;
  currency: string;
  unitType: InquiryUnitType;
  perPerson?: boolean;        // when true, amount is per-talent, not group total
  note?: string;
};

export type InquiryTimelineEvent = {
  id: string;
  ts: string;
  actor: string;
  body: string;
  tone?: "default" | "success" | "warn" | "info";
  /** Set when this same event should also surface as a system message in chat. */
  surfaceInChat?: boolean;
  /** Which thread to post into when surfacing. */
  surfaceThread?: "client" | "talent" | "internal";
};

export type InquiryRecord = {
  id: string;
  source: { kind: InquirySourceKind; label?: string };
  status: InquiryStatus;
  createdBy: { id: string; name: string };
  createdAt: string;

  title: string;              // project name — "Spring lookbook"
  category?: string;
  client: InquiryClientRef;

  coordinators: InquiryCoordinatorRef[];   // 1–2 active
  talent: InquiryTalentInvite[];

  schedule: InquirySchedule;
  location: InquiryLocation;
  brief: InquiryBrief;

  budget?: InquiryClientBudget;            // null = no budget given, talent proposes
  // Aggregated offer state, derived from talent rows + agency fee + coord %.
  // The detailed shape lives in _messages.tsx alongside OfferTab to keep
  // commerce concerns there; this is the index pointer.
  offerStage?:
    | "no_offer" | "client_budget" | "awaiting_talent" | "talent_submitted"
    | "coordinator_review" | "sent" | "reviewing" | "countered"
    | "accepted" | "rejected" | "expired";
  agencyFee?: number;
  coordinatorPct?: number;
  expiresInHours?: number;

  threads: {
    client: string;             // thread ids → message store
    talentGroup: string;
    internal?: string;
  };
  timeline: InquiryTimelineEvent[];
};

/**
 * Adapter: lift an existing `RichInquiry` into the canonical `Inquiry`
 * shape so the new shell components can consume both the legacy mocks
 * and the new model uniformly. Lossy in some legacy cases (e.g. legacy
 * `requirementGroups` collapse into talent invites); good enough for
 * the prototype until we retire RichInquiry entirely.
 */
export function toInquiry(rich: RichInquiry): InquiryRecord {
  const talent: InquiryTalentInvite[] = (rich.requirementGroups ?? [])
    .flatMap((g) => g.talents ?? [])
    .map((t, i) => ({
      talentId: `${rich.id}-t-${i}`,
      name: t.name,
      initials: t.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase(),
      photoUrl: t.thumb,
      state:
          t.status === "accepted"  ? "confirmed"
        : t.status === "declined"  ? "declined"
        : t.status === "superseded" ? "withdrawn"
        : "invited",
    }));

  const status: InquiryStatus =
      rich.stage === "submitted"      ? "submitted"
    : rich.stage === "coordination"   ? "coordinating"
    : rich.stage === "offer_pending"  ? "offer_pending"
    : rich.stage === "approved"       ? "approved"
    : rich.stage === "booked"         ? "booked"
    : rich.stage === "rejected"       ? "rejected"
    : rich.stage === "expired"        ? "expired"
    : "submitted";

  const coordinators: InquiryCoordinatorRef[] = rich.coordinator
    ? [{
        id: rich.coordinator.id,
        name: rich.coordinator.name,
        initials: rich.coordinator.name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase(),
        role: "coordinator",
      }]
    : [];

  return {
    id: rich.id,
    source: { kind: rich.source.kind === "hub" ? "hub" : "agency_referral" },
    status,
    createdBy: { id: "client", name: rich.clientName },
    createdAt: `${rich.ageDays}d ago`,
    title: rich.brief,
    client: {
      id: rich.clientName.toLowerCase().replace(/\s+/g, "-"),
      name: rich.clientName,
      trust: rich.clientTrust,
    },
    coordinators,
    talent,
    schedule: { start: rich.date ?? "TBC" },
    location: rich.location
      ? { mode: "on_site", city: rich.location.split(" · ")[0], venue: rich.location.split(" · ")[1] }
      : { mode: "tbc" },
    brief: { summary: rich.brief, files: [] },
    budget: rich.offer?.total
      ? { amount: parseInt(String(rich.offer.total).replace(/\D/g, ""), 10) || 0,
          currency: "EUR", unitType: "contract" }
      : undefined,
    offerStage:
        rich.stage === "offer_pending" ? "sent"
      : rich.stage === "approved"      ? "accepted"
      : rich.stage === "booked"        ? "accepted"
      : rich.stage === "rejected"      ? "rejected"
      : rich.stage === "expired"       ? "expired"
      : "no_offer",
    threads: { client: `${rich.id}:client`, talentGroup: `${rich.id}:talent` },
    timeline: (rich.messages ?? []).slice(0, 8).map((m, i) => ({
      id: `${rich.id}-tl-${i}`,
      ts: m.ts,
      actor: m.senderName,
      body: m.body.slice(0, 120),
    })),
  };
}

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
    agencyName: "Atelier Roma",
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
          { name: "Marta Reyes",   thumb: "https://i.pravatar.cc/200?img=5", status: "accepted", lastSaidTs: "Mon 17:22", lastSaidSnippet: "All clear from me — happy to confirm." },
          { name: "Tomás Navarro", thumb: "https://i.pravatar.cc/200?img=12", status: "pending",  lastSaidTs: "Tue 10:01", lastSaidSnippet: "Checking my schedule — back in 1h." },
          // WS-31.6 demo — Lina is 16 (see ROSTER_AGENCY t4). Inquiry workspace
          // surfaces MinorProtectionBanner the moment her row is added.
          { name: "Lina Park",     thumb: "https://i.pravatar.cc/200?img=47", status: "pending" },
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
      {
        id: "m6",
        threadType: "group",
        senderName: "Tomás Navarro",
        senderInitials: "TN",
        senderRole: "talent",
        body: "Checking my schedule — back in 1h.",
        ts: "Tue 10:01",
      },
      // WS-1.E — requiresAction: talent hold deadline requires coordinator action
      {
        id: "m7",
        threadType: "group",
        senderName: "System",
        senderInitials: "SY",
        senderRole: "system",
        body: "Hold deadline for Tomás Navarro expires in 4 hours. Confirm or release.",
        ts: "Tue 11:30",
        requiresAction: true,
        requiresActionLabel: "Hold deadline expires in 4 hours — confirm or release Tomás.",
        requiresActionCta: "Manage hold",
      },
      // WS-1.E — requiresAction: client side — offer expiry
      {
        id: "m8",
        threadType: "private",
        senderName: "System",
        senderInitials: "SY",
        senderRole: "system",
        body: "The offer expires in 24 hours. The client hasn't responded yet.",
        ts: "Tue 11:30",
        requiresAction: true,
        requiresActionLabel: "Offer expires in 24 hours — nudge the client or extend the deadline.",
        requiresActionCta: "Nudge client",
      },
    ],
  },
  {
    id: "RI-202",
    agencyName: "Atelier Roma",
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
          { name: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", status: "accepted" },
          { name: "Lina Park", thumb: "https://i.pravatar.cc/200?img=47", status: "accepted" },
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
        { talentName: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", role: "talent", fee: "€3,200", status: "accepted" },
        { talentName: "Lina Park", thumb: "https://i.pravatar.cc/200?img=47", role: "talent", fee: "€2,800", status: "accepted" },
        { talentName: "Yuna Park", thumb: "https://i.pravatar.cc/200?img=20", role: "talent", fee: "€1,400", status: "pending" },
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
        senderName: "Martina Greco",
        senderInitials: "MG",
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
    agencyName: "Atelier Roma",
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
        talents: [{ name: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", status: "accepted" }],
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
        { talentName: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", role: "talent", fee: "€8,200", status: "accepted" },
      ],
      history: [
        { version: 1, total: "€6,400", sentAt: "6d ago", note: "Initial offer — standard day rate" },
        { version: 2, total: "€9,500", sentAt: "4d ago", note: "Client counter — added usage rights" },
      ],
    },
    bookingId: "BK-203",
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
        body: "Marta — Bvlgari is a YES. Locking the booking now. Call sheet by EOD.",
        ts: "Today 12:00",
        isYou: true,
      },
      {
        id: "m33",
        threadType: "group",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Payment receiver set to Marta Reyes. Marta will distribute the agency commission off-platform.",
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
    agencyName: "Atelier Roma",
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
          { name: "Iris Volpe", thumb: "https://i.pravatar.cc/200?img=16", status: "accepted" },
          { name: "Léa Mercier", thumb: "https://i.pravatar.cc/200?img=47", status: "accepted" },
          { name: "Yuna Park", thumb: "https://i.pravatar.cc/200?img=44", status: "accepted" },
          { name: "Ola Brandt", thumb: "https://i.pravatar.cc/200?img=49", status: "accepted" },
          { name: "Rafa Ortega", thumb: "https://i.pravatar.cc/200?img=53", status: "pending" },
          { name: "—", thumb: "·", status: "pending" },
        ],
      },
      {
        id: "rg-204-model",
        role: "model",
        needed: 4,
        approved: 4,
        talents: [
          { name: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", status: "accepted" },
          { name: "Lina Park", thumb: "https://i.pravatar.cc/200?img=47", status: "accepted" },
          { name: "Tomás Navarro", thumb: "https://i.pravatar.cc/200?img=12", status: "accepted" },
          { name: "Zara Habib", thumb: "https://i.pravatar.cc/200?img=10", status: "accepted" },
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
    agencyName: "Atelier Roma",
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
        talents: [{ name: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", status: "accepted" }],
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
        { talentName: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", role: "talent", fee: "€3,400", status: "accepted" },
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

  // ── RI-206: submitted — just came in, no coordinator yet ─────────
  {
    id: "RI-206",
    agencyName: "Atelier Roma",
    clientName: "Valentino",
    clientTrust: "gold",
    brief: "SS26 campaign · 2 talent · 3 days",
    date: "Apr 29",
    location: "Paris · Rue du Faubourg",
    source: { kind: "direct", domain: "acme-models.com" },
    stage: "submitted",
    ageDays: 0,
    lastActivityHrs: 1,
    repeatBookings: 0,
    unreadPrivate: 1,
    unreadGroup: 0,
    nextActionBy: "coordinator",
    requirementGroups: [
      {
        id: "rg-206-talent",
        role: "talent",
        needed: 2,
        approved: 0,
        talents: [],
      },
    ],
    coordinator: null,
    offer: null,
    bookingId: null,
    messages: [
      {
        id: "m61",
        threadType: "private",
        senderName: "Chiara Fontana",
        senderInitials: "CF",
        senderRole: "client",
        body: "Hi — Valentino SS26, 3 days in Paris from Apr 29. We need 2 talents who can handle high-fashion editorial, ideally with runway experience. Budget is flexible for the right profiles.",
        ts: "Today 08:30",
      },
      {
        id: "m62",
        threadType: "private",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Inquiry received. A coordinator has been notified and will respond within 2 hours.",
        ts: "Today 08:31",
      },
    ],
  },

  // ── RI-207: rejected — turned down, schedule conflict ──────────────
  {
    id: "RI-207",
    agencyName: "Atelier Roma",
    clientName: "H&M",
    clientTrust: "verified",
    brief: "Online catalogue · 3 talent · 2 days",
    date: "Apr 15",
    location: "Stockholm · Studio Birk",
    source: { kind: "marketplace", platform: "Tulala marketplace" },
    stage: "rejected",
    ageDays: 12,
    lastActivityHrs: 288,
    repeatBookings: 1,
    unreadPrivate: 0,
    unreadGroup: 0,
    nextActionBy: null,
    requirementGroups: [
      {
        id: "rg-207-talent",
        role: "talent",
        needed: 3,
        approved: 0,
        talents: [
          { name: "Marta Reyes", thumb: "https://i.pravatar.cc/200?img=5", status: "declined" },
          { name: "Zara Habib", thumb: "https://i.pravatar.cc/200?img=10", status: "declined" },
        ],
      },
    ],
    coordinator: {
      id: "co-2",
      name: "Daniel Ferrer",
      initials: "DF",
      email: "daniel@acme-models.com",
      acceptedAt: "13d ago",
      isPrimary: true,
    },
    offer: null,
    bookingId: null,
    messages: [
      {
        id: "m71",
        threadType: "private",
        senderName: "Karin Svensson",
        senderInitials: "KS",
        senderRole: "client",
        body: "Hi — still interested in working together. Can we rebook for May?",
        ts: "Apr 14 16:00",
      },
      {
        id: "m72",
        threadType: "private",
        senderName: "Daniel Ferrer",
        senderInitials: "DF",
        senderRole: "coordinator",
        body: "Unfortunately our roster is at full capacity for mid-April. The Apr 15 dates conflict with 4 confirmed shoots. Happy to revisit for May — shall I send you a few available windows?",
        ts: "Apr 14 16:45",
        isYou: true,
      },
      {
        id: "m73",
        threadType: "private",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Inquiry closed — declined by agency. Reason: schedule conflict.",
        ts: "Apr 15 10:00",
      },
    ],
  },

  // ── RI-208: expired — client never replied to offer ────────────────
  {
    id: "RI-208",
    agencyName: "Atelier Roma",
    clientName: "Massimo Dutti",
    clientTrust: "verified",
    brief: "AW collection · 1 talent · 1 day",
    date: "Apr 7",
    location: "Madrid · Estudio Retiro",
    source: { kind: "direct", domain: "acme-models.com" },
    stage: "expired",
    ageDays: 20,
    lastActivityHrs: 480,
    repeatBookings: 0,
    unreadPrivate: 0,
    unreadGroup: 0,
    nextActionBy: null,
    requirementGroups: [
      {
        id: "rg-208-talent",
        role: "talent",
        needed: 1,
        approved: 1,
        talents: [{ name: "Iris Volpe", thumb: "https://i.pravatar.cc/200?img=16", status: "accepted" }],
      },
    ],
    coordinator: {
      id: "co-1",
      name: "Sara Bianchi",
      initials: "SB",
      email: "sara@acme-models.com",
      acceptedAt: "22d ago",
      isPrimary: true,
    },
    offer: {
      id: "of-208-v1",
      version: 1,
      status: "sent",
      total: "€2,400",
      sentAt: "18d ago",
      clientApproval: "pending",
      lineItems: [
        { talentName: "Iris Volpe", thumb: "https://i.pravatar.cc/200?img=16", role: "talent", fee: "€2,400", status: "accepted" },
      ],
    },
    bookingId: null,
    messages: [
      {
        id: "m81",
        threadType: "private",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "coordinator",
        body: "Hi — attached the offer for Iris Volpe, 1 day at €2,400. Please confirm by Apr 5 so we can hold the date.",
        ts: "Apr 3",
        isYou: true,
      },
      {
        id: "m82",
        threadType: "private",
        senderName: "Sara Bianchi",
        senderInitials: "SB",
        senderRole: "coordinator",
        body: "Following up — the Apr 7 date is at risk if we don't hear back today. Happy to adjust the offer if needed.",
        ts: "Apr 5",
        isYou: true,
      },
      {
        id: "m83",
        threadType: "private",
        senderName: "System",
        senderInitials: "—",
        senderRole: "system",
        body: "Inquiry expired — no client response after 7-day window. Iris Volpe hold released.",
        ts: "Apr 10",
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
  /** Primary Talent Type id (matches TaxonomyChild.id). Drives the type chip on cards. */
  primaryType?: string;
  /** Profile completeness 0–100. Surfaced on cards in non-published states. */
  completeness?: number;
  /** "available" | "busy" | "offline". Drives dot on the card. */
  availability?: "available" | "busy" | "offline";
  /** Short last-active string ("2h", "1d", "3d"). */
  lastActive?: string;
  // ── WS-31.6 / WS-34.8 Minor protections ────────────────────────────
  // Talent under 18 carries a guardian + protection block. Surfaced on
  // every offer, inquiry workspace, and roster card via
  // `<MinorProtectionBanner>` so coordinators can never miss it. The
  // protections themselves (working hours, chaperone) are hard
  // defaults — coordinators don't get to override without the guardian
  // co-signing through the MinorAccountDrawer.
  isMinor?: boolean;
  /** Birth year — used to auto-flip `isMinor` when comparing against
   *  the current year. Optional so basic fixtures can stay terse. */
  birthYear?: number;
  /** Guardian / co-pilot record. Required when `isMinor` is true. */
  guardian?: {
    name: string;
    relation: "parent" | "legal_guardian" | "other";
    email: string;
    phone?: string;
    /** Has the guardian completed verification + consent? */
    consentVerified: boolean;
  };
  /** Hard default protections for minors — agency can request
   *  variations through the MinorAccountDrawer but defaults bind.
   *  All times are workspace-local. */
  minorProtections?: {
    /** Working-hour window, 24h — applied to ALL bookings. Default 9–17. */
    workingHourStart: number;
    workingHourEnd: number;
    /** Max consecutive on-set hours per day. Default 6. */
    maxOnSetHoursPerDay: number;
    /** Must have a designated chaperone present at every booking. */
    chaperoneRequired: boolean;
    /** Hours of school per week that the booking schedule must accommodate. */
    schoolHoursPerWeek: number;
  };
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
  { id: "t1", name: "Marta Reyes",     state: "published",         height: "5'9\"",  city: "Madrid",    thumb: "https://i.pravatar.cc/200?img=5",  primaryType: "fashion",     completeness: 92, availability: "available", lastActive: "2h" },
  { id: "t2", name: "Kai Lin",         state: "awaiting-approval", height: "5'11\"", city: "Berlin",    thumb: "https://i.pravatar.cc/200?img=14", primaryType: "commercial",  completeness: 68, availability: "busy",      lastActive: "1d" },
  { id: "t3", name: "Amelia Dorsey",   state: "invited",           height: "5'8\"",  city: "Lisbon",    thumb: "https://i.pravatar.cc/200?img=23", primaryType: "promotional", completeness: 24, availability: "offline",   lastActive: "—"  },
  // Seeded close to the Free cap (5) so the cap-nudge surfaces in the prototype.
  { id: "t4", name: "Tomás Navarro",   state: "draft",             height: "6'0\"",  city: "Barcelona", thumb: "https://i.pravatar.cc/200?img=49", primaryType: "vip_host",    completeness: 45, availability: "available", lastActive: "5d" },
];

export const ROSTER_AGENCY: TalentProfile[] = [
  {
    id: "t1", name: "Marta Reyes", state: "published",
    height: "5'9\"", city: "Madrid",
    thumb: "https://i.pravatar.cc/200?img=5",
    representation: { kind: "exclusive", agencyName: "Atelier Roma" },
    primaryType: "fashion", completeness: 92, availability: "available", lastActive: "2h",
  },
  {
    id: "t2", name: "Kai Lin", state: "published",
    height: "5'11\"", city: "Berlin",
    thumb: "https://i.pravatar.cc/200?img=14",
    representation: { kind: "exclusive", agencyName: "Atelier Roma" },
    primaryType: "commercial", completeness: 88, availability: "available", lastActive: "1d",
  },
  {
    id: "t3", name: "Tomás Navarro", state: "published",
    height: "6'1\"", city: "Lisbon",
    thumb: "https://i.pravatar.cc/200?img=12",
    representation: { kind: "non-exclusive", agencyNames: ["Atelier Roma", "Studio Iberia"] },
    primaryType: "vip_host", completeness: 80, availability: "available", lastActive: "3h",
  },
  {
    id: "t4", name: "Lina Park", state: "awaiting-approval",
    height: "5'7\"", city: "Paris",
    thumb: "https://i.pravatar.cc/200?img=47",
    representation: { kind: "exclusive", agencyName: "Atelier Roma" },
    primaryType: "fashion", completeness: 64, availability: "available", lastActive: "1d",
    // WS-31.6 demo seed — Lina is 16, parental co-pilot account. Every
    // offer/booking surfaces MinorProtectionBanner. School-hour and
    // working-hour defaults are non-negotiable without guardian re-consent.
    isMinor: true,
    birthYear: 2010,
    guardian: {
      name: "Min-Jun Park",
      relation: "parent",
      email: "min-jun.park@example.com",
      phone: "+33 6 12 34 56 78",
      consentVerified: true,
    },
    minorProtections: {
      workingHourStart: 9,
      workingHourEnd: 17,
      maxOnSetHoursPerDay: 6,
      chaperoneRequired: true,
      schoolHoursPerWeek: 25,
    },
  },
  {
    id: "t5", name: "Amelia Dorsey", state: "invited",
    height: "5'8\"", city: "Lisbon",
    thumb: "https://i.pravatar.cc/200?img=23",
    representation: { kind: "freelance" },
    primaryType: "promotional", completeness: 28, availability: "offline", lastActive: "—",
  },
  {
    id: "t6", name: "Sven Olafsson", state: "draft",
    height: "6'0\"", city: "Oslo",
    thumb: "https://i.pravatar.cc/200?img=29",
    representation: { kind: "exclusive", agencyName: "Atelier Roma" },
    primaryType: "commercial", completeness: 42, availability: "busy", lastActive: "1w",
  },
  {
    id: "t7", name: "Zara Habib", state: "published",
    height: "5'10\"", city: "London",
    thumb: "https://i.pravatar.cc/200?img=10",
    representation: { kind: "exclusive", agencyName: "Atelier Roma" },
    primaryType: "fashion", completeness: 95, availability: "busy", lastActive: "2d",
  },
];

// Legacy roll-up — kept as `Inquiry` for the few list views that still
// consume INQUIRIES_AGENCY. New surfaces should consume `InquiryRecord`.
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
    displayName: "Atelier Roma",
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
    displayName: "Atelier Roma",
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
      displayName: "Atelier Roma",
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
      displayName: "Atelier Roma",
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
    receiverName: "Atelier Roma",
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
    receiverName: "Atelier Roma",
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
    receiverName: "Atelier Roma",
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

// ─── Notifications ───────────────────────────────────────────────────
//
// Structured notification log shared by both workspace and talent surfaces.
// Production reads from a realtime channel; this mock drives the drawer UI
// and the bell badge counts.

export type NotificationKind =
  | "message"    // new message in a thread
  | "offer"      // offer sent or updated
  | "booking"    // booking confirmed / updated
  | "payment"    // payment status change
  | "approval"   // talent or client approved something
  | "system"     // automated platform event
  | "profile";   // talent profile submitted changes

export type NotificationItem = {
  id: string;
  kind: NotificationKind;
  /** Which inquiry this notification relates to, if any. */
  inquiryId?: string;
  /** Which booking this notification relates to, if any. */
  bookingId?: string;
  title: string;
  body: string;
  ts: string;
  read: boolean;
  actorName: string;
  actorInitials: string;
  /** Surface: workspace admin or talent personal. */
  surface: "workspace" | "talent";
  /** DrawerId to open when this notification is clicked. */
  targetDrawer: DrawerId;
  /** Optional payload forwarded to the target drawer. */
  targetPayload?: { id?: string; inquiryId?: string };
};

export const NOTIFICATIONS: NotificationItem[] = [
  // ── Workspace notifications ──────────────────────────────────────
  {
    id: "wn1",
    kind: "message",
    inquiryId: "RI-202",
    title: "Vogue Italia replied to the offer",
    body: '"Reviewing the v2 offer with our producer — should have a decision by EOD."',
    ts: "22m ago",
    read: false,
    actorName: "Martina Greco",
    actorInitials: "MG",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-202" },
  },
  // WS-11.2 — extra messages from the same inquiry to trigger batching demo
  {
    id: "wn1b",
    kind: "message",
    inquiryId: "RI-202",
    title: "Vogue Italia sent a follow-up",
    body: '"Also — can you confirm Kai Lin availability for May 14?"',
    ts: "18m ago",
    read: false,
    actorName: "Martina Greco",
    actorInitials: "MG",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-202" },
  },
  {
    id: "wn1c",
    kind: "message",
    inquiryId: "RI-202",
    title: "Vogue Italia — 3rd message",
    body: "“Never mind — she confirmed directly. We’re good to go.”",
    ts: "12m ago",
    read: false,
    actorName: "Martina Greco",
    actorInitials: "MG",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-202" },
  },
  {
    id: "wn2",
    kind: "approval",
    inquiryId: "RI-203",
    title: "Bvlgari approved the offer",
    body: "All parties confirmed. Convert to booking and send the contract.",
    ts: "2h ago",
    read: false,
    actorName: "Marco Conti",
    actorInitials: "MC",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-203" },
  },
  {
    id: "wn3",
    kind: "profile",
    title: "Lina Park submitted profile changes",
    body: "Updated measurements and 3 new photos. Awaiting your approval.",
    ts: "1h ago",
    read: false,
    actorName: "Lina Park",
    actorInitials: "LP",
    surface: "workspace",
    targetDrawer: "talent-profile",
    targetPayload: { id: "t4" },
  },
  {
    id: "wn4",
    kind: "booking",
    inquiryId: "RI-203",
    bookingId: "BK-203",
    title: "Bvlgari booking starts Thursday",
    body: "Kai Lin · €8,200 · Rome · Cinecittà 7",
    ts: "3h ago",
    read: true,
    actorName: "System",
    actorInitials: "—",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-203" },
  },
  {
    id: "wn5",
    kind: "system",
    inquiryId: "RI-206",
    title: "New inquiry from Valentino",
    body: "SS26 campaign · 2 talent · 3 days · Apr 29. No coordinator assigned yet.",
    ts: "Today 08:31",
    read: false,
    actorName: "System",
    actorInitials: "—",
    surface: "workspace",
    targetDrawer: "inquiry-workspace",
    targetPayload: { inquiryId: "RI-206" },
  },
  {
    id: "wn6",
    kind: "payment",
    inquiryId: "RI-205",
    bookingId: "BK-205",
    title: "Payout sent — Net-a-Porter / Marta Reyes",
    body: "€3,281 sent to Acme Models. BK-205 complete.",
    ts: "Apr 11",
    read: true,
    actorName: "System",
    actorInitials: "—",
    surface: "workspace",
    targetDrawer: "payment-detail",
    targetPayload: { id: "BK-205" },
  },
  // ── Talent notifications (Marta Reyes) ────────────────────────────
  {
    id: "tn1",
    kind: "offer",
    inquiryId: "RI-201",
    title: "New offer from Acme Models",
    body: "Mango · Spring lookbook · Tue May 6 · €1,800. Please respond by tomorrow.",
    ts: "5h ago",
    read: false,
    actorName: "Sara Bianchi",
    actorInitials: "SB",
    surface: "talent",
    targetDrawer: "talent-offer-detail",
    targetPayload: { id: "rq1" },
  },
  {
    id: "tn2",
    kind: "booking",
    inquiryId: "RI-202",
    bookingId: "bk2",
    title: "Vogue Italia booking confirmed",
    body: "May 14–15, Milan · Studio 5. Call time 07:00. Call sheet to follow.",
    ts: "2d ago",
    read: true,
    actorName: "Daniel Ferrer",
    actorInitials: "DF",
    surface: "talent",
    targetDrawer: "talent-booking-detail",
    targetPayload: { id: "bk2" },
  },
  {
    id: "tn3",
    kind: "payment",
    bookingId: "bk4",
    title: "Payout received — Zara",
    body: "€2,000 transferred via bank. Zara capsule lookbook, Mar 28.",
    ts: "Apr 4",
    read: true,
    actorName: "System",
    actorInitials: "—",
    surface: "talent",
    targetDrawer: "talent-closed-booking",
    targetPayload: { id: "bk4" },
  },
  {
    id: "tn4",
    kind: "message",
    inquiryId: "RI-201",
    title: "Sara Bianchi sent a group message",
    body: "Mango spring lookbook, Tue May 6 in Madrid. Estudio Roca, full day.",
    ts: "Mon 17:05",
    read: true,
    actorName: "Sara Bianchi",
    actorInitials: "SB",
    surface: "talent",
    targetDrawer: "talent-offer-detail",
    targetPayload: { id: "rq1" },
  },
];

/** Unread workspace notification count — derived from NOTIFICATIONS. */
export const WORKSPACE_NOTIFICATION_COUNT = NOTIFICATIONS.filter(
  (n) => n.surface === "workspace" && !n.read
).length;

/** Unread talent notification count — derived from NOTIFICATIONS. */
export const TALENT_NOTIFICATION_COUNT = NOTIFICATIONS.filter(
  (n) => n.surface === "talent" && !n.read
).length;

// ─── Workspace info ──────────────────────────────────────────────────

export const TENANT: {
  slug: string;
  name: string;
  domain: string;
  customDomain: string;
  initials: string;
  entityType: EntityType;
} = {
  // "Atelier Roma" reads as a real boutique agency. Was "Atelier Roma" —
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
  /** Primary talent type from the Tulala taxonomy (e.g. "models"). Drives
   *  the dynamic-field engine in the profile shell drawer. Required —
   *  defaults to "models" in the mock data; the profile shell drawer
   *  always populates it on first open. */
  primaryType: TaxonomyParentId;
  /** Additional roles for multi-discipline talent (model + performer, etc.).
   *  Required to be an array (empty = single-role) so spread ops in the
   *  drawer are always safe. */
  secondaryTypes: TaxonomyParentId[];
  /** Portfolio video links. Each entry is a VideoSlot shape so the drawer
   *  can round-trip video URLs back to the canonical profile on save. */
  portfolioVideos?: VideoSlot[];
  /** Direct video URL for the talent's showreel. Separate from
   *  `showreelThumb` (which is the emoji placeholder used in mocks). */
  showreelUrl?: string;
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
  // Real photos for QA. Cover is a wide editorial backdrop; profile is a
  // headshot. Both swap-tested on the talent profile + identity bar.
  coverPhoto: "https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=1200&q=80",
  profilePhoto: "https://i.pravatar.cc/300?img=5",
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
  primaryType: "models" as TaxonomyParentId,
  secondaryTypes: [],
  primaryAgency: "Atelier Roma",
  representation: { kind: "exclusive", agencyName: "Atelier Roma" },
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
    "Polaroids set (5 naturals)",
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
  { id: "ag1", name: "Atelier Roma", slug: "acme-models", joinedAt: "Mar 2024", isPrimary: true, status: "exclusive", bookingsYTD: 6, planTier: "agency", commissionRate: 0.18 },
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
  /** Cross-reference to RICH_INQUIRIES — same booking seen from the talent side. */
  inquiryId?: string;
};

export const TALENT_REQUESTS: TalentRequest[] = [
  { id: "rq1", kind: "offer",   agency: "Atelier Roma",    client: "Mango",          clientTrust: "gold",     brief: "Lookbook · spring capsule · 1 day",        date: "Tue · May 6",  amount: "€1,800",      ageHrs: 5,   status: "needs-answer", inquiryId: "RI-201" },
  { id: "rq2", kind: "hold",    agency: "Atelier Roma",    client: "Bvlgari",         clientTrust: "silver",   brief: "Editorial · jewelry campaign",             date: "May 18–20",    amount: "€4,000–6,000", ageHrs: 18,  status: "needs-answer", inquiryId: "RI-203" },
  { id: "rq3", kind: "casting", agency: "Praline London", client: "Net-a-Porter",    clientTrust: "silver",   brief: "Casting call · video lookbook",            date: "Apr 30",       amount: "TBC",          ageHrs: 36,  status: "viewed" },
  { id: "rq4", kind: "offer",   agency: "Atelier Roma",    client: "Vogue Italia",    clientTrust: "gold",     brief: "Editorial spread · 2 day shoot",           date: "May 14–15",    amount: "€3,200",       ageHrs: 60,  status: "accepted",    inquiryId: "RI-202" },
  // Conflicted hold — overlaps with confirmed bk2 (Vogue Italia · May 14–15).
  // Surfaces the conflict-resolution UI on the calendar so Marta sees the
  // collision before either party expects her to commit.
  { id: "rq5", kind: "hold",    agency: "Atelier Roma",    client: "Stella McCartney", clientTrust: "verified", brief: "Lookbook · single day",                   date: "May 14",       amount: "€2,200",       ageHrs: 4,   status: "needs-answer" },
  // Declined / fell-through inquiries — surface in the "Past" section.
  { id: "rq6", kind: "casting", agency: "Atelier Roma",    client: "H&M",             clientTrust: "verified", brief: "Online catalogue · 3 talent shortlist",    date: "Apr 24",       amount: "€900",         ageHrs: 96,  status: "declined",    inquiryId: "RI-207" },
  { id: "rq7", kind: "hold",    agency: "Praline London", client: "Topshop",         clientTrust: "basic",    brief: "Pop-up activation · weekend",              date: "Apr 12",       amount: "£600",         ageHrs: 240, status: "expired" },
];

export type TalentBooking = {
  id: string;
  /** Cross-reference to the workspace RICH_INQUIRIES booking that created this. */
  inquiryId?: string;
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
  { id: "bk1", inquiryId: "RI-201", agency: "Atelier Roma",    client: "Mango",        brief: "Lookbook · spring capsule",     startDate: "Tue, May 6",         location: "Madrid · ESTUDIO ROCA",    amount: "€1,800", status: "confirmed", call: "08:30" },
  { id: "bk2", inquiryId: "RI-202", agency: "Atelier Roma",    client: "Vogue Italia", brief: "Editorial spread",              startDate: "May 14", endDate: "May 15", location: "Milan · Studio 5",    amount: "€3,200", status: "confirmed", call: "07:00" },
  { id: "bk3",                      agency: "Praline London", client: "Burberry",     brief: "Lookbook",                      startDate: "Apr 18",              location: "London · Hackney",          amount: "£2,400", status: "wrapped",   call: "—"    },
  { id: "bk4",                      agency: "Atelier Roma",    client: "Zara",         brief: "Capsule lookbook",              startDate: "Mar 28",              location: "Madrid",                    amount: "€2,000", status: "paid",      call: "—"    },
  // Cancellation examples — surface in the "Cancelled" calendar filter.
  { id: "bk5",                      agency: "Atelier Roma",    client: "Hugo Boss",    brief: "AW campaign",                   startDate: "May 9",               location: "Berlin · Studio Mitte",     amount: "€2,400", status: "cancelled", call: "08:00", cancelledBy: "client", cancelReason: "Client postponed campaign · no kill fee due",   cancelTiming: "3d before shoot"   },
  { id: "bk6",                      agency: "Praline London", client: "Selfridges",   brief: "Editorial · summer spread",     startDate: "Apr 22",              location: "London · Studio 2C",        amount: "£1,800", status: "cancelled", call: "—",    cancelledBy: "talent", cancelReason: "Travel conflict · settled with hold-day fee",    cancelTiming: "day before shoot"  },
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
  { id: "e1", workDate: "Mar 28, 2026", payoutDate: "Apr 4, 2026", agency: "Atelier Roma", client: "Zara", amount: "€2,000", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
  { id: "e2", workDate: "Mar 10, 2026", payoutDate: "Mar 21, 2026", agency: "Praline London", client: "Burberry", amount: "£2,400", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
  { id: "e3", workDate: "Mar 1, 2026", payoutDate: "Mar 12, 2026", agency: "Atelier Roma", client: "Vogue Italia", amount: "€2,800", status: "paid", source: { kind: "agency" }, paymentMethod: "mixed", paymentNote: "Transfer + Vogue editorial credit" },
  // Mango paid in product (clothing capsule) — tax-relevant in-kind example.
  { id: "e4", workDate: "Feb 14, 2026", payoutDate: "Feb 28, 2026", agency: "Atelier Roma", client: "Mango", amount: "€1,600", status: "paid", source: { kind: "agency" }, paymentMethod: "in-kind", paymentNote: "Capsule wardrobe · est. value" },
  { id: "e5", workDate: "Jan 30, 2026", payoutDate: "Feb 14, 2026", agency: "Atelier Roma", client: "Net-a-Porter", amount: "€3,400", status: "paid", source: { kind: "agency" }, paymentMethod: "transfer" },
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
    name: "Atelier Roma",
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

// Two client profiles — switchable from the prototype control bar so QA
// can see how the surface adapts to a business client (logo + brand name)
// vs a personal client (face + first name). Avatars use real photo URLs.
export type ClientProfileId = "martina" | "gringo";
export type ClientProfile = ClientBrand & {
  contactName: string;
  /** When set, identity bar shows the photo (square logo for business,
   * round headshot for person). For business: a logo URL; for person:
   * a portrait URL. */
  photoUrl: string;
  isBusiness: boolean;
};

export const CLIENT_PROFILES: Record<ClientProfileId, ClientProfile> = {
  martina: {
    id: "br-martina",
    name: "Martina Beach Club",
    initials: "MB",
    industry: "Hospitality · beach club",
    trustLevel: "verified",
    contactName: "Martina González",
    photoUrl: "https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=400&q=80",
    isBusiness: true,
  },
  gringo: {
    id: "br-gringo",
    name: "The Gringo",
    initials: "TG",
    industry: "Personal client",
    trustLevel: "basic",
    contactName: "The Gringo",
    photoUrl: "https://i.pravatar.cc/300?img=33",
    isBusiness: false,
  },
};

// Default brand identity — points at the business client. The active
// client profile is read off the proto state's `clientProfile` field;
// callers should prefer `useProto().activeClientProfile` over this.
export const MY_CLIENT_BRAND: ClientBrand = CLIENT_PROFILES.martina;

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
  /** Primary agency (kept for legacy filters; channels[] is the new source of truth) */
  agency: string;
  city: string;
  height: string;
  thumb: string;
  available: boolean;
  /** Talent category — drives Discover tab filtering */
  category: "models" | "hosts" | "chefs" | "artists" | "djs" | "photographers" | "performers";
  /** Specific child taxonomy id (e.g. "fashion", "vip_host"). Drives sub-filter chips on Discover. */
  subType?: string;
  /** Trust tier (binding spec): basic / verified / silver / gold. */
  trust?: "basic" | "verified" | "silver" | "gold";
  /** Optional bio paragraph shown on profile sheet. */
  bio?: string;
  /** Median reply time in minutes (used by SLA chip). Direct talent only. */
  replyTimeMin?: number;
  /** If true, talent has a Pro/Portfolio premium page at tulala.digital/t/<slug>. */
  premiumPage?: boolean;
  /** Talent slug (used for canonical premium URL). */
  slug?: string;
  /** Representation channels the client can choose between when sending an inquiry.
   *  - "agency"  : agency-routed (talent under an exclusive or non-exclusive contract)
   *  - "hub"     : routed through a Tulala hub (referrer fee model)
   *  - "freelance": direct to talent — talent becomes the coordinator themselves
   *  At least one entry. Most talent have ≥2 channels and the client picks. */
  channels: { kind: "agency" | "hub" | "freelance"; name: string; commission?: string }[];
};

// ════════════════════════════════════════════════════════════════════
// MASTER TAXONOMY — Tulala-owned. Each agency/hub picks a subset.
// Parents are the major buckets surfaced in Discover and registration.
// Children are specific talent types under each parent. Plan tier
// limits how many parent groups an agency can enable simultaneously.
// ════════════════════════════════════════════════════════════════════

export type TaxonomyParentId =
  | "models" | "hosts" | "performers" | "music" | "creators"
  | "chefs" | "wellness" | "hospitality" | "transportation"
  | "photo_video" | "event_staff" | "security";

/**
 * A specific bookable Talent Type (the answer to "I need a ___").
 * Examples: "Fashion model", "VIP host", "Private chef", "Driver".
 * Specialties refine a Talent Type — Editorial under Fashion model,
 * Sushi under Private chef. Skills/contexts/locations are separate.
 */
export type TaxonomyChild = {
  id: string;
  label: string;
  helper?: string;
  /** Specialties = refinements (Editorial under Fashion model). */
  specialties?: string[];
  /** Whether this type can be a primary booked role (default true). */
  primaryAllowed?: boolean;
  /** Whether this type can be a secondary role (default true). */
  secondaryAllowed?: boolean;
};

/**
 * Skill — an ability that makes a profile more valuable but is NOT
 * the booked role. Cross-category; surfaced as chips on the profile.
 */
export const SKILL_CATALOG: { id: string; label: string; group: string }[] = [
  { id: "luxury_sales",     label: "Luxury sales",        group: "Sales & promo" },
  { id: "lead_gen",         label: "Lead generation",      group: "Sales & promo" },
  { id: "guest_interaction",label: "Guest interaction",    group: "Hospitality" },
  { id: "public_speaking",  label: "Public speaking",      group: "Stage" },
  { id: "stage_presence",   label: "Stage presence",       group: "Stage" },
  { id: "runway_walk",      label: "Runway walk",          group: "Modeling" },
  { id: "posing",           label: "Posing",               group: "Modeling" },
  { id: "social_content",   label: "Social media content", group: "Creator" },
  { id: "vendor_negotiation", label: "Vendor negotiation", group: "Operations" },
  { id: "cash_handling",    label: "Cash handling",        group: "Operations" },
  { id: "translation",      label: "Translation",          group: "Languages" },
  { id: "first_aid",        label: "First aid",            group: "Safety" },
];

/**
 * Context — where / what kind of situation the talent works best.
 * NOT a Talent Type; describes setting fit.
 */
export const CONTEXT_CATALOG: { id: string; label: string }[] = [
  { id: "luxury_events",   label: "Luxury events" },
  { id: "beach_clubs",     label: "Beach clubs" },
  { id: "hotels",          label: "Hotels" },
  { id: "restaurants",     label: "Restaurants" },
  { id: "weddings",        label: "Weddings" },
  { id: "brand_act",       label: "Brand activations" },
  { id: "private_villas",  label: "Private villas" },
  { id: "yachts",          label: "Yachts" },
  { id: "nightclubs",      label: "Nightclubs" },
  { id: "photo_shoots",    label: "Photo shoots" },
  { id: "tourism",         label: "Tourism experiences" },
];

/**
 * Language ability — structured. NOT a skill, NOT a Talent Type.
 * Each row carries a level + role flags (can host / sell / translate).
 */
export type LanguageLevel = "native" | "fluent" | "conversational" | "basic";
export type ProfileLanguage = {
  language: string;
  level: LanguageLevel;
  canHost?: boolean;
  canSell?: boolean;
  canTranslate?: boolean;
  canTeach?: boolean;
};

/**
 * Service area — where the talent is based + where they can work.
 * Mirrored to talent_service_areas in production; the talent_profiles
 * `location_id` / `destinations` columns are cache only.
 */
export type ServiceArea = {
  /** Home base city (canonical). */
  homeBase: string;
  /** Cities the talent will work in without travel logistics. */
  serviceCities: string[];
  /** Travel radius from home base in km. 999 = anywhere. */
  travelKm: number;
  /** Whether a travel fee may apply outside service cities. */
  travelFee: boolean;
  /** True if talent is remote-only (no on-site bookings). */
  remoteOnly?: boolean;
  /** Free-text notes (visa, passport, etc.). */
  notes?: string;
  // ── Travel & eligibility (Phase C profile shell fields) ──────────────
  /** Passport status. */
  passport?: "valid" | "expired" | "none";
  /** Driver's license class held. */
  driversLicense?: "none" | "standard" | "international" | "commercial";
  /** Has access to own vehicle for shoot logistics. */
  ownsVehicle?: boolean;
  /** ISO country codes the talent is work-eligible in (e.g. ["ES", "FR", "MX"]). */
  workEligibility?: string[];
  /** Active visa countries beyond home country. */
  visaCountries?: string[];
};

// ════════════════════════════════════════════════════════════════════
// Phase 4 follow-up — Availability / Rates / Albums / Locale-bio /
// Verifications. Each is a first-class profile dimension with its own
// shape so production can map cleanly to dedicated tables.
// ════════════════════════════════════════════════════════════════════

/** A single calendar cell on the talent's mini-availability grid. */
export type AvailabilityStatus = "open" | "busy" | "blocked";
export type AvailabilityCell = {
  /** ISO date string (YYYY-MM-DD). */
  date: string;
  status: AvailabilityStatus;
  /** Optional note (booking ref, vacation tag, etc.). */
  note?: string;
};

/**
 * Rate unit defaults per parent Talent Type. Models price by day,
 * DJs by set, drivers by hour, etc. Production maps these via the
 * taxonomy_terms.metadata column.
 */
export type RateUnit = "day" | "hour" | "set" | "event" | "session" | "month";
export const TYPE_RATE_UNIT: Record<TaxonomyParentId, RateUnit> = {
  models:         "day",
  hosts:          "event",
  performers:     "set",
  music:          "set",
  creators:       "event",
  chefs:          "event",
  wellness:       "session",
  hospitality:    "month",
  transportation: "hour",
  photo_video:    "day",
  event_staff:    "hour",
  security:       "hour",
};

export type ProfileRate = {
  /** TaxonomyChild.id this rate applies to (e.g. "fashion"). */
  typeId: string;
  /** Numeric amount. */
  amount: number;
  /** ISO 4217 (or symbolic). */
  currency: string;
  /** Per-{unit}. Derived from the parent type but overridable. */
  unit: RateUnit;
  /** Optional rider conditions ("min 4 hours", "+ tax"). */
  conditions?: string;
};

/**
 * Portfolio album — lets talent split media into Editorial /
 * Lookbook / Behind-the-scenes. Not a hard structure; default is
 * a single "Main" album.
 */
export type ProfileAlbum = {
  id: string;
  name: string;
  /** Image URLs (or blob: refs in the prototype). */
  photos: string[];
  /** Optional caption per photo, indexed positionally. */
  captions?: string[];
};

/** Locale code (ISO 639-1). */
export type LocaleCode = "en" | "es" | "fr" | "it" | "pt" | "de";
export const LOCALE_LABEL: Record<LocaleCode, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  de: "German",
};

export type LocaleBio = { locale: LocaleCode; text: string };

/**
 * Verification + funded-account signals — drives the trust badge per
 * the binding spec. Trust is DERIVED, never set manually.
 */
export type Verifications = {
  idSubmitted: boolean;
  payoutConnected: boolean;
  bookingsCount: number;
  hasFundedClient: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
};

export type TrustTier = "basic" | "verified" | "silver" | "gold";

export function computeTrustTier(v: Verifications): TrustTier {
  if (v.idSubmitted && v.payoutConnected && v.bookingsCount >= 5 && v.hasFundedClient) return "gold";
  if (v.idSubmitted && v.payoutConnected && v.bookingsCount >= 1) return "silver";
  if (v.idSubmitted && v.payoutConnected) return "verified";
  return "basic";
}

/** History entry for the diff view (admin reviewing a self-edit submission). */
export type ProfileChange = {
  fieldId: string;
  fieldLabel: string;
  before: string;
  after: string;
  /** ISO timestamp. */
  changedAt: string;
};

// ════════════════════════════════════════════════════════════════════
// Phase 4 +30 — premium profile dimensions.
// Identity (gender / pronouns / DOB) is intentionally separate from
// Talent Type per the binding spec. Skills carry proficiency so a
// "great at" beats a "learning" in directory ranking. Photos carry
// per-tile metadata (tag + alt + caption). Rates support package
// bundles and channel-tier variation. Admin gets templates, locks,
// invite tracking, and bulk operations.
// ════════════════════════════════════════════════════════════════════

// ── Identity ─────────────────────────────────────────────────────────
export type Pronouns = "she/her" | "he/him" | "they/them" | "ze/zir" | "custom";
export type GenderOption = "woman" | "man" | "non_binary" | "other" | "prefer_not_to_say";
export type AgeDisplayMode = "exact" | "range" | "hidden";

export const PRONOUNS_OPTIONS: { id: Pronouns; label: string }[] = [
  { id: "she/her",   label: "she / her" },
  { id: "he/him",    label: "he / him" },
  { id: "they/them", label: "they / them" },
  { id: "ze/zir",    label: "ze / zir" },
  { id: "custom",    label: "custom" },
];

export const GENDER_OPTIONS: { id: GenderOption; label: string }[] = [
  { id: "woman",                label: "Woman" },
  { id: "man",                  label: "Man" },
  { id: "non_binary",           label: "Non-binary" },
  { id: "other",                label: "Other" },
  { id: "prefer_not_to_say",    label: "Prefer not to say" },
];

export type ProfileIdentity = {
  stageName: string;
  /** Admin-only / KYC. Never exposed on the public profile. */
  legalName: string;
  /** Phonetic pronunciation aid (e.g. "soh-FEE-ah loo-PO"). */
  pronunciation: string;
  pronouns: Pronouns | null;
  pronounsCustom?: string;
  gender: GenderOption | null;
  /** ISO date YYYY-MM-DD. */
  dob: string | null;
  ageDisplay: AgeDisplayMode;
  /** Country of citizenship — drives international booking pre-checks. */
  nationality?: string;
  /** Country of residence — used for tax + payout routing. */
  homeCountry?: string;
  /** Self-declared reply-time commitment shown on Discover. */
  responseTime?: "1h" | "4h" | "24h" | "48h";
  /** Per-field visibility overrides. Keys are profile field short-ids;
   *  values are the channel array the talent chose. Matches FieldVisibility
   *  (ReadonlyArray<FieldChannel>) so ChannelVisibilityStrip onChange
   *  values can be assigned directly without a cast. */
  visibility?: Partial<Record<
    "legalName" | "pronouns" | "gender" | "dob",
    ReadonlyArray<RegFieldChannel>
  >>;
};

export function deriveAge(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}
export function ageRangeFor(age: number | null): string | null {
  if (age == null) return null;
  const lo = Math.floor(age / 5) * 5;
  return `${lo}–${lo + 4}`;
}

// ── Skills with proficiency ──────────────────────────────────────────
export type SkillProficiency = "great" | "can_do" | "learning";
export type SkillEntry = { skillId: string; proficiency: SkillProficiency };

export const PROFICIENCY_META: Record<SkillProficiency, { label: string; helper: string; bg: string; fg: string }> = {
  great:    { label: "I'm great at",      helper: "Stand-out strengths.",         bg: "rgba(15,79,62,0.10)", fg: "#0F4F3E" },
  can_do:   { label: "I can do",          helper: "Solid + reliable.",            bg: "rgba(91,107,160,0.10)", fg: "#3B4A75" },
  learning: { label: "I'm learning",      helper: "Open to gigs that train me.",  bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
};

// ── Bio tone selector ────────────────────────────────────────────────
export type BioTone = "editorial" | "friendly" | "professional" | "quirky";
export const BIO_TONES: { id: BioTone; label: string; emoji: string }[] = [
  { id: "editorial",    label: "Editorial",    emoji: "✦" },
  { id: "friendly",     label: "Friendly",     emoji: "🌿" },
  { id: "professional", label: "Professional", emoji: "🎯" },
  { id: "quirky",       label: "Quirky",       emoji: "✨" },
];

// ── Personality fields ───────────────────────────────────────────────
export type Personality = { loves: string[]; avoids: string[] };

// ── Photo metadata ───────────────────────────────────────────────────
export type PhotoTag = "headshot" | "full_body" | "in_motion" | "portfolio" | "bts";
export const PHOTO_TAG_META: Record<PhotoTag, { label: string; emoji: string }> = {
  headshot:  { label: "Headshot",   emoji: "😊" },
  full_body: { label: "Full body",  emoji: "🧍" },
  in_motion: { label: "In motion",  emoji: "💫" },
  portfolio: { label: "Portfolio",  emoji: "✦" },
  bts:       { label: "BTS",        emoji: "🎬" },
};
export type PhotoMeta = {
  url: string;
  tag?: PhotoTag;
  altText?: string;
  caption?: string;
  // ── Video media (Phase B portfolio drawer) ───────────────────────────
  /** When set, this tile represents a video rather than a still image.
   *  The thumbnail in `url` is displayed as the tile; videoUrl is the
   *  actual playback source. */
  videoUrl?: string;
  /** Video duration in seconds — shown as "0:42" chip on the tile. */
  videoDurationSec?: number;
  /** Provider detected from videoUrl — drives the coloured chip.
   *  "youtube" → red, "vimeo" → cyan, "mp4" → dark. */
  videoProvider?: "youtube" | "vimeo" | "mp4";
};

// ── Video clips + hello reel ─────────────────────────────────────────
export type VideoSlot = { url: string; durationSec?: number; caption?: string };

// ── Aspirations (talent type ids the talent wants to grow into) ─────
// Plain string[] — references TaxonomyChild.id

// ── Seasonal availability ────────────────────────────────────────────
export type SeasonalWindow = {
  id: string;
  city: string;
  /** 1-12. Inclusive. */
  startMonth: number;
  endMonth: number;
};

// ── Recurring availability + vacation ────────────────────────────────
export type RecurringPattern = {
  /** "weekends-only" => only Sat/Sun open. "weekdays-only" => only Mon-Fri. "weekly-busy" => specific dow always busy. */
  kind: "none" | "weekends-only" | "weekdays-only" | "weekly-busy";
  /** When kind="weekly-busy", which days (0=Sun..6=Sat) are busy. */
  busyDays?: number[];
};
export type VacationWindow = { start: string; end: string; note?: string };

// ── Package rates (bundles) ─────────────────────────────────────────
export type PackageRate = {
  id: string;
  name: string;
  description: string;
  amount: number;
  currency: string;
  conditions?: string;
};

// ── Past clients + testimonials ──────────────────────────────────────
export type PastClient = {
  id: string;
  name: string;
  testimonial?: string;
  testimonialBy?: string;
  /** "Verified booking" badge — true if backed by a funded-account booking on Tulala. */
  verified?: boolean;
};

// ── Profile templates (admin tool) ──────────────────────────────────
export type ProfileTemplate = {
  id: string;
  name: string;
  primaryType: string;
  secondaryTypes?: string[];
  serviceArea?: ServiceArea;
  defaultRates?: ProfileRate[];
  defaultLanguages?: ProfileLanguage[];
  contexts?: string[];
  skills?: SkillEntry[];
};

export const PROFILE_TEMPLATES: ProfileTemplate[] = [
  {
    id: "tpl-promo-model-ws",
    name: "Promo model · weekend events",
    primaryType: "promotional",
    serviceArea: { homeBase: "Madrid", serviceCities: ["Toledo", "Segovia"], travelKm: 100, travelFee: false },
    defaultLanguages: [
      { language: "Spanish", level: "native",  canHost: true,  canSell: true },
      { language: "English", level: "fluent",  canHost: true,  canSell: true },
    ],
    contexts: ["luxury_events", "brand_act"],
    skills: [
      { skillId: "luxury_sales",      proficiency: "great" },
      { skillId: "guest_interaction", proficiency: "great" },
    ],
  },
  {
    id: "tpl-vip-host-rivmaya",
    name: "VIP host · Riviera Maya",
    primaryType: "vip_host",
    serviceArea: { homeBase: "Playa del Carmen", serviceCities: ["Tulum", "Cancun"], travelKm: 80, travelFee: true },
    defaultLanguages: [
      { language: "Spanish", level: "native", canHost: true, canSell: true },
      { language: "English", level: "fluent", canHost: true, canSell: true },
      { language: "French",  level: "conversational", canHost: true },
    ],
    contexts: ["beach_clubs", "hotels", "luxury_events"],
    skills: [
      { skillId: "luxury_sales",      proficiency: "great" },
      { skillId: "stage_presence",    proficiency: "great" },
      { skillId: "guest_interaction", proficiency: "great" },
    ],
  },
  {
    id: "tpl-private-chef-villa",
    name: "Private chef · villa service",
    primaryType: "private_chef",
    serviceArea: { homeBase: "Tulum", serviceCities: ["Cancun"], travelKm: 120, travelFee: true },
    defaultLanguages: [
      { language: "Spanish", level: "native" },
      { language: "English", level: "fluent" },
    ],
    contexts: ["private_villas", "yachts", "weddings"],
    skills: [
      { skillId: "vendor_negotiation", proficiency: "great" },
    ],
  },
];

// ── Field-level lock (admin) ────────────────────────────────────────
/** Dot-path into ProfileState. e.g. "identity.legalName", "rates.0.amount". */
export type FieldLockPath = string;

// ── Invite tracking (admin) ─────────────────────────────────────────
export type InviteStatus = "sent" | "opened" | "claimed" | "expired";
export type TalentInvite = {
  id: string;
  talentName: string;
  email: string;
  sentAt: string;
  openedAt?: string;
  claimedAt?: string;
  status: InviteStatus;
  remindersSent: number;
};

export const TALENT_INVITES: TalentInvite[] = [
  { id: "inv-1", talentName: "Amelia Dorsey",     email: "amelia@example.com",  sentAt: "2026-04-25T10:00Z",                                              status: "claimed", openedAt: "2026-04-25T11:32Z", claimedAt: "2026-04-26T08:11Z", remindersSent: 0 },
  { id: "inv-2", talentName: "Sven Olafsson",      email: "sven@example.com",    sentAt: "2026-04-22T14:00Z", openedAt: "2026-04-22T18:00Z",               status: "opened",  remindersSent: 1 },
  { id: "inv-3", talentName: "Kai Lin",            email: "kai@example.com",     sentAt: "2026-04-19T09:30Z",                                              status: "sent",    remindersSent: 0 },
  { id: "inv-4", talentName: "Tomás Navarro",      email: "tomas@example.com",   sentAt: "2026-04-10T16:00Z", openedAt: "2026-04-10T17:00Z",               status: "opened",  remindersSent: 2 },
  { id: "inv-5", talentName: "Lina Park",          email: "lina@example.com",    sentAt: "2026-03-12T08:00Z",                                              status: "expired", remindersSent: 3 },
];


export type TaxonomyParent = {
  id: TaxonomyParentId;
  label: string;
  emoji: string;
  helper: string;
  children: TaxonomyChild[];
  /** Minimum plan tier required to enable this parent. */
  minPlan: "free" | "studio" | "agency" | "network";
};

export const TAXONOMY: TaxonomyParent[] = [
  {
    id: "models", label: "Models", emoji: "👤", minPlan: "free",
    helper: "Fashion, commercial, editorial, fit, content.",
    children: [
      { id: "fashion",      label: "Fashion model",     specialties: ["Editorial", "Runway", "High fashion", "Lookbook"] },
      { id: "promotional",  label: "Promotional model", specialties: ["Brand activation", "Trade show", "Luxury event", "Festival"] },
      { id: "content",      label: "Content model",     helper: "Per-post or per-campaign content", specialties: ["UGC", "Lifestyle", "Product", "Beauty"] },
      { id: "commercial",   label: "Commercial model",  specialties: ["Print", "Catalog", "TVC", "Stock"] },
      { id: "swimwear",     label: "Swimwear / lingerie", specialties: ["Resort", "Editorial", "Catalog"] },
      { id: "fit",          label: "Fit model",         specialties: ["Womenswear", "Menswear", "Activewear"] },
      { id: "showroom",     label: "Showroom model",    specialties: ["Buyer presentations", "Wholesale"] },
    ],
  },
  {
    id: "hosts", label: "Hosts & Promo", emoji: "🎤", minPlan: "free",
    helper: "Brand ambassadors, MCs, VIP hosts, event hosts.",
    children: [
      { id: "vip_host",     label: "VIP host",            specialties: ["Hotel", "Beach club", "Yacht", "Private event"] },
      { id: "brand_amb",    label: "Brand ambassador",    specialties: ["Activation", "Sampling", "Roadshow", "Pop-up"] },
      { id: "mc",           label: "Master of ceremonies",specialties: ["Wedding", "Corporate", "Concert"] },
      { id: "promoter",     label: "Promoter / club host",specialties: ["Nightclub", "Festival", "Bar"] },
      { id: "trade_show",   label: "Trade-show staff",    specialties: ["Booth host", "Demo", "Lead capture"] },
      { id: "greeter",      label: "Greeter" },
    ],
  },
  {
    id: "performers", label: "Performers", emoji: "✨", minPlan: "free",
    helper: "Dancers, acrobats, fire performers, character acts.",
    children: [
      { id: "dancer",       label: "Dancer",            specialties: ["Salsa", "Bachata", "Contemporary", "Ballet", "Hip-hop"] },
      { id: "belly_dancer", label: "Belly dancer",      specialties: ["Egyptian", "Tribal fusion"] },
      { id: "fire",         label: "Fire performer",    specialties: ["Poi", "Staff", "Fans", "Hoop"] },
      { id: "acrobat",      label: "Acrobat / aerial",  specialties: ["Silk", "Hoop", "Trapeze", "Pole"] },
      { id: "characters",   label: "Character acts",    specialties: ["Mascot", "Living statue", "Theatrical"] },
      { id: "stilts",       label: "Stilts / circus",   specialties: ["LED stilts", "Costumed"] },
    ],
  },
  {
    id: "music", label: "Music & DJs", emoji: "🎧", minPlan: "studio",
    helper: "DJs, singers, bands, musicians.",
    children: [
      { id: "dj",           label: "DJ",          specialties: ["House", "Techno", "Hip-hop", "Latin", "Open format"] },
      { id: "singer",       label: "Singer",      specialties: ["Pop", "Jazz", "Soul", "Latin", "Classical"] },
      { id: "band",         label: "Band",        specialties: ["Cover band", "Original act", "Acoustic"] },
      { id: "musician",     label: "Musician",    specialties: ["Pianist", "Saxophonist", "Guitarist", "Violinist"] },
      { id: "live_act",     label: "Live act",    specialties: ["Live painting", "Live percussion"] },
    ],
  },
  {
    id: "creators", label: "Creators & Influencers", emoji: "📱", minPlan: "free",
    helper: "Content creators, influencers, UGC.",
    children: [
      { id: "influencer",   label: "Influencer" },
      { id: "ugc_creator",  label: "UGC creator" },
      { id: "podcaster",    label: "Podcaster" },
      { id: "tiktoker",     label: "Short-form creator" },
    ],
  },
  {
    id: "chefs", label: "Chefs & Culinary", emoji: "👨‍🍳", minPlan: "agency",
    helper: "Private chefs, mixologists, sommeliers.",
    children: [
      { id: "private_chef", label: "Private chef", specialties: ["Sushi", "Italian", "Mexican", "Mediterranean", "Plant-based"] },
      { id: "mixologist",   label: "Mixologist",   specialties: ["Cocktail menu", "Tasting flight", "Live show"] },
      { id: "sommelier",    label: "Sommelier",    specialties: ["Wine pairing", "Whisky", "Sake"] },
      { id: "pastry",       label: "Pastry chef",  specialties: ["Patisserie", "Wedding cake", "Plated dessert"] },
      { id: "catering",     label: "Catering team", specialties: ["Wedding", "Corporate", "Festival"] },
    ],
  },
  {
    id: "wellness", label: "Wellness", emoji: "🌿", minPlan: "agency",
    helper: "Massage, yoga, training, breathwork.",
    children: [
      { id: "massage",      label: "Massage therapist", specialties: ["Deep tissue", "Swedish", "Thai", "Sports"] },
      { id: "yoga",         label: "Yoga instructor",   specialties: ["Hatha", "Vinyasa", "Yin", "Kids"] },
      { id: "trainer",      label: "Personal trainer",  specialties: ["Strength", "HIIT", "Pilates"] },
      { id: "breathwork",   label: "Breathwork / sound healing" },
    ],
  },
  {
    id: "hospitality", label: "Hospitality", emoji: "🏨", minPlan: "agency",
    helper: "Housekeeping, butlers, villa staff.",
    children: [
      { id: "housekeeper",  label: "Housekeeper",     specialties: ["Villa", "Airbnb", "Hotel"] },
      { id: "butler",       label: "Butler",          specialties: ["Service", "Concierge support"] },
      { id: "villa_staff",  label: "Villa staff" },
      { id: "concierge",    label: "Concierge" },
    ],
  },
  {
    id: "transportation", label: "Transportation", emoji: "🚙", minPlan: "agency",
    helper: "Drivers, chauffeurs, transfer services.",
    children: [
      { id: "chauffeur",    label: "Chauffeur",      specialties: ["VIP", "Wedding", "Long-distance"] },
      { id: "airport",      label: "Airport transfer" },
      { id: "shuttle",      label: "Shuttle driver" },
    ],
  },
  {
    id: "photo_video", label: "Photo & Video", emoji: "📷", minPlan: "studio",
    helper: "Photographers, videographers, drone operators.",
    children: [
      { id: "photographer", label: "Photographer" },
      { id: "videographer", label: "Videographer" },
      { id: "drone",        label: "Drone operator" },
      { id: "editor",       label: "Editor / colorist" },
    ],
  },
  {
    id: "event_staff", label: "Event Staff", emoji: "✦", minPlan: "agency",
    helper: "Setup, runners, coordinators, assistants.",
    children: [
      { id: "setup",        label: "Event setup crew" },
      { id: "runner",       label: "Runner" },
      { id: "coordinator",  label: "Event coordinator" },
      { id: "stage",        label: "Stage manager" },
    ],
  },
  {
    id: "security", label: "Security", emoji: "🛡", minPlan: "agency",
    helper: "Bodyguards, event security, door staff.",
    children: [
      { id: "bodyguard",    label: "Bodyguard" },
      { id: "event_sec",    label: "Event security" },
      { id: "door",         label: "Door staff" },
    ],
  },
];

export const PLAN_TAXONOMY_LIMITS: Record<"free" | "studio" | "agency" | "network", number> = {
  free: 3,
  studio: 8,
  agency: 999,    // all
  network: 999,   // all + multi-hub vocabularies
};

/**
 * Per-workspace taxonomy settings. Mock for prototype — production
 * lives in `workspace_taxonomy_settings` keyed by tenant_id.
 * Each enabled parent has its own visibility + approval rules.
 */
export type WorkspaceTaxonomySetting = {
  parentId: TaxonomyParentId;
  isEnabled: boolean;
  showInDirectory: boolean;
  showInRegistration: boolean;
  requiresApproval: boolean;
  customLabel?: string;
};

/**
 * Type-specific field schemas. Talent registration shows different
 * fields per parent category. Production stores these in
 * `taxonomy_field_schema` with a JSON Schema; the prototype keeps
 * a flat shape for clarity.
 */
export type RegFieldKind = "text" | "number" | "select" | "multiselect" | "chips";
/** Visibility channel for a talent profile field. Used by _field-catalog.ts
 *  to express who can see a given field by default. Talent can override. */
/** Visibility channel for a talent profile field. Matches FieldChannel
 *  in _primitives.tsx so RegField.defaultVisibility values are always
 *  assignable to FieldVisibility (the UI strip's value type). The
 *  "platform" channel (staff-only, not UI-editable) is intentionally
 *  excluded — staff-visible fields use adminOnly flag instead. */
export type RegFieldChannel = "public" | "agency" | "private";
export type RegField = {
  id: string;
  label: string;
  kind: RegFieldKind;
  optional?: boolean;
  placeholder?: string;
  helper?: string;
  options?: string[];
  /** Drawer subsection — "physical" (measurements) or "wardrobe" (sizes).
   *  Drives the section mapping in _field-catalog.ts deriveTypeFields(). */
  subsection?: "physical" | "wardrobe";
  /** Whether this field is privacy-sensitive; drives the visibility chip strip. */
  sensitive?: boolean;
  /** Default visibility channels for this field; talent can override per-field. */
  defaultVisibility?: ReadonlyArray<RegFieldChannel>;
};

export const TAXONOMY_FIELDS: Record<TaxonomyParentId, RegField[]> = {
  models: [
    { id: "height",       label: "Height",         kind: "text",   placeholder: "5'9\" / 175 cm" },
    { id: "bust",         label: "Bust",           kind: "text",   optional: true, placeholder: "85 cm" },
    { id: "waist",        label: "Waist",          kind: "text",   optional: true, placeholder: "62 cm" },
    { id: "hips",         label: "Hips",           kind: "text",   optional: true, placeholder: "90 cm" },
    { id: "shoe",         label: "Shoe size (EU)", kind: "text",   optional: true, placeholder: "39" },
    { id: "hair",         label: "Hair color",     kind: "select", options: ["Black", "Brown", "Blonde", "Red", "Grey", "Other"] },
    { id: "eyes",         label: "Eye color",      kind: "select", options: ["Brown", "Blue", "Green", "Hazel", "Grey", "Other"] },
  ],
  hosts: [
    { id: "languages_fluent", label: "Languages spoken", kind: "chips", placeholder: "Add a language…" },
    { id: "vibe",             label: "Style",            kind: "select", options: ["Energetic", "Polished", "Warm", "Edgy"] },
    { id: "experience_yrs",   label: "Years hosting",    kind: "number", optional: true, placeholder: "3" },
  ],
  performers: [
    { id: "act_type",      label: "Act type",      kind: "multiselect", options: ["Solo", "Duo", "Group", "Choreographed", "Improv"] },
    { id: "rig_required",  label: "Rigging needed", kind: "select", options: ["No", "Truss", "Hard point", "Crane / lift"] },
    { id: "duration_min",  label: "Typical set length", kind: "text", optional: true, placeholder: "20–30 min" },
  ],
  music: [
    { id: "genre",         label: "Primary genres", kind: "chips", placeholder: "Add a genre…" },
    { id: "set_length",    label: "Set length",     kind: "select", options: ["30 min", "60 min", "90 min", "2 hr", "3 hr+"] },
    { id: "equipment",     label: "Brings own equipment?", kind: "select", options: ["Full setup", "Partial", "No equipment"] },
  ],
  creators: [
    { id: "platforms",     label: "Platforms",      kind: "multiselect", options: ["Instagram", "TikTok", "YouTube", "Substack", "Twitch", "X"] },
    { id: "followers",     label: "Audience size",  kind: "select", options: ["< 10k", "10–50k", "50–250k", "250k–1M", "1M+"] },
    { id: "niche",         label: "Niche",          kind: "chips", placeholder: "Add a niche…" },
  ],
  chefs: [
    { id: "cuisines",      label: "Cuisines",       kind: "chips", placeholder: "Add a cuisine…" },
    { id: "dietary",       label: "Dietary specialties", kind: "multiselect", options: ["Vegan", "Vegetarian", "Gluten-free", "Kosher", "Halal", "Raw"] },
    { id: "service_style", label: "Service style",  kind: "select", options: ["Plated", "Family-style", "Tasting menu", "Buffet"] },
  ],
  wellness: [
    { id: "modalities",    label: "Modalities",     kind: "chips", placeholder: "Add a modality…" },
    { id: "certifications", label: "Certifications", kind: "chips", optional: true, placeholder: "Add a cert…" },
    { id: "session_min",   label: "Session length", kind: "select", options: ["30 min", "60 min", "90 min", "2 hr"] },
  ],
  hospitality: [
    { id: "languages_fluent", label: "Languages spoken", kind: "chips", placeholder: "Add a language…" },
    { id: "experience_yrs",   label: "Years experience", kind: "number", optional: true, placeholder: "5" },
    { id: "uniform",          label: "Uniform owned",   kind: "select", options: ["Black tie", "Whites", "Casual", "None"] },
  ],
  transportation: [
    { id: "vehicle",       label: "Vehicle type",   kind: "select", options: ["Sedan", "SUV", "Van", "Sprinter", "Luxury", "Limo"] },
    { id: "vehicle_year",  label: "Vehicle year",   kind: "text", optional: true, placeholder: "2024" },
    { id: "license_class", label: "License class",  kind: "select", options: ["Standard", "Commercial", "Chauffeur"] },
    { id: "max_pax",       label: "Max passengers", kind: "number", placeholder: "4" },
  ],
  photo_video: [
    { id: "format",        label: "Formats",        kind: "multiselect", options: ["Editorial", "Commercial", "Wedding", "Event", "Documentary", "Fashion"] },
    { id: "kit",           label: "Kit owned",      kind: "select", options: ["Full studio", "Mobile pro", "Camera + lens only"] },
    { id: "deliverables",  label: "Typical turnaround", kind: "select", options: ["24h", "3 days", "1 week", "2 weeks+"] },
  ],
  event_staff: [
    { id: "role_focus",    label: "Role focus",     kind: "multiselect", options: ["Setup", "Runner", "Coordinator", "Stage manager", "Crowd control"] },
    { id: "physical",      label: "Physical lifting OK?", kind: "select", options: ["Up to 10kg", "Up to 25kg", "Heavy lifting OK"] },
  ],
  security: [
    { id: "license",       label: "Security license", kind: "select", options: ["SIA / equivalent", "Armed", "Unarmed", "Pending"] },
    { id: "training",      label: "Training",       kind: "multiselect", options: ["Close protection", "Crowd control", "First aid", "De-escalation"] },
    { id: "languages_fluent", label: "Languages spoken", kind: "chips", placeholder: "Add a language…" },
  ],
};

/** Default settings for the demo agency (Atelier Roma). Free plan = 3 enabled. */
export const WORKSPACE_TAXONOMY_DEFAULT: WorkspaceTaxonomySetting[] = [
  { parentId: "models",     isEnabled: true,  showInDirectory: true, showInRegistration: true, requiresApproval: true },
  { parentId: "hosts",      isEnabled: true,  showInDirectory: true, showInRegistration: true, requiresApproval: true },
  { parentId: "performers", isEnabled: true,  showInDirectory: true, showInRegistration: true, requiresApproval: false },
  { parentId: "music",          isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "creators",       isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "chefs",          isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "wellness",       isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "hospitality",    isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "transportation", isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
  { parentId: "photo_video",    isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: false },
  { parentId: "event_staff",    isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: false },
  { parentId: "security",       isEnabled: false, showInDirectory: false, showInRegistration: false, requiresApproval: true },
];

export const DISCOVER_TALENT: DiscoverTalent[] = [
  { id: "dt1", name: "Marta Reyes", agency: "Atelier Roma", city: "Madrid", height: "5'9\"", thumb: "https://i.pravatar.cc/600?img=5", available: true, category: "models",
    subType: "fashion", trust: "gold", slug: "marta-reyes", premiumPage: true,
    bio: "Editorial-leaning fashion model based in Madrid. Eight years with Acme; recent campaigns for Mango, Bvlgari, Loewe.",
    channels: [
      { kind: "agency", name: "Atelier Roma", commission: "20%" },
      { kind: "agency", name: "Praline London", commission: "20%" },
      { kind: "freelance", name: "Direct (Marta is your coordinator)" },
    ] },
  { id: "dt2", name: "Kai Lin", agency: "Atelier Roma", city: "Berlin", height: "5'11\"", thumb: "https://i.pravatar.cc/600?img=14", available: true, category: "models",
    subType: "commercial", trust: "verified", slug: "kai-lin",
    bio: "Commercial + showroom specialist. Berlin-based, bilingual EN/DE.",
    channels: [
      { kind: "agency", name: "Atelier Roma", commission: "20%" },
      { kind: "hub", name: "Tulum Hub", commission: "10%" },
    ] },
  { id: "dt3", name: "Tomás Navarro", agency: "Atelier Roma", city: "Lisbon", height: "6'1\"", thumb: "https://i.pravatar.cc/600?img=12", available: true, category: "hosts",
    subType: "vip_host", trust: "silver", slug: "tomas-navarro", replyTimeMin: 90,
    bio: "VIP host & MC. Lisbon nightlife scene + Algarve summer residencies.",
    channels: [
      { kind: "agency", name: "Atelier Roma", commission: "20%" },
      { kind: "freelance", name: "Direct (Tomás is your coordinator)" },
    ] },
  { id: "dt4", name: "Yuna Park", agency: "Praline London", city: "London", height: "5'10\"", thumb: "https://i.pravatar.cc/600?img=44", available: false, category: "models",
    subType: "fashion", trust: "verified", slug: "yuna-park",
    bio: "Editorial + runway. Exclusive with Praline London since 2023.",
    channels: [
      { kind: "agency", name: "Praline London (exclusive)", commission: "22%" },
    ] },
  { id: "dt5", name: "Léa Mercier", agency: "Maison Sud", city: "Paris", height: "5'8\"", thumb: "https://i.pravatar.cc/600?img=47", available: true, category: "djs",
    subType: "dj", trust: "silver", slug: "lea-mercier", replyTimeMin: 45, premiumPage: true,
    bio: "House + disco DJ. Paris residencies + festival circuit. 90 / 120 / 180 min sets.",
    channels: [
      { kind: "agency", name: "Maison Sud", commission: "18%" },
      { kind: "freelance", name: "Direct (Léa is your coordinator)" },
    ] },
  { id: "dt6", name: "Ola Brandt", agency: "Nord Talent", city: "Copenhagen", height: "5'11\"", thumb: "https://i.pravatar.cc/600?img=49", available: true, category: "chefs",
    subType: "private_chef", trust: "verified", slug: "ola-brandt", replyTimeMin: 30,
    bio: "Nordic / new-Scandinavian private chef. Tasting menus 6–24 guests.",
    channels: [
      { kind: "freelance", name: "Direct (Ola is your coordinator)" },
    ] },
  { id: "dt7", name: "Rafa Ortega", agency: "Atelier Roma", city: "Madrid", height: "6'0\"", thumb: "https://i.pravatar.cc/600?img=53", available: false, category: "performers",
    subType: "fire", trust: "verified", slug: "rafa-ortega",
    bio: "Fire performer + acrobat. Festival circuit Spain + Portugal.",
    channels: [
      { kind: "agency", name: "Atelier Roma", commission: "20%" },
      { kind: "hub", name: "Tulum Hub", commission: "10%" },
      { kind: "freelance", name: "Direct (Rafa is your coordinator)" },
    ] },
  { id: "dt8", name: "Iris Volpe", agency: "Bottega Roma", city: "Rome", height: "5'9\"", thumb: "https://i.pravatar.cc/600?img=16", available: true, category: "artists",
    subType: "live_act", trust: "basic", slug: "iris-volpe",
    bio: "Live painting + performance. Multi-day events.",
    channels: [
      { kind: "agency", name: "Bottega Roma", commission: "25%" },
      { kind: "freelance", name: "Direct (Iris is your coordinator)" },
    ] },
];

// ════════════════════════════════════════════════════════════════════
// Talent trust tier — surfaced as a chip on profile sheets and the
// inquiry workspace. NOT subscription-driven (per binding spec). Driven
// by verification + funded-account signals on the talent's account.
// ════════════════════════════════════════════════════════════════════

export const TALENT_TRUST_META: Record<"basic" | "verified" | "silver" | "gold", {
  label: string; emoji: string; bg: string; fg: string; helper: string;
}> = {
  basic:    { label: "Basic",    emoji: "·",  bg: "rgba(11,11,13,0.05)", fg: "rgba(11,11,13,0.55)", helper: "New profile · no verification yet." },
  verified: { label: "Verified", emoji: "✓",  bg: "rgba(91,107,160,0.10)", fg: "#3B4A75", helper: "ID + payout details verified." },
  silver:   { label: "Silver",   emoji: "✦",  bg: "rgba(82,96,109,0.12)",  fg: "#3A4651", helper: "Verified + repeat bookings on Tulala." },
  gold:     { label: "Gold",     emoji: "★",  bg: "rgba(184,135,49,0.14)", fg: "#7A5A1F", helper: "Silver + funded-account top-tier client." },
};

// ════════════════════════════════════════════════════════════════════
// TRUST & VERIFICATION SYSTEM (Phase 1)
//
// Marketplace trust layer — separate from account/email security.
// Three concepts:
//   1. Account Verification (email/phone) — security only, no public badge
//   2. Profile Claiming — agency creates profile, talent claims it
//   3. Profile Trust Verification — public/private trust badges
//
// MVP verification types: instagram_verified, tulala_verified, agency_confirmed.
// Future-ready for: business_verified, domain_verified, payment_verified, id_verified.
//
// All shapes mirror the production schema (verification_requests,
// profile_verifications, profile_claim_invitations) so demo state is
// portable to real persistence.
// ════════════════════════════════════════════════════════════════════

export type VerificationSubjectType =
  | "talent_profile"
  | "client_profile"
  | "brand_profile"
  | "agency_profile"
  | "user_account";

export type VerificationContext = "hub" | "agency" | "studio" | "client" | "platform";

export type VerificationMethod =
  | "instagram_dm"
  | "manual_review"
  | "agency_confirmation"
  | "domain"
  | "payment"
  | "phone"
  | "email";

export type VerificationType =
  | "instagram_verified"
  | "tulala_verified"
  | "agency_confirmed"
  | "business_verified"
  | "domain_verified"
  | "payment_verified"
  | "phone_verified"
  | "id_verified";

export type VerificationRequestStatus =
  | "draft"
  | "pending_user_action"
  | "submitted"
  | "in_review"
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled"
  | "needs_more_info";

export type ProfileClaimStatus =
  | "unclaimed"
  | "invite_sent"
  | "claimed"
  | "disputed"
  | "released";

export type VerificationActiveStatus = "active" | "revoked" | "expired";

// ─── Platform-admin verification method registry ────────────────────────
// Phase 2 — platform admins decide which verification methods are
// available across the whole platform. Disabled methods disappear from
// talent CTAs, admin queue tabs, and public badges. Workspace admins
// cannot override these settings.

export type VerificationReviewMode = "automated" | "manual" | "hybrid";
export type VerificationVisibility = "public_profile" | "admin_only" | "internal";
export type VerificationTierGate = "basic" | "pro" | "portfolio" | "all";

export type VerificationMethodConfig = {
  type: VerificationType;
  enabled: boolean;
  reviewMode: VerificationReviewMode;
  visibleOn: VerificationVisibility[];
  /** Talent subscription tiers that can use this method. "all" means
   *  any talent can use it regardless of plan. */
  availableToTiers: VerificationTierGate[];
  evidenceRequired: boolean;
  /** Number of days a badge stays active after approval before it
   *  expires and must be re-verified. null = never expires. */
  expiresAfterDays?: number | null;
};

/** Audit entry for the verification methods console — every toggle
 *  produces one of these so platform admins can see who changed what. */
export type VerificationMethodAuditEntry = {
  id: string;
  methodType: VerificationType;
  changedByUserId: string;
  changeKind: "enabled" | "disabled" | "review_mode" | "visibility" | "tier_gate" | "evidence_required" | "expiry";
  before: string;
  after: string;
  at: string;
};

/** A single verification attempt — every action by user/agency/admin
 *  creates one of these. Lifecycle: draft → submitted → in_review →
 *  approved | rejected | needs_more_info. */
export type VerificationRequest = {
  id: string;
  subjectType: VerificationSubjectType;
  subjectId: string;
  /** User who initiated — null when system-created. */
  requestedByUserId: string | null;
  context: VerificationContext;
  agencyId?: string | null;
  hubId?: string | null;
  clientId?: string | null;
  method: VerificationMethod;
  verificationType: VerificationType;
  status: VerificationRequestStatus;
  /** Generated unique code talent must include in their DM. */
  verificationCode?: string | null;
  /** What identifier the user is claiming — @handle, domain.com, etc. */
  claimedIdentifier?: string | null;
  /** Profile URL etc. */
  targetUrl?: string | null;
  /** Talent-provided supporting URL — screenshot of DM, ID document URL,
   *  invoice, work portfolio link, etc. Visible to admin reviewers. */
  evidenceUrl?: string | null;
  /** Free-text evidence note from talent (e.g. "DM sent from
   *  @marta.studio at 14:02 GMT, screenshot attached"). */
  evidenceNote?: string | null;
  /** Public message visible to talent (e.g. rejection reason summary). */
  publicMessage?: string | null;
  /** Admin-only notes — never shown to talent. */
  adminNotes?: string | null;
  rejectionReason?: string | null;
  reviewedByUserId?: string | null;
  reviewedAt?: string | null;
  expiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Approved active verification badge. Created when an admin approves a
 *  matching VerificationRequest. Rendered as the public badge. */
export type ProfileVerification = {
  id: string;
  subjectType: VerificationSubjectType;
  subjectId: string;
  verificationType: VerificationType;
  /** instagram | tulala | agency | domain | stripe | phone | email */
  provider: string;
  /** @handle or agency_id or domain — depends on type. */
  identifier?: string | null;
  sourceRequestId: string;
  status: VerificationActiveStatus;
  publicBadgeEnabled: boolean;
  verifiedByUserId?: string | null;
  verifiedAt: string;
  expiresAt?: string | null;
  metadata?: Record<string, unknown>;
};

/** Profile claim invitation sent by agency/studio/admin to a talent. */
export type ProfileClaimInvitation = {
  id: string;
  profileId: string;
  profileType: "talent_profile" | "client_profile" | "brand_profile";
  email?: string;
  phone?: string;
  invitedByUserId: string;
  invitedByAgencyId?: string;
  tokenHash: string;
  status: "pending" | "accepted" | "expired" | "revoked" | "disputed";
  acceptedByUserId?: string | null;
  acceptedAt?: string | null;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
};

/** Per-verification-type display metadata — labels, tooltips, palette. */
export const VERIFICATION_TYPE_META: Record<VerificationType, {
  label: string;
  shortLabel: string;
  emoji: string;
  tooltip: string;
  bg: string;
  fg: string;
  /** Whether this badge should ever appear publicly. */
  publicEligible: boolean;
}> = {
  instagram_verified: {
    label: "Instagram Verified",
    shortLabel: "IG Verified",
    emoji: "📸",
    tooltip: "Tulala confirmed this profile controls the Instagram account linked here.",
    bg: "rgba(225,48,108,0.10)",
    fg: "#C13584",
    publicEligible: true,
  },
  tulala_verified: {
    label: "Tulala Verified",
    shortLabel: "Tulala Verified",
    emoji: "✓",
    tooltip: "Tulala manually reviewed this profile for authenticity and quality.",
    bg: "rgba(15,79,62,0.10)",
    fg: "#0F4F3E",
    publicEligible: true,
  },
  agency_confirmed: {
    label: "Agency Confirmed",
    shortLabel: "Agency Confirmed",
    emoji: "✦",
    tooltip: "This agency confirmed the profile is part of its roster.",
    bg: "rgba(91,107,160,0.10)",
    fg: "#3B4A75",
    publicEligible: true,
  },
  business_verified: {
    label: "Business Verified",
    shortLabel: "Business Verified",
    emoji: "🏢",
    tooltip: "Tulala verified the business identity behind this brand.",
    bg: "rgba(184,135,49,0.14)",
    fg: "#7A5A1F",
    publicEligible: true,
  },
  domain_verified: {
    label: "Domain Verified",
    shortLabel: "Domain Verified",
    emoji: "🌐",
    tooltip: "This profile controls the domain it's linked from.",
    bg: "rgba(91,107,160,0.10)",
    fg: "#3B4A75",
    publicEligible: true,
  },
  payment_verified: {
    label: "Payment Verified",
    shortLabel: "Payment Verified",
    emoji: "💳",
    tooltip: "This client has a verified payment method on Tulala.",
    bg: "rgba(15,79,62,0.10)",
    fg: "#0F4F3E",
    publicEligible: true,
  },
  phone_verified: {
    label: "Phone Verified",
    shortLabel: "Phone",
    emoji: "📱",
    tooltip: "Phone number confirmed via SMS code.",
    bg: "rgba(11,11,13,0.05)",
    fg: "rgba(11,11,13,0.72)",
    publicEligible: false,
  },
  id_verified: {
    label: "ID Verified",
    shortLabel: "ID Verified",
    emoji: "🪪",
    tooltip: "Government ID confirmed by Tulala review.",
    bg: "rgba(15,79,62,0.10)",
    fg: "#0F4F3E",
    publicEligible: true,
  },
};

/** Claim status display metadata. */
export const PROFILE_CLAIM_META: Record<ProfileClaimStatus, {
  label: string;
  shortLabel: string;
  bg: string;
  fg: string;
  helper: string;
}> = {
  unclaimed:   { label: "Unclaimed",   shortLabel: "Unclaimed",   bg: "rgba(11,11,13,0.05)",   fg: "rgba(11,11,13,0.55)", helper: "Created by an agency or admin. Talent hasn't claimed it yet." },
  invite_sent: { label: "Invite sent", shortLabel: "Invite sent", bg: "rgba(82,96,109,0.10)",  fg: "#3A4651",             helper: "Claim invite emailed. Waiting for talent." },
  claimed:     { label: "Claimed",     shortLabel: "Claimed",     bg: "rgba(15,79,62,0.10)",   fg: "#0F4F3E",             helper: "Talent owns this profile and verified their email." },
  disputed:    { label: "Disputed",    shortLabel: "Disputed",    bg: "rgba(200,40,40,0.10)",  fg: "#C82828",             helper: "Talent flagged this profile as not theirs. Admin review needed." },
  released:    { label: "Released",    shortLabel: "Released",    bg: "rgba(11,11,13,0.05)",   fg: "rgba(11,11,13,0.55)", helper: "Talent released ownership back to the agency." },
};

/** Normalized trust data returned by getTrustSummary — used across all
 *  surfaces (public profile, roster, admin queue, inquiry, chat headers). */
export type TrustSummary = {
  subjectType: VerificationSubjectType;
  subjectId: string;
  claimStatus?: ProfileClaimStatus;
  account?: {
    emailVerified?: boolean;
    phoneVerified?: boolean;
  };
  badges: Array<{
    type: VerificationType;
    label: string;
    tooltip: string;
    public: boolean;
    status: VerificationActiveStatus;
    identifier?: string | null;
    /** Phase 2 — false when the platform admin has disabled this method.
     *  Public surfaces hide such badges; admin surfaces show them with
     *  a "(method disabled)" annotation so the badge isn't lost. */
    methodEnabled: boolean;
  }>;
  pendingRequests: Array<{
    verificationType: VerificationType;
    status: VerificationRequestStatus;
    method: VerificationMethod;
  }>;
};

// ── Mock data ────────────────────────────────────────────────────────

/** Seed verification requests across the Tulala demo dataset. */
export const SEED_VERIFICATION_REQUESTS: VerificationRequest[] = [
  // Marta has IG Verified approved + Tulala Verified approved
  {
    id: "vr-001", subjectType: "talent_profile", subjectId: "t1",
    requestedByUserId: "u-marta", context: "agency", agencyId: "a-atelier-roma",
    method: "instagram_dm", verificationType: "instagram_verified",
    status: "approved", verificationCode: "TUL-8492", claimedIdentifier: "@martareyesmodel",
    targetUrl: "https://atelier-roma.tulala.app/marta-reyes",
    reviewedByUserId: "u-platform-admin", reviewedAt: "2026-04-22T10:00:00Z",
    createdAt: "2026-04-20T14:32:00Z", updatedAt: "2026-04-22T10:00:00Z",
  },
  {
    id: "vr-002", subjectType: "talent_profile", subjectId: "t1",
    requestedByUserId: "u-marta", context: "agency", agencyId: "a-atelier-roma",
    method: "manual_review", verificationType: "tulala_verified",
    status: "approved", reviewedByUserId: "u-platform-admin",
    reviewedAt: "2026-04-23T11:00:00Z",
    createdAt: "2026-04-22T15:00:00Z", updatedAt: "2026-04-23T11:00:00Z",
  },
  // Kai Lin has IG submitted, awaiting admin
  {
    id: "vr-003", subjectType: "talent_profile", subjectId: "t2",
    requestedByUserId: "u-kai", context: "agency", agencyId: "a-atelier-roma",
    method: "instagram_dm", verificationType: "instagram_verified",
    status: "submitted", verificationCode: "TUL-3318", claimedIdentifier: "@kailin",
    targetUrl: "https://atelier-roma.tulala.app/kai-lin",
    evidenceUrl: "https://drive.tulala.app/screens/kai-ig-dm-2026-04-29.png",
    evidenceNote: "DM sent 2026-04-29 16:28 GMT from @kailin. Screenshot attached.",
    createdAt: "2026-04-29T16:12:00Z", updatedAt: "2026-04-29T16:30:00Z",
    expiresAt: "2026-05-02T16:12:00Z",
  },
  // Tomás Navarro IG pending — talent hasn't sent the DM yet
  {
    id: "vr-004", subjectType: "talent_profile", subjectId: "t3",
    requestedByUserId: "u-tomas", context: "agency", agencyId: "a-atelier-roma",
    method: "instagram_dm", verificationType: "instagram_verified",
    status: "pending_user_action", verificationCode: "TUL-7041", claimedIdentifier: "@tomasnvarro",
    targetUrl: "https://atelier-roma.tulala.app/tomas-navarro",
    createdAt: "2026-04-30T09:00:00Z", updatedAt: "2026-04-30T09:00:00Z",
    expiresAt: "2026-05-03T09:00:00Z",
  },
  // Lina Park — needs more info from admin
  {
    id: "vr-005", subjectType: "talent_profile", subjectId: "t4",
    requestedByUserId: "u-lina", context: "agency", agencyId: "a-atelier-roma",
    method: "manual_review", verificationType: "tulala_verified",
    status: "needs_more_info",
    publicMessage: "Add at least 3 portfolio photos before resubmitting.",
    adminNotes: "Profile is too thin — only 1 photo and no bio. Tulala bar is 3+ photos + bio.",
    reviewedByUserId: "u-platform-admin", reviewedAt: "2026-04-28T14:00:00Z",
    createdAt: "2026-04-27T10:00:00Z", updatedAt: "2026-04-28T14:00:00Z",
  },
];

/** Seed approved profile verifications — derived from approved requests. */
export const SEED_PROFILE_VERIFICATIONS: ProfileVerification[] = [
  {
    id: "pv-001", subjectType: "talent_profile", subjectId: "t1",
    verificationType: "instagram_verified", provider: "instagram",
    identifier: "@martareyesmodel", sourceRequestId: "vr-001",
    status: "active", publicBadgeEnabled: true,
    verifiedByUserId: "u-platform-admin", verifiedAt: "2026-04-22T10:00:00Z",
  },
  {
    id: "pv-002", subjectType: "talent_profile", subjectId: "t1",
    verificationType: "tulala_verified", provider: "tulala",
    sourceRequestId: "vr-002",
    status: "active", publicBadgeEnabled: true,
    verifiedByUserId: "u-platform-admin", verifiedAt: "2026-04-23T11:00:00Z",
  },
  // Agency-confirmed for several talents on Atelier Roma
  {
    id: "pv-003", subjectType: "talent_profile", subjectId: "t1",
    verificationType: "agency_confirmed", provider: "agency",
    identifier: "atelier-roma", sourceRequestId: "system-agency-confirm",
    status: "active", publicBadgeEnabled: true,
    verifiedAt: "2026-04-15T00:00:00Z",
    metadata: { agencyName: "Atelier Roma" },
  },
  {
    id: "pv-004", subjectType: "talent_profile", subjectId: "t2",
    verificationType: "agency_confirmed", provider: "agency",
    identifier: "atelier-roma", sourceRequestId: "system-agency-confirm",
    status: "active", publicBadgeEnabled: true,
    verifiedAt: "2026-04-15T00:00:00Z",
    metadata: { agencyName: "Atelier Roma" },
  },
  {
    id: "pv-005", subjectType: "talent_profile", subjectId: "t3",
    verificationType: "agency_confirmed", provider: "agency",
    identifier: "atelier-roma", sourceRequestId: "system-agency-confirm",
    status: "active", publicBadgeEnabled: true,
    verifiedAt: "2026-04-18T00:00:00Z",
    metadata: { agencyName: "Atelier Roma" },
  },
  // Client-side: Vogue Italia is business verified
  {
    id: "pv-006", subjectType: "client_profile", subjectId: "c1",
    verificationType: "business_verified", provider: "tulala",
    sourceRequestId: "system-business",
    status: "active", publicBadgeEnabled: true,
    verifiedAt: "2026-03-01T00:00:00Z",
  },
];

/** Seed claim invitations — Amelia and Kai have outstanding invites. */
export const SEED_PROFILE_CLAIMS: ProfileClaimInvitation[] = [
  {
    id: "pci-001", profileId: "t5", profileType: "talent_profile",
    email: "amelia.dorsey@example.com",
    invitedByUserId: "u-marta", invitedByAgencyId: "a-atelier-roma",
    tokenHash: "hash-001", status: "pending",
    expiresAt: "2026-05-15T00:00:00Z",
    createdAt: "2026-04-25T10:00:00Z", updatedAt: "2026-04-25T10:00:00Z",
  },
  {
    // Disputed example — talent says this profile isn't theirs.
    id: "pci-002", profileId: "t8-disputed", profileType: "talent_profile",
    email: "lucas.moreno@example.com",
    invitedByUserId: "u-marta", invitedByAgencyId: "a-atelier-roma",
    tokenHash: "hash-002", status: "disputed",
    expiresAt: "2026-05-20T00:00:00Z",
    createdAt: "2026-04-22T09:30:00Z", updatedAt: "2026-04-28T14:12:00Z",
  },
];

/** Per-talent contact gate — controls who can send inquiries.
 *  Default "open" = anyone can DM. "verified_only" requires client to
 *  have an active trust badge; "trusted_only" requires score >= 60. */
export type TalentContactGate = "open" | "verified_only" | "trusted_only";
export const SEED_TALENT_CONTACT_GATE: Record<string, TalentContactGate> = {
  t1: "open",
  t2: "open",
  t3: "verified_only",
  t4: "open",
  t7: "trusted_only",
};

/** Per-talent claim status — keyed by talent id. Null/undefined means
 *  the profile was self-created (no claim flow needed). */
export const SEED_CLAIM_STATUS: Record<string, ProfileClaimStatus> = {
  t1: "claimed",      // Marta — long-tenured, fully claimed
  t2: "claimed",      // Kai — claimed, IG pending
  t3: "claimed",      // Tomás — claimed, IG pending user-action
  t4: "claimed",      // Lina — claimed, Tulala review needs more info
  t5: "invite_sent",  // Amelia — agency invited, talent hasn't accepted
  t6: "unclaimed",    // Sven — agency-managed draft, not yet invited
  t7: "claimed",      // Zara — claimed
};

/** Per-user account verification (email/phone). NOT a public badge,
 *  just account-security state. Keyed by user id. */
export const SEED_ACCOUNT_VERIFICATION: Record<string, { emailVerified: boolean; phoneVerified: boolean }> = {
  "u-marta":          { emailVerified: true,  phoneVerified: true  },
  "u-kai":            { emailVerified: true,  phoneVerified: false },
  "u-tomas":          { emailVerified: true,  phoneVerified: false },
  "u-lina":           { emailVerified: true,  phoneVerified: false },
  "u-amelia":         { emailVerified: false, phoneVerified: false }, // hasn't claimed yet
  "u-sven":           { emailVerified: false, phoneVerified: false },
  "u-zara":           { emailVerified: true,  phoneVerified: true  },
  "u-platform-admin": { emailVerified: true,  phoneVerified: true  },
};

/** Platform-admin verification-method registry. Source-of-truth for
 *  which methods are available across Tulala. Phase 1 launched with the
 *  three methods enabled (Instagram / Tulala / Agency). Phase 2 adds
 *  five methods that ship disabled by default — platform admin opts
 *  them in via the Verification Methods console. */
export const SEED_VERIFICATION_METHOD_CONFIG: VerificationMethodConfig[] = [
  { type: "instagram_verified", enabled: true,  reviewMode: "manual",    visibleOn: ["public_profile"],            availableToTiers: ["all"],               evidenceRequired: false, expiresAfterDays: null },
  { type: "tulala_verified",    enabled: true,  reviewMode: "manual",    visibleOn: ["public_profile"],            availableToTiers: ["all"],               evidenceRequired: false, expiresAfterDays: null },
  { type: "agency_confirmed",   enabled: true,  reviewMode: "automated", visibleOn: ["public_profile"],            availableToTiers: ["all"],               evidenceRequired: false, expiresAfterDays: null },
  { type: "phone_verified",     enabled: false, reviewMode: "automated", visibleOn: ["admin_only"],                availableToTiers: ["all"],               evidenceRequired: false, expiresAfterDays: 365 },
  { type: "id_verified",        enabled: false, reviewMode: "manual",    visibleOn: ["admin_only"],                availableToTiers: ["pro", "portfolio"], evidenceRequired: true,  expiresAfterDays: 730 },
  { type: "business_verified",  enabled: false, reviewMode: "manual",    visibleOn: ["public_profile"],            availableToTiers: ["pro", "portfolio"], evidenceRequired: true,  expiresAfterDays: 365 },
  { type: "domain_verified",    enabled: false, reviewMode: "automated", visibleOn: ["public_profile"],            availableToTiers: ["portfolio"],         evidenceRequired: false, expiresAfterDays: 90  },
  { type: "payment_verified",   enabled: false, reviewMode: "automated", visibleOn: ["admin_only"],                availableToTiers: ["all"],               evidenceRequired: false, expiresAfterDays: 365 },
];

/** Demo audit entries — production wires this to a real audit table. */
export const SEED_VERIFICATION_METHOD_AUDIT: VerificationMethodAuditEntry[] = [
  {
    id: "vma-001", methodType: "instagram_verified", changedByUserId: "u-platform-admin",
    changeKind: "enabled", before: "false", after: "true",
    at: "2026-04-01T09:00:00Z",
  },
  {
    id: "vma-002", methodType: "tulala_verified", changedByUserId: "u-platform-admin",
    changeKind: "enabled", before: "false", after: "true",
    at: "2026-04-01T09:01:00Z",
  },
  {
    id: "vma-003", methodType: "agency_confirmed", changedByUserId: "u-platform-admin",
    changeKind: "enabled", before: "false", after: "true",
    at: "2026-04-01T09:01:30Z",
  },
];

/** Map talent profile id → user id (their account). Used for resolving
 *  account verification state in getTrustSummary. */
export const TALENT_TO_USER: Record<string, string> = {
  t1: "u-marta",
  t2: "u-kai",
  t3: "u-tomas",
  t4: "u-lina",
  t5: "u-amelia",
  t6: "u-sven",
  t7: "u-zara",
};

// ════════════════════════════════════════════════════════════════════
// Pending talent registrations — Phase H (approval queue).
// New self-registered talent land here. Admin approves / rejects /
// requests more info. Counts roll up to a Roster badge.
// ════════════════════════════════════════════════════════════════════

export type PendingTalent = {
  id: string;
  name: string;
  thumb: string;
  parentCategory: TaxonomyParentId;
  childTypes: string[];
  city: string;
  submittedAgo: string;
  photoCount: number;
  languages: string[];
  fields: Record<string, string | string[]>;
};

export const PENDING_TALENT: PendingTalent[] = [
  {
    id: "pt1", name: "Sofia Lupo", thumb: "https://i.pravatar.cc/300?img=23",
    parentCategory: "models", childTypes: ["fashion", "swimwear"],
    city: "Naples", submittedAgo: "2h", photoCount: 6,
    languages: ["Italian", "English", "Spanish"],
    fields: { height: "5'10\"", bust: "85 cm", waist: "62 cm", hips: "90 cm", hair: "Brown", eyes: "Hazel" },
  },
  {
    id: "pt2", name: "Diego Martín", thumb: "https://i.pravatar.cc/300?img=33",
    parentCategory: "hosts", childTypes: ["vip_host", "mc"],
    city: "Madrid", submittedAgo: "5h", photoCount: 4,
    languages: ["Spanish", "English"],
    fields: { vibe: "Polished", experience_yrs: "6" },
  },
  {
    id: "pt3", name: "Aiyana Storm", thumb: "https://i.pravatar.cc/300?img=20",
    parentCategory: "performers", childTypes: ["dancer", "belly_dancer"],
    city: "Tulum", submittedAgo: "1d", photoCount: 5,
    languages: ["English", "Spanish"],
    fields: { act_type: ["Solo", "Choreographed"], rig_required: "No", duration_min: "30 min" },
  },
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
  { id: "sl1", name: "Spring lookbook · Estudio Solé SS27", brief: "Editorial · 4 talent", count: 6, updatedAgo: "2h", status: "shared", thumbs: [
    "https://i.pravatar.cc/200?img=5", "https://i.pravatar.cc/200?img=14",
    "https://i.pravatar.cc/200?img=12", "https://i.pravatar.cc/200?img=47",
  ] },
  { id: "sl2", name: "Bridal capsule", brief: "Lookbook · 3 talent", count: 4, updatedAgo: "1d", status: "draft", thumbs: [
    "https://i.pravatar.cc/200?img=47", "https://i.pravatar.cc/200?img=44", "https://i.pravatar.cc/200?img=10",
  ] },
  { id: "sl3", name: "Press kit launch", brief: "Editorial · 2 talent", count: 3, updatedAgo: "5d", status: "inquiry-sent", thumbs: [
    "https://i.pravatar.cc/200?img=5", "https://i.pravatar.cc/200?img=12",
  ] },
  { id: "sl4", name: "Winter '25 (archived)", brief: "Wrapped · 5 bookings", count: 7, updatedAgo: "4mo", status: "booked", thumbs: [
    "https://i.pravatar.cc/200?img=14", "https://i.pravatar.cc/200?img=47",
    "https://i.pravatar.cc/200?img=12", "https://i.pravatar.cc/200?img=10",
    "https://i.pravatar.cc/200?img=49",
  ] },
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
  /**
   * Cross-reference to the workspace RICH_INQUIRIES entry that matches
   * this client-side inquiry. M:1 — a single rich inquiry can span
   * multiple per-talent client inquiry rows.
   */
  inquiryId?: string;
};

export const CLIENT_INQUIRIES: ClientInquiry[] = [
  // ci1 + ci2 are per-talent line items from the same RI-201 (Mango spring lookbook).
  { id: "ci1", shortlistName: "Spring lookbook", agency: "Atelier Roma",    brief: "Marta Reyes · 1 day",    ageDays: 1, stage: "agency-replied", amount: "€1,800", date: "Tue · May 6",  inquiryId: "RI-201" },
  { id: "ci2", shortlistName: "Spring lookbook", agency: "Atelier Roma",    brief: "Tomás Navarro · 1 day",  ageDays: 1, stage: "negotiating",    amount: "€2,400", date: "Tue · May 6",  inquiryId: "RI-201" },
  // ci3 maps to RI-203 (Bvlgari / Kai Lin). Client stage "confirmed" = workspace stage "approved" (both sides said yes).
  { id: "ci3", shortlistName: "Press kit launch",agency: "Atelier Roma",    brief: "Kai Lin · 2 day",         ageDays: 5, stage: "confirmed",      amount: "€3,200", date: "May 14–15",    inquiryId: "RI-203" },
  // ci4 is a fresh client-side draft with no workspace counterpart yet.
  { id: "ci4", shortlistName: "Bridal capsule",  agency: "Maison Sud",      brief: "Léa Mercier · 1 day",    ageDays: 0, stage: "draft" },
  // ci5 is a declined line item — Yuna Park turned down for the Spring lookbook.
  { id: "ci5", shortlistName: "Spring lookbook", agency: "Praline London",  brief: "Yuna Park · 1 day",       ageDays: 3, stage: "declined",       amount: "£2,400",                       inquiryId: "RI-201" },
  // ci6 — new inquiry just submitted to Valentino; workspace RI-206 = submitted stage.
  { id: "ci6", shortlistName: "SS26 campaign",   agency: "Atelier Roma",     brief: "2 talent · 3 days",       ageDays: 0, stage: "sent",                             date: "Apr 29",      inquiryId: "RI-206" },
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
  /** Cross-reference to the workspace RICH_INQUIRIES booking. */
  inquiryId?: string;
};

export const CLIENT_BOOKINGS: ClientBooking[] = [
  // cb1 → RI-201 (Mango spring lookbook, Marta Reyes's slot).
  { id: "cb1", shortlistName: "Spring lookbook",  agency: "Atelier Roma", talent: "Marta Reyes",    date: "Tue, May 6",    location: "Madrid · Estudio Roca", amount: "€1,800", status: "confirmed", postStatus: "call-sheet-sent",  inquiryId: "RI-201" },
  // cb2 → RI-203 (Bvlgari jewelry campaign, Kai Lin). Workspace stage "approved" = client postStatus "contract-pending".
  { id: "cb2", shortlistName: "Press kit launch", agency: "Atelier Roma", talent: "Kai Lin",         date: "May 18–20",     location: "Rome · Cinecittà 7",    amount: "€8,200", status: "confirmed", postStatus: "contract-pending", inquiryId: "RI-203" },
  // cb3 — closed booking, no open inquiry.
  { id: "cb3", shortlistName: "Winter '25",        agency: "Atelier Roma", talent: "Tomás Navarro", date: "Feb 22, 2026",  location: "Madrid",                amount: "€2,400", status: "invoiced",  postStatus: "paid" },
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
  { agencyName: "Atelier Roma", bookingsCompleted: 12, onTimeRate: 100, cancellations: 0, repeatBookings: 9 },
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
  { id: "tn1", name: "Atelier Roma", slug: "acme-models", plan: "agency", entityType: "agency", seats: 8, talentCount: 47, mrr: "$149", health: "healthy", signupAt: "Jan 2025", lastActivity: "2m ago" },
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
  { id: "pu1", name: "Oran Tene", email: "oran@acme-models.com", primaryTenant: "Atelier Roma", tenants: 1, isTalent: false, signupAt: "Jan 2025", lastSeen: "now" },
  { id: "pu2", name: "Marta Reyes", email: "marta@reyes.studio", primaryTenant: "Atelier Roma", tenants: 2, isTalent: true, signupAt: "Mar 2024", lastSeen: "1h ago" },
  { id: "pu3", name: "Sara Bianchi", email: "sara@vogueitalia.com", primaryTenant: "(client) Vogue Italia", tenants: 1, isTalent: false, signupAt: "Feb 2026", lastSeen: "12m ago" },
  { id: "pu4", name: "Kai Lin", email: "kai@lin.studio", primaryTenant: "Atelier Roma", tenants: 1, isTalent: true, signupAt: "Jun 2024", lastSeen: "3h ago" },
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
  { id: "hs1", talentName: "Marta Reyes", agency: "Atelier Roma", submittedAt: "2h ago", status: "pending" },
  { id: "hs2", talentName: "Yuna Park", agency: "Praline London", submittedAt: "5h ago", status: "pending" },
  { id: "hs3", talentName: "Léa Mercier", agency: "Maison Sud", submittedAt: "1d ago", status: "featured" },
  { id: "hs4", talentName: "Ola Brandt", agency: "Nord Talent", submittedAt: "2d ago", status: "pending" },
  { id: "hs5", talentName: "Rafa Ortega", agency: "Atelier Roma", submittedAt: "3d ago", status: "declined", reason: "Profile under-developed" },
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
  { id: "inv1", tenant: "Atelier Roma", amount: "$149", date: "Apr 12, 2026", plan: "agency", status: "paid" },
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

type ToastAction = { label: string; onClick: () => void };
type Toast = { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone };

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
  /** Active client identity. "martina" = business (Martina Beach Club);
   * "gringo" = personal client (The Gringo). Drives identity bar photo. */
  clientProfile: ClientProfileId;
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
  /**
   * Workspace layout preference (X2). "topbar" (default) keeps the
   * existing horizontal nav. "sidebar" pivots to a workspace-style
   * vertical rail — useful for hybrid talent owners who run a workspace
   * and want a workspace-y mental model when they switch into it.
   * Persisted to localStorage.
   */
  workspaceLayout: WorkspaceLayout;
};

export type Density = "comfortable" | "compact";
export type WorkspaceLayout = "topbar" | "sidebar";

// ─── F5: Real-time push (engineering hook-up point) ──────────────────
//
// These types describe the shape of the realtime subscription the
// backend should push to a connected client. The prototype doesn't
// wire them — production replaces the static mock counts with these
// streams. Added here so the type contract is fixed before engineering
// stands up the websocket.

export type RealtimeChannel =
  | "talent-inbox"        // new inquiry / hold landed
  | "talent-conflict"     // calendar overlap detected by backend
  | "talent-counter"      // mock counts: bell badge, hybrid mode unread
  | "workspace-inbox"     // workspace inbox new item
  | "workspace-counter";  // workspace counter aggregates

export type RealtimeEvent =
  | { type: "inquiry-arrived"; channel: "talent-inbox" | "workspace-inbox"; inquiryId: string; at: string }
  | { type: "conflict-detected"; channel: "talent-conflict"; payload: { dateISO: string; eventIds: string[] }; at: string }
  | { type: "counter-changed"; channel: "talent-counter" | "workspace-counter"; counts: Record<string, number>; at: string };

// ─── F6: Telemetry (color-frequency budgets + interaction events) ────
//
// Same engineering hookup pattern. The design system has color
// frequency budgets (forest ≤5/screen, coral 0–2, red 0–1/week);
// telemetry tracks how often each role-color is rendered so the team
// can catch budget violations in production.

export type TelemetryEvent =
  | { type: "color-rendered"; role: "brand" | "success" | "coral" | "indigo" | "royal" | "critical" | "caution" | "locked" | "focus"; surface: Surface; page: string; at: string }
  | { type: "drawer-opened"; drawerId: DrawerId; surface: Surface; at: string }
  | { type: "mode-flip"; from: Surface; to: Surface; at: string }
  | { type: "celebration-shown"; milestone: string; at: string };

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
  setWorkspaceLayout: (l: WorkspaceLayout) => void;
  setPage: (p: WorkspacePage) => void;
  setTalentPage: (p: TalentPage) => void;
  setClientPlan: (p: ClientPlan) => void;
  setClientPage: (p: ClientPage) => void;
  /** Active client identity (Martina Beach Club business vs The Gringo person). */
  clientProfile: ClientProfileId;
  setClientProfile: (p: ClientProfileId) => void;
  /** Resolved profile object for the active client. */
  activeClientProfile: ClientProfile;
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
  toast: (message: string, opts?: { undo?: () => void; action?: ToastAction; tone?: ToastTone }) => void;
  dismissToast: (id: number) => void;
  completeTask: (id: string) => void;
  // Pending-approvals queue, lifted into proto state so the count is
  // observable globally (topbar nav badge, mobile nav, settings row).
  pendingTalent: PendingTalent[];
  resolveApproval: (id: string) => void;
  /** CSV bulk-import — append N talent records to the pending queue. Each
   *  row enters as a draft pending profile so admin can review-then-publish.
   *  Production wires this to a real INSERT into talent_profiles. */
  bulkAddTalent: (rows: { firstName: string; lastName: string; email: string; primaryType?: string; city?: string }[]) => number;
  // WS-25.2 — Bulk client import. Mirrors `bulkAddTalent`. Returns the
  // number of rows actually created. Validation: name + at least one of
  // email/contact required.
  bulkAddClient: (rows: { name: string; contact?: string; email?: string }[]) => number;
  importedClients: Client[];
  // Custom workspace fields (Agency tier). Lifted so the Field Catalog
  // and the Profile Shell are looking at the same list.
  customFields: WorkspaceCustomField[];
  addCustomField: (f: Omit<WorkspaceCustomField, "id">) => void;
  removeCustomField: (id: string) => void;
  setCustomFieldVisibility: (id: string, vis: FieldVisibility) => void;
  // Per-workspace overrides on built-in field visibility. Empty by default
  // (workspace falls back to DEFAULT_FIELD_VISIBILITY).
  fieldVisibilityOverrides: Partial<Record<ProfileFieldId, FieldVisibility>>;
  setFieldVisibility: (id: ProfileFieldId, vis: FieldVisibility) => void;
  /** Resolve effective visibility for any built-in field — overrides win, defaults fall through. */
  effectiveFieldVisibility: (id: ProfileFieldId) => FieldVisibility;

  // ── Trust & Verification ─────────────────────────────────────────
  verificationRequests: VerificationRequest[];
  profileVerifications: ProfileVerification[];
  profileClaims: ProfileClaimInvitation[];
  claimStatusByTalent: Record<string, ProfileClaimStatus>;
  /** Submit a new verification request — returns the created request. */
  createVerificationRequest: (input: Omit<VerificationRequest, "id" | "status" | "createdAt" | "updatedAt"> & {
    status?: VerificationRequestStatus;
  }) => VerificationRequest;
  /** Move a request through its lifecycle. */
  updateVerificationRequest: (id: string, patch: Partial<VerificationRequest>) => void;
  /** Approve a request — marks request approved + creates an active ProfileVerification. */
  approveVerificationRequest: (id: string) => void;
  /** Reject a request — marks request rejected with the given reason. */
  rejectVerificationRequest: (id: string, reason: string, publicMessage?: string) => void;
  /** Revoke an approved badge (e.g. IG handle changed). */
  revokeProfileVerification: (id: string) => void;
  /** Edge case: when a talent changes their Instagram handle, the prior
   *  Instagram Verified badge is auto-revoked (production sends a notice
   *  email; prototype just flips the status). Talent must re-verify. */
  revokeInstagramOnHandleChange: (subjectType: VerificationSubjectType, subjectId: string, newHandle: string) => void;
  /** Send a claim invite to a talent profile. */
  sendProfileClaimInvite: (input: Omit<ProfileClaimInvitation, "id" | "status" | "tokenHash" | "createdAt" | "updatedAt">) => void;
  /** Resolve a disputed claim invitation. Outcome controls what happens
   *  to the profile-claim status: "release" frees the profile (back to
   *  unclaimed); "uphold" keeps it with the agency and marks the dispute
   *  resolved; "remove" deletes the agency-managed profile entirely. */
  resolveProfileClaimDispute: (claimId: string, outcome: "release" | "uphold" | "remove", adminNotes?: string) => void;
  /** Resolve all active trust data for a subject — used by every UI surface. */
  getTrustSummary: (subjectType: VerificationSubjectType, subjectId: string) => TrustSummary;

  // ── Platform-admin verification method registry (Phase 2) ────────
  /** Full registry — one config per VerificationType. Always all 8 entries. */
  verificationMethodConfigs: VerificationMethodConfig[];
  /** Audit trail of platform-admin changes to method configs. */
  verificationMethodAudit: VerificationMethodAuditEntry[];
  /** True if the method is enabled platform-wide. UI surfaces gate on this. */
  isVerificationMethodEnabled: (type: VerificationType) => boolean;
  /** Lookup the full config for a method. */
  getVerificationMethodConfig: (type: VerificationType) => VerificationMethodConfig;
  /** All currently-enabled methods, in registry order. */
  listEnabledMethods: () => VerificationType[];
  /** Patch a method's config — emits an audit entry. Platform-admin only. */
  updateVerificationMethod: (type: VerificationType, patch: Partial<VerificationMethodConfig>) => void;

  // ── Trust filtering / risk score (Phase 2.4) ─────────────────────
  /** 0-100 heuristic risk/health score for a subject. Internal only —
   *  never surface to public users. Higher = more trustworthy. */
  getRiskScore: (subjectType: VerificationSubjectType, subjectId: string) => number;
  /** Talent's preferred contact gate. */
  getTalentContactGate: (talentId: string) => TalentContactGate;
  /** Talent updates their own gate. */
  setTalentContactGate: (talentId: string, gate: TalentContactGate) => void;
  /** Returns true if a client (resolved by id or "current") meets
   *  the talent's gate, false if blocked. */
  canClientContactTalent: (talentId: string, clientId: string) => boolean;

  // ── Phase 1 real-data bridge ─────────────────────────────────────
  /**
   * Live workspace roster pre-fetched by the server-component wrapper
   * (`./page.tsx`) when the URL carries `?dataSource=live`. `null` means
   * "live mode was not requested — surfaces should fall back to the
   * per-plan mock arrays via `getRoster(plan)`". An empty array means
   * "live mode was requested but the tenant has zero rostered talent
   * (or scope/query failed) — render the empty state, NOT the mock".
   *
   * Surfaces that read roster data should use `effectiveRoster` instead
   * of calling `getRoster(plan)` directly so the bridge is honoured
   * without each call site having to know about it.
   */
  bridgeRoster: TalentProfile[] | null;
  /**
   * `bridgeRoster ?? getRoster(plan)` — the rule the workspace surface
   * should follow. Stable identity (memoised in the provider) so it can
   * be consumed inside hooks without re-render churn.
   */
  effectiveRoster: TalentProfile[];
};

/** Agency-defined custom field. Renders in Profile Shell's "Profile details"
 *  section alongside type-specific fields, plus appears as a column in CSV
 *  exports. Backed by `workspace_custom_fields` in production. */
export type WorkspaceCustomFieldKind = "Text" | "Number" | "Select" | "Multi-select" | "Date" | "Toggle";
export type WorkspaceCustomFieldAppliesTo = "Talent" | "Client" | "Booking" | "Inquiry";
export type WorkspaceCustomField = {
  id: string;
  name: string;
  kind: WorkspaceCustomFieldKind;
  appliesTo: WorkspaceCustomFieldAppliesTo;
  required: boolean;
  helper?: string;
  /** Where this field is visible. Defaults to "internal" for new custom fields. */
  visibility?: FieldVisibility;
};

// ════════════════════════════════════════════════════════════════════
// FIELD PRIVACY MODEL
// Every talent profile field has a 3-state visibility per workspace:
//   public   → shown on the agency's public storefront + Discover
//   internal → agency admins only (workspace team)
//   hidden   → disabled by this workspace entirely
//
// Tulala always captures the data (network-wide engine); the agency
// chooses what to expose. Free plan = locked defaults. Studio = can
// move fields between public ↔ internal. Agency = full control + can
// hide fields entirely.
// ════════════════════════════════════════════════════════════════════

export type FieldVisibility = "public" | "internal" | "hidden";

/** Catalog ID for built-in profile fields — stable across all workspaces.
 *  Custom fields use their own UUID and don't appear in this union. */
export type ProfileFieldId =
  // Identity
  | "stageName" | "legalName" | "pronunciation" | "tagline" | "dob" | "ageDisplay" | "pronouns" | "gender"
  // Services
  | "primaryType" | "secondaryTypes" | "specialties"
  // Location
  | "homeBase" | "serviceCities" | "travelKm" | "travelFee" | "remoteOnly"
  // Media
  | "coverPhoto" | "photos" | "videoLinks" | "albums"
  // About
  | "bio"
  // Languages
  | "languages"
  // Refinement
  | "skills" | "contexts"
  // Type-specific physical (Models)
  | "height" | "bust" | "waist" | "hips" | "shoeSize" | "hair" | "eyes"
  // Contact (always internal by default — never public)
  | "email" | "phone" | "address"
  // Money (always internal)
  | "rates" | "payoutMethod" | "taxId"
  // Compliance
  | "passport" | "visa" | "insurance"
  // Engagement
  | "availability" | "languageRoleFlags"
  // Files
  | "files" | "compCard" | "contracts";

/** Default visibility per built-in field. Defines the "shipped" privacy
 *  posture — agencies on Studio+ can override these. */
export const DEFAULT_FIELD_VISIBILITY: Record<ProfileFieldId, FieldVisibility> = {
  // Identity — name + tagline are public; legal/dob/pronouns are internal by default
  stageName:     "public",
  legalName:     "internal",
  pronunciation: "public",
  tagline:       "public",
  dob:           "internal",
  ageDisplay:    "public",  // "29" or "26-30 range"
  pronouns:      "public",
  gender:        "public",
  // Services
  primaryType:     "public",
  secondaryTypes:  "public",
  specialties:     "public",
  // Location — home base public, exact address never
  homeBase:      "public",
  serviceCities: "public",
  travelKm:      "public",
  travelFee:     "internal",
  remoteOnly:    "public",
  address:       "hidden",  // never collected for public-facing
  // Media — gallery public, raw uploads private
  coverPhoto:    "public",
  photos:        "public",
  videoLinks:    "public",
  albums:        "public",
  // About
  bio:           "public",
  // Languages + refinement — public
  languages:          "public",
  languageRoleFlags:  "public",
  skills:             "public",
  contexts:           "public",
  // Physical — Models
  height: "public",
  bust:   "internal",
  waist:  "internal",
  hips:   "internal",
  shoeSize: "internal",
  hair:   "public",
  eyes:   "public",
  // Contact — never public by default
  email:  "internal",
  phone:  "internal",
  // Money — always internal
  rates:        "internal",
  payoutMethod: "internal",
  taxId:        "internal",
  // Compliance
  passport:  "internal",
  visa:      "internal",
  insurance: "internal",
  // Engagement
  availability: "internal",  // shown as available/booked, not full calendar
  // Files
  files:     "internal",
  compCard:  "internal",
  contracts: "internal",
};

/** Field metadata — display-friendly label + section for the privacy
 *  settings UI. Mirrors what's in the Field Catalog. */
export const PROFILE_FIELD_META: Record<ProfileFieldId, { label: string; section: string; description?: string }> = {
  stageName:     { label: "Stage / professional name", section: "Identity", description: "Public name on storefront." },
  legalName:     { label: "Legal name",                 section: "Identity", description: "For contracts. Never public." },
  pronunciation: { label: "Pronunciation",              section: "Identity" },
  tagline:       { label: "Tagline",                    section: "Identity", description: "One line shown on the directory card." },
  dob:           { label: "Date of birth",              section: "Identity", description: "Used to compute age. Never public." },
  ageDisplay:    { label: "Age (display)",              section: "Identity", description: "Shown as exact age or a range." },
  pronouns:      { label: "Pronouns",                   section: "Identity" },
  gender:        { label: "Gender",                     section: "Identity" },
  primaryType:   { label: "Primary Talent Type",        section: "Services" },
  secondaryTypes:{ label: "Secondary Talent Types",     section: "Services" },
  specialties:   { label: "Specialties",                section: "Services" },
  homeBase:      { label: "Home base",                  section: "Location" },
  serviceCities: { label: "Service areas",              section: "Location" },
  travelKm:      { label: "Travel radius",              section: "Location" },
  travelFee:     { label: "Travel fee policy",          section: "Location", description: "Internal — used for quotes." },
  remoteOnly:    { label: "Remote-only flag",           section: "Location" },
  address:       { label: "Mailing address",            section: "Location", description: "Tulala doesn't collect this for public profiles." },
  coverPhoto:    { label: "Cover photo",                section: "Media" },
  photos:        { label: "Photo gallery",              section: "Media" },
  videoLinks:    { label: "Video / social links",       section: "Media" },
  albums:        { label: "Album-grouped photos",       section: "Media" },
  bio:           { label: "Bio (any locale)",           section: "About" },
  languages:     { label: "Languages spoken",           section: "Languages" },
  languageRoleFlags: { label: "Can host / sell / translate", section: "Languages" },
  skills:        { label: "Skills",                     section: "Refinement" },
  contexts:      { label: "Best-for contexts",          section: "Refinement" },
  height:        { label: "Height",                     section: "Physical" },
  bust:          { label: "Bust",                       section: "Physical" },
  waist:         { label: "Waist",                      section: "Physical" },
  hips:          { label: "Hips",                       section: "Physical" },
  shoeSize:      { label: "Shoe size",                  section: "Physical" },
  hair:          { label: "Hair color",                 section: "Physical" },
  eyes:          { label: "Eye color",                  section: "Physical" },
  email:         { label: "Email",                      section: "Contact",  description: "How clients/agency reach the talent." },
  phone:         { label: "Phone",                      section: "Contact",  description: "SMS verification + day-of booking comms." },
  rates:         { label: "Rates + day rate",           section: "Money",    description: "Always internal — never public on storefront." },
  payoutMethod:  { label: "Payout method",              section: "Money" },
  taxId:         { label: "Tax ID",                     section: "Money" },
  passport:      { label: "Passport scan",              section: "Compliance" },
  visa:          { label: "Visa / work permit",         section: "Compliance" },
  insurance:     { label: "Insurance certificate",      section: "Compliance" },
  availability:  { label: "Availability calendar",      section: "Engagement", description: "Shown as available/busy on storefront." },
  files:         { label: "Files (comp cards, etc.)",   section: "Files" },
  compCard:      { label: "Comp card",                  section: "Files" },
  contracts:     { label: "Contracts",                  section: "Files" },
};

/** What this workspace permits per plan tier. Free = locked, Studio =
 *  can flip public ↔ internal, Agency = can hide entirely + change
 *  required-ness + create custom fields. */
export const FIELD_PRIVACY_PLAN_RULES: Record<"free" | "studio" | "agency" | "network", {
  canFlipPublicInternal: boolean;
  canHide: boolean;
  canCreateCustom: boolean;
  canSetRequired: boolean;
}> = {
  free:    { canFlipPublicInternal: false, canHide: false, canCreateCustom: false, canSetRequired: false },
  studio:  { canFlipPublicInternal: true,  canHide: false, canCreateCustom: false, canSetRequired: false },
  agency:  { canFlipPublicInternal: true,  canHide: true,  canCreateCustom: true,  canSetRequired: true  },
  network: { canFlipPublicInternal: true,  canHide: true,  canCreateCustom: true,  canSetRequired: true  },
};

/** Hard policy: fields that are NEVER allowed to go public, regardless
 *  of plan tier or admin override. Financial + compliance + raw-PII data. */
export const ALWAYS_INTERNAL_FIELDS: ReadonlySet<ProfileFieldId> = new Set<ProfileFieldId>([
  "legalName",      // contracts only
  "dob",            // → ageDisplay can be public, raw DOB cannot
  "address",        // mailing address is never public
  "email",          // contact channel
  "phone",          // contact channel
  "rates",          // pricing is internal
  "payoutMethod",   // money
  "taxId",          // money
  "passport",       // compliance / PII
  "visa",           // compliance
  "insurance",      // compliance
  "contracts",      // legal
]);

/** Hard policy: fields that are required for a profile to function and
 *  cannot be hidden. Tulala enforces these regardless of plan. */
export const ALWAYS_VISIBLE_FIELDS: ReadonlySet<ProfileFieldId> = new Set<ProfileFieldId>([
  "stageName",   // without name there's no profile
  "primaryType", // without type clients can't book
]);

/** Resolve which visibility states are allowed for a given field, given
 *  the workspace's plan rules. Hard-coded policy beats plan flexibility. */
export function allowedVisibilities(
  fieldId: ProfileFieldId,
  rules: typeof FIELD_PRIVACY_PLAN_RULES[keyof typeof FIELD_PRIVACY_PLAN_RULES],
): { public: boolean; internal: boolean; hidden: boolean } {
  const alwaysInternal = ALWAYS_INTERNAL_FIELDS.has(fieldId);
  const alwaysVisible = ALWAYS_VISIBLE_FIELDS.has(fieldId);
  return {
    public:   !alwaysInternal && (rules.canFlipPublicInternal || DEFAULT_FIELD_VISIBILITY[fieldId] === "public"),
    internal: !alwaysVisible  && (rules.canFlipPublicInternal || DEFAULT_FIELD_VISIBILITY[fieldId] === "internal"),
    hidden:   !alwaysVisible  && !alwaysInternal && (rules.canHide || DEFAULT_FIELD_VISIBILITY[fieldId] === "hidden"),
  };
}

const ProtoContext = createContext<Ctx | null>(null);

// 2026 #6 — Wrap a state mutation in document.startViewTransition() so
// the browser interpolates DOM changes into a smooth crossfade. Falls
// back to plain execution on browsers without support (Firefox <125,
// Safari <18) and is skipped entirely when prefers-reduced-motion is
// set. Used by openDrawer / closeDrawer to crossfade between drawers.
function runWithViewTransition(work: () => void): void {
  if (typeof window === "undefined") { work(); return; }
  const reduced = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  type DocWithVT = Document & { startViewTransition?: (cb: () => void) => unknown };
  const doc = document as DocWithVT;
  if (reduced || typeof doc.startViewTransition !== "function") {
    work();
    return;
  }
  doc.startViewTransition(work);
}

export function ProtoProvider({
  children,
  initialBridgeData = null,
}: {
  children: ReactNode;
  /**
   * Phase 1 real-data bridge payload pre-fetched server-side. `null` (the
   * default) preserves the original 100% mock behaviour. See
   * `_data-bridge.ts` and `./page.tsx` for the server boundary.
   */
  initialBridgeData?: BridgeData | null;
}) {
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
  const [clientProfile, setClientProfile] = useState<ClientProfileId>("martina");
  const activeClientProfile = CLIENT_PROFILES[clientProfile];
  // platform
  const [hqRole, setHqRole] = useState<HqRole>("exec");
  const [platformPage, setPlatformPage] = useState<PlatformPage>("today");
  const [impersonating, setImpersonating] = useState<Impersonation>(null);
  // shared
  const [drawer, setDrawer] = useState<DrawerContext>({ drawerId: null });
  const [upgrade, setUpgrade] = useState<UpgradeOffer>({ open: false });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Set<string>>(new Set());
  // Pending-approvals queue lifted into proto state. Mutating this
  // updates the topbar Roster nav badge, mobile bottom nav, and the
  // Settings → Pending approvals row in one shot.
  const [pendingTalent, setPendingTalent] = useState<PendingTalent[]>(PENDING_TALENT);
  const resolveApproval = useCallback((id: string) => {
    setPendingTalent(p => p.filter(x => x.id !== id));
  }, []);
  // CSV bulk-import → append valid rows to the pending queue. Returns
  // the number of rows actually created (skipping any that fail
  // minimum validation: name + email required).
  const bulkAddTalent = useCallback((rows: { firstName: string; lastName: string; email: string; primaryType?: string; city?: string }[]) => {
    const valid = rows.filter(r => r.firstName.trim() && r.email.trim());
    if (valid.length === 0) return 0;
    const now = new Date().toISOString();
    const additions: PendingTalent[] = valid.map((r, i) => ({
      id: `csv-${Date.now()}-${i}`,
      name: `${r.firstName.trim()} ${r.lastName.trim()}`.trim(),
      thumb: `https://i.pravatar.cc/300?img=${(i * 7 + 30) % 70}`,
      parentCategory: "models",
      childTypes: r.primaryType ? [r.primaryType] : ["fashion"],
      city: r.city?.trim() || "—",
      submittedAgo: "just now",
      photoCount: 0,
      languages: ["English"],
      fields: { _source: "csv-import", _email: r.email.trim(), _createdAt: now },
    }));
    setPendingTalent(p => [...additions, ...p]);
    return valid.length;
  }, []);

  // WS-25.2 — Client CSV import. Unlike talent which has an approval
  // queue, client adds go straight in (clients are workspace-internal
  // records — no off-platform identity to verify on creation).
  const [importedClients, setImportedClients] = useState<Client[]>([]);
  const bulkAddClient = useCallback((rows: { name: string; contact?: string; email?: string }[]) => {
    const valid = rows.filter(r => r.name.trim() && (r.contact?.trim() || r.email?.trim()));
    if (valid.length === 0) return 0;
    const additions: Client[] = valid.map((r, i) => ({
      id: `csv-c-${Date.now()}-${i}`,
      name: r.name.trim(),
      contact: r.contact?.trim() || r.email?.trim() || "—",
      bookingsYTD: 0,
      status: "active" as const,
      trust: "basic" as const,
    }));
    setImportedClients(p => [...additions, ...p]);
    return valid.length;
  }, []);

  // Custom workspace fields. Persisted to localStorage so adds in
  // Field Catalog survive page reload (the prototype's URL-driven nav
  // does a full mount on every change).
  const CUSTOM_FIELDS_KEY = "tulala_custom_fields_v1";
  const SEED_FIELDS: WorkspaceCustomField[] = [
    { id: "cf1", name: "Niches",     kind: "Multi-select", appliesTo: "Talent", required: false, helper: "Editorial / Commercial / Runway / Showroom / Lookbook" },
    { id: "cf2", name: "Brand tier", kind: "Select",       appliesTo: "Client", required: true,  helper: "A — global / B — regional / C — local" },
    { id: "cf3", name: "Region",     kind: "Select",       appliesTo: "Client", required: false, helper: "EMEA / Americas / APAC" },
  ];
  const [customFields, setCustomFields] = useState<WorkspaceCustomField[]>(() => {
    if (typeof window === "undefined") return SEED_FIELDS;
    try {
      const raw = window.localStorage.getItem(CUSTOM_FIELDS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed as WorkspaceCustomField[];
      }
    } catch {}
    return SEED_FIELDS;
  });
  const addCustomField = useCallback((f: Omit<WorkspaceCustomField, "id">) => {
    setCustomFields(cs => {
      const next = [...cs, { ...f, id: `cf-${Date.now()}` }];
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const removeCustomField = useCallback((id: string) => {
    setCustomFields(cs => {
      const next = cs.filter(c => c.id !== id);
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const setCustomFieldVisibility = useCallback((id: string, vis: FieldVisibility) => {
    setCustomFields(cs => {
      const next = cs.map(c => c.id === id ? { ...c, visibility: vis } : c);
      try { window.localStorage.setItem(CUSTOM_FIELDS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Per-workspace overrides on built-in field visibility.
  const FIELD_VIS_KEY = "tulala_field_visibility_v1";
  const [fieldVisibilityOverrides, setFieldVisibilityOverrides] = useState<Partial<Record<ProfileFieldId, FieldVisibility>>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(FIELD_VIS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  });
  const setFieldVisibility = useCallback((id: ProfileFieldId, vis: FieldVisibility) => {
    // Hard-policy enforcement: financial / PII / compliance fields can
    // never go public. Required fields can never be hidden. Silently
    // coerces invalid combos so a bad UI/API call can't leak data.
    if (ALWAYS_INTERNAL_FIELDS.has(id) && vis === "public") return;
    if (ALWAYS_VISIBLE_FIELDS.has(id) && vis === "hidden") return;
    setFieldVisibilityOverrides(o => {
      const next = { ...o };
      if (DEFAULT_FIELD_VISIBILITY[id] === vis) delete next[id];
      else next[id] = vis;
      try { window.localStorage.setItem(FIELD_VIS_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);
  const effectiveFieldVisibility = useCallback(
    (id: ProfileFieldId) => fieldVisibilityOverrides[id] ?? DEFAULT_FIELD_VISIBILITY[id],
    [fieldVisibilityOverrides],
  );

  // ── Trust & Verification state ──────────────────────────────────
  const [verificationRequests, setVerificationRequests] = useState<VerificationRequest[]>(SEED_VERIFICATION_REQUESTS);
  const [profileVerifications, setProfileVerifications] = useState<ProfileVerification[]>(SEED_PROFILE_VERIFICATIONS);
  const [profileClaims, setProfileClaims] = useState<ProfileClaimInvitation[]>(SEED_PROFILE_CLAIMS);
  const [claimStatusByTalent, setClaimStatusByTalent] = useState<Record<string, ProfileClaimStatus>>(SEED_CLAIM_STATUS);
  const [verificationMethodConfigs, setVerificationMethodConfigs] = useState<VerificationMethodConfig[]>(SEED_VERIFICATION_METHOD_CONFIG);
  const [verificationMethodAudit, setVerificationMethodAudit] = useState<VerificationMethodAuditEntry[]>(SEED_VERIFICATION_METHOD_AUDIT);
  const [talentContactGates, setTalentContactGates] = useState<Record<string, TalentContactGate>>(SEED_TALENT_CONTACT_GATE);

  const nowIso = () => new Date().toISOString();
  const newId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const createVerificationRequest = useCallback((input: Omit<VerificationRequest, "id" | "status" | "createdAt" | "updatedAt"> & {
    status?: VerificationRequestStatus;
  }): VerificationRequest => {
    // Edge case #9: duplicate guard — reuse any active in-flight request
    // for the same subject + verification type instead of creating a dup.
    const existing = verificationRequests.find(r =>
      r.subjectType === input.subjectType
      && r.subjectId === input.subjectId
      && r.verificationType === input.verificationType
      && (r.status === "pending_user_action" || r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info")
    );
    if (existing) return existing;
    const req: VerificationRequest = {
      id: newId("vr"),
      status: input.status ?? "pending_user_action",
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...input,
    };
    setVerificationRequests(rs => [...rs, req]);
    return req;
  }, [verificationRequests]);

  // Edge case #10: expired-code sweep. Once a minute, any pending or
  // submitted request whose expires_at has passed flips to "expired".
  // Cheap to run and matches production cron behavior.
  useEffect(() => {
    const sweep = () => {
      const now = Date.now();
      setVerificationRequests(rs => rs.map(r => {
        if (!r.expiresAt) return r;
        if (r.status !== "pending_user_action" && r.status !== "submitted") return r;
        if (new Date(r.expiresAt).getTime() < now) {
          return { ...r, status: "expired" as VerificationRequestStatus, updatedAt: nowIso() };
        }
        return r;
      }));
    };
    sweep(); // run once on mount
    const id = window.setInterval(sweep, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // Edge case #8: IG handle change → revoke active IG verification.
  // Exposed as a callable so the talent profile editor can invoke it
  // when the talent edits their Instagram handle.
  const revokeInstagramOnHandleChange = useCallback((subjectType: VerificationSubjectType, subjectId: string, newHandle: string) => {
    setProfileVerifications(pvs => pvs.map(pv => {
      if (pv.subjectType !== subjectType || pv.subjectId !== subjectId) return pv;
      if (pv.verificationType !== "instagram_verified") return pv;
      if (pv.status !== "active") return pv;
      if (pv.identifier === newHandle) return pv; // same handle, no-op
      return { ...pv, status: "revoked" as VerificationActiveStatus };
    }));
  }, []);

  const updateVerificationRequest = useCallback((id: string, patch: Partial<VerificationRequest>) => {
    setVerificationRequests(rs => rs.map(r => r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r));
  }, []);

  const approveVerificationRequest = useCallback((id: string) => {
    setVerificationRequests(rs => rs.map(r => {
      if (r.id !== id) return r;
      return { ...r, status: "approved" as VerificationRequestStatus, reviewedAt: nowIso(), updatedAt: nowIso() };
    }));
    // Create the active ProfileVerification record
    const req = verificationRequests.find(r => r.id === id);
    if (req) {
      const provider =
        req.method === "instagram_dm" ? "instagram" :
        req.method === "agency_confirmation" ? "agency" :
        req.method === "domain" ? "domain" :
        req.method === "payment" ? "stripe" :
        req.method === "phone" ? "phone" :
        "tulala";
      const pv: ProfileVerification = {
        id: newId("pv"),
        subjectType: req.subjectType,
        subjectId: req.subjectId,
        verificationType: req.verificationType,
        provider,
        identifier: req.claimedIdentifier ?? null,
        sourceRequestId: req.id,
        status: "active",
        publicBadgeEnabled: true,
        verifiedAt: nowIso(),
      };
      setProfileVerifications(pvs => [...pvs, pv]);
    }
  }, [verificationRequests]);

  const rejectVerificationRequest = useCallback((id: string, reason: string, publicMessage?: string) => {
    setVerificationRequests(rs => rs.map(r => r.id === id ? {
      ...r,
      status: "rejected" as VerificationRequestStatus,
      rejectionReason: reason,
      publicMessage: publicMessage ?? null,
      reviewedAt: nowIso(),
      updatedAt: nowIso(),
    } : r));
  }, []);

  const revokeProfileVerification = useCallback((id: string) => {
    setProfileVerifications(pvs => pvs.map(pv => pv.id === id ? { ...pv, status: "revoked" as VerificationActiveStatus } : pv));
  }, []);

  const sendProfileClaimInvite = useCallback((input: Omit<ProfileClaimInvitation, "id" | "status" | "tokenHash" | "createdAt" | "updatedAt">) => {
    const inv: ProfileClaimInvitation = {
      id: newId("pci"),
      status: "pending",
      tokenHash: newId("hash"),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      ...input,
    };
    setProfileClaims(cs => [...cs, inv]);
    // Update claim status on the talent
    if (input.profileType === "talent_profile") {
      setClaimStatusByTalent(s => ({ ...s, [input.profileId]: "invite_sent" as ProfileClaimStatus }));
    }
  }, []);

  const resolveProfileClaimDispute = useCallback((claimId: string, outcome: "release" | "uphold" | "remove", _adminNotes?: string) => {
    setProfileClaims(cs => cs.map(c => {
      if (c.id !== claimId) return c;
      const nextStatus: ProfileClaimInvitation["status"] =
        outcome === "release" ? "revoked"
        : outcome === "remove" ? "revoked"
        : /* uphold */ "pending";
      return { ...c, status: nextStatus, updatedAt: nowIso() };
    }));
    const claim = profileClaims.find(c => c.id === claimId);
    if (claim?.profileType === "talent_profile") {
      setClaimStatusByTalent(s => {
        const next = { ...s };
        if (outcome === "release") next[claim.profileId] = "released" as ProfileClaimStatus;
        else if (outcome === "remove") delete next[claim.profileId];
        else if (outcome === "uphold") next[claim.profileId] = "invite_sent" as ProfileClaimStatus;
        return next;
      });
    }
  }, [profileClaims]);

  const getTrustSummary = useCallback((subjectType: VerificationSubjectType, subjectId: string): TrustSummary => {
    const claimStatus = subjectType === "talent_profile" ? claimStatusByTalent[subjectId] : undefined;
    const userId = subjectType === "talent_profile" ? TALENT_TO_USER[subjectId] : undefined;
    const account = userId ? SEED_ACCOUNT_VERIFICATION[userId] : undefined;
    const badges = profileVerifications
      .filter(pv => pv.subjectType === subjectType && pv.subjectId === subjectId && pv.status === "active")
      .map(pv => ({
        type: pv.verificationType,
        label: VERIFICATION_TYPE_META[pv.verificationType].label,
        tooltip: VERIFICATION_TYPE_META[pv.verificationType].tooltip,
        public: pv.publicBadgeEnabled,
        status: pv.status,
        identifier: pv.identifier,
        methodEnabled: verificationMethodConfigs.find(c => c.type === pv.verificationType)?.enabled ?? true,
      }));
    const pendingRequests = verificationRequests
      .filter(r => r.subjectType === subjectType && r.subjectId === subjectId
        && (r.status === "pending_user_action" || r.status === "submitted" || r.status === "in_review" || r.status === "needs_more_info"))
      .map(r => ({ verificationType: r.verificationType, status: r.status, method: r.method }));
    return { subjectType, subjectId, claimStatus, account, badges, pendingRequests };
  }, [profileVerifications, verificationRequests, claimStatusByTalent, verificationMethodConfigs]);

  // ── Platform-admin verification method registry ───────────────────
  const isVerificationMethodEnabled = useCallback((type: VerificationType) => {
    return verificationMethodConfigs.find(c => c.type === type)?.enabled ?? false;
  }, [verificationMethodConfigs]);
  const getVerificationMethodConfig = useCallback((type: VerificationType) => {
    return verificationMethodConfigs.find(c => c.type === type)
      ?? { type, enabled: false, reviewMode: "manual" as VerificationReviewMode, visibleOn: ["admin_only"] as VerificationVisibility[], availableToTiers: ["all"] as VerificationTierGate[], evidenceRequired: false, expiresAfterDays: null };
  }, [verificationMethodConfigs]);
  const listEnabledMethods = useCallback(() => {
    return verificationMethodConfigs.filter(c => c.enabled).map(c => c.type);
  }, [verificationMethodConfigs]);
  const updateVerificationMethod = useCallback((type: VerificationType, patch: Partial<VerificationMethodConfig>) => {
    setVerificationMethodConfigs(cs => cs.map(c => {
      if (c.type !== type) return c;
      const next = { ...c, ...patch };
      // Emit one audit entry per changed key.
      const entries: VerificationMethodAuditEntry[] = [];
      const stamp = nowIso();
      const mkEntry = (kind: VerificationMethodAuditEntry["changeKind"], before: unknown, after: unknown) => ({
        id: newId("vma"), methodType: type, changedByUserId: "u-platform-admin",
        changeKind: kind, before: String(before), after: String(after), at: stamp,
      });
      if ("enabled" in patch && patch.enabled !== c.enabled) entries.push(mkEntry(patch.enabled ? "enabled" : "disabled", c.enabled, patch.enabled));
      if ("reviewMode" in patch && patch.reviewMode !== c.reviewMode) entries.push(mkEntry("review_mode", c.reviewMode, patch.reviewMode));
      if ("visibleOn" in patch && JSON.stringify(patch.visibleOn) !== JSON.stringify(c.visibleOn)) entries.push(mkEntry("visibility", c.visibleOn.join(","), (patch.visibleOn ?? []).join(",")));
      if ("availableToTiers" in patch && JSON.stringify(patch.availableToTiers) !== JSON.stringify(c.availableToTiers)) entries.push(mkEntry("tier_gate", c.availableToTiers.join(","), (patch.availableToTiers ?? []).join(",")));
      if ("evidenceRequired" in patch && patch.evidenceRequired !== c.evidenceRequired) entries.push(mkEntry("evidence_required", c.evidenceRequired, patch.evidenceRequired));
      if ("expiresAfterDays" in patch && patch.expiresAfterDays !== c.expiresAfterDays) entries.push(mkEntry("expiry", c.expiresAfterDays ?? "never", patch.expiresAfterDays ?? "never"));
      if (entries.length > 0) {
        setVerificationMethodAudit(a => [...entries, ...a]);
      }
      return next;
    }));
  }, []);

  // ── Risk score (Phase 2.4) — internal-only heuristic ─────────────
  const getRiskScore = useCallback((subjectType: VerificationSubjectType, subjectId: string): number => {
    let score = 50; // baseline
    const summary = profileVerifications
      .filter(pv => pv.subjectType === subjectType && pv.subjectId === subjectId && pv.status === "active");
    score += summary.length * 12;
    const claim = subjectType === "talent_profile" ? claimStatusByTalent[subjectId] : undefined;
    if (claim === "claimed") score += 10;
    if (claim === "disputed") score -= 25;
    const userId = subjectType === "talent_profile" ? TALENT_TO_USER[subjectId] : undefined;
    const account = userId ? SEED_ACCOUNT_VERIFICATION[userId] : undefined;
    if (account?.emailVerified) score += 5;
    if (account?.phoneVerified) score += 5;
    // Negative: recent expired/rejected requests
    const recentBad = verificationRequests.filter(r =>
      r.subjectType === subjectType && r.subjectId === subjectId
      && (r.status === "rejected" || r.status === "expired")
    ).length;
    score -= recentBad * 8;
    return Math.max(0, Math.min(100, score));
  }, [profileVerifications, claimStatusByTalent, verificationRequests]);

  const getTalentContactGate = useCallback((talentId: string) => {
    return talentContactGates[talentId] ?? "open";
  }, [talentContactGates]);
  const setTalentContactGate = useCallback((talentId: string, gate: TalentContactGate) => {
    setTalentContactGates(s => ({ ...s, [talentId]: gate }));
  }, []);
  const canClientContactTalent = useCallback((talentId: string, clientId: string) => {
    const gate = talentContactGates[talentId] ?? "open";
    if (gate === "open") return true;
    const trust = profileVerifications.filter(pv => pv.subjectType === "client_profile" && pv.subjectId === clientId && pv.status === "active");
    if (gate === "verified_only") return trust.length > 0;
    // trusted_only — needs score ≥ 60
    let score = 50 + trust.length * 12;
    const claim = claimStatusByTalent[clientId];
    if (claim === "claimed") score += 10;
    return score >= 60;
  }, [talentContactGates, profileVerifications, claimStatusByTalent]);
  const [density, setDensityState] = useState<Density>("comfortable");
  const [workspaceLayout, setWorkspaceLayoutState] = useState<WorkspaceLayout>("topbar");
  const toastIdRef = useRef(0);

  // Hydrate density + workspace layout from localStorage on mount.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem("tulala_density");
      if (v === "comfortable" || v === "compact") setDensityState(v);
      const l = window.localStorage.getItem("tulala_workspaceLayout");
      if (l === "topbar" || l === "sidebar") setWorkspaceLayoutState(l);
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
  const setWorkspaceLayout = useCallback((l: WorkspaceLayout) => {
    setWorkspaceLayoutState(l);
    try {
      window.localStorage.setItem("tulala_workspaceLayout", l);
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

  // Hydration gate — the persist-to-URL effect skips its initial fire
  // until the URL-read effect below has had a chance to apply the
  // params. Otherwise the persist effect runs on first paint with
  // *defaults* and clobbers the user's URL params before they're read.
  const [urlHydrated, setUrlHydrated] = useState(false);

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
    // WS-3.6 — resolve legacy aliases before setting page
    if (pg) setPage(resolveWorkspacePage(pg));
    if (tpg && TALENT_PAGES.includes(tpg as TalentPage)) setTalentPage(tpg as TalentPage);
    if (cpl && CLIENT_PLANS.includes(cpl as ClientPlan)) setClientPlan(cpl as ClientPlan);
    if (cpg && CLIENT_PAGES.includes(cpg as ClientPage)) setClientPage(cpg as ClientPage);
    const cprof = params.get("clientProfile");
    if (cprof === "martina" || cprof === "gringo") setClientProfile(cprof);
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
    // Open the persistence gate AFTER reading. This sets a flag in the
    // next render tick, so the persist effect's first fire-with-defaults
    // is skipped and only fires once state actually reflects the URL.
    setUrlHydrated(true);
  }, []);

  // Persist to URL (replace, not push). Only sync the dimensions relevant to
  // the active surface to keep URLs short and shareable.
  useEffect(() => {
    // Skip until URL-read has applied. Otherwise the very first paint
    // writes defaults to the URL and discards whatever the user navigated to.
    if (!urlHydrated) return;
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
      params.set("clientProfile", clientProfile);
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
    clientProfile,
    hqRole,
    platformPage,
    drawer,
    urlHydrated,
  ]);

  // Drawer history stack — supports a "back" affordance in nested
  // drawer flows. Push the *current* drawer onto the stack whenever a
  // new drawer is opened on top of it; pop on close. Reset whenever a
  // drawer is opened from a closed state.
  const [drawerStack, setDrawerStack] = useState<DrawerContext[]>([]);
  const openDrawer = useCallback(
    (id: DrawerId, payload?: Record<string, unknown>) => {
      // 2026 #6 — Wrap drawer mutations in startViewTransition so the
      // browser crossfades the DOM. Falls back to plain state on
      // unsupported browsers + skipped under prefers-reduced-motion.
      runWithViewTransition(() => {
        setDrawer((current) => {
          // If a drawer is already open and we're switching to a different
          // one, push the current one onto the back-stack.
          if (current.drawerId && current.drawerId !== id) {
            setDrawerStack((s) => [...s, current]);
          }
          return { drawerId: id, payload };
        });
      });
    },
    [],
  );
  const closeDrawer = useCallback(() => {
    runWithViewTransition(() => {
      setDrawer({ drawerId: null });
      setDrawerStack([]);
    });
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

  const toast = useCallback((message: string, opts?: { undo?: () => void; action?: ToastAction; tone?: ToastTone }) => {
    const id = ++toastIdRef.current;
    // WS-0.9 — toast queue limit. Max 3 toasts on screen at once.
    // Errors get priority (kept), oldest non-error gets dropped.
    // Without this cap, firing 5 toasts in a row stacks them and
    // the user can't read any.
    const TOAST_LIMIT = 3;
    setToasts((prev) => {
      const next = [...prev, { id, message, undo: opts?.undo, action: opts?.action, tone: opts?.tone }];
      if (next.length <= TOAST_LIMIT) return next;
      // Over limit — drop the oldest non-error toast first; if all are
      // errors, drop the absolute oldest.
      const dropIdx = next.findIndex((t) => t.tone !== "error");
      const cutAt = dropIdx === -1 ? 0 : dropIdx;
      return next.slice(0, cutAt).concat(next.slice(cutAt + 1));
    });
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, (opts?.undo || opts?.action) ? 5000 : 2400); // actionable toasts stay longer
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

  // Phase 1 real-data bridge — pre-fetched payload from `./page.tsx`.
  // `bridgeRoster` is null when the URL did not request live mode (the
  // default); in that case `effectiveRoster` falls back to the mock
  // arrays via `getRoster(plan)`. When live mode is requested,
  // `bridgeRoster` carries the result of the server-side query and
  // overrides the per-plan mock — even if it's an empty array (which
  // we render as the standard empty state, NOT silent mock fallback).
  const bridgeRoster = initialBridgeData?.roster ?? null;
  const effectiveRoster = useMemo<TalentProfile[]>(
    () => bridgeRoster ?? getRoster(plan),
    [bridgeRoster, plan],
  );

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
        clientProfile,
        hqRole,
        platformPage,
        impersonating,
        drawer,
        upgrade,
        toasts,
        completedTasks,
        density,
        workspaceLayout,
      },
      setSurface: handleSetSurface,
      flipMode,
      setPlan,
      setRole,
      setEntityType,
      setAlsoTalent,
      setDensity,
      setWorkspaceLayout,
      setPage,
      setTalentPage,
      setClientPlan,
      setClientPage,
      clientProfile,
      setClientProfile,
      activeClientProfile,
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
      pendingTalent,
      resolveApproval,
      bulkAddTalent,
      bulkAddClient,
      importedClients,
      customFields,
      addCustomField,
      removeCustomField,
      setCustomFieldVisibility,
      fieldVisibilityOverrides,
      setFieldVisibility,
      effectiveFieldVisibility,
      verificationRequests,
      profileVerifications,
      profileClaims,
      claimStatusByTalent,
      createVerificationRequest,
      updateVerificationRequest,
      approveVerificationRequest,
      rejectVerificationRequest,
      revokeProfileVerification,
      revokeInstagramOnHandleChange,
      sendProfileClaimInvite,
      resolveProfileClaimDispute,
      getTrustSummary,
      verificationMethodConfigs,
      verificationMethodAudit,
      isVerificationMethodEnabled,
      getVerificationMethodConfig,
      listEnabledMethods,
      updateVerificationMethod,
      getRiskScore,
      getTalentContactGate,
      setTalentContactGate,
      canClientContactTalent,
      // Phase 1 real-data bridge fields. `bridgeRoster` is the raw
      // server-fetched payload (or null in mock mode); `effectiveRoster`
      // is the resolved `bridgeRoster ?? getRoster(plan)` that surfaces
      // should consume.
      bridgeRoster,
      effectiveRoster,
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
      workspaceLayout,
      setDensity,
      setWorkspaceLayout,
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
      pendingTalent,
      resolveApproval,
      bulkAddTalent,
      bulkAddClient,
      importedClients,
      customFields,
      addCustomField,
      removeCustomField,
      setCustomFieldVisibility,
      fieldVisibilityOverrides,
      setFieldVisibility,
      effectiveFieldVisibility,
      verificationRequests,
      profileVerifications,
      profileClaims,
      claimStatusByTalent,
      createVerificationRequest,
      updateVerificationRequest,
      approveVerificationRequest,
      rejectVerificationRequest,
      revokeProfileVerification,
      revokeInstagramOnHandleChange,
      sendProfileClaimInvite,
      resolveProfileClaimDispute,
      getTrustSummary,
      verificationMethodConfigs,
      verificationMethodAudit,
      isVerificationMethodEnabled,
      getVerificationMethodConfig,
      listEnabledMethods,
      updateVerificationMethod,
      getRiskScore,
      getTalentContactGate,
      setTalentContactGate,
      canClientContactTalent,
      bridgeRoster,
      effectiveRoster,
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
  inkMuted: "rgba(11,11,13,0.72)",
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
  /** Soft amber fill — caution / draft backgrounds. */
  amberSoft: "rgba(82,96,109,0.10)",
  /** Deep amber text — caution foreground on soft fills. */
  amberDeep: "#3A4651",
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

  // Fill — replacement for the old "ink-as-background" pattern. Pure black
  // (#0B0B0D) was being used everywhere as a primary fill (buttons, sent
  // bubbles, callouts, active toggles) and read as aggressive/oppressive.
  // This is a soft modern slate — calm, designerly, still high-contrast on
  // light backgrounds. Use for primary CTAs, active toggles, sent message
  // bubbles. Ink remains the body-text color; never use it as a fill.
  fill: "#4D4855",
  fillSoft: "rgba(77,72,85,0.10)",
  fillDeep: "#33303A",

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
 * Transition scale — WS-16.3.
 *
 * One canonical system for every animation/transition in the prototype.
 * Usage: `transition: \`background ${TRANSITION.micro}\``
 *
 *   micro   .12s            — instant hover colour/bg swap; no easing needed
 *   sm      .15s ease       — small state change (opacity, border fade)
 *   md      .18s ease       — component enter/exit (badges, pills expanding)
 *   layout  .22s ease-out   — sidebar expand, grid reflow
 *   drawer  .26s cubic-bezier(.4,0,.2,1)  — sheet/panel slides
 *
 * Things that SHOULD NOT use TRANSITION:
 *   - Keyframe animations (use @keyframes with their own timing)
 *   - prefers-reduced-motion guards (wrap the whole value in reduceMotionCheck())
 *   - SVG stroke-dasharray (use TRANSITION.layout or a custom cubic)
 */
export const TRANSITION = {
  /** 120 ms — instant hover colour/bg swap. */
  micro:  ".12s",
  /** 150 ms ease — small opacity/border state change. */
  sm:     ".15s ease",
  /** 180 ms ease — badge/pill expand, chip grow. */
  md:     ".18s ease",
  /** 220 ms ease-out — sidebar, grid column resize. */
  layout: ".22s ease-out",
  /** 260 ms material-decel — drawer/sheet slide. */
  drawer: ".26s cubic-bezier(.4,0,.2,1)",
} as const;

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

// ─── WS-0.5 Telemetry shim ───────────────────────────────────────────
//
// Per ROADMAP §5.1 — every consequential action emits an event through
// `track()`. Today this is a console.debug no-op (dev) / silent (prod).
// Dev wires PostHog/Segment/etc. later by replacing the implementation.
//
// Event names are typed below so call sites get autocomplete and so
// future consumers (analytics dashboards, A/B tests, retention cohorts)
// know exactly what's available.

/**
 * Master event registry. Add new events here as workstreams ship.
 * Keep names snake_case + verb_object (e.g. `chat_typing_indicator_seen`).
 * Don't repurpose names — once shipped, an event's semantics are frozen
 * for downstream consumers.
 */
export type TrackEvent =
  // Chat / messaging (WS-1)
  | "chat_view_mode_active"
  | "chat_typing_indicator_seen"
  | "chat_read_receipt_seen"
  | "chat_jump_to_latest_clicked"
  | "chat_system_group_expanded"
  | "chat_system_action_clicked"
  | "chat_attachment_added"
  | "chat_thread_search_used"
  | "chat_participant_filter_applied"
  | "chat_overwhelm_self_reported"
  // Inbox / inquiry surfaces (WS-1, WS-3)
  | "inquiry_pending_offer_acted_on"
  | "legacy_page_url_resolved"
  // Mobile (WS-2)
  | "mobile_chrome_height_ratio"
  // Drawers (WS-4)
  | "drawer_count_per_session"
  | "drawer_help_opened"
  | "drawer_help_feedback"
  // Search (WS-7)
  | "command_palette_opened"
  | "command_palette_query"
  | "command_palette_result_clicked"
  // Onboarding (WS-9)
  | "first_meaningful_action"
  | "activation_step_completed"
  // WS-27 page-builder
  | "site_context_switched"
  | "page_builder_opened"
  | "page_published"
  | "page_scheduled"
  | "page_reverted"
  | "domain_verification_started"
  // WS-30 image rights
  | "usage_extension_started"
  | "tear_sheet_added"
  // Performance (WS-13)
  | "webvitals_lcp"
  | "webvitals_fid"
  | "webvitals_cls"
  | "error_boundary_triggered"
  // Catch-all for prototype-only diagnostics
  | "prototype_diagnostic";

export type TrackProps = Record<string, string | number | boolean | null | undefined>;

/**
 * Emit a typed telemetry event. Real analytics SDK plugs in here later.
 * Until then, dev gets console.debug; prod no-ops silently.
 */
export function track(event: TrackEvent, props: TrackProps = {}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    console.debug("[track]", event, props);
  }
  // Future: pipe to analytics here. Example contracts:
  //   window.posthog?.capture(event, props);
  //   window.analytics?.track(event, props);
}

// Window-level event names for the unified BottomActionFab palette.
// Constants (rather than raw strings) keep producers and listeners in sync.
//   FAB_PALETTE_OPEN      — anyone can fire this to open the palette (⌘K,
//                           topbar Search pill, custom triggers).
//   FAB_PALETTE_CHANGED   — BottomActionFab broadcasts this whenever its
//                           open state flips; carries `{ open: boolean }`
//                           in detail. Used by WorkspaceShell to suppress
//                           global keyboard shortcuts while open.
export const FAB_PALETTE_OPEN_EVENT = "tulala:open-fab-palette";
export const FAB_PALETTE_CHANGED_EVENT = "tulala:fab-palette-changed";
export type FabPaletteChangedDetail = { open: boolean };

// ─────────────��─────────────────────────────────���─────────────────────
// Phase B — Profile override system (mock)
//
// When the talent profile shell drawer commits edits, `setProfileOverride`
// patches a module-level map so every surface that calls `getProfileById`
// sees the updated data immediately without a page reload. The override is
// shallow-merged: only touched top-level fields change; nested shapes are
// replaced atomically (e.g. the full measurements object when measurements
// were edited). Production replaces this with a Supabase round-trip.
//
// Canonical demo talent: id "t1" → MY_TALENT_PROFILE (Marta Reyes).
// Other roster talents can be seeded by adding entries to TALENT_PROFILES_BY_ID
// before the first render; the bridge data-layer (Phase 1) will eventually
// supply live records here for the ?dataSource=live path.
// ────────────────────────────────────────────────────────��────────────

/** Parse a YouTube / Vimeo / direct-mp4 URL into a structured form.
 *  Returns null when the URL isn't recognised. Downstream renderers use
 *  `provider` to pick the coloured chip and `thumbUrl` for the tile
 *  image before the video plays. */
export type ParsedVideoUrl = {
  provider: "youtube" | "vimeo" | "mp4";
  /** Static thumbnail URL for displaying a preview tile. */
  thumbUrl?: string;
  /** Embed-ready src URL for an <iframe> (YouTube/Vimeo) or
   *  direct <video> src (mp4). */
  embedUrl?: string;
};
export function parseVideoUrl(url: string): ParsedVideoUrl | null {
  if (!url) return null;
  const t = url.trim();
  const yt = t.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (yt) return {
    provider: "youtube",
    thumbUrl: `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg`,
    embedUrl: `https://www.youtube.com/embed/${yt[1]}`,
  };
  const vi = t.match(/(?:vimeo\.com\/(?:video\/)?|player\.vimeo\.com\/video\/)(\d+)/);
  if (vi) return {
    provider: "vimeo",
    embedUrl: `https://player.vimeo.com/video/${vi[1]}`,
  };
  if (t.match(/\.mp4(\?|$)/i)) return { provider: "mp4", embedUrl: t };
  return null;
}

/** Index of all mock talent profiles keyed by id. Seed additional
 *  entries here or via the bridge data-layer (Phase 1). */
export const TALENT_PROFILES_BY_ID: Record<string, MyTalentProfile> = {
  t1: MY_TALENT_PROFILE,
};

/** Look up a talent profile by id. Falls back to MY_TALENT_PROFILE when
 *  the id isn't in the mock index — keeps code paths non-nullable in the
 *  prototype while the live bridge is still being wired. */
export function getProfileById(id: string): MyTalentProfile {
  return TALENT_PROFILES_BY_ID[id] ?? MY_TALENT_PROFILE;
}

const __profileOverrides: Record<string, Partial<MyTalentProfile>> = {};
const __profileOverrideSubscribers = new Set<() => void>();

/** Patch a mock talent profile in-memory. Shallow merge — only keys in
 *  `patch` are overwritten; all other fields keep their current values. */
export function setProfileOverride(id: string, patch: Partial<MyTalentProfile>): void {
  __profileOverrides[id] = { ...(__profileOverrides[id] ?? {}), ...patch };
  __profileOverrideSubscribers.forEach(fn => fn());
}

/** Return the profile with any active override applied. Safe to call
 *  with an id that has no override — returns `profile` unchanged. */
export function applyProfileOverride(id: string, profile: MyTalentProfile): MyTalentProfile {
  const override = __profileOverrides[id];
  if (!override) return profile;
  return { ...profile, ...override };
}

/** React hook — components that display profile data call this to
 *  re-render whenever any profile override changes. */
export function useProfileOverrideSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    __profileOverrideSubscribers.add(fn);
    return () => { __profileOverrideSubscribers.delete(fn); };
  }, []);
}

/** Extract a stable id string from a roster-row-like object. The
 *  protocol: roster rows carry `id` (the talent's uuid or mock id).
 *  Centralised here so callers don't import `RosterRow` shapes directly. */
export function talentIdOf(row: { id: string }): string {
  return row.id;
}

// ────────────────��────────────────────��───────────────────────────────
// Pending review queue (mock)
//
// When a talent self-edits via the profile shell and submits, a
// PendingReviewRecord is pushed here keyed by talentId. The workspace
// roster card reads it to show an "Awaiting review" badge. An admin
// dismissing or approving from the drawer calls clearPendingReview().
// ─────────────────────────────────────────────��───────────────────────

export type PendingReviewRecord = {
  talentId: string;
  submittedAt: string; // ISO date string
  note: string;        // human-readable diff summary
};

const __pendingReviews: Record<string, PendingReviewRecord> = {};
const __pendingReviewSubscribers = new Set<() => void>();

export function addPendingReview(review: PendingReviewRecord): void {
  __pendingReviews[review.talentId] = review;
  __pendingReviewSubscribers.forEach(fn => fn());
}

export function clearPendingReview(talentId: string): void {
  delete __pendingReviews[talentId];
  __pendingReviewSubscribers.forEach(fn => fn());
}

/** Return the pending review for a roster row, or null if none. */
export function getPendingReviewForRoster(row: { id: string; name?: string }): PendingReviewRecord | null {
  return __pendingReviews[row.id] ?? null;
}

/** React hook — re-renders when any pending-review entry is added or
 *  cleared. Roster surfaces call this to keep the badge in sync. */
export function usePendingReviewSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force((n) => n + 1);
    __pendingReviewSubscribers.add(fn);
    return () => { __pendingReviewSubscribers.delete(fn); };
  }, []);
}

// ─────────────────────────────────────────────────────────────────────
// Website / domain mock state
//
// The website page (workspace surface, page=website) reads everything
// here. The domain drawer reads `WEBSITE_STATE.domain` so the two
// surfaces stay in sync. In production each piece maps to its own
// table — see dev-handoff §27 for the production wiring map.
// ─────────────────────────────────────────────────────────────────────

type WebsiteDnsRecord = {
  type: string;
  host: string;
  value: string;
  matched: boolean;
};
type WebsiteAlternateDomain = {
  domain: string;
  status: "verified" | "pending";
};
export type WebsiteDomain = {
  primaryDomain: string;
  status: "verified" | "pending" | "unverified";
  sslStatus: "active" | "pending" | "expired";
  sslExpiresOn?: string;
  dnsRecords?: WebsiteDnsRecord[];
  redirectsToWww: boolean;
  alternateDomains: WebsiteAlternateDomain[];
};

export type WebsitePageRow = {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft" | "scheduled";
  updatedAt: string;
  scheduledFor?: string;
  lastEditedBy: string;
  template: string;
  hits7d?: number;
};

export type WebsitePost = {
  id: string;
  title: string;
  slug: string;
  status: "published" | "draft" | "scheduled";
  publishedAt?: string;
  updatedAt: string;
  author: string;
  hits7d?: number;
  tags: string[];
};

export type WebsiteRedirect = {
  id: string;
  from: string;
  to: string;
  statusCode: 301 | 302 | 307 | 308;
  match: "exact" | "prefix" | "regex";
  hits7d?: number;
  createdAt: string;
  createdBy: string;
  active: boolean;
};

export type WebsiteJsBlock = {
  id: string;
  label: string;
  code: string;
  placement: "head" | "body-end";
  enabled: boolean;
};

export type WebsiteCustomCode = {
  css: string;
  js: WebsiteJsBlock[];
};

export type WebsiteTrackingCodes = {
  ga4MeasurementId: string;
  plausibleDomain: string;
  metaPixelId: string;
  gtmContainerId: string;
  hotjarSiteId: string;
  linkedInPartnerId: string;
  cookieConsent: "off" | "essential" | "geo-aware";
};

export type WebsiteSeoDefaults = {
  siteTitle: string;
  titleTemplate: string;
  description: string;
  ogImage: string;
  twitterHandle: string;
  robotsMode: "indexable" | "noindex-nofollow" | "private";
  sitemapEnabled: boolean;
  canonicalDomain: string;
};

export type WebsiteMaintenance = {
  enabled: boolean;
  message: string;
  scheduledStart?: string;
  scheduledEnd?: string;
  bypassToken: string;
};

export type WebsiteAnnouncement = {
  enabled: boolean;
  text: string;
  ctaLabel?: string;
  ctaHref?: string;
  audience: "all" | "clients" | "talent";
  tone: "neutral" | "info" | "success" | "warning";
};

export type WebsitePeriodMetrics = {
  visits: number;
  inquiries: number;
  bookings: number;
  revenue: number;
  prior: { visits: number; inquiries: number; bookings: number; revenue: number };
};

export type WebsitePageMetrics = {
  pageId: string;
  visits: number;
  inquiries: number;
  bookings: number;
};

export type WebsiteTalentMetrics = {
  talentId: string;
  talentName: string;
  visits: number;
  inquiries: number;
  bookings: number;
  revenue: number;
  topPageId?: string;
};

export type WebsiteAnalytics = {
  refreshedAt: string;
  last7d: WebsitePeriodMetrics;
  last30d: WebsitePeriodMetrics;
  byPage7d: WebsitePageMetrics[];
  byPage30d: WebsitePageMetrics[];
  byTalent7d: WebsiteTalentMetrics[];
  byTalent30d: WebsiteTalentMetrics[];
};

export type WebsiteState = {
  pages: WebsitePageRow[];
  posts: WebsitePost[];
  redirects: WebsiteRedirect[];
  customCode: WebsiteCustomCode;
  tracking: WebsiteTrackingCodes;
  seo: WebsiteSeoDefaults;
  domain: WebsiteDomain;
  maintenance: WebsiteMaintenance;
  announcement: WebsiteAnnouncement;
  analytics: WebsiteAnalytics;
};

const _now = Date.now();
const _daysAgo = (n: number) => new Date(_now - n * 86400e3).toISOString();
const _daysAhead = (n: number) => new Date(_now + n * 86400e3).toISOString();

export const WEBSITE_STATE: WebsiteState = {
  pages: [
    { id: "p1", title: "Home",                  slug: "/",            status: "published", updatedAt: _daysAgo(2),  lastEditedBy: "Joana Rivera", template: "home",    hits7d: 1842 },
    { id: "p2", title: "Roster",                slug: "/roster",      status: "published", updatedAt: _daysAgo(5),  lastEditedBy: "Joana Rivera", template: "roster",  hits7d: 1216 },
    { id: "p3", title: "About us",              slug: "/about",       status: "published", updatedAt: _daysAgo(30), lastEditedBy: "Marco Conti",  template: "about",   hits7d: 412 },
    { id: "p4", title: "Contact",               slug: "/contact",     status: "published", updatedAt: _daysAgo(60), lastEditedBy: "Joana Rivera", template: "contact", hits7d: 287 },
    { id: "p5", title: "Press kit",             slug: "/press",       status: "draft",     updatedAt: _daysAgo(1),  lastEditedBy: "Marco Conti",  template: "press",   hits7d: 0 },
    { id: "p6", title: "SS27 capsule launch",   slug: "/launch/ss27", status: "scheduled", scheduledFor: _daysAhead(14), updatedAt: _daysAgo(0.2), lastEditedBy: "Joana Rivera", template: "blank", hits7d: 0 },
  ],
  posts: [
    { id: "po1", title: "Spring 2026 — what's moving",   slug: "/blog/spring-2026-moving",  status: "published", publishedAt: _daysAgo(3),  updatedAt: _daysAgo(3),  author: "Joana Rivera", hits7d: 412, tags: ["editorial", "trends"] },
    { id: "po2", title: "BTS · Vogue Italia editorial",  slug: "/blog/bts-vogue-italia",    status: "published", publishedAt: _daysAgo(7),  updatedAt: _daysAgo(7),  author: "Marco Conti",  hits7d: 318, tags: ["bts", "editorial"] },
    { id: "po3", title: "Welcoming Tomás Navarro",       slug: "/blog/welcoming-tomas",     status: "published", publishedAt: _daysAgo(14), updatedAt: _daysAgo(14), author: "Joana Rivera", hits7d: 156, tags: ["roster"] },
    { id: "po4", title: "Rate cards explained",          slug: "/blog/rate-cards-explained", status: "published", publishedAt: _daysAgo(30), updatedAt: _daysAgo(30), author: "Marco Conti", hits7d: 87,  tags: ["operations"] },
    { id: "po5", title: "Press kit refresh",             slug: "/blog/press-kit-refresh",   status: "draft",     updatedAt: _daysAgo(2),  author: "Joana Rivera", hits7d: 0, tags: ["meta"] },
  ],
  redirects: [
    { id: "r1", from: "/talent",         to: "/roster",                              statusCode: 301, match: "exact",  hits7d: 142, createdAt: "2025-11-04T10:00:00Z", createdBy: "Joana Rivera", active: true },
    { id: "r2", from: "/old-press",      to: "/press",                               statusCode: 301, match: "exact",  hits7d: 8,   createdAt: "2025-12-12T14:30:00Z", createdBy: "Marco Conti",  active: true },
    { id: "r3", from: "/blog/2024/*",    to: "https://archive.acme-models.com/$1",   statusCode: 301, match: "regex",  hits7d: 47,  createdAt: "2025-09-22T09:15:00Z", createdBy: "Joana Rivera", active: true },
    { id: "r4", from: "/spring-promo",   to: "/launch/ss27",                         statusCode: 302, match: "exact",  hits7d: 213, createdAt: "2026-04-14T08:00:00Z", createdBy: "Joana Rivera", active: true },
    { id: "r5", from: "/contact-us",     to: "/contact",                             statusCode: 301, match: "exact",  hits7d: 33,  createdAt: "2025-08-01T11:00:00Z", createdBy: "Marco Conti",  active: false },
  ],
  customCode: {
    css: "/* Custom CSS for the live site */\n.editorial-band { letter-spacing: -0.5px; }\n",
    js: [
      { id: "jc1", label: "Hotjar tracking",  code: "<!-- Hotjar Tracking Code -->", placement: "head",     enabled: true },
      { id: "jc2", label: "Newsletter popup", code: "// Custom newsletter popup logic",            placement: "body-end", enabled: false },
    ],
  },
  tracking: {
    ga4MeasurementId: "G-EXAMPLE1234",
    plausibleDomain: "acme-models.tulala.digital",
    metaPixelId: "",
    gtmContainerId: "",
    hotjarSiteId: "1234567",
    linkedInPartnerId: "",
    cookieConsent: "geo-aware",
  },
  seo: {
    siteTitle: "Acme Models",
    titleTemplate: "%s — Acme Models",
    description: "Acme Models represents editorial talent across fashion, hospitality, and live events. Curated roster, vetted partners, fast booking.",
    ogImage: "https://acme-models.tulala.digital/og.png",
    twitterHandle: "@acmemodels",
    robotsMode: "indexable",
    sitemapEnabled: true,
    canonicalDomain: "acme-models.tulala.digital",
  },
  domain: {
    primaryDomain: "acme-models.tulala.digital",
    status: "verified",
    sslStatus: "active",
    sslExpiresOn: "2026-12-01",
    dnsRecords: [
      { type: "CNAME", host: "www",  value: "acme-models.tulala.digital", matched: true },
      { type: "A",     host: "@",    value: "76.76.21.21",                matched: true },
    ],
    redirectsToWww: true,
    alternateDomains: [],
  },
  maintenance: {
    enabled: false,
    message: "We're polishing things. Back in a moment.",
    bypassToken: "preview-1f2e3d",
  },
  announcement: {
    enabled: true,
    text: "Casting open for the SS27 capsule — apply by May 30.",
    ctaLabel: "View brief",
    ctaHref: "/launch/ss27",
    audience: "all",
    tone: "info",
  },
  analytics: {
    refreshedAt: _daysAgo(0.04),
    last7d: {
      visits: 4730,
      inquiries: 23,
      bookings: 6,
      revenue: 14500,
      prior: { visits: 4148, inquiries: 18, bookings: 4, revenue: 10980 },
    },
    last30d: {
      visits: 19140,
      inquiries: 87,
      bookings: 28,
      revenue: 61200,
      prior: { visits: 14920, inquiries: 71, bookings: 21, revenue: 46300 },
    },
    byPage7d: [
      { pageId: "p2", visits: 1216, inquiries: 11, bookings: 4 },
      { pageId: "p1", visits: 1842, inquiries:  6, bookings: 1 },
      { pageId: "p3", visits:  412, inquiries:  4, bookings: 1 },
      { pageId: "p4", visits:  287, inquiries:  2, bookings: 0 },
      { pageId: "p5", visits:    0, inquiries:  0, bookings: 0 },
      { pageId: "p6", visits:    0, inquiries:  0, bookings: 0 },
    ],
    byPage30d: [
      { pageId: "p2", visits: 4180, inquiries: 41, bookings: 17 },
      { pageId: "p1", visits: 6320, inquiries: 22, bookings:  6 },
      { pageId: "p3", visits: 1410, inquiries: 14, bookings:  3 },
      { pageId: "p4", visits:  980, inquiries:  9, bookings:  2 },
      { pageId: "p5", visits:    0, inquiries:  0, bookings:  0 },
      { pageId: "p6", visits:    0, inquiries:  0, bookings:  0 },
    ],
    byTalent7d: [
      { talentId: "t1", talentName: "Marta Reyes",   visits: 624, inquiries: 7, bookings: 3, revenue: 18400, topPageId: "p2" },
      { talentId: "t3", talentName: "Tomás Navarro", visits: 412, inquiries: 5, bookings: 2, revenue: 12800, topPageId: "p2" },
      { talentId: "t4", talentName: "Lina Park",     visits: 318, inquiries: 3, bookings: 1, revenue:  6200, topPageId: "p2" },
      { talentId: "t5", talentName: "Amelia Dorsey", visits: 184, inquiries: 2, bookings: 1, revenue:  4400, topPageId: "p2" },
      { talentId: "t2", talentName: "Kai Lin",       visits: 156, inquiries: 2, bookings: 0, revenue:     0, topPageId: "p3" },
    ],
    byTalent30d: [
      { talentId: "t1", talentName: "Marta Reyes",   visits: 2180, inquiries: 26, bookings: 11, revenue: 64800, topPageId: "p2" },
      { talentId: "t3", talentName: "Tomás Navarro", visits: 1490, inquiries: 18, bookings:  7, revenue: 41200, topPageId: "p2" },
      { talentId: "t4", talentName: "Lina Park",     visits: 1124, inquiries: 11, bookings:  4, revenue: 22000, topPageId: "p2" },
      { talentId: "t5", talentName: "Amelia Dorsey", visits:  672, inquiries:  8, bookings:  3, revenue: 13200, topPageId: "p2" },
      { talentId: "t2", talentName: "Kai Lin",       visits:  548, inquiries:  6, bookings:  2, revenue:  8400, topPageId: "p3" },
    ],
  },
};

// ─────────────────────��───────────────────────────────────────────────
// Re-exports from _field-catalog.ts
//
// `_talent.tsx` imports computeProfileCompleteness, fieldsForType, and
// FIELD_CATALOG from "./_state" (same import block as all other state
// symbols). Rather than modifying the frozen caller file, we re-export
// these from the catalog module. The circular import (_state ↔
// _field-catalog) is safe: _field-catalog already uses lazy
// initialization for everything that touches TAXONOMY_FIELDS.
// ──────────────────────────────���─────────────────────────────────��────
export {
  computeProfileCompleteness,
  fieldsForType,
  FIELD_CATALOG,
} from "./_field-catalog";
