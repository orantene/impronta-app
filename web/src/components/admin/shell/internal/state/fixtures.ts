"use client";
// ─────────────────────────────────────────────────────────────────────
// Phase 1b decomposition of _state.tsx (remediation-plan-2026-05-19 §4).
// Byte-for-byte declaration bodies; public surface re-exported by the
// ./state.tsx barrel. Do not add/remove exports here without updating
// the barrel + the "public export surface" proof.
// ─────────────────────────────────────────────────────────────────────
import { useEffect, useState } from "react";
import { seatCapLabel } from "@/lib/saas/plan-seat-caps";
import type { WebsiteData } from "@/app/(workspace)/[tenantSlug]/_data-bridge/website";
import { resolveWorkspaceLiveAddress } from "@/lib/saas/workspace-live-url";
import { deriveWebsitePageStatus } from "./website-page-status";
import type { AgencyReliability, AvailabilityBlock, BioTone, BookingPaymentStatus, ChannelEntry, Client, ClientBooking, ClientBrand, ClientInquiry, ClientPlan, ClientProfile, ClientProfileId, ClientTrustLevel, DiscoverTalent, EarningsPaymentMethod, EarningsRow, EntityType, ExposurePreset, FeatureFlag, FieldVisibility, GenderOption, HubSubmission, Inquiry, InquiryCoordinatorRef, InquiryOwnershipResolution, InquiryRecord, InquirySource, InquiryStage, InquiryStatus, InquiryTalentInvite, LocaleCode, ModerationItem, MyTalentProfile, NotificationItem, ParsedVideoUrl, PaymentSummary, PayoutConnectionStatus, PayoutReceiver, PayoutReceiverKind, PendingReviewRecord, PendingTalent, PhotoTag, Plan, PlanLadderRow, PlatformIncident, PlatformInvoice, PlatformTenant, PlatformUser, Polaroid, ProfileClaimInvitation, ProfileClaimStatus, ProfileFieldId, ProfileTemplate, ProfileVerification, Pronouns, RateUnit, RegField, RepresentationStatus, RequirementRole, RichInquiry, Role, Shortlist, SitePage, SkillProficiency, SupportTicket, Surface, SystemJob, TalentAgency, TalentBooking, TalentContactGate, TalentContactPolicy, TalentInvite, TalentLanguage, TalentPage, TalentPageTemplate, TalentProfile, TalentRequest, TalentSpecialty, TalentSubscriptionTier, TalentTierCatalogRow, TalentTierFeature, TalentTierGroup, TaxonomyParent, TaxonomyParentId, TeamMember, TrackEvent, TrackProps, TrustTier, VerificationMethodAuditEntry, VerificationMethodConfig, VerificationRequest, VerificationType, Verifications, WebsiteAnalytics, WebsiteDomain, WebsiteDomainRecord, WebsitePageMetrics, WebsitePageRow, WebsitePeriodMetrics, WebsitePost, WebsiteRedirect, WebsiteSeoDefaults, WebsiteState, WorkspacePage, WorkspacePaymentRow, WorkspacePayout, WorkspaceTaxonomySetting } from "./types";
import type { DrawerId } from "./drawer-ids";

export const SURFACES: Surface[] = ["workspace", "talent", ];
export const PLANS: Plan[] = ["free", "website", "studio", "agency", "network"];
export const ROLES: Role[] = ["viewer", "editor", "manager", "admin", "owner"];
export const ENTITY_TYPES: EntityType[] = ["agency", "hub"];
export const CLIENT_PLANS: ClientPlan[] = ["free", "pro", "enterprise"];
// WS-3.1 — The canonical nav pages. Legacy aliases excluded.
export const WORKSPACE_PAGES: WorkspacePage[] = [
  "overview",
  "messages",
  "calendar",
  "sessions",
  "menu",
  "roster",
  "clients",
  "pitches",   // Phase 9 — pitch history surface.
  "reviews",   // WP1 — reputation surface (moderation queue + review photos)
  "analytics", // WP1 — funnel / money / website / reviews, honest empty states
  "website",   // 2026 — premium site management (pages, posts, redirects, custom code, tracking, SEO, domain). Sits between Production and Settings.
  "media",     // Agency/Studio — workspace media gallery + watermark control
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
// WS-8.1: activity removed from primary nav; WS-8.2: reach split into agencies + public-page.
// Talent Max foundation: public-page tab renders the site dashboard inside the shell at /talent/site
// and appears in nav as "Public page". Order mirrors talent.tsx rail groups.
export const TALENT_PAGES: TalentPage[] = [
  "today",
  "messages",
  "calendar",
  "money",
  "profile",
  "public-page",
  "services",
  "reviews",
  "settings",
];

// ─── Semantics ───────────────────────────────────────────────────────

export const PLAN_META: Record<Plan, { label: string; theme: string; rank: number }> = {
  free: { label: "Free", theme: "Join the ecosystem", rank: 0 },
  website: { label: "Website", theme: "Your site, your domain", rank: 1 },
  studio: { label: "Studio", theme: "Gain control", rank: 2 },
  agency: { label: "Agency", theme: "Branded operation", rank: 3 },
  network: { label: "Network", theme: "Multi-brand · hub", rank: 4 },
};

/** Canonical plan price string. Used in upgrade modal, locked cards, billing. */
export function planPrice(plan: Plan): string {
  if (plan === "free") return "Free forever";
  if (plan === "website") return "$12 / month";
  if (plan === "studio") return "$29 / month";
  if (plan === "agency") return "$79 / month";
  return "Custom pricing";
}

/** Compact price (no "/ month" suffix, used inside chips). */
export function planPriceCompact(plan: Plan): string {
  if (plan === "free") return "Free";
  if (plan === "website") return "$12/mo";
  if (plan === "studio") return "$29/mo";
  if (plan === "agency") return "$79/mo";
  return "Custom";
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
 * Canonical money format. USD (the platform operating currency), no decimals
 * for whole amounts: "$4,200" not "$4200.00". Never default to EUR here.
 */
export function fmtMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
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
  manager: { label: "Manager", rank: 2 },
  admin: { label: "Admin", rank: 3 },
  owner: { label: "Owner", rank: 4 },
};

export const SURFACE_META: Record<
  Surface,
  { label: string; short: string; ready: boolean }
> = {
  workspace: { label: "Workspace Admin", short: "Workspace", ready: true },
  talent: { label: "Talent", short: "Talent", ready: true },
};

// WS-3.2 — canonical page metadata.  Legacy aliases included so code that
// still references them doesn't throw; they redirect immediately in nav.
export const PAGE_META: Record<WorkspacePage, { label: string; icon: string; description?: string }> = {
  // ── canonical pages ──
  overview:  { label: "Overview",  icon: "home",     description: "Today's snapshot: unread, pending actions, recent activity" },
  messages:  { label: "Messages",  icon: "mail",     description: "All threads across active inquiries and bookings" },
  calendar:  { label: "Calendar",  icon: "calendar", description: "Scheduled shoots, holds, and deadlines" },
  sessions:  { label: "Schedule",  icon: "layers",   description: "Series and their occurrences, with the series editor" },
  menu:      { label: "Menu",      icon: "layers",   description: "Workspace-owned items customers can order from your site" },
  roster:    { label: "Roster",    icon: "users",    description: "Your talent, availability, and performance" },
  clients:   { label: "Clients",   icon: "briefcase", description: "Client accounts, trust tiers, and booking history" },
  reviews:   { label: "Reviews",   icon: "star",     description: "Reported reviews, review photos, and rating integrity" },
  analytics: { label: "Analytics", icon: "chart",    description: "Funnel, money, website, and reviews" },
  website:   { label: "Website",   icon: "globe",    description: "Pages, posts, redirects, custom code, tracking, SEO, domain" },
  media:     { label: "Media",     icon: "camera",   description: "Workspace photo library, watermark control, and usage tracking" },
  pitches:   { label: "Pitches",   icon: "send",     description: "Curated talent suggestions sent to clients" },
  financials:{ label: "Financials",icon: "trending-up", description: "Revenue, payouts, commissions, and payment status" },
  orders:    { label: "Orders",    icon: "credit",      description: "Every order taken, and what is still owed on each" },
  reservations: { label: "Reservations", icon: "calendar", description: "The host stand: today's book, arrivals, and who is still unseated" },
  payouts:   { label: "Payouts",   icon: "credit-card", description: "Stripe Connect payout onboarding and base reservation fee" },
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
  services:    { label: "Services" },
  reviews:     { label: "Reviews" },
  inbox:       { label: "Inbox" },         // legacy
  calendar:    { label: "Calendar" },
  activity:    { label: "Activity" },      // legacy — redirects to money
  reach:       { label: "Reach" },         // legacy — redirects to money
  agencies:    { label: "Agencies" },      // legacy — redirects to money
  money:       { label: "Money" },
  payouts:     { label: "Payouts" },       // in-shell section, reached from Settings
  "public-page": { label: "Public page" }, // canonical URL segment: /talent/site
  settings:    { label: "Settings" },
};

/**
 * EVERY valid TalentPage (superset of the nav-only `TALENT_PAGES`). Use this for
 * URL/state hydration so in-shell sections reached from Settings — e.g.
 * `payouts` — survive a hard refresh. `TALENT_PAGES` stays nav-only so those
 * sections do NOT show up as top-level tabs.
 */
export const TALENT_PAGES_ALL = Object.keys(TALENT_PAGE_META) as TalentPage[];





export function meetsPlan(current: Plan, required: Plan): boolean {
  return PLAN_META[current].rank >= PLAN_META[required].rank;
}

export function meetsRole(current: Role, required: Role): boolean {
  return ROLE_META[current].rank >= ROLE_META[required].rank;
}


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
  { label: string; tone: "ink" | "amber" | "green" | "dim" | "red" | "indigo"; description: string }
> = {
  draft: { label: "Draft", tone: "dim", description: "Started — not yet sent." },
  submitted: { label: "Submitted", tone: "amber", description: "Client request received. Needs a coordinator." },
  coordination: { label: "With coordinator", tone: "amber", description: "Coordinator working with client + selecting talent." },
  offer_pending: { label: "Offer pending", tone: "amber", description: "Offer sent — waiting on client + talent approvals." },
  approved: { label: "Approved", tone: "indigo", description: "All parties approved. Ready to book." },
  booked: { label: "Booked", tone: "green", description: "Converted to a booking. Inquiry is read-only." },
  rejected: { label: "Rejected", tone: "red", description: "Closed without converting." },
  expired: { label: "Expired", tone: "dim", description: "Lapsed past response window." },
};

/**
 * i18n catalog-key siblings for the inquiry-stage labels (additive,
 * non-breaking). The English `.label` on each INQUIRY_STAGE_META entry stays
 * the source of truth for the many non-localized consumers; a localized
 * consumer holding a `useT()` resolves `t(INQUIRY_STAGE_LABEL_KEYS[stage])`.
 * Keys live under `dashboard.enums.inquiryStage.*`.
 */
export const INQUIRY_STAGE_LABEL_KEYS: Record<InquiryStage, string> = {
  draft: "dashboard.enums.inquiryStage.draft",
  submitted: "dashboard.enums.inquiryStage.submitted",
  coordination: "dashboard.enums.inquiryStage.coordination",
  offer_pending: "dashboard.enums.inquiryStage.offer_pending",
  approved: "dashboard.enums.inquiryStage.approved",
  booked: "dashboard.enums.inquiryStage.booked",
  rejected: "dashboard.enums.inquiryStage.rejected",
  expired: "dashboard.enums.inquiryStage.expired",
};

export const REQUIREMENT_ROLE_META: Record<
  RequirementRole,
  { label: string; pluralLabel: string }
> = {
  talent: { label: "Talent", pluralLabel: "Talent" },
  host: { label: "Host", pluralLabel: "Hosts" },
  model: { label: "Model", pluralLabel: "Models" },
  promoter: { label: "Promoter", pluralLabel: "Promoters" },
};

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

// i18n sibling for describeSource (additive — the English version above stays
// for non-localized consumers, e.g. the inquiry-workspace drawer description).
// Localized consumers resolve `interpolate(t(shortKey), shortParams)` /
// `interpolate(t(longKey), longParams)` via their OWN translator. Manual
// (channel) sources also carry a channel-label key so the interpolated
// channel name is itself localized. Keys live under
// `dashboard.adminWork.source.*`.
const SOURCE_CHANNEL_LABEL_KEYS: Record<
  Extract<InquirySource, { kind: "manual" }>["channel"],
  string
> = {
  phone:       "dashboard.adminWork.source.channelPhone",
  email:       "dashboard.adminWork.source.channelEmail",
  whatsapp:    "dashboard.adminWork.source.channelWhatsApp",
  "in-person": "dashboard.adminWork.source.channelInPerson",
};
export function describeSourceChannelKey(s: Extract<InquirySource, { kind: "manual" }>): string {
  return SOURCE_CHANNEL_LABEL_KEYS[s.channel];
}
export function describeSourceKeys(s: InquirySource): {
  shortKey: string;
  shortParams?: Record<string, string | number>;
  longKey: string;
  longParams?: Record<string, string | number>;
} {
  const SRC = "dashboard.adminWork.source";
  if (s.kind === "direct") {
    return {
      shortKey: `${SRC}.shortVia`, shortParams: { via: s.domain },
      longKey: `${SRC}.longDirect`, longParams: { domain: s.domain },
    };
  }
  if (s.kind === "hub") {
    return {
      shortKey: `${SRC}.shortVia`, shortParams: { via: s.hubName },
      longKey: `${SRC}.longHub`, longParams: { hubName: s.hubName, domain: s.domain },
    };
  }
  if (s.kind === "marketplace") {
    return {
      shortKey: `${SRC}.shortVia`, shortParams: { via: s.platform },
      longKey: `${SRC}.longMarketplace`, longParams: { platform: s.platform },
    };
  }
  if (s.kind === "talent-page") {
    const host = s.customDomain ?? `tulala.digital/t/${s.talentSlug}`;
    return {
      shortKey: `${SRC}.shortPersonalPage`,
      longKey: `${SRC}.longTalentPage`, longParams: { host },
    };
  }
  return {
    shortKey: `${SRC}.shortAddedByChannel`,
    longKey: `${SRC}.longManualChannel`,
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

export const TEAM_AGENCY: TeamMember[] = [
  { id: "u1", name: "Oran Tene", email: "oran@acme-models.com", role: "owner", status: "active", initials: "OT" },
  { id: "u2", name: "Sara Bianchi", email: "sara@acme-models.com", role: "admin", status: "active", initials: "SB" },
  { id: "u3", name: "Daniel Ferrer", email: "daniel@acme-models.com", role: "manager", status: "active", initials: "DF" },
  { id: "u4", name: "Mira Soto", email: "mira@acme-models.com", role: "viewer", status: "active", initials: "MS" },
  { id: "u5", name: "Andrés Lopez", email: "andres@acme-models.com", role: "editor", status: "invited", initials: "AL" },
];

export const TEAM_FREE: TeamMember[] = [
  { id: "u1", name: "You", email: "you@acme-models.com", role: "owner", status: "active", initials: "OT" },
];

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

export const PLAN_LADDER_HEADER: Record<Plan, { price: string; idealFor: string }> = {
  free: { price: "$0", idealFor: "Your first roster, a single coordinator, listed on the public directory." },
  website: { price: "$12/mo", idealFor: "A local business that needs a real site on its own domain, with no talent roster." },
  studio: { price: "$29/mo", idealFor: "Private inbox, your own client list, room for a couple of teammates." },
  agency: { price: "$79/mo", idealFor: "Branded site, team workflows, and negotiation tools." },
  network: { price: "Custom", idealFor: "Multi-brand hubs, network distribution, and partner API access." },
};

export const PLAN_LADDER: PlanLadderRow[] = [
  {
    dimension: "Active roster",
    why: "How much talent your agency can list at once.",
    values: {
      free: `Up to ${seatCapLabel("free")} talent`,
      website: "No roster",
      studio: `Up to ${seatCapLabel("studio")} talent`,
      agency: seatCapLabel("agency", "Unlimited talent"),
      network: "Unlimited",
    },
  },
  {
    dimension: "Inquiry throughput",
    why: "Concurrent live inquiries before workflow hand-offs strain.",
    values: {
      free: "5 / month",
      website: "50 / month",
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
      website: "Your own domain, in English and Spanish",
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
      website: "2 seats",
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
      website: "Custom domain + your logo",
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
      website: "Private — your own inbox",
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
      website: "—",
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
      website: "6% per booking",
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
      website: "Single receiver · standard schedule",
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
      website: "Site visits · form submissions",
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
// The English `label`/`detail`/`unit` stay for any non-localized reader;
// the localized `FreeValuePanel` renders the `*Key` siblings via `t()` (keys
// under `dashboard.adminWork.freePlan.*`). `storefront.detailKey` is unused
// at render (the panel overrides that row's detail with the live subdomain)
// but kept for shape symmetry.
export const FREE_PLAN_VALUE: Array<{
  id: string;
  label: string;
  labelKey: string;
  detail: string;
  detailKey: string;
  used?: { current: number; cap: number; unit: string; unitKey: string };
}> = [
  {
    id: "roster",
    label: "Public roster",
    labelKey: "dashboard.adminWork.freePlan.rosterLabel",
    detail: "Searchable across the Tulala network.",
    detailKey: "dashboard.adminWork.freePlan.rosterDetail",
    used: { current: 3, cap: 5, unit: "talent", unitKey: "dashboard.adminWork.freePlan.unitTalent" },
  },
  {
    id: "inquiries",
    label: "Inbound inquiries",
    labelKey: "dashboard.adminWork.freePlan.inquiriesLabel",
    detail: "Clients message you through your storefront.",
    detailKey: "dashboard.adminWork.freePlan.inquiriesDetail",
    used: { current: 1, cap: 5, unit: "this month", unitKey: "dashboard.adminWork.freePlan.unitThisMonth" },
  },
  {
    id: "storefront",
    label: "Storefront page",
    labelKey: "dashboard.adminWork.freePlan.storefrontLabel",
    detail: "Lives at acme-models.tulala.app.",
    detailKey: "dashboard.adminWork.freePlan.storefrontDetail",
  },
  {
    id: "messaging",
    label: "Talent + client messaging",
    labelKey: "dashboard.adminWork.freePlan.messagingLabel",
    detail: "Two-thread conversations on every inquiry.",
    detailKey: "dashboard.adminWork.freePlan.messagingDetail",
  },
  {
    id: "discovery",
    label: "Listed in the public directory",
    labelKey: "dashboard.adminWork.freePlan.discoveryLabel",
    detail: "Brands looking for talent can find you.",
    detailKey: "dashboard.adminWork.freePlan.discoveryDetail",
  },
];

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

export const PAYOUT_RECEIVER_KIND_LABEL: Record<PayoutReceiverKind, string> = {
  "agency-owner": "Agency owner",
  "agency-admin": "Agency admin",
  coordinator: "Coordinator",
  talent: "Talent",
};

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
  website: {
    pct: 6,
    flat: "$0",
    label: "6% per booking",
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
  free: {
    label: "Free",
    tagline: "Be on Tulala",
    monthlyPrice: "Free",
    blurb: "Everything you need to be found and hired — a public profile, agency rosters, and a personal Tulala page.",
    accent: "ink",
  },
  pro: {
    label: "Pro",
    tagline: "Get seen, keep more",
    monthlyPrice: "$9 / mo",
    blurb: "Template choices, video + social embeds, press band, media kit, priority discovery — and a lower Tulala fee on direct bookings.",
    accent: "gold",
  },
  max: {
    label: "Portfolio",
    tagline: "Your own brand",
    monthlyPrice: "$15 / mo",
    blurb: "A multi-section page builder, custom domain, SEO controls, branded invoices, full analytics — and the lowest fee on direct bookings.",
    accent: "deep",
  },
};

/**
 * The single talent-tier catalog — the source of truth for the
 * Free / Pro / Portfolio split. Drives the compare-drawer matrix, the
 * per-feature gates (`tierAllows`), and per-plan lock states. Change
 * a feature's split here and every consumer follows.
 */
export const TALENT_TIER_CATALOG: TalentTierCatalogRow[] = [
  // ── Your Tulala page ──
  { group: "page", label: "Personal page at tulala.digital/t/<code>", free: true, pro: true, max: true },
  { group: "page", label: "Page templates", free: "Roster only", pro: "+ Editorial, Studio", max: "All 6 templates", feature: "template-picker", unlockedAt: "pro" },
  { group: "page", label: "Photo gallery", free: "Standard", pro: "Large", max: "Unlimited" },
  { group: "page", label: "Video + social embeds", free: false, pro: "Up to 6", max: "Unlimited", feature: "media-embeds", unlockedAt: "pro" },
  { group: "page", label: "Animated cover", free: false, pro: true, max: true, feature: "video-hero", unlockedAt: "pro" },
  { group: "page", label: "Press / clippings band", free: false, pro: true, max: true, feature: "press-band", unlockedAt: "pro" },
  { group: "page", label: "Soften / hide agency branding", free: false, pro: true, max: true },
  { group: "page", label: "Multi-section page builder", free: false, pro: false, max: true, feature: "extra-sections", unlockedAt: "max" },
  { group: "page", label: "Custom domain (yourname.com)", free: false, pro: false, max: true, feature: "custom-domain", unlockedAt: "max" },
  { group: "page", label: "SEO controls + meta", free: false, pro: false, max: true, feature: "seo-controls", unlockedAt: "max" },
  // ── Getting found ──
  { group: "discovery", label: "Listed in Tulala Discover", free: "Standard", pro: "Priority", max: "Top + featured", feature: "priority-discovery", unlockedAt: "pro" },
  { group: "discovery", label: "Plan badge on cards & inquiries", free: false, pro: "Pro badge", max: "Portfolio badge" },
  // ── Bookings & money ──
  { group: "money", label: "Inquiry inbox + bookings", free: true, pro: true, max: true },
  { group: "money", label: "Tulala fee on direct bookings", free: "Standard", pro: "Reduced", max: "Lowest" },
  { group: "money", label: "Deposit requests", free: false, pro: true, max: true },
  { group: "money", label: "Branded invoices / quotes", free: false, pro: false, max: true },
  { group: "money", label: "Page analytics", free: false, pro: "Basic", max: "Full" },
  // ── Pro tools ──
  { group: "tools", label: "Auto media kit (EPK PDF)", free: false, pro: true, max: "Branded", feature: "media-kit", unlockedAt: "pro" },
  { group: "tools", label: "Priority support", free: false, pro: false, max: true },
];

/** Section headers for the tier matrix, in render order. */
export const TALENT_TIER_GROUP_LABELS: Record<TalentTierGroup, string> = {
  page: "Your Tulala page",
  discovery: "Getting found",
  money: "Bookings & money",
  tools: "Pro tools",
};

const TALENT_TIER_RANK: Record<TalentSubscriptionTier, number> = { free: 0, pro: 1, max: 2 };

/** Returns true if the talent's current tier unlocks the given feature. */
export function tierAllows(current: TalentSubscriptionTier, feature: TalentTierFeature): boolean {
  const row = TALENT_TIER_CATALOG.find((r) => r.feature === feature);
  if (!row || !row.unlockedAt) return false;
  return TALENT_TIER_RANK[current] >= TALENT_TIER_RANK[row.unlockedAt];
}

export const TALENT_PAGE_TEMPLATES: TalentPageTemplate[] = [
  { id: "roster", label: "Roster", blurb: "Classic comp-card layout — what agencies use.", thumb: "🎴", availableAt: "free" },
  { id: "editorial", label: "Editorial", blurb: "Magazine spread feel — large hero, generous white space.", thumb: "📰", availableAt: "pro" },
  { id: "studio", label: "Studio", blurb: "Tight grid, big imagery — for fashion + lifestyle.", thumb: "🖼️", availableAt: "pro" },
  { id: "stage", label: "Stage", blurb: "Video-first hero with show / tour / gig dates.", thumb: "🎤", availableAt: "max" },
  { id: "creator", label: "Creator", blurb: "Social-first — TikTok / IG / YouTube embeds drive the page.", thumb: "📱", availableAt: "max" },
  { id: "epk", label: "EPK", blurb: "Press-kit feel — bio, credits, downloads, contact CTA.", thumb: "📄", availableAt: "max" },
];

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
    // her embeds + a press band. Max would unlock a custom
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

export const MY_AGENCIES: TalentAgency[] = [
  { id: "ag1", name: "Atelier Roma", slug: "acme-models", joinedAt: "Mar 2024", isPrimary: true, status: "exclusive", bookingsYTD: 6, planTier: "agency", commissionRate: 0.18 },
  { id: "ag2", name: "Praline London", slug: "praline-london", joinedAt: "Jan 2025", isPrimary: false, status: "non-exclusive", bookingsYTD: 2, planTier: "studio", commissionRate: 0.12 },
  // Friend-on-free case — demonstrates the "free plan, no exclusivity, no
  // commission" tier per the agency-exclusivity spec.
  { id: "ag3", name: "Estudio Solé (friend)", slug: "estudio-sole", joinedAt: "Apr 2026", isPrimary: false, status: "active", bookingsYTD: 0, planTier: "free", commissionRate: 0 },
];

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

export const TALENT_BOOKINGS: TalentBooking[] = [
  { id: "bk1", inquiryId: "RI-201", agency: "Atelier Roma",    client: "Mango",        brief: "Lookbook · spring capsule",     startDate: "Tue, May 6",         location: "Madrid · ESTUDIO ROCA",    amount: "€1,800", status: "confirmed", call: "08:30" },
  { id: "bk2", inquiryId: "RI-202", agency: "Atelier Roma",    client: "Vogue Italia", brief: "Editorial spread",              startDate: "May 14", endDate: "May 15", location: "Milan · Studio 5",    amount: "€3,200", status: "confirmed", call: "07:00" },
  { id: "bk3",                      agency: "Praline London", client: "Burberry",     brief: "Lookbook",                      startDate: "Apr 18",              location: "London · Hackney",          amount: "£2,400", status: "wrapped",   call: "—"    },
  { id: "bk4",                      agency: "Atelier Roma",    client: "Zara",         brief: "Capsule lookbook",              startDate: "Mar 28",              location: "Madrid",                    amount: "€2,000", status: "paid",      call: "—"    },
  // Cancellation examples — surface in the "Cancelled" calendar filter.
  { id: "bk5",                      agency: "Atelier Roma",    client: "Hugo Boss",    brief: "AW campaign",                   startDate: "May 9",               location: "Berlin · Studio Mitte",     amount: "€2,400", status: "cancelled", call: "08:00", cancelledBy: "client", cancelReason: "Client postponed campaign · no kill fee due",   cancelTiming: "3d before shoot"   },
  { id: "bk6",                      agency: "Praline London", client: "Selfridges",   brief: "Editorial · summer spread",     startDate: "Apr 22",              location: "London · Studio 2C",        amount: "£1,800", status: "cancelled", call: "—",    cancelledBy: "talent", cancelReason: "Travel conflict · settled with hold-day fee",    cancelTiming: "day before shoot"  },
];

export const AVAILABILITY_BLOCKS: AvailabilityBlock[] = [
  { id: "av1", startDate: "Apr 28", endDate: "May 2", reason: "Travel · Lisbon trip", type: "travel" },
  { id: "av2", startDate: "May 22", endDate: "May 26", reason: "Personal", type: "personal" },
];

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
// callers should prefer `useAdminShell().activeClientProfile` over this.
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
  services:       "hour",
};
export const LOCALE_LABEL: Record<LocaleCode, string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  pt: "Portuguese",
  de: "German",
};

export function computeTrustTier(v: Verifications): TrustTier {
  if (v.idSubmitted && v.payoutConnected && v.bookingsCount >= 5 && v.hasFundedClient) return "gold";
  if (v.idSubmitted && v.payoutConnected && v.bookingsCount >= 1) return "silver";
  if (v.idSubmitted && v.payoutConnected) return "verified";
  return "basic";
}

export const PRONOUNS_OPTIONS: { id: Pronouns; label: string }[] = [
  { id: "she/her",   label: "she / her" },
  { id: "he/him",    label: "he / him" },
  { id: "they/them", label: "they / them" },
  { id: "ze/zir",    label: "ze / zir" },
  { id: "custom",    label: "custom" },
];

// Canonical, inclusive gender option-set (Tier-C-tail, 2026-06-10). id == label
// == the stored talent_profiles.gender value (no slug↔label map — the bespoke
// identity editor persists the picker id verbatim). Kept in lockstep with the
// profile_field_definitions `identity.gender`.options JSON array + the directory
// facet field_definitions(gender).config.filter_options.
export const GENDER_OPTIONS: { id: GenderOption; label: string }[] = [
  { id: "Woman",                   label: "Woman" },
  { id: "Man",                     label: "Man" },
  { id: "Non-binary",              label: "Non-binary" },
  { id: "Trans woman",             label: "Trans woman" },
  { id: "Trans man",               label: "Trans man" },
  { id: "Transgender",             label: "Transgender" },
  { id: "Genderfluid",             label: "Genderfluid" },
  { id: "Genderqueer",             label: "Genderqueer" },
  { id: "Agender",                 label: "Agender" },
  { id: "Bigender",                label: "Bigender" },
  { id: "Two-Spirit",              label: "Two-Spirit" },
  { id: "Intersex",                label: "Intersex" },
  { id: "Prefer to self-describe", label: "Prefer to self-describe" },
  { id: "Prefer not to say",       label: "Prefer not to say" },
];

/** Prefixes shown in IdentityEditor — longest match wins when parsing DB `phone`. */
export const SHELL_CONTACT_PHONE_PREFIXES = [
  "+86", "+44", "+34", "+52", "+55", "+33", "+49", "+39", "+91", "+7", "+1",
] as const;

export function splitShellContactPhone(stored: string | null | undefined): {
  contactPhonePrefix: string;
  contactPhone: string;
} {
  const s = (stored ?? "").trim();
  if (!s) return { contactPhonePrefix: "+1", contactPhone: "" };
  const ordered = [...SHELL_CONTACT_PHONE_PREFIXES].sort((a, b) => b.length - a.length);
  for (const p of ordered) {
    if (s.startsWith(p)) {
      return { contactPhonePrefix: p, contactPhone: s.slice(p.length).trim() };
    }
  }
  return { contactPhonePrefix: "+1", contactPhone: s };
}

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

export const PROFICIENCY_META: Record<SkillProficiency, { label: string; helper: string; bg: string; fg: string }> = {
  great:    { label: "I'm great at",      helper: "Stand-out strengths.",         bg: "rgba(15,79,62,0.10)", fg: "#0F4F3E" },
  can_do:   { label: "I can do",          helper: "Solid + reliable.",            bg: "rgba(91,107,160,0.10)", fg: "#3B4A75" },
  learning: { label: "I'm learning",      helper: "Open to gigs that train me.",  bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
};
export const BIO_TONES: { id: BioTone; label: string; emoji: string }[] = [
  { id: "editorial",    label: "Editorial",    emoji: "✦" },
  { id: "friendly",     label: "Friendly",     emoji: "🌿" },
  { id: "professional", label: "Professional", emoji: "🎯" },
  { id: "quirky",       label: "Quirky",       emoji: "✨" },
];
export const PHOTO_TAG_META: Record<PhotoTag, { label: string; emoji: string }> = {
  headshot:  { label: "Headshot",   emoji: "😊" },
  full_body: { label: "Full body",  emoji: "🧍" },
  in_motion: { label: "In motion",  emoji: "💫" },
  portfolio: { label: "Portfolio",  emoji: "✦" },
  bts:       { label: "BTS",        emoji: "🎬" },
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

export const TALENT_INVITES: TalentInvite[] = [
  { id: "inv-1", talentName: "Amelia Dorsey",     email: "amelia@example.com",  sentAt: "2026-04-25T10:00Z",                                              status: "claimed", openedAt: "2026-04-25T11:32Z", claimedAt: "2026-04-26T08:11Z", remindersSent: 0 },
  { id: "inv-2", talentName: "Sven Olafsson",      email: "sven@example.com",    sentAt: "2026-04-22T14:00Z", openedAt: "2026-04-22T18:00Z",               status: "opened",  remindersSent: 1 },
  { id: "inv-3", talentName: "Kai Lin",            email: "kai@example.com",     sentAt: "2026-04-19T09:30Z",                                              status: "sent",    remindersSent: 0 },
  { id: "inv-4", talentName: "Tomás Navarro",      email: "tomas@example.com",   sentAt: "2026-04-10T16:00Z", openedAt: "2026-04-10T17:00Z",               status: "opened",  remindersSent: 2 },
  { id: "inv-5", talentName: "Lina Park",          email: "lina@example.com",    sentAt: "2026-03-12T08:00Z",                                              status: "expired", remindersSent: 3 },
];

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
  {
    id: "services", label: "Services", emoji: "🔧", minPlan: "free",
    helper: "Cleaning, hospitality staff, transport, security, catering, retail, technical support.",
    children: [
      { id: "cleaning_staff",   label: "Cleaning & Laundry",  specialties: ["Standard clean", "Deep clean", "Industrial", "Laundry & ironing", "Turndown service"] },
      { id: "hotel_staff",      label: "Hospitality staff",   specialties: ["Front desk", "Housekeeping", "Butler", "Concierge", "Villa staff"] },
      { id: "svc_transport",    label: "Transport staff",     specialties: ["Airport transfer", "Shuttle", "Delivery", "Long-distance"] },
      { id: "svc_security",     label: "Security staff",      specialties: ["Event security", "Door staff", "Close protection"] },
      { id: "svc_catering",     label: "Catering staff",      specialties: ["Events", "Corporate", "Wedding", "Private dining"] },
      { id: "svc_retail",       label: "Retail staff",        specialties: ["Sales", "Cashier", "Visual merchandising", "Stock management"] },
      { id: "svc_technical",    label: "Technical & AV",      specialties: ["AV / sound", "Lighting", "IT support", "Stage rigging"] },
    ],
  },
];

/**
 * i18n catalog-key siblings for the TAXONOMY *parent* labels (additive,
 * non-breaking). The English `.label` on each TAXONOMY entry stays the source of
 * truth for the many non-localized consumers across the admin shell; a localized
 * consumer that holds a `useT()` (e.g. the talent MyProfile header) resolves
 * `t(TAXONOMY_PARENT_LABEL_KEYS[id])` and falls back to the English label when a
 * key is absent. Keys live under `dashboard.enums.talentRole.*`. Only the 13
 * parent ids are mapped (the only taxonomy labels rendered on localized
 * surfaces); child role labels remain a noted follow-up.
 */
export const TAXONOMY_PARENT_LABEL_KEYS: Record<TaxonomyParentId, string> = {
  models: "dashboard.enums.talentRole.models",
  hosts: "dashboard.enums.talentRole.hosts",
  performers: "dashboard.enums.talentRole.performers",
  music: "dashboard.enums.talentRole.music",
  creators: "dashboard.enums.talentRole.creators",
  chefs: "dashboard.enums.talentRole.chefs",
  wellness: "dashboard.enums.talentRole.wellness",
  hospitality: "dashboard.enums.talentRole.hospitality",
  transportation: "dashboard.enums.talentRole.transportation",
  photo_video: "dashboard.enums.talentRole.photo_video",
  event_staff: "dashboard.enums.talentRole.event_staff",
  security: "dashboard.enums.talentRole.security",
  services: "dashboard.enums.talentRole.services",
};

export const PLAN_TAXONOMY_LIMITS: Record<"free" | "studio" | "agency" | "network", number> = {
  free: 3,
  studio: 8,
  agency: 999,    // all
  network: 999,   // all + multi-hub vocabularies
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
  services: [
    { id: "service_types", label: "Services provided", kind: "multiselect", options: ["Housekeeping", "Laundry & ironing", "Deep clean", "Industrial clean", "Turndown service", "Concierge support", "Front desk", "Butler service", "Transport", "Security", "Catering", "AV / Technical", "Retail"] },
    { id: "experience_yrs", label: "Years experience", kind: "number", optional: true, placeholder: "3" },
    { id: "equipment_own",  label: "Brings own equipment", kind: "select", optional: true, options: ["Yes", "No", "Partial"] },
    { id: "availability",   label: "Availability schedule", kind: "select", optional: true, options: ["Full-time", "Part-time", "On-call", "Seasonal", "Flexible"] },
    { id: "certifications", label: "Certifications", kind: "chips", optional: true, placeholder: "Add cert…" },
    { id: "languages_fluent", label: "Languages spoken", kind: "chips", optional: true, placeholder: "Add a language…" },
    { id: "uniform",        label: "Uniform", kind: "select", optional: true, options: ["Formal / black tie", "Smart casual", "Company uniform", "Casual", "None"] },
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
  // Services: free-tier accessible so workspaces like Hotels Express Lavanderia
  // can onboard cleaning, hospitality, and transport staff without needing Agency plan.
  { parentId: "services",       isEnabled: true,  showInDirectory: true, showInRegistration: true,  requiresApproval: false },
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

export const AGENCY_RELIABILITY: AgencyReliability[] = [
  { agencyName: "Atelier Roma", bookingsCompleted: 12, onTimeRate: 100, cancellations: 0, repeatBookings: 9 },
  { agencyName: "Praline London", bookingsCompleted: 3, onTimeRate: 100, cancellations: 0, repeatBookings: 1 },
  { agencyName: "Maison Sud", bookingsCompleted: 1, onTimeRate: 100, cancellations: 0, repeatBookings: 0 },
];

export const PLATFORM_TENANTS: PlatformTenant[] = [
  { id: "tn1", name: "Atelier Roma", slug: "acme-models", plan: "agency", entityType: "agency", seats: 8, talentCount: 47, mrr: "$79", health: "healthy", signupAt: "Jan 2025", lastActivity: "2m ago" },
  { id: "tn2", name: "Praline London", slug: "praline-london", plan: "agency", entityType: "agency", seats: 12, talentCount: 84, mrr: "$79", health: "healthy", signupAt: "Sep 2024", lastActivity: "12m ago" },
  { id: "tn3", name: "Maison Sud", slug: "maison-sud", plan: "studio", entityType: "agency", seats: 3, talentCount: 18, mrr: "$79", health: "healthy", signupAt: "Mar 2026", lastActivity: "1h ago" },
  { id: "tn4", name: "Nord Talent", slug: "nord-talent", plan: "studio", entityType: "agency", seats: 5, talentCount: 22, mrr: "$79", health: "at-risk", signupAt: "Nov 2025", lastActivity: "11d ago" },
  { id: "tn5", name: "Bottega Roma", slug: "bottega-roma", plan: "free", entityType: "agency", seats: 1, talentCount: 4, mrr: "$0", health: "at-risk", signupAt: "Apr 2026", lastActivity: "2d ago" },
  { id: "tn6", name: "Coast & Co", slug: "coast-co", plan: "free", entityType: "hub", seats: 1, talentCount: 1, mrr: "$0", health: "churning", signupAt: "Feb 2026", lastActivity: "21d ago" },
  { id: "tn7", name: "Tokyo Faces", slug: "tokyo-faces", plan: "network", entityType: "hub", seats: 22, talentCount: 312, mrr: "$899", health: "healthy", signupAt: "Aug 2024", lastActivity: "4m ago" },
];

export const PLATFORM_USERS: PlatformUser[] = [
  { id: "pu1", name: "Oran Tene", email: "oran@acme-models.com", primaryTenant: "Atelier Roma", tenants: 1, isTalent: false, signupAt: "Jan 2025", lastSeen: "now" },
  { id: "pu2", name: "Marta Reyes", email: "marta@reyes.studio", primaryTenant: "Atelier Roma", tenants: 2, isTalent: true, signupAt: "Mar 2024", lastSeen: "1h ago" },
  { id: "pu3", name: "Sara Bianchi", email: "sara@vogueitalia.com", primaryTenant: "(client) Vogue Italia", tenants: 1, isTalent: false, signupAt: "Feb 2026", lastSeen: "12m ago" },
  { id: "pu4", name: "Kai Lin", email: "kai@lin.studio", primaryTenant: "Atelier Roma", tenants: 1, isTalent: true, signupAt: "Jun 2024", lastSeen: "3h ago" },
  { id: "pu5", name: "Helena Ross", email: "helena@netaporter.com", primaryTenant: "(client) Net-a-Porter", tenants: 1, isTalent: false, signupAt: "Apr 2026", lastSeen: "2d ago" },
];

export const HUB_SUBMISSIONS: HubSubmission[] = [
  { id: "hs1", talentName: "Marta Reyes", agency: "Atelier Roma", submittedAt: "2h ago", status: "pending" },
  { id: "hs2", talentName: "Yuna Park", agency: "Praline London", submittedAt: "5h ago", status: "pending" },
  { id: "hs3", talentName: "Léa Mercier", agency: "Maison Sud", submittedAt: "1d ago", status: "featured" },
  { id: "hs4", talentName: "Ola Brandt", agency: "Nord Talent", submittedAt: "2d ago", status: "pending" },
  { id: "hs5", talentName: "Rafa Ortega", agency: "Atelier Roma", submittedAt: "3d ago", status: "declined", reason: "Profile under-developed" },
];

export const PLATFORM_INVOICES: PlatformInvoice[] = [
  { id: "inv1", tenant: "Atelier Roma", amount: "$79", date: "Apr 12, 2026", plan: "agency", status: "paid" },
  { id: "inv2", tenant: "Praline London", amount: "$79", date: "Apr 9, 2026", plan: "agency", status: "paid" },
  { id: "inv3", tenant: "Tokyo Faces", amount: "$899", date: "Apr 8, 2026", plan: "network", status: "paid" },
  { id: "inv4", tenant: "Maison Sud", amount: "$79", date: "Apr 4, 2026", plan: "studio", status: "paid" },
  { id: "inv5", tenant: "Nord Talent", amount: "$79", date: "Apr 2, 2026", plan: "studio", status: "failed" },
  { id: "inv6", tenant: "Coast & Co", amount: "$79", date: "Mar 28, 2026", plan: "studio", status: "refunded" },
];

export const FEATURE_FLAGS: FeatureFlag[] = [
  { id: "ff1", name: "ai_inquiry_drafts", state: "on", owner: "Ops", description: "AI-assisted inquiry response drafts" },
  { id: "ff2", name: "hub_publishing_v2", state: "rollout", rollout: "30% · network", owner: "Product", description: "New hub-publishing UI with featured rotation" },
  { id: "ff3", name: "client_workspace_seats", state: "rollout", rollout: "12% · enterprise", owner: "Product", description: "Multi-seat client workspace" },
  { id: "ff4", name: "talent_self_serve_portfolio", state: "off", owner: "Trust", description: "Let talent edit portfolio without agency review" },
  { id: "ff5", name: "instant_book", state: "off", owner: "Product", description: "One-click booking for verified clients" },
];

export const MODERATION_QUEUE: ModerationItem[] = [
  { id: "m1", kind: "media-upload", subject: "Sven Olafsson · 4 portfolio shots", reportedAt: "1h ago", reason: "Auto-flag · low resolution", severity: "low" },
  { id: "m2", kind: "talent-profile", subject: "Coast & Co · Anna T", reportedAt: "3h ago", reason: "Possible underage profile", severity: "high" },
  { id: "m3", kind: "report", subject: "Bottega Roma → Iris V", reportedAt: "1d ago", reason: "Talent reports unwanted contact", severity: "high" },
  { id: "m4", kind: "client-profile", subject: "Generic Co", reportedAt: "2d ago", reason: "Suspected impersonation", severity: "med" },
];

export const SYSTEM_JOBS: SystemJob[] = [
  { id: "j1", name: "embed-talents · vector index refresh", state: "succeeded", duration: "4m 12s", lastRun: "8m ago" },
  { id: "j2", name: "send-weekly-digest", state: "running", duration: "2m 04s", lastRun: "started 2m ago" },
  { id: "j3", name: "process-stripe-webhooks", state: "queued", duration: "—", lastRun: "—" },
  { id: "j4", name: "expire-stale-holds", state: "failed", duration: "0m 18s", lastRun: "1h ago" },
];

export const PLATFORM_INCIDENTS: PlatformIncident[] = [
  { id: "in1", title: "Slow image uploads (eu-west)", severity: "p3", state: "monitoring", startedAt: "37m ago" },
  { id: "in2", title: "Stripe webhook latency", severity: "p2", state: "open", startedAt: "1h ago" },
];

export const SUPPORT_TICKETS: SupportTicket[] = [
  { id: "tk1", tenant: "Coast & Co", subject: "Can't connect custom domain", reportedBy: "anna@coast-co.com", ageHrs: 3, state: "new" },
  { id: "tk2", tenant: "Maison Sud", subject: "Lost access to admin", reportedBy: "founder@maison.sud", ageHrs: 6, state: "open" },
  { id: "tk3", tenant: "Nord Talent", subject: "Refund request — March", reportedBy: "ole@nord.dk", ageHrs: 24, state: "waiting" },
];

export const PLATFORM_HQ_TEAM: TeamMember[] = [
  { id: "hq1", name: "Oran Tene", email: "oran@tulala.digital", role: "owner", status: "active", initials: "OT" },
  { id: "hq2", name: "Eli Park", email: "eli@tulala.digital", role: "admin", status: "active", initials: "EP" },
  { id: "hq3", name: "Sam Liu", email: "sam@tulala.digital", role: "admin", status: "active", initials: "SL" },
  { id: "hq4", name: "Nora Diaz", email: "nora@tulala.digital", role: "manager", status: "active", initials: "ND" },
];

/** Default visibility per built-in field. Defines the "shipped" privacy
 *  posture — agencies on Studio+ can override these. */
export const DEFAULT_FIELD_VISIBILITY: Record<ProfileFieldId, FieldVisibility> = {
  // Identity — name + tagline are public; legal/dob/pronouns are internal by default
  stageName:     "public",
  firstName:     "internal",
  lastName:      "internal",
  legalName:     "internal",
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
  firstName:     { label: "First name",                 section: "Identity", description: "Legal given name. Admin-only." },
  lastName:      { label: "Last name",                  section: "Identity", description: "Legal family name. Admin-only." },
  legalName:     { label: "Legal name",                 section: "Identity", description: "For contracts. Never public." },
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

// Default admin accent — deep forest. Used as the literal fallback inside the
// `--tulala-accent` custom property, and as the raw hex seed anywhere a real
// hex value is required (e.g. an <input type="color">, which can't take a var()).
export const ACCENT_FALLBACK = "#0F4F3E";
export const ACCENT_DEEP_FALLBACK = "#093328";

/**
 * Accent tint at a given alpha, whitelabel-aware.
 *
 * Sites that used to write `COLORS.accent + "44"` (append an 8-bit alpha hex)
 * can't do that once `COLORS.accent` is a `var()` — string concatenation would
 * produce `var(--tulala-accent, #0F4F3E)44`, which is invalid CSS. This returns
 * a `color-mix()` at the equivalent opacity so the tint still tracks the
 * tenant's accent. Pass the same 2-digit alpha hex the old code appended.
 */
export function accentAlpha(alphaHex: string): string {
  const pct = Math.round((parseInt(alphaHex, 16) / 255) * 100);
  return `color-mix(in srgb, var(--tulala-accent, ${ACCENT_FALLBACK}) ${pct}%, transparent)`;
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
  //
  // Whitelabel: these resolve through `--tulala-accent`, a custom property the
  // shell root sets only for whitelabel-tier tenants (see admin-shell-client
  // + _layout-identity.ts). Everywhere else the forest-green fallback wins, so
  // the default chrome is unchanged. Sites that append an alpha hex to the
  // accent must use `accentAlpha()` below — a `var()` can't be string-concatenated.
  accent: `var(--tulala-accent, ${ACCENT_FALLBACK})`,
  accentDeep: `var(--tulala-accent-deep, ${ACCENT_DEEP_FALLBACK})`,
  accentSoft: `color-mix(in srgb, var(--tulala-accent, ${ACCENT_FALLBACK}) 10%, transparent)`,

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

/**
 * Emit a typed telemetry event. Real analytics SDK plugs in here later.
 * Until then, dev gets console.debug; prod no-ops silently.
 */
export function track(event: TrackEvent, props: TrackProps = {}): void {
  if (typeof window === "undefined") return;
  if (process.env.NODE_ENV !== "production") {
    void 0;
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

/**
 * Build a fresh MyTalentProfile shape from real bridge data — used for
 * talents who exist in the DB but aren't in the prototype's mock index.
 * Without this helper, `getProfileById(<real uuid>)` returns Marta's
 * fixture data, so a freshly-provisioned talent sees Marta's bio +
 * credits + measurements on their dashboard. This factory returns the
 * Marta scaffold (so every required nested field is type-safe) with all
 * narrative content emptied AND the talent's real name / city / photo
 * patched in.
 */
export function buildFreshTalentProfile(bridge: {
  displayName: string;
  primaryTypeLabel: string | null;
  homeCity: string | null;
  headshotUrl: string | null;
  /** The talent's REAL subscription tier from the bridge. Without it the
   *  built profile stamped tier "free", so the profile hero's TierPill
   *  contradicted the nav's plan badge (which reads the bridge tier). */
  talentTier?: MyTalentProfile["subscription"]["tier"];
},
  /** ANALYTICS — the talent's REAL page analytics from the layout bridge, when
   *  their tier includes them. The three engagement fields below were hardcoded
   *  `0` before this, so a Pro talent with traffic saw a measured-looking zero.
   *  Absent (Free tier / workspace-only entry) they stay 0 and EngagementStrip
   *  shows the upsell instead of presenting that zero as a measurement. */
  pageAnalytics?: import("@/lib/analytics/talent-analytics-group").TalentPageAnalyticsData | null,
): MyTalentProfile {
  const initials =
    bridge.displayName
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "?";
  return {
    // We deliberately do NOT spread MY_TALENT_PROFILE here — every field
    // not provided by the bridge must be empty so completeness math
    // reflects an actual fresh-talent state instead of leaking Marta's
    // measurements / rate card / travel docs through the cracks.
    name: bridge.displayName,
    legalName: bridge.displayName,
    initials,
    pronouns: "any",
    age: 0,
    city: bridge.homeCity || "",
    currentLocation: bridge.homeCity || "",
    availableForWork: false,
    availableToTravel: false,
    coverPhoto: "",
    profilePhoto: bridge.headshotUrl || "",
    showreelThumb: undefined,
    showreelDuration: undefined,
    measurements: {
      heightImperial: "",
      heightMetric: "",
      weight: "",
      bust: "",
      waist: "",
      hips: "",
      inseam: "",
      shoeEU: "",
      shoeUS: "",
      shoeUK: "",
      dress: "",
      suit: "",
      hairColor: "",
      hairLength: "medium",
      eyeColor: "",
      skinTone: "",
      hasTattoos: false,
      tattoosNote: "",
      hasPiercings: false,
      piercingsNote: "",
      scarsNote: "",
    },
    measurementsSummary: "",
    specialties: [],
    languages: [],
    skills: [],
    limits: [],
    credits: [],
    reviews: [],
    bookingStats: {
      completedBookings: 0,
      onTimeRate: 0,
      repeatClients: 0,
      yearsActive: 0,
    },
    badges: [],
    documents: [],
    rateCard: {
      visibility: "agency-only",
      lines: [],
      usagePolicy: "",
    },
    travel: {
      basedIn: bridge.homeCity || "",
      willingTravel: "city",
      homeRadius: "",
      passports: [],
      workAuth: [],
      lastTrip: "",
      preferredClass: "economy",
    },
    links: [],
    emergencyContact: {
      name: "",
      relation: "",
      phone: "",
    },
    primaryAgency: "",
    representation: { kind: "freelance" },
    contactPolicy: { ...DEFAULT_CONTACT_POLICY },
    publishedAt: "",
    // Real when the bridge carried analytics; 0 only when there is none to read.
    profileViews7d: pageAnalytics?.last7d.views ?? 0,
    inquiries7d: pageAnalytics?.last7d.inquiries ?? 0,
    // NOT SOURCED — no Discover-rank computation exists; strip shows "Not yet ranked".
    discoverRank: 0,
    // 0 against a zero baseline; the strip reads viewsTrendPct === null and hides the arrow.
    viewsTrend: pageAnalytics?.viewsTrendPct ?? 0,
    completeness: 0,
    missing: [],
    publicUrl: "",
    primaryType: "models" as TaxonomyParentId,
    secondaryTypes: [],
    portfolioVideos: [],
    showreelUrl: undefined,
    subscription: {
      tier: bridge.talentTier ?? "free",
      template: "roster",
      personalPageEnabled: false,
      customDomain: undefined,
      customDomainStatus: "not-set",
      personalPageUrl: "",
      embeds: [],
      press: [],
      mediaKit: undefined,
      renewsOn: "",
      inTrial: false,
    },
  };
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

const _now = Date.UTC(2026, 4, 7, 12, 0, 0);
const _daysAgo = (n: number) => new Date(_now - n * 86400e3).toISOString();
const _daysAhead = (n: number) => new Date(_now + n * 86400e3).toISOString();

export const WEBSITE_STATE: WebsiteState = {
  pages: [
    { id: "p1", title: "Home",                  slug: "/",            status: "published", updatedAt: _daysAgo(2),  lastEditedBy: "Joana Rivera", template: "home",    hits7d: 1842, hits30d: 6320, locale: "en", version: 9,  noindex: false, includeInSitemap: true,  hasMetaDescription: true,  publishedAt: _daysAgo(120), isHomepage: true },
    { id: "p2", title: "Roster",                slug: "/roster",      status: "published", updatedAt: _daysAgo(5),  lastEditedBy: "Joana Rivera", template: "roster",  hits7d: 1216, hits30d: 4180, locale: "en", version: 5,  noindex: false, includeInSitemap: true,  hasMetaDescription: true,  publishedAt: _daysAgo(90),  isHomepage: false },
    { id: "p3", title: "About us",              slug: "/about",       status: "published", updatedAt: _daysAgo(30), lastEditedBy: "Marco Conti",  template: "about",   hits7d: 412,  hits30d: 1410, locale: "en", version: 3,  noindex: false, includeInSitemap: true,  hasMetaDescription: true,  publishedAt: _daysAgo(200), isHomepage: false },
    { id: "p4", title: "Contact",               slug: "/contact",     status: "published", updatedAt: _daysAgo(60), lastEditedBy: "Joana Rivera", template: "contact", hits7d: 287,  hits30d: 980,  locale: "en", version: 4,  noindex: false, includeInSitemap: true,  hasMetaDescription: false, publishedAt: _daysAgo(200), isHomepage: false },
    { id: "p5", title: "Press kit",             slug: "/press",       status: "draft",     updatedAt: _daysAgo(1),  lastEditedBy: "Marco Conti",  template: "press",   hits7d: 0,    hits30d: 0,    locale: "en", version: 1,  noindex: false, includeInSitemap: true,  hasMetaDescription: false, isHomepage: false },
    { id: "p6", title: "SS27 capsule launch",   slug: "/launch/ss27", status: "scheduled", scheduledFor: _daysAhead(14), updatedAt: _daysAgo(0.2), lastEditedBy: "Joana Rivera", template: "blank", hits7d: 0, hits30d: 0, locale: "en", version: 1, noindex: false, includeInSitemap: true, hasMetaDescription: true, isHomepage: false },
  ],
  posts: [
    { id: "po1", title: "Spring 2026 — what's moving",   slug: "/spring-2026-moving",  status: "published", publishedAt: _daysAgo(3),  updatedAt: _daysAgo(3),  locale: "en", hasExcerpt: true,  lastEditedBy: "Joana Rivera" },
    { id: "po2", title: "BTS · Vogue Italia editorial",  slug: "/bts-vogue-italia",    status: "published", publishedAt: _daysAgo(7),  updatedAt: _daysAgo(7),  locale: "en", hasExcerpt: true,  lastEditedBy: "Marco Conti" },
    { id: "po3", title: "Welcoming Tomás Navarro",       slug: "/welcoming-tomas",     status: "published", publishedAt: _daysAgo(14), updatedAt: _daysAgo(14), locale: "en", hasExcerpt: false, lastEditedBy: "Joana Rivera" },
    { id: "po4", title: "Rate cards explained",          slug: "/rate-cards-explained", status: "published", publishedAt: _daysAgo(30), updatedAt: _daysAgo(30), locale: "en", hasExcerpt: true, lastEditedBy: "Marco Conti" },
    { id: "po5", title: "Press kit refresh",             slug: "/press-kit-refresh",   status: "draft",     updatedAt: _daysAgo(2),  locale: "en", hasExcerpt: false, lastEditedBy: "Joana Rivera" },
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
  // Standalone prototype mode only. `records` stays EMPTY on purpose: the
  // domain manager renders real `agency_domains` rows or its empty state,
  // never an invented DNS table (the old fixture's fake "2/2 matched" rows
  // and made-up SSL renewal date showed the same lie to every tenant).
  domain: {
    primaryDomain: "acme-models.tulala.digital",
    status: "verified",
    sslStatus: "active",
    records: [],
    canUseCustomDomain: false,
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
    // W2 — per-page rows carry ONLY what the data can support: real visits,
    // the grouping slug, and contributing surfaces. The always-zero per-page
    // inquiries/bookings columns and the never-populated byTalent arrays that
    // used to live here are gone (see WebsitePageMetrics in types.ts).
    byPage7d: [
      { pageId: "p2", pageSlug: "/roster",  surfaces: ["storefront"], visits: 1216 },
      { pageId: "p1", pageSlug: "/",        surfaces: ["storefront"], visits: 1842 },
      { pageId: "p3", pageSlug: "/about",   surfaces: ["storefront"], visits:  412 },
      { pageId: "p4", pageSlug: "/contact", surfaces: ["storefront"], visits:  287 },
    ],
    byPage30d: [
      { pageId: "p2", pageSlug: "/roster",  surfaces: ["storefront"], visits: 4180 },
      { pageId: "p1", pageSlug: "/",        surfaces: ["storefront"], visits: 6320 },
      { pageId: "p3", pageSlug: "/about",   surfaces: ["storefront"], visits: 1410 },
      { pageId: "p4", pageSlug: "/contact", surfaces: ["storefront"], visits:  980 },
    ],
    // Deterministic 30-day trend fixture: a gentle weekly rhythm around the
    // ~638 visits/day the last30d.visits total implies.
    visitsByDay: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
      visits: 520 + ((i * 97) % 240),
    })),
    topReferrers7d: [
      { referrer: "direct",        visits: 2840 },
      { referrer: "google.com",    visits: 1180 },
      { referrer: "instagram.com", visits:  410 },
      { referrer: "t.co",          visits:  180 },
    ],
    topReferrers30d: [
      { referrer: "direct",        visits: 11200 },
      { referrer: "google.com",    visits:  4980 },
      { referrer: "instagram.com", visits:  1840 },
      { referrer: "t.co",          visits:   720 },
    ],
  },
};

/**
 * Merge server-loaded `WebsiteData` into the prototype `WebsiteState` shape.
 *
 * Phase B de-fixture (2026-05-28):
 *  - Domain fallback uses real `${tenantSlug}.tulala.digital`, not prototype literal.
 *  - Analytics zeroed out — real analytics loader is Phase C. `WebsitePerformance`
 *    renders cleanly with all-zeros (top-performer tables filter to `visits > 0`).
 *  - Announcement disabled — SS27 fixture copy removed; real announcement is Phase C.
 *
 * `teamMembers` resolves `cms_pages.updated_by` (a raw profile UUID) to the
 * member's display name for the page cards' "By {name}" line. A member who
 * has since left the workspace won't resolve — the card shows nothing
 * rather than a raw UUID (W1-L9 polish).
 */
export function mergeWebsiteStateFromBridge(
  live: WebsiteData,
  tenantSlug: string,
  teamMembers: TeamMember[] = [],
  planTier: string | null = null,
): WebsiteState {
  const memberNameById = new Map(teamMembers.map((m) => [m.id, m.name]));
  // The Website hero prints this as the workspace's LIVE URL, with a green dot
  // and a Copy button. It must therefore be an address that actually resolves.
  // The old `?? \`${tenantSlug}.tulala.digital\`` fallback ignored both plan
  // eligibility and whether any agency_domains row existed, so every Free
  // workspace advertised a host that 404s "Host not registered".
  const address = resolveWorkspaceLiveAddress({
    slug: tenantSlug,
    planTier,
    domains: live.domainSummary,
  });
  const host = address.primaryHost;

  // A path-hosted workspace (`tulala.digital/w/<slug>`) is served by the
  // platform apex: always reachable, always TLS. A branded host is only as good
  // as its agency_domains row.
  const pathHosted = address.primaryKind === "path";
  const sslOk =
    pathHosted ||
    live.domainSummary.primaryHostStatus === "active" ||
    live.domainSummary.primaryHostStatus === "ssl_provisioned" ||
    live.domainSummary.primaryHostStatus === "verified";

  const pages: WebsitePageRow[] = live.pages.map((p) => {
    const rawSlug = (p.slug ?? "").trim();
    const slug =
      rawSlug === ""
        ? "/"
        : rawSlug.startsWith("/")
          ? rawSlug
          : `/${rawSlug}`;
    // UI-only "scheduled" status — see website-page-status.ts for why
    // `cms_pages.status` alone can never produce it.
    const status = deriveWebsitePageStatus(p.status, p.scheduledPublishAt);
    // A row is the tenant's homepage when its raw slug matches the
    // assigned `home` page-role pointer (agencies.settings.pageRoles.home,
    // read by readTenantPageRoles). When no role is assigned, fall back to
    // the built-in convention: the seeded `system_template_key = 'homepage'`
    // row — see page-roles-shape.ts for why an unset role means "use the
    // default" rather than "no homepage".
    const isHomepage = live.homeSlug
      ? rawSlug === live.homeSlug
      : p.systemTemplateKey === "homepage";
    return {
      id: p.id,
      title: p.title?.trim() ? p.title : "Untitled",
      slug,
      status,
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      scheduledFor: status === "scheduled" ? p.scheduledPublishAt ?? undefined : undefined,
      // Resolve the raw profile UUID to a display name. Unresolvable (member
      // left, or no author recorded) → "" so the card renders nothing
      // instead of a raw UUID.
      lastEditedBy: (p.updatedBy && memberNameById.get(p.updatedBy)) || "",
      template: p.templateKey?.replace(/_/g, " ") ?? "page",
      hits7d: 0,
      // P1-B — pipeline enrichment, no visible UI change yet (feeds the
      // redesigned Pages list). Passed straight through from cms_pages via
      // WebsitePageItem.
      locale: p.locale,
      version: p.version,
      noindex: p.noindex,
      includeInSitemap: p.includeInSitemap,
      hasMetaDescription: p.hasMetaDescription,
      publishedAt: p.publishedAt ?? undefined,
      isHomepage,
      // P3-A — the quick-actions region needs to know which rows the cms_pages
      // guard trigger protects; system_template_key is the flag the bridge
      // already carries (see WebsitePageRow.systemTemplateKey).
      systemTemplateKey: p.systemTemplateKey,
    };
  });

  const posts: WebsitePost[] = live.posts.map((p) => {
    const slug = (p.slug ?? "").trim();
    const path = slug.startsWith("/") ? slug : slug ? `/${slug}` : "/";
    return {
      id: p.id,
      title: p.title,
      slug: path,
      status:
        p.status === "published" ? "published" : p.status === "archived" ? "archived" : "draft",
      locale: p.locale,
      hasExcerpt: p.hasExcerpt,
      publishedAt: p.publishedAt ?? undefined,
      updatedAt: p.updatedAt ?? new Date().toISOString(),
      // Same resolution as pages' lastEditedBy: raw profile UUID → display
      // name, "" when unresolvable so no surface prints a UUID.
      lastEditedBy: (p.updatedBy && memberNameById.get(p.updatedBy)) || "",
    };
  });

  const redirects: WebsiteRedirect[] = live.redirects.map((r) => {
    const code = r.statusCode;
    const statusCode: WebsiteRedirect["statusCode"] =
      code === 302 || code === 307 || code === 308 ? code : 301;
    return {
      id: r.id,
      from: r.oldPath,
      to: r.newPath,
      statusCode,
      match: "exact" as const,
      hits7d: 0,
      createdAt: new Date().toISOString(),
      createdBy: "—",
      active: r.active,
    };
  });

  // REAL `agency_domains` registry rows, projected 1:1. No fixture spread:
  // the old `{...WEBSITE_STATE.domain}` carried a fake DNS table ("2/2
  // matched") and an invented SSL renewal date into every real tenant.
  const domainRecords: WebsiteDomainRecord[] = [
    ...live.domainSummary.subdomains.map((row) => ({
      hostname: row.hostname,
      kind: "subdomain" as const,
      isPrimary: row.isPrimary,
      status: row.status,
      verificationToken: null,
      verifiedAt: null,
      failureReason: null,
    })),
    ...live.domainSummary.customDomains.map((row) => ({
      hostname: row.hostname,
      kind: "custom" as const,
      isPrimary: row.isPrimary,
      status: row.status,
      verificationToken: row.verificationToken,
      verifiedAt: row.verifiedAt,
      failureReason: row.failureReason,
    })),
  ];

  const domainPatch: WebsiteDomain = {
    primaryDomain: host,
    status:
      pathHosted ||
      live.domainSummary.primaryHostStatus === "verified" ||
      sslOk
        ? "verified"
        : "pending",
    sslStatus: sslOk ? "active" : "pending",
    records: domainRecords,
    // SAME source the connect action checks: `builderPlanAllows(plan,
    // "builder.domain.custom")` delegates to `customDomainEligible(plan)`,
    // which is what `resolveWorkspacePublicAddress` computed here.
    canUseCustomDomain: address.customDomainEligible,
  };

  // Real tenant name (agency_business_identity.public_name), NOT the
  // "Acme Models" prototype fixture — that placeholder was leaking into
  // every real tenant's SEO Defaults card (title + title template).
  const tenantName = live.tenantName?.trim() || "";
  const seoPatch: WebsiteSeoDefaults = {
    ...WEBSITE_STATE.seo,
    // Empty string is the "unset" sentinel — the render layer shows a
    // localized "Not set" state instead of baking an English fallback
    // string into the data (WebsitePage-1.tsx SEO card).
    siteTitle: live.seoTitle ?? tenantName,
    titleTemplate: tenantName ? `%s | ${tenantName}` : "",
    description: live.seoDescription ?? "",
    canonicalDomain: host,
  };

  // ANALYTICS-2 — project the REAL first-party page-view analytics
  // (`view_site_page` grouped by page_slug / referrer) into the panel shape.
  // Visits come from the page-view loader; inquiries/bookings/revenue come from
  // the ANALYTICS-1 conversion loader (`inquiries` / `agency_bookings` /
  // `booking_transactions`). Prior == 0 (no historical baseline yet) → the Tile
  // deltas read "flat", which is honest.
  const live7d = live.analytics.last7d;
  const live30d = live.analytics.last30d;
  const conv7d = live.conversion.last7d;
  const conv30d = live.conversion.last30d;

  // Map page slug → real 7d/30d visits so each page card shows live hits.
  const visitsBySlug7d = new Map<string, number>(
    live7d.topPages.map((p) => [p.pageSlug, p.visits]),
  );
  const visitsBySlug30d = new Map<string, number>(
    live30d.topPages.map((p) => [p.pageSlug, p.visits]),
  );
  const slugOf = (raw: string): string => {
    const s = (raw ?? "").trim();
    return s === "" ? "/" : s.startsWith("/") ? s : `/${s}`;
  };
  // ANALYTICS-2 — null-honest: `groupTopPages` truncates to the top 8
  // slugs by visits (website-analytics-group.ts `limit = 8`), so a slug
  // absent from `topPages` does NOT mean zero visits — it means "not in
  // the top 8". Leave hits7d/hits30d undefined here rather than
  // defaulting to 0. Consumers (WebsitePage-1/2.tsx) already do
  // `hits7d ?? 0` for rendering — a deliberate "treat unknown as zero for
  // now" display choice, not a claim of a true zero.
  const pagesWithHits: WebsitePageRow[] = pages.map((p) => ({
    ...p,
    hits7d: visitsBySlug7d.get(slugOf(p.slug)),
    hits30d: visitsBySlug30d.get(slugOf(p.slug)),
  }));

  // Build a slug → cms_pages id map so top-page rows (which may carry only a
  // slug, e.g. talent-site pages) resolve to a panel title when the slug
  // matches a known page; else the page card title falls back to "—".
  const pageIdBySlug = new Map<string, string>(
    pages.map((p) => [slugOf(p.slug), p.id]),
  );
  const toByPage = (
    topPages: { pageSlug: string; pageId: string | null; surfaces: string[]; visits: number }[],
  ): WebsitePageMetrics[] =>
    topPages.map((tp) => ({
      pageId: tp.pageId ?? pageIdBySlug.get(slugOf(tp.pageSlug)) ?? tp.pageSlug,
      pageSlug: slugOf(tp.pageSlug),
      surfaces: tp.surfaces,
      visits: tp.visits,
    }));

  // W2 — real prior-period baselines, or an honest null. The 7d prior (days
  // 8-14) is derived from the SAME 30d fetch by the loaders; the 30d period
  // has no baseline (that needs a 60d scan) so its prior is null and the UI
  // renders no delta — the old shape's hardcoded prior of 0 made every delta
  // permanently read "flat vs 0".
  const metrics = (
    visits: number,
    conv: { inquiries: number; bookings: number; revenue: number },
    prior: WebsitePeriodMetrics["prior"],
  ): WebsitePeriodMetrics => ({
    visits,
    inquiries: conv.inquiries,
    bookings: conv.bookings,
    revenue: conv.revenue,
    prior,
  });

  const analyticsLive: WebsiteAnalytics = {
    refreshedAt:    live.analytics.refreshedAt,
    last7d:         metrics(live7d.visits, conv7d, {
      visits: live.analytics.prior7dVisits,
      inquiries: live.conversion.prior7d.inquiries,
      bookings: live.conversion.prior7d.bookings,
      revenue: live.conversion.prior7d.revenue,
    }),
    last30d:        metrics(live30d.visits, conv30d, null),
    byPage7d:       toByPage(live7d.topPages),
    byPage30d:      toByPage(live30d.topPages),
    topReferrers7d:  live7d.topReferrers,
    topReferrers30d: live30d.topReferrers,
    visitsByDay:     live.analytics.visitsByDay30,
  };

  return {
    ...WEBSITE_STATE,
    // P2-C — server-computed Site Health report. Undefined when the loader
    // did not run, which keeps the panel silent rather than green-by-default.
    health:       live.health,
    pages:        pagesWithHits,
    posts,
    redirects,
    domain:       domainPatch,
    seo:          seoPatch,
    analytics:    analyticsLive,
    // Disable fixture announcement — real announcement management is Phase C.
    announcement: { enabled: false, text: "", audience: "all", tone: "info" },
    // Scope tracking domain to the real workspace.
    tracking: { ...WEBSITE_STATE.tracking, plausibleDomain: host },
  };
}
