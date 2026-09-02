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
  | "homepage"
  | "pages"
  | "posts"
  | "navigation"
  | "media"
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
  | "guest-chat-settings"
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
  | "representation"
  | "talent-leave-agency"
  | "talent-notifications"
  | "talent-privacy"
  | "talent-payouts"
  | "talent-contact-preferences"
  | "talent-earnings-detail"
  | "talent-connections"
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
  // — Cross-cutting upgrade surfaces ————————————————————————————————
  | "plan-compare"
  // — Payments / payouts ——————————————————————————————————
  | "payments-setup"
  | "payout-receiver-picker"
  | "payment-detail"
  // — Platform / HQ drawers ————————————————————————————————————
  // — Shared messaging-first workspace ——————————————————————————————————
  | "inquiry-workspace"
  // — Wave-2 additions ——————————————————————————————————
  | "day-detail"
  | "inbox-snippets"
  | "notifications-prefs"
  | "support-ticket"
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
  // ── WS-19 Reporting & analytics ────────────────────────────────────
  // "workspace-revenue" retired 2026-05-26 — replaced by the canonical
  // /{tenantSlug}/admin/financials route. See decision-log L46.
  | "conversion-funnel"
  // ── WS-20 Operations & workflow ──────────────────────────────────────
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
  | "brand-assets"        // workspace brand-asset library
  // ── WS-27 Site & page-builder management ────────────────────────────
  | "site-context-switcher" // multi-context site picker (agency/talent/hub)
  | "page-scheduler"      // schedule page publish/unpublish
  // ── WS-28 Casting director ──────────────────────────────────────────
  // ── WS-29 Production team & multi-discipline bookings ───────────────
  // ── WS-30 Image rights & post-booking lifecycle ──────────────────────
  // ── WS-31 Account lifecycle ─────────────────────────────────────────
  | "minor-account"       // parent/guardian co-pilot account for under-18 talent
  // ── WS-32 Discovery & marketplace ────────────────────────────────────
  // ── WS-33 On-set / production-day live ───────────────────────────────
  // ── WS-34 Safety, disputes, incident handling ────────────────────────
  // ── WS-35 Production-feature reconciliation ──────────────────────────
  // ── Feature controls ─────────────────────────────────────────────────
  | "feature-controls"    // agency-admin on/off toggles for every platform feature
  // ── Talent circle ────────────────────────────────────────────────────
  | "circle-manage"       // talent's personal circle of trusted collaborators
  | "circle-recommend"    // recommend a circle member into a booking
  // ── Phase B workspace profile shell ──────────────────────────────────
  | "workspace-profile"         // workspace own identity / branding summary
  // ── Media Gallery + Watermark ────────────────────────────────────────
  | "watermark-editor"          // per-image watermark position/opacity/size editor
  | "workspace-media-gallery"   // full-screen agency media grid (Agency tier)
  // ── Reviews moderation (STANDING) ────────────────────────────────────
  | "reviews-moderation"        // staff reported-review queue + rating-integrity panel
  // ── Media ownership / two-key release ────────────────────────────────
  // Emitted as `targetDrawer` by the media-grant notifications
  // (`media-grants-shared.ts`). It used to resolve to nothing, so the
  // workspace half of the two-key flow opened the "Coming up next" stub at its
  // moment of highest attention. The talent half (`talent-media`) is an ALIAS
  // rather than an id — see `notification-drawer-targets.ts` for the
  // resolution table and the static test that keeps every emitted id honest.
  | "media-releases";           // workspace queue of photo-release requests

export type DrawerContext = {
  drawerId: DrawerId | null;
  payload?: Record<string, unknown>;
};

// ─── Upgrade modal ───────────────────────────────────────────────────

/**
 * The framing a contextual upgrade prompt passes to `openUpgrade()`.
 *
 * `feature`, `why`/`outcome` and `requiredPlan` reach the real modal. The
 * remaining fields are inert leftovers from the deleted prototype modal, which
 * rendered a caller-supplied bullet list; the real modal shows each tier's
 * actual feature list, so it does not need one. They are kept so the ~45
 * existing call sites still type-check, and are the obvious thing to delete in
 * a follow-up sweep.
 */
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
