"use client";
// ─────────────────────────────────────────────────────────────────────
// Phase 1b decomposition of _state.tsx (remediation-plan-2026-05-19 §4).
// Byte-for-byte declaration bodies; public surface re-exported by the
// ./state.tsx barrel. Do not add/remove exports here without updating
// the barrel + the "public export surface" proof.
// ─────────────────────────────────────────────────────────────────────
import type { Plan } from "./types";

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
  | "talent-agency-switcher"
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
  | "workspace-profile"         // workspace own identity / branding summary
  // ── Media Gallery + Watermark ────────────────────────────────────────
  | "watermark-editor"          // per-image watermark position/opacity/size editor
  | "workspace-media-gallery";  // full-screen agency media grid (Agency tier)

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