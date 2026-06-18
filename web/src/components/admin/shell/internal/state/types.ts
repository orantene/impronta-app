// ─────────────────────────────────────────────────────────────────────
// Phase 1b decomposition of _state.tsx (remediation-plan-2026-05-19 §4).
// Byte-for-byte declaration bodies; public surface re-exported by the
// ./state.tsx barrel. Do not add/remove exports here without updating
// the barrel + the "public export surface" proof.
// ─────────────────────────────────────────────────────────────────────
import type { DrawerId } from "./drawer-ids";
import type { OfferCommercialTerms } from "@/lib/billing/commercial-terms-types";

// ─── Surface dimensions ──────────────────────────────────────────────

export type Surface = "workspace" | "talent" | "client" | "platform";
export type Plan = "free" | "studio" | "agency" | "network";
export type Role = "viewer" | "editor" | "manager" | "admin" | "owner";
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
  | "media"      // Agency/Studio — workspace media gallery + watermark control
  | "pitches"    // Phase 9 — pitch history (admin curation of talent suggestions sent to clients). Renders via real server component, not the admin shell.
  | "financials" // L46 — business financials. Canonical server-rendered route; NOT a SPA nav tab.
  | "payouts"    // Stripe Connect payout onboarding + base reservation fee. In-shell SPA section (not in nav).
  | "settings"   // replaces workspace; billing folded in via anchor nav
  // ── legacy aliases (hidden from nav, kept for URL compat) ──
  | "inbox"
  | "work"
  | "talent"
  | "site"
  | "billing"
  | "workspace";

// Talent surface — relationship-based agency context plus a separate
// Free / Pro / Max personal membership ladder. Workspace plans and talent
// memberships are separate products and must not leak into each other.
export type TalentPage =
  | "today"
  | "messages"      // Chat-first inquiry/booking surface (replaces inbox)
  | "profile"
  | "inbox"         // Legacy list view — kept for URL compat, not in nav
  | "calendar"
  | "activity"      // Legacy — kept for URL compat; nav routes to settings tab
  | "reach"         // Legacy — kept for URL compat; nav routes to money
  | "agencies"      // Legacy — kept for URL compat; nav routes to money
  | "money"         // Phase E — earnings + agency relationships
  | "payouts"       // Embedded Stripe Connect payout onboarding. In-shell section (not in nav; reached from Settings).
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
  // Platform Builder Lab (WS5) — super_admin-only page-builder workshop that
  // authors/tests templates against real talent + workspace data and publishes
  // them into the consumer gallery. Persistence is ephemeral (never a page).
  | "builder-lab"
  | "settings";

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

/** Multi-role rosters: an inquiry can need hosts + models + promoters + general talent. */
export type RequirementRole = "talent" | "host" | "model" | "promoter";

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
  // Structured-card / voice discriminators carried from the persisted row.
  // Optional so mock rows (which omit them) still satisfy the type.
  messageKind?: string;
  cardPayload?: Record<string, unknown> | null;
  /** Raw message metadata jsonb — carries the voice-note descriptor for
   *  messageKind='voice' (parsed via readVoiceMetaFromMessageMetadata). */
  metadata?: Record<string, unknown> | null;
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
    /** One-line discipline (e.g. "Editorial Model") shown under the name. */
    headline?: string;
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
  /**
   * W6a — negotiated commercial terms on this offer (deposit / balance method /
   * refund policy). Populated by the offer loader once the data-bridge selects
   * the new inquiry_offers columns. Optional so the type stays valid before the
   * loader is wired; the read-only summary renders only when present.
   */
  commercialTerms?: OfferCommercialTerms | null;
  /** Offer total in MINOR units (cents) — for computing deposit/balance amounts. */
  totalCents?: number;
  /** ISO 4217 currency for the offer total. */
  currencyCode?: string;
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

/**
 * Per-talent contact policy — which client trust tiers may send
 * inquiries to this talent. Default opens all tiers. Talent can flip
 * any tier off in the contact-preferences drawer.
 */
export type TalentContactPolicy = Record<ClientTrustLevel, boolean>;

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
  /** Slice M wiring: pitch origin id — set when this inquiry was
   *  created from a Pitch (per project_pitch_feature.md). When present,
   *  the Chat tab top renders <PitchOriginCard> linking back to the
   *  pitch and the Event tab surfaces the originating pitch reference.
   *  Optional + nullable for back-compat with non-pitch inquiries. */
  pitchId?: string | null;
  /** Optional human-readable pitch title — surfaced in PitchOriginCard
   *  header. Falls back to "Pitch" when missing. */
  pitchTitle?: string | null;
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

// ─── Mock data ───────────────────────────────────────────────────────

export type TalentProfile = {
  id: string;
  /** Human-readable canonical talent code (`talent_profiles.profile_code`),
   *  e.g. "TAL-00033". Surfaced on the roster card + profile drawer so
   *  admins can reference a talent by a stable short id. */
  profileCode?: string;
  name: string;
  /** Real legal/given name from `talent_profiles.first_name` / `last_name`.
   *  Surfaced alongside the stage `name` so admins can identify a talent
   *  on cards (e.g. the Team drawer coordinator picker). Optional —
   *  incomplete profiles may not have them. */
  firstName?: string;
  lastName?: string;
  /** Talent contact email (`talent_profiles.invitation_email`). Shown on
   *  identity cards. Optional. */
  email?: string;
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
  /** ISO timestamp of when this talent was added to the roster. Drives "Newest" sort. */
  createdAt?: string;
  /** ISO timestamp of the last profile edit (`talent_profiles.updated_at`). Drives "Last edited" sort. */
  updatedAt?: string;
  /** Number of non-deleted portfolio/gallery media assets owned by this talent.
   *  Surfaced on the roster card so admins see which talents still need photos. */
  portfolioCount?: number;
  /** "available" | "busy" | "offline". Drives dot on the card. */
  availability?: "available" | "busy" | "offline";
  /** Short last-active string ("2h", "1d", "3d"). */
  lastActive?: string;
  /** Talent's `is_discoverable` master switch — true = visible on
   *  cross-tenant Tulala Discover catalog. Drives the "Discover" pill
   *  shown on the roster card so admins can see at-a-glance which
   *  talents are surfaced platform-wide. See project_discover_unified.md. */
  isDiscoverable?: boolean;
  /** Agency directory visibility — the roster-card "eye" toggle. true when
   *  `agency_talent_roster.agency_visibility` is `site_visible` or `featured`,
   *  i.e. this agency lists the talent in their directory / search / page.
   *  false = roster-only (on the roster, not shown publicly). */
  siteVisible?: boolean;
  /** Talent's own global kill-switch (`talent_profiles.is_publicly_hidden`).
   *  true = the talent has hidden their profile across all of Tulala — this
   *  overrides any agency's `siteVisible` choice. Drives the "Hidden by
   *  talent" indicator on the roster card. */
  talentHidden?: boolean;
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

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  /** Member headshot URL (`profiles.avatar_url`). Optional — falls back
   *  to an initial-tinted avatar on the identity card. */
  photoUrl?: string;
  role: Role;
  status: "active" | "invited";
  initials: string;
};

export type SitePage = {
  id: string;
  title: string;
  status: "published" | "draft";
  updatedAgo: string;
};

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

/** Who is the legal recipient of this payment in the platform's eyes. */
export type PayoutReceiverKind =
  | "agency-owner"
  | "agency-admin"
  | "coordinator"
  | "talent";

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
// Tiers are ADDITIVE, not exclusive. A talent on Max still
// appears on agency rosters and hubs the same way — the personal
// page is a parallel surface, not a replacement.

export type TalentSubscriptionTier = "free" | "pro" | "max";

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

/** A section grouping for the tier comparison matrix. */
export type TalentTierGroup = "page" | "discovery" | "money" | "tools";

/** One cell of the tier matrix: `true` = included, `false` = not
 *  included, `string` = a qualifying label (e.g. "Up to 6"). */
export type TalentTierCell = boolean | string;

/** One row of the talent tier catalog — the single source that drives
 *  the compare-drawer matrix AND the per-feature gates (`tierAllows`).
 *  Rows that gate a premium module carry `feature` + `unlockedAt`. */
export type TalentTierCatalogRow = {
  label: string;
  group: TalentTierGroup;
  free: TalentTierCell;
  pro: TalentTierCell;
  max: TalentTierCell;
  feature?: TalentTierFeature;
  unlockedAt?: TalentSubscriptionTier;
};

/** Page-builder template — only the "Roster" template ships at Free. */
export type TalentPageTemplate = {
  id: string;
  label: string;
  blurb: string;
  thumb: string;          // emoji preview
  /** First tier this template is available on. */
  availableAt: TalentSubscriptionTier;
};

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
  /** Custom domain (Max only). */
  customDomain?: string;
  /** Custom-domain verification state. */
  customDomainStatus?: "verified" | "pending" | "failed" | "not-set";
  /** Personal page URL — what the talent can share. Falls back to
   *  the canonical Tulala /t/<slug> path when no custom domain is set.
   *  All tiers (Free / Pro / Max) use the same canonical route;
   *  custom domain is reserved for Max only. */
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

/** Polaroid set — separate from the styled portfolio. Industry standard
 *  is 5: front, side, back, smile, no-makeup. The set proves what the
 *  talent looks like without lighting / styling.
 */
export type Polaroid = { id: string; angle: string; thumb: string; updatedAgo: string };

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

export type AvailabilityBlock = {
  id: string;
  startDate: string;
  endDate: string;
  reason: string;
  type: "blocked" | "travel" | "personal";
};

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
  | "photo_video" | "event_staff" | "security"
  | "services";

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
export type UpcomingVisit = {
  id: string;
  city: string;
  placeId?: string;
  /** ISO date string, e.g. "2026-06-15" */
  date?: string;
  /** Optional end date for multi-day visits */
  dateEnd?: string;
};

export type ServiceArea = {
  /** Current location / home city (canonical). */
  homeBase: string;
  /** Google place_id for homeBase, if resolved via autocomplete. */
  homePlaceId?: string;
  /** Upcoming visits / travel destinations. */
  upcomingVisits?: UpcomingVisit[];
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
// Gender option values are the CANONICAL display strings — they are ALSO the
// stored talent_profiles.gender column values (the bespoke identity editor
// persists the picker id verbatim, no slug↔label map; see TalentProfileShellDrawer
// gender read/write). Kept in lockstep with profile_field_definitions
// `identity.gender`.options + the directory facet field_definitions(gender)
// config.filter_options. (Tier-C-tail unification, 2026-06-10.)
export type GenderOption =
  | "Woman"
  | "Man"
  | "Non-binary"
  | "Trans woman"
  | "Trans man"
  | "Transgender"
  | "Genderfluid"
  | "Genderqueer"
  | "Agender"
  | "Bigender"
  | "Two-Spirit"
  | "Intersex"
  | "Prefer to self-describe"
  | "Prefer not to say";
export type AgeDisplayMode = "exact" | "range" | "hidden";

export type ProfileIdentity = {
  stageName: string;
  /** Given name — composes legal name, used for contracts. */
  firstName: string;
  /** Family name — composes legal name, used for contracts. */
  lastName: string;
  /** Admin-only / KYC. Never exposed on the public profile. */
  legalName: string;
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
  /** Direct contact email — agency-visible, never public. */
  contactEmail?: string;
  /** Primary phone number (digits only, prefix separate). */
  contactPhone?: string;
  /** Phone country-code prefix, e.g. "+52". */
  contactPhonePrefix?: string;
  /** WhatsApp number if different from primary phone. */
  whatsapp?: string;
  /** WhatsApp country-code prefix. */
  whatsappPrefix?: string;
  /** Secondary business line or handle. */
  businessLine?: string;
  /** Per-field visibility overrides. Keys are profile field short-ids;
   *  values are the channel array the talent chose. Matches FieldVisibility
   *  (ReadonlyArray<FieldChannel>) so ChannelVisibilityStrip onChange
   *  values can be assigned directly without a cast. */
  visibility?: Partial<Record<
    "legalName" | "pronouns" | "gender" | "dob",
    ReadonlyArray<RegFieldChannel>
  >>;
};

// ── Skills with proficiency ──────────────────────────────────────────
export type SkillProficiency = "great" | "can_do" | "learning";
export type SkillEntry = { skillId: string; proficiency: SkillProficiency };

// ── Bio tone selector ────────────────────────────────────────────────
export type BioTone = "editorial" | "friendly" | "professional" | "quirky";

// ── Personality fields ───────────────────────────────────────────────
export type Personality = { loves: string[]; avoids: string[] };

// ── Photo metadata ───────────────────────────────────────────────────
export type PhotoTag = "headshot" | "full_body" | "in_motion" | "portfolio" | "bts";
export type PhotoMeta = {
  url: string;
  /** DB row id for this asset in `media_assets`. Set after a real upload
   *  completes. Absent for unsaved/blob entries. Used for delete + reorder. */
  mediaAssetId?: string;
  /** True while the file is uploading to storage. UI can show a spinner. */
  uploading?: boolean;
  /** Human-readable error message if upload failed. UI shows red overlay. */
  uploadError?: string;
  tag?: PhotoTag;
  altText?: string;
  caption?: string;
  // ── Video media (Phase B portfolio drawer) ───────────────────────────
  videoUrl?: string;
  videoDurationSec?: number;
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


export type TaxonomyParent = {
  id: TaxonomyParentId;
  label: string;
  emoji: string;
  helper: string;
  children: TaxonomyChild[];
  /** Minimum plan tier required to enable this parent. */
  minPlan: "free" | "studio" | "agency" | "network";
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

/** Per-talent contact gate — controls who can send inquiries.
 *  Default "open" = anyone can DM. "verified_only" requires client to
 *  have an active trust badge; "trusted_only" requires score >= 60. */
export type TalentContactGate = "open" | "verified_only" | "trusted_only";

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

export type Shortlist = {
  id: string;
  name: string;
  brief: string;
  count: number;
  updatedAgo: string;
  status: "draft" | "shared" | "inquiry-sent" | "booked";
  thumbs: string[];
};

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

/** Agency reliability data — on-time deliveries + cancellation history (C20) */
export type AgencyReliability = {
  agencyName: string;
  bookingsCompleted: number;
  onTimeRate: number;   // 0–100
  cancellations: number;
  repeatBookings: number;
};

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

export type HubSubmission = {
  id: string;
  talentName: string;
  agency: string;
  submittedAt: string;
  status: "pending" | "featured" | "declined";
  reason?: string;
};

export type PlatformInvoice = {
  id: string;
  tenant: string;
  amount: string;
  date: string;
  plan: Plan;
  status: "paid" | "failed" | "refunded" | "pending";
};

export type FeatureFlag = {
  id: string;
  name: string;
  state: "on" | "off" | "rollout";
  rollout?: string; // "12% — agency plan"
  owner: string;
  description: string;
};

export type ModerationItem = {
  id: string;
  kind: "talent-profile" | "media-upload" | "client-profile" | "report";
  subject: string;
  reportedAt: string;
  reason: string;
  severity: "low" | "med" | "high";
};

export type SystemJob = {
  id: string;
  name: string;
  state: "running" | "queued" | "failed" | "succeeded";
  duration: string;
  lastRun: string;
};

export type PlatformIncident = {
  id: string;
  title: string;
  severity: "p1" | "p2" | "p3";
  state: "open" | "monitoring" | "resolved";
  startedAt: string;
};

export type SupportTicket = {
  id: string;
  tenant: string;
  subject: string;
  reportedBy: string;
  ageHrs: number;
  state: "new" | "open" | "waiting" | "resolved";
};

export type Impersonation = {
  tenantSlug: string;
  tenantName: string;
  asPlan: Plan;
  asRole: Role;
  asEntityType: EntityType;
  readOnly: boolean;
} | null;

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
  | "stageName" | "firstName" | "lastName" | "legalName" | "tagline" | "dob" | "ageDisplay" | "pronouns" | "gender"
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
  status: "published" | "draft" | "scheduled" | "archived";
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

/**
 * ANALYTICS-2 — a top-referrer row for the WebsitePerformance panel, grouped
 * from `view_site_page` payload `referrer` (host-normalized; "direct" when none).
 */
export type WebsiteReferrerMetrics = {
  referrer: string;
  visits: number;
};

export type WebsiteAnalytics = {
  refreshedAt: string;
  last7d: WebsitePeriodMetrics;
  last30d: WebsitePeriodMetrics;
  byPage7d: WebsitePageMetrics[];
  byPage30d: WebsitePageMetrics[];
  byTalent7d: WebsiteTalentMetrics[];
  byTalent30d: WebsiteTalentMetrics[];
  /** ANALYTICS-2 — top referrers (host) over the trailing window. */
  topReferrers7d: WebsiteReferrerMetrics[];
  topReferrers30d: WebsiteReferrerMetrics[];
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
