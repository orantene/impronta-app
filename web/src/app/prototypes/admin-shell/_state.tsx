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
export type WorkspacePage =
  | "overview"
  | "work"
  | "talent"
  | "clients"
  | "site"
  | "workspace";

// Talent surface — relationship-based (no separate plan ladder; talent inherits
// the agency they belong to). Keep dimensions minimal: which agency, which page.
export type TalentPage =
  | "today"
  | "profile"
  | "inbox"
  | "calendar"
  | "activity"
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
export const CLIENT_PLANS: ClientPlan[] = ["free", "pro", "enterprise"];
export const HQ_ROLES: HqRole[] = ["support", "ops", "billing", "exec"];
export const WORKSPACE_PAGES: WorkspacePage[] = [
  "overview",
  "work",
  "talent",
  "clients",
  "site",
  "workspace",
];
export const TALENT_PAGES: TalentPage[] = [
  "today",
  "profile",
  "inbox",
  "calendar",
  "activity",
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
  work: { label: "Work" },
  talent: { label: "Talent" },
  clients: { label: "Clients" },
  site: { label: "Site" },
  workspace: { label: "Workspace" },
};

export const TALENT_PAGE_META: Record<TalentPage, { label: string }> = {
  today: { label: "Today" },
  profile: { label: "Edit profile" },
  inbox: { label: "Inbox" },
  calendar: { label: "Calendar" },
  activity: { label: "Activity" },
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
  | "talent-profile-edit"
  | "talent-profile-section"
  | "talent-availability"
  | "talent-block-dates"
  | "talent-portfolio"
  | "talent-agency-relationship"
  | "talent-leave-agency"
  | "talent-notifications"
  | "talent-privacy"
  | "talent-payouts"
  | "talent-earnings-detail"
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
  | "inquiry-workspace";

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
  coordination: { label: "Coordination", tone: "amber", description: "Coordinator working with client + selecting talent." },
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
export type RichInquiry = {
  id: string;
  // identity
  agencyName: string;
  clientName: string;
  brief: string;
  // shoot
  date: string | null;
  location: string | null;
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
    brief: "Spring lookbook · 3 talent · 1 day",
    date: "Tue, May 6",
    location: "Madrid · Estudio Roca",
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
    brief: "Editorial spread · 2 talent · 2 days",
    date: "May 14–15",
    location: "Milan · Studio 5",
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
    ],
  },
  {
    id: "RI-203",
    agencyName: "Acme Models",
    clientName: "Bvlgari",
    brief: "Jewelry campaign · 1 talent · multi-day",
    date: "May 18–20",
    location: "Rome · Cinecittà 7",
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
    ],
  },
  {
    id: "RI-204",
    agencyName: "Acme Models",
    clientName: "Estudio Roca",
    brief: "Brand gala · 6 hosts + 4 models + 2 promoters",
    date: "Sat, May 24",
    location: "Madrid · Palacio Vistalegre",
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
    brief: "Editorial · 1 talent · 1 day",
    date: "Apr 10",
    location: "London · Hackney",
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
];

export const ROSTER_AGENCY: TalentProfile[] = [
  { id: "t1", name: "Marta Reyes", state: "published", height: "5'9\"", city: "Madrid", thumb: "🌸" },
  { id: "t2", name: "Kai Lin", state: "published", height: "5'11\"", city: "Berlin", thumb: "🌊" },
  { id: "t3", name: "Tomás Navarro", state: "published", height: "6'1\"", city: "Lisbon", thumb: "🍃" },
  { id: "t4", name: "Lina Park", state: "awaiting-approval", height: "5'7\"", city: "Paris", thumb: "🌷" },
  { id: "t5", name: "Amelia Dorsey", state: "invited", height: "5'8\"", city: "Lisbon", thumb: "🌿" },
  { id: "t6", name: "Sven Olafsson", state: "draft", height: "6'0\"", city: "Oslo", thumb: "🌲" },
  { id: "t7", name: "Zara Habib", state: "published", height: "5'10\"", city: "London", thumb: "🌹" },
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
};

export const CLIENTS_AGENCY: Client[] = [
  { id: "c1", name: "Vogue Italia", contact: "Sara Bianchi", bookingsYTD: 6, status: "active" },
  { id: "c2", name: "Mango", contact: "Joana Rivera", bookingsYTD: 4, status: "active" },
  { id: "c3", name: "Zara", contact: "Lucas Vidal", bookingsYTD: 3, status: "active" },
  { id: "c4", name: "Bvlgari", contact: "Marco Conti", bookingsYTD: 2, status: "active" },
  { id: "c5", name: "Net-a-Porter", contact: "Helena Ross", bookingsYTD: 1, status: "dormant" },
];

export const CLIENTS_FREE: Client[] = [
  { id: "c1", name: "Friend referral", contact: "—", bookingsYTD: 0, status: "active" },
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

export const ACTIVATION_TASKS = [
  { id: "add-talent", label: "Add your first talent", drawer: "new-talent" as DrawerId },
  { id: "publish", label: "Publish a profile", drawer: "talent-profile" as DrawerId },
  { id: "share-url", label: "Share your workspace URL", drawer: null },
  { id: "invite-team", label: "Invite a teammate (optional)", drawer: "team" as DrawerId },
];

// ─── Workspace info ──────────────────────────────────────────────────

export const TENANT = {
  slug: "acme-models",
  name: "Acme Models",
  domain: "acme-models.tulala.app",
  customDomain: "acme-models.com",
  initials: "A",
};

// ════════════════════════════════════════════════════════════════════
// Talent surface mock data
// ════════════════════════════════════════════════════════════════════

export type MyTalentProfile = {
  name: string;
  initials: string;
  primaryAgency: string;
  measurements: string;
  city: string;
  publishedAt: string; // "Apr 12, 2026"
  profileViews7d: number;
  inquiries7d: number;
  completeness: number; // 0–100
  missing: string[];
  publicUrl: string;
};

export const MY_TALENT_PROFILE: MyTalentProfile = {
  name: "Marta Reyes",
  initials: "MR",
  primaryAgency: "Acme Models",
  measurements: "5'9\" · 86-62-91",
  city: "Madrid · willing to travel",
  publishedAt: "Apr 12, 2026",
  profileViews7d: 142,
  inquiries7d: 4,
  completeness: 84,
  missing: ["3 portfolio shots from 2026", "Tax form (W-8BEN)"],
  publicUrl: "acme-models.com/talent/marta-reyes",
};

export type TalentAgency = {
  id: string;
  name: string;
  slug: string;
  joinedAt: string;
  isPrimary: boolean;
  status: "active" | "exclusive" | "non-exclusive" | "ended";
  bookingsYTD: number;
};

export const MY_AGENCIES: TalentAgency[] = [
  { id: "ag1", name: "Acme Models", slug: "acme-models", joinedAt: "Mar 2024", isPrimary: true, status: "exclusive", bookingsYTD: 6 },
  { id: "ag2", name: "Praline London", slug: "praline-london", joinedAt: "Jan 2025", isPrimary: false, status: "non-exclusive", bookingsYTD: 2 },
];

export type TalentRequest = {
  id: string;
  kind: "offer" | "hold" | "casting" | "request";
  agency: string;
  client: string;
  brief: string;
  date?: string;
  amount?: string;
  ageHrs: number;
  status: "needs-answer" | "viewed" | "accepted" | "declined" | "expired";
};

export const TALENT_REQUESTS: TalentRequest[] = [
  { id: "rq1", kind: "offer", agency: "Acme Models", client: "Mango", brief: "Lookbook · spring capsule · 1 day", date: "Tue · May 6", amount: "€1,800", ageHrs: 5, status: "needs-answer" },
  { id: "rq2", kind: "hold", agency: "Acme Models", client: "Bvlgari", brief: "Editorial · jewelry campaign", date: "May 18–20", amount: "€4,000–6,000", ageHrs: 18, status: "needs-answer" },
  { id: "rq3", kind: "casting", agency: "Praline London", client: "Net-a-Porter", brief: "Casting call · video lookbook", date: "Apr 30", amount: "TBC", ageHrs: 36, status: "viewed" },
  { id: "rq4", kind: "offer", agency: "Acme Models", client: "Vogue Italia", brief: "Editorial spread · 2 day shoot", date: "May 14–15", amount: "€3,200", ageHrs: 60, status: "accepted" },
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
  status: "confirmed" | "in-progress" | "wrapped" | "paid";
  call: string;
};

export const TALENT_BOOKINGS: TalentBooking[] = [
  { id: "bk1", agency: "Acme Models", client: "Mango", brief: "Lookbook · spring capsule", startDate: "Tue, May 6", location: "Madrid · ESTUDIO ROCA", amount: "€1,800", status: "confirmed", call: "08:30" },
  { id: "bk2", agency: "Acme Models", client: "Vogue Italia", brief: "Editorial spread", startDate: "May 14", endDate: "May 15", location: "Milan · Studio 5", amount: "€3,200", status: "confirmed", call: "07:00" },
  { id: "bk3", agency: "Praline London", client: "Burberry", brief: "Lookbook", startDate: "Apr 18", location: "London · Hackney", amount: "£2,400", status: "wrapped", call: "—" },
  { id: "bk4", agency: "Acme Models", client: "Zara", brief: "Capsule lookbook", startDate: "Mar 28", location: "Madrid", amount: "€2,000", status: "paid", call: "—" },
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
};

export const EARNINGS_ROWS: EarningsRow[] = [
  { id: "e1", workDate: "Mar 28, 2026", payoutDate: "Apr 4, 2026", agency: "Acme Models", client: "Zara", amount: "€2,000", status: "paid" },
  { id: "e2", workDate: "Mar 10, 2026", payoutDate: "Mar 21, 2026", agency: "Praline London", client: "Burberry", amount: "£2,400", status: "paid" },
  { id: "e3", workDate: "Mar 1, 2026", payoutDate: "Mar 12, 2026", agency: "Acme Models", client: "Vogue Italia", amount: "€2,800", status: "paid" },
  { id: "e4", workDate: "Feb 14, 2026", payoutDate: "Feb 28, 2026", agency: "Acme Models", client: "Mango", amount: "€1,600", status: "paid" },
  { id: "e5", workDate: "Jan 30, 2026", payoutDate: "Feb 14, 2026", agency: "Acme Models", client: "Net-a-Porter", amount: "€3,400", status: "paid" },
];

// ════════════════════════════════════════════════════════════════════
// Client surface mock data
// ════════════════════════════════════════════════════════════════════

export type ClientBrand = {
  id: string;
  name: string;
  initials: string;
  industry: string;
};

export const MY_CLIENT_BRAND: ClientBrand = {
  id: "br1",
  name: "Estudio Solé",
  initials: "ES",
  industry: "Fashion · creative studio",
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
  seats: number;
  talentCount: number;
  mrr: string;
  health: "healthy" | "at-risk" | "churning";
  signupAt: string;
  lastActivity: string;
};

export const PLATFORM_TENANTS: PlatformTenant[] = [
  { id: "tn1", name: "Acme Models", slug: "acme-models", plan: "agency", seats: 8, talentCount: 47, mrr: "$149", health: "healthy", signupAt: "Jan 2025", lastActivity: "2m ago" },
  { id: "tn2", name: "Praline London", slug: "praline-london", plan: "agency", seats: 12, talentCount: 84, mrr: "$149", health: "healthy", signupAt: "Sep 2024", lastActivity: "12m ago" },
  { id: "tn3", name: "Maison Sud", slug: "maison-sud", plan: "studio", seats: 3, talentCount: 18, mrr: "$79", health: "healthy", signupAt: "Mar 2026", lastActivity: "1h ago" },
  { id: "tn4", name: "Nord Talent", slug: "nord-talent", plan: "studio", seats: 5, talentCount: 22, mrr: "$79", health: "at-risk", signupAt: "Nov 2025", lastActivity: "11d ago" },
  { id: "tn5", name: "Bottega Roma", slug: "bottega-roma", plan: "free", seats: 1, talentCount: 4, mrr: "$0", health: "at-risk", signupAt: "Apr 2026", lastActivity: "2d ago" },
  { id: "tn6", name: "Coast & Co", slug: "coast-co", plan: "free", seats: 1, talentCount: 1, mrr: "$0", health: "churning", signupAt: "Feb 2026", lastActivity: "21d ago" },
  { id: "tn7", name: "Tokyo Faces", slug: "tokyo-faces", plan: "network", seats: 22, talentCount: 312, mrr: "$899", health: "healthy", signupAt: "Aug 2024", lastActivity: "4m ago" },
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

type Toast = { id: number; message: string };

export type Impersonation = {
  tenantSlug: string;
  tenantName: string;
  asPlan: Plan;
  asRole: Role;
  readOnly: boolean;
} | null;

export type ProtoState = {
  surface: Surface;
  // workspace dimensions
  plan: Plan;
  role: Role;
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
};

type Ctx = {
  state: ProtoState;
  setSurface: (s: Surface) => void;
  setPlan: (p: Plan) => void;
  setRole: (r: Role) => void;
  setAlsoTalent: (b: boolean) => void;
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
  openUpgrade: (offer: Omit<UpgradeOffer, "open">) => void;
  closeUpgrade: () => void;
  toast: (message: string) => void;
  completeTask: (id: string) => void;
};

const ProtoContext = createContext<Ctx | null>(null);

export function ProtoProvider({ children }: { children: ReactNode }) {
  const [surface, setSurface] = useState<Surface>("workspace");
  // workspace
  const [plan, setPlan] = useState<Plan>("free");
  const [role, setRole] = useState<Role>("owner");
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
  const toastIdRef = useRef(0);

  // Read initial state from URL on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const s = params.get("surface");
    const pl = params.get("plan");
    const r = params.get("role");
    const at = params.get("alsoTalent");
    const pg = params.get("page");
    const tpg = params.get("talentPage");
    const cpl = params.get("clientPlan");
    const cpg = params.get("clientPage");
    const hr = params.get("hqRole");
    const ppg = params.get("platformPage");
    if (s && SURFACES.includes(s as Surface)) setSurface(s as Surface);
    if (pl && PLANS.includes(pl as Plan)) setPlan(pl as Plan);
    if (r && ROLES.includes(r as Role)) setRole(r as Role);
    if (at === "true" || at === "false") setAlsoTalent(at === "true");
    if (pg && WORKSPACE_PAGES.includes(pg as WorkspacePage)) setPage(pg as WorkspacePage);
    if (tpg && TALENT_PAGES.includes(tpg as TalentPage)) setTalentPage(tpg as TalentPage);
    if (cpl && CLIENT_PLANS.includes(cpl as ClientPlan)) setClientPlan(cpl as ClientPlan);
    if (cpg && CLIENT_PAGES.includes(cpg as ClientPage)) setClientPage(cpg as ClientPage);
    if (hr && HQ_ROLES.includes(hr as HqRole)) setHqRole(hr as HqRole);
    if (ppg && PLATFORM_PAGES.includes(ppg as PlatformPage)) setPlatformPage(ppg as PlatformPage);
  }, []);

  // Persist to URL (replace, not push). Only sync the dimensions relevant to
  // the active surface to keep URLs short and shareable.
  useEffect(() => {
    const params = new URLSearchParams();
    params.set("surface", surface);
    if (surface === "workspace") {
      params.set("plan", plan);
      params.set("role", role);
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
    const next = `${window.location.pathname}?${params.toString()}`;
    window.history.replaceState({}, "", next);
  }, [
    surface,
    plan,
    role,
    alsoTalent,
    page,
    talentPage,
    clientPlan,
    clientPage,
    hqRole,
    platformPage,
  ]);

  const openDrawer = useCallback(
    (id: DrawerId, payload?: Record<string, unknown>) => {
      setDrawer({ drawerId: id, payload });
    },
    [],
  );
  const closeDrawer = useCallback(() => {
    setDrawer({ drawerId: null });
  }, []);

  const openUpgrade = useCallback((offer: Omit<UpgradeOffer, "open">) => {
    setUpgrade({ open: true, ...offer });
  }, []);
  const closeUpgrade = useCallback(() => {
    setUpgrade({ open: false });
  }, []);

  const toast = useCallback((message: string) => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 2400);
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

  // Impersonation: HQ user starts viewing a tenant's workspace. We jump to
  // the workspace surface in read-only mode, with a banner overlay (rendered
  // by SurfaceRouter when state.impersonating is set).
  const startImpersonation = useCallback(
    (i: NonNullable<Impersonation>) => {
      setImpersonating(i);
      setSurface("workspace");
      setPlan(i.asPlan);
      setRole(i.asRole);
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
      },
      setSurface: handleSetSurface,
      setPlan,
      setRole,
      setAlsoTalent,
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
      openUpgrade,
      closeUpgrade,
      toast,
      completeTask,
    }),
    [
      surface,
      plan,
      role,
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
      handleSetSurface,
      startImpersonation,
      stopImpersonation,
      openDrawer,
      closeDrawer,
      openUpgrade,
      closeUpgrade,
      toast,
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
  surface: "#FAFAF7",
  card: "#FFFFFF",
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.62)",
  inkDim: "rgba(11,11,13,0.38)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  cream: "#F5F2EB",
  goldDeep: "#8B6308",
  gold: "#B8860B",
  goldSoft: "rgba(184,134,11,0.10)",
  green: "#2E7D5B",
  amber: "#C68A1E",
  red: "#B0303A",
  navyBg: "#0B0B0D",
};

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
