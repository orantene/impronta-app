"use client";

/**
 * Drawer Help Registry — single source of truth for in-app drawer
 * explanations, support article URLs, chatbot Q&A pairs, and ticket
 * routing categories.
 *
 * For the bigger picture — audit findings, 25-workstream execution
 * plan, designer + engineer handoff packages — see ROADMAP.md in this
 * directory. The page-builder management plane (which integrates with
 * a separate front-end editor codebase and supports hybrid-user
 * context-switching) is tracked as workstream WS-27.
 *
 * Usage:
 *  - DrawerShell auto-renders an ⓘ button + slide-down HelpPanel when
 *    `getHelp(drawerId)` returns an entry.
 *  - DRAWERS.md is generated from this same registry (run the script in
 *    scripts/gen-drawers-doc.ts — same shape, just serialized).
 *  - Future support pages will live at `/support/<supportSlug>` and read
 *    the same `purpose` + `youCanHere` + `faqs` fields.
 *  - The chat Q&A bot looks up `faqs` keyed by drawer; if no match, it
 *    falls back to the registry's free-text search over `purpose`.
 *  - The ticket form pre-fills `category` from `ticketCategory`.
 *
 * Writing style:
 *  - `purpose` — one sentence, plain language, no jargon. Answers
 *    "what is this thing" for someone who has never seen it.
 *  - `youCanHere` — 3–5 bullets, imperative verbs ("Reply…", "Send…"),
 *    each describes a concrete action a user can take in this view.
 *  - `relatedDrawers` — 2–3 logical jumps, never exhaustive.
 *  - `audience` — one or many. Drives the eyebrow chip color and the
 *    "who's this for" filter on the support index.
 */

import { Fragment, useEffect, useState } from "react";

import { COLORS, FONTS, useProto, type DrawerId } from "./_state";

// ─── Type definitions ────────────────────────────────────────────────

export type Audience =
  | "Workspace admin"
  | "Workspace coordinator"
  | "Workspace editor"
  | "Talent"
  | "Client"
  | "Tulala HQ";

export type HelpEntry = {
  /** Who primarily uses this drawer. Drives the eyebrow chip. */
  audience: Audience | Audience[];
  /** High-level grouping, eg "Operations", "Settings", "Public site". */
  category: string;
  /** Optional short-title override; defaults to drawer's own title. */
  shortTitle?: string;
  /** One sentence — what this view is for / why it exists. */
  purpose: string;
  /** 3–5 bullets of "what you can do here". Imperative. */
  youCanHere: string[];
  /** Drawers a user often jumps to from here. Rendered as chips. */
  relatedDrawers?: DrawerId[];

  // ── Future hooks (already wired into the data shape) ──────────────
  /** Slug for /support/<slug>. Defaults to the drawer id. */
  supportSlug?: string;
  /** Q&A pairs surfaced by the in-app chatbot when a user is on this drawer. */
  faqs?: { q: string; a: string }[];
  /** Pre-filled category for the ticket-submission form. */
  ticketCategory?: string;
  /** Internal notes — surfaced in DRAWERS.md, NEVER in the UI. */
  devNotes?: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────

const W_ADMIN = "Workspace admin" as const;
const W_COORD = "Workspace coordinator" as const;
const W_EDIT = "Workspace editor" as const;
const TALENT = "Talent" as const;
const CLIENT = "Client" as const;
const HQ = "Tulala HQ" as const;

// ─── Registry ────────────────────────────────────────────────────────

export const DRAWER_HELP: Partial<Record<DrawerId, HelpEntry>> = {
  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Operations
  // ════════════════════════════════════════════════════════════════

  "inquiry-workspace": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Single sheet for one inquiry. Clients ask questions, you negotiate, talent confirms — all in one place.",
    youCanHere: [
      "Reply in the client thread (visible to client + talent)",
      "Coordinate privately with talent (the client never sees this)",
      "Send offers and watch for client approval",
      "Track funded escrow and convert to a confirmed booking",
      "See the full event timeline — every reply, offer, status change",
    ],
    relatedDrawers: ["pipeline", "new-inquiry", "today-pulse"],
    ticketCategory: "Bookings & inquiries",
    faqs: [
      {
        q: "Can the client see my private notes with talent?",
        a: "No. The 'Coordinate' tab is talent-only. Clients only see the public thread.",
      },
      {
        q: "Why can't I confirm the booking?",
        a: "A booking confirms automatically once the client approves an offer and funds escrow. If neither has happened, the offer is still pending.",
      },
    ],
  },

  "inquiry-peek": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Quick read-only summary of an inquiry. Use this when you just need to glance at status without opening the full workspace.",
    youCanHere: [
      "See the request, dates, and the client's name",
      "Check current stage and who's waiting on whom",
      "Jump to the full inquiry workspace if you need to act",
    ],
    relatedDrawers: ["inquiry-workspace", "pipeline"],
  },

  "new-inquiry": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Manually create an inquiry — usually for clients who reached out via WhatsApp or email and you want them tracked inside Tulala.",
    youCanHere: [
      "Add the client (existing or new) and the talent involved",
      "Set the date(s), shoot type, and budget range",
      "Choose initial status — usually Draft if you're still negotiating",
      "Email the client a Tulala link so they can take over from there",
    ],
    relatedDrawers: ["pipeline", "inquiry-workspace", "client-list"],
    ticketCategory: "Bookings & inquiries",
  },

  "booking-peek": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Read-only summary of one confirmed booking — call-time, talent, contracts, payment status — without leaving the page you're on.",
    youCanHere: [
      "See the booking at a glance",
      "Jump to the full booking detail to act",
      "Open the linked inquiry to see how it was negotiated",
    ],
    relatedDrawers: ["confirmed-bookings", "inquiry-workspace"],
  },

  "new-booking": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Skip the inquiry phase and create a booking directly. Use this for already-negotiated deals, repeat clients, or back-office records.",
    youCanHere: [
      "Pick the client and talent",
      "Enter the date, rate, and any commission terms",
      "Mark the booking as funded if escrow is already in place",
      "Generate the invoice on confirmation",
    ],
    relatedDrawers: ["confirmed-bookings", "client-billing", "new-inquiry"],
    ticketCategory: "Bookings & inquiries",
  },

  "today-pulse": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "What needs your attention right now — overdue replies, expiring offers, today's call-times, unresolved holds.",
    youCanHere: [
      "Tap any line to jump straight into the inquiry that needs action",
      "Dismiss items you'll handle later (they reappear next morning)",
      "See which talent has a confirmed booking starting today",
    ],
    relatedDrawers: ["pipeline", "inquiry-workspace", "drafts-holds"],
  },

  pipeline: {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Every inquiry from first request to booked, grouped by what's blocking forward motion.",
    youCanHere: [
      "Filter by stage (drafts, awaiting client, confirmed, archived)",
      "Open any inquiry to see its full workspace",
      "Spot stalled requests and nudge the right side",
      "Reassign coordinators to rebalance load",
    ],
    relatedDrawers: ["today-pulse", "inquiry-workspace", "drafts-holds"],
  },

  "drafts-holds": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Inquiries you started but haven't sent, plus tentative date holds that haven't been confirmed.",
    youCanHere: [
      "Pick up where you left off on a draft",
      "Convert a hold into a sent offer or release the date back",
      "Clear out abandoned drafts in bulk",
    ],
    relatedDrawers: ["pipeline", "new-inquiry"],
  },

  "awaiting-client": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Offers waiting on a client decision. Sorted by how long they've been sitting.",
    youCanHere: [
      "Send a polite nudge if the client has been silent",
      "Withdraw or revise an offer that's gone stale",
      "Open the inquiry to add context or attachments",
    ],
    relatedDrawers: ["pipeline", "inquiry-workspace"],
  },

  "confirmed-bookings": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Every booking that's been approved and funded. Source of truth for upcoming work.",
    youCanHere: [
      "See call-time, location, talent, and contract status at a glance",
      "Open a booking to send updates to talent or client",
      "Mark a booking as completed once the shoot wraps",
    ],
    relatedDrawers: ["new-booking", "client-billing", "today-pulse"],
  },

  "archived-work": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Cancelled, expired, and completed work — your historical record.",
    youCanHere: [
      "Search past bookings by client or talent",
      "Reopen a cancelled inquiry if a client comes back",
      "Export a date-range report for accounting",
    ],
    relatedDrawers: ["confirmed-bookings", "data-export"],
  },

  "day-detail": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Everything happening on a single calendar day — bookings, holds, blockouts, talent availability.",
    youCanHere: [
      "See who's working, who's holding the date, who's free",
      "Tap a booking to open its full sheet",
      "Block out a date for personal time, travel, or studio days",
    ],
    relatedDrawers: ["confirmed-bookings", "talent-availability"],
  },

  "representation-requests": {
    audience: W_ADMIN,
    category: "Operations",
    purpose:
      "Talent requesting to join your roster — claims to existing profiles or fresh sign-ups.",
    youCanHere: [
      "Approve or reject each request with a reason",
      "Send the talent a sign-on contract before approving",
      "Flag suspicious requests for the platform team",
    ],
    relatedDrawers: ["talent-profile", "new-talent"],
  },

  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Roster & talent management
  // ════════════════════════════════════════════════════════════════

  "talent-profile": {
    audience: [W_ADMIN, W_COORD, W_EDIT],
    category: "Roster",
    purpose:
      "The agency-side view of one talent — measurements, rates, availability, internal notes the talent never sees.",
    youCanHere: [
      "Edit measurements, polaroids, and credits",
      "Set rate cards and territory restrictions",
      "Leave private internal notes for your team",
      "See the agency's commission split with this talent",
    ],
    relatedDrawers: ["new-talent", "talent-rate-card", "pipeline"],
  },

  "new-talent": {
    audience: [W_ADMIN, W_EDIT],
    category: "Roster",
    purpose:
      "Add a talent to your roster. Choose between a draft profile (you fill in everything) or invite the talent to claim and finish their own profile.",
    youCanHere: [
      "Create an unclaimed draft profile to start booking immediately",
      "Send the talent a claim-link so they manage their own page",
      "Pre-fill measurements, polaroids, and rates",
    ],
    relatedDrawers: ["talent-profile", "representation-requests"],
    faqs: [
      {
        q: "Will adding a talent automatically make them exclusive to my agency?",
        a: "On Studio and Agency plans, yes — adding a talent auto-assigns exclusivity. On Free plan, talents stay non-exclusive (the friend-link case). You can always change this later from the talent's profile.",
      },
    ],
  },

  "my-profile": {
    audience: [W_ADMIN, W_COORD, W_EDIT],
    category: "Roster",
    purpose:
      "Your own talent profile, if you also work as talent. Editing it here is identical to the talent surface.",
    youCanHere: [
      "Update your measurements, photos, and credits",
      "Manage your availability calendar",
      "Switch to the dedicated talent dashboard for the full experience",
    ],
    relatedDrawers: ["talent-profile-edit", "talent-availability"],
  },

  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Tenant settings
  // ════════════════════════════════════════════════════════════════

  "tenant-summary": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Read-only snapshot of your workspace's plan, usage, and settings — for sharing with finance or legal.",
    youCanHere: [
      "Copy a permalink to send to your accountant",
      "See current plan, billing date, and seat count",
      "Jump to the relevant settings tab to change anything",
    ],
    relatedDrawers: ["plan-billing", "plan-compare", "team"],
  },

  "site-setup": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "First-time setup wizard for your public storefront — domain, branding, and the talent who'll show up first.",
    youCanHere: [
      "Pick a tulala.app subdomain or connect a custom one",
      "Upload logo and pick brand colors",
      "Choose which talent appear on the public roster",
    ],
    relatedDrawers: ["domain", "branding", "homepage"],
  },

  "theme-foundations": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Brand-level design tokens — fonts, colors, spacing — that propagate across your storefront and emails.",
    youCanHere: [
      "Pick a font pairing or upload custom webfonts",
      "Define your primary, accent, and ink colors",
      "Preview changes on a sample page before saving",
    ],
    relatedDrawers: ["design", "branding", "homepage"],
  },

  "plan-billing": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Your subscription, payment method, invoices, and seat count.",
    youCanHere: [
      "Upgrade or downgrade your plan",
      "Update the card on file",
      "Download past invoices",
      "Add or remove seats for team members",
    ],
    relatedDrawers: ["plan-compare", "team", "data-export"],
    ticketCategory: "Billing",
  },

  team: {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Coordinators, editors, and other admins on your workspace — and what each can do.",
    youCanHere: [
      "Invite teammates by email",
      "Assign roles (admin, coordinator, editor)",
      "Revoke access when someone leaves",
      "See last-active timestamps for each member",
    ],
    relatedDrawers: ["plan-billing", "audit-log"],
    ticketCategory: "Account & access",
  },

  branding: {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Logo, favicon, and brand assets used across your storefront, emails, and shareable links.",
    youCanHere: [
      "Upload your logo (light + dark variants)",
      "Set the favicon shown in browser tabs",
      "Upload a default OG image for social shares",
    ],
    relatedDrawers: ["theme-foundations", "domain", "homepage"],
  },

  domain: {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Connect a custom domain (yours.com) instead of the default tulala.app subdomain.",
    youCanHere: [
      "Add a new domain and see the DNS records to set",
      "Verify and switch your storefront to the new domain",
      "Set up a redirect from your old subdomain",
    ],
    relatedDrawers: ["site-setup", "branding"],
    ticketCategory: "Public site & domains",
  },

  identity: {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Legal entity, billing address, and tax info — used on invoices and contracts.",
    youCanHere: [
      "Update your registered business name and address",
      "Add a VAT or tax ID",
      "Choose what appears on outgoing invoices",
    ],
    relatedDrawers: ["plan-billing"],
    ticketCategory: "Billing",
  },

  "workspace-settings": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Workspace-wide defaults — currency, locale, weekly schedule, notification rules.",
    youCanHere: [
      "Set the default currency for new bookings",
      "Pick which weekday your dashboard week starts on",
      "Define default reply windows and SLA targets",
    ],
    relatedDrawers: ["notifications-prefs", "team"],
  },

  "danger-zone": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Irreversible workspace operations — exporting everything, transferring ownership, deleting the workspace.",
    youCanHere: [
      "Export a full archive (clients, bookings, files) before leaving",
      "Transfer the workspace to another admin",
      "Delete the workspace permanently (90-day grace period)",
    ],
    relatedDrawers: ["data-export", "plan-billing"],
    ticketCategory: "Account & access",
    devNotes:
      "All actions trigger a 2FA prompt. Workspace deletion is soft-deleted for 90 days then hard-deleted by a platform job.",
  },

  "activation-checklist": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "Your onboarding progress — the steps that turn a fresh workspace into a live, bookable storefront.",
    youCanHere: [
      "See which setup steps are still incomplete",
      "Tap any step to jump straight into it",
      "Mark steps as done manually if you skipped the in-app flow",
    ],
    relatedDrawers: ["site-setup", "homepage", "new-talent"],
  },

  "tenant-switcher": {
    audience: W_ADMIN,
    category: "Settings",
    purpose:
      "If you belong to multiple workspaces (eg you run both a studio and an agency), switch between them here.",
    youCanHere: [
      "See all workspaces you have access to",
      "Switch to another workspace without signing out",
      "Set a default workspace for new sessions",
    ],
    relatedDrawers: ["workspace-settings"],
  },

  "plan-compare": {
    audience: [W_ADMIN, TALENT, CLIENT],
    category: "Settings",
    purpose:
      "Side-by-side comparison of every plan tier so you can pick (or upgrade) the one that fits.",
    youCanHere: [
      "See feature parity across Free, Studio, Agency, and Network",
      "Toggle monthly vs annual pricing",
      "Start an upgrade flow from any tier card",
    ],
    relatedDrawers: ["plan-billing"],
    faqs: [
      {
        q: "Can I downgrade later?",
        a: "Yes. Any time. The change takes effect at the next billing cycle, and you keep your higher-tier features until then.",
      },
    ],
  },

  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Public site / CMS
  // ════════════════════════════════════════════════════════════════

  homepage: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Edit your public storefront homepage — the first thing visitors see at yoursite.tulala.app.",
    youCanHere: [
      "Reorder hero, talent grid, and any custom sections",
      "Drop in widgets (booking form, featured talent, press logos)",
      "Preview on desktop, tablet, and mobile before publishing",
    ],
    relatedDrawers: ["pages", "design", "widgets"],
  },

  pages: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Static pages on your storefront — About, Press, Contact, Terms, etc.",
    youCanHere: [
      "Create a new page from a template or blank canvas",
      "Set the URL slug, SEO title, and OG image per page",
      "Publish, unpublish, or schedule a page for later",
    ],
    relatedDrawers: ["homepage", "navigation", "seo"],
  },

  posts: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Editorial posts — campaign roundups, talent spotlights, agency news.",
    youCanHere: [
      "Draft a post with rich text, images, and embeds",
      "Tag posts so they appear on the right index pages",
      "Schedule a publish time or push it live now",
    ],
    relatedDrawers: ["pages", "media", "seo"],
  },

  navigation: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "The header and footer menus on your public storefront.",
    youCanHere: [
      "Add, reorder, or remove menu items",
      "Link to internal pages or external URLs",
      "Set different menus for desktop and mobile",
    ],
    relatedDrawers: ["pages", "homepage"],
  },

  media: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Every image, video, and file uploaded across your workspace — central library.",
    youCanHere: [
      "Upload new media (drag-and-drop, bulk OK)",
      "Search and tag assets so others on the team can find them",
      "Replace an image everywhere it's used in one move",
    ],
    relatedDrawers: ["homepage", "posts", "talent-portfolio"],
  },

  translations: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Multilingual storefront — translate your pages, posts, and UI strings.",
    youCanHere: [
      "Add a language and pick a default fallback",
      "Edit translations side-by-side with the source",
      "Mark a translation as 'needs review' for an editor",
    ],
    relatedDrawers: ["pages", "posts"],
  },

  seo: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "SEO defaults and per-page overrides — meta title, description, OG image, robots.",
    youCanHere: [
      "Set sitewide defaults (title template, default OG image)",
      "Override SEO on any page or post",
      "Submit your sitemap to Google Search Console",
    ],
    relatedDrawers: ["pages", "homepage", "site-health"],
  },

  "field-catalog": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "Custom fields on talent profiles, clients, and inquiries. Define your own data model on top of the defaults.",
    youCanHere: [
      "Add a custom field (text, number, select, file)",
      "Choose where it appears (talent profile, inquiry form, etc.)",
      "Mark a field as required or admin-only",
    ],
    relatedDrawers: ["taxonomy", "talent-profile"],
    devNotes:
      "Custom fields are an Agency-tier feature. Free + Studio plans see a read-only preview with an upgrade nudge.",
  },

  taxonomy: {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "The categorization system — talent specialties, client industries, inquiry types — used for filtering across the app.",
    youCanHere: [
      "Add or rename a category",
      "Reorder how categories appear in filter menus",
      "Merge two categories that should be one",
    ],
    relatedDrawers: ["field-catalog", "filter-config"],
  },

  design: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Section-level design controls — typography, spacing, button styles — beyond the brand foundations.",
    youCanHere: [
      "Tweak component styles (cards, buttons, headers)",
      "Override layout for specific page sections",
      "Reset to the brand defaults at any time",
    ],
    relatedDrawers: ["theme-foundations", "homepage"],
  },

  widgets: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Embeddable Tulala blocks — booking forms, talent grids, hub directories — that you can drop into pages.",
    youCanHere: [
      "Browse available widgets",
      "Configure a widget (which talent, which filters)",
      "Get the embed code for an external site",
    ],
    relatedDrawers: ["api-keys", "homepage", "hub-distribution"],
  },

  "api-keys": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "API keys for pulling your roster data into external sites or third-party tools.",
    youCanHere: [
      "Generate a new key with scoped permissions",
      "Revoke a leaked or unused key",
      "See the last call timestamp for each key",
    ],
    relatedDrawers: ["widgets", "audit-log"],
    ticketCategory: "Developer & API",
  },

  "site-health": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "Storefront-side checks — broken links, missing meta tags, slow pages, indexability.",
    youCanHere: [
      "See a prioritized list of issues to fix",
      "Re-run a single check after fixing it",
      "Schedule weekly health emails",
    ],
    relatedDrawers: ["seo", "pages", "homepage"],
  },

  "storefront-visibility": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "Who can see your storefront — public, link-only, password-protected, or hidden from Tulala discovery.",
    youCanHere: [
      "Toggle public discovery on or off",
      "Set a password gate for unfinished sites",
      "Hide individual talent from public search",
    ],
    relatedDrawers: ["site-setup", "domain"],
  },

  "hub-distribution": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "Submit your roster to industry hubs — curated talent directories that send you inbound clients.",
    youCanHere: [
      "Apply to a hub (each has its own review process)",
      "Choose which talent are eligible for hub listing",
      "See which hubs are sending you the most inquiries",
    ],
    relatedDrawers: ["widgets", "site-health"],
    devNotes:
      "Hub listings are reviewed by Tulala HQ. See platform-hub-submission for the HQ side.",
  },

  "filter-config": {
    audience: W_ADMIN,
    category: "Public site",
    purpose:
      "Which filters appear on your public roster page (height, location, specialty, etc).",
    youCanHere: [
      "Reorder filters by importance",
      "Hide filters that don't apply to your roster",
      "Set default filter values for first-time visitors",
    ],
    relatedDrawers: ["taxonomy", "homepage"],
  },

  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Clients
  // ════════════════════════════════════════════════════════════════

  "client-list": {
    audience: [W_ADMIN, W_COORD],
    category: "Clients",
    purpose:
      "Every client your workspace has worked with — past, present, and prospective.",
    youCanHere: [
      "Filter by trust tier, last booking, or industry",
      "Open a client's profile to see their full history",
      "Tag VIP clients or flag ones to deprioritize",
    ],
    relatedDrawers: ["client-profile", "private-client-data", "relationship-history"],
  },

  "client-profile": {
    audience: [W_ADMIN, W_COORD],
    category: "Clients",
    purpose:
      "The client's full record — contacts, brands, past bookings, payment history.",
    youCanHere: [
      "Update contact details and brand affiliations",
      "See every past inquiry and booking",
      "Set client-specific rates or commission overrides",
      "Add internal notes the client never sees",
    ],
    relatedDrawers: ["client-list", "private-client-data", "relationship-history", "client-billing"],
  },

  "relationship-history": {
    audience: [W_ADMIN, W_COORD],
    category: "Clients",
    purpose:
      "Chronological log of every interaction with one client — bookings, messages, contracts, payments.",
    youCanHere: [
      "Scroll through a unified timeline",
      "Filter to a specific event type",
      "Export the history for legal or audit purposes",
    ],
    relatedDrawers: ["client-profile", "audit-log"],
  },

  "private-client-data": {
    audience: W_ADMIN,
    category: "Clients",
    purpose:
      "Client info that's locked to admins only — internal credit ratings, do-not-book flags, sensitive notes.",
    youCanHere: [
      "Mark a client as do-not-book with a reason",
      "Set an internal credit limit",
      "Leave private notes other admins can read",
    ],
    relatedDrawers: ["client-profile", "audit-log"],
    devNotes: "Coordinators and editors see no trace this drawer exists.",
  },

  // ════════════════════════════════════════════════════════════════
  // Workspace surface — Notifications & activity
  // ════════════════════════════════════════════════════════════════

  notifications: {
    audience: [W_ADMIN, W_COORD],
    category: "Notifications",
    purpose:
      "Every alert your workspace has generated — replies, offers, payments, system events.",
    youCanHere: [
      "Filter by 'needs action' to see what's actually blocking you",
      "Mark items read or jump straight to the relevant inquiry",
      "Tune which events trigger notifications in Preferences",
    ],
    relatedDrawers: ["notifications-prefs", "today-pulse"],
  },

  "team-activity": {
    audience: W_ADMIN,
    category: "Notifications",
    purpose:
      "What your teammates have been doing — replies sent, bookings closed, talents added.",
    youCanHere: [
      "Filter by team member or by event type",
      "Spot coordinators who are overloaded or underused",
      "Identify training opportunities from common mistakes",
    ],
    relatedDrawers: ["audit-log", "team"],
  },

  "talent-activity": {
    audience: [W_ADMIN, W_COORD],
    category: "Notifications",
    purpose:
      "Talent-side actions visible to you — accepted offers, updated availability, new portfolio uploads.",
    youCanHere: [
      "See which talent recently went unavailable",
      "Spot stale profiles (no portfolio updates in months)",
      "Open any talent's profile from a row",
    ],
    relatedDrawers: ["talent-profile", "team-activity"],
  },

  "notifications-prefs": {
    audience: [W_ADMIN, W_COORD, W_EDIT, TALENT, CLIENT],
    category: "Notifications",
    purpose:
      "Which notifications you receive (in-app, email, push), and at what frequency.",
    youCanHere: [
      "Mute event types you don't care about",
      "Set quiet hours so you stop getting pinged at 2am",
      "Pick instant, daily digest, or weekly digest delivery",
    ],
    relatedDrawers: ["notifications"],
  },

  "inbox-snippets": {
    audience: [W_ADMIN, W_COORD],
    category: "Notifications",
    purpose:
      "Saved reply templates — for common questions, follow-ups, polite-no's.",
    youCanHere: [
      "Create a new snippet with merge tags (client name, date, etc.)",
      "Edit existing snippets and see usage counts",
      "Share snippets across your team",
    ],
    relatedDrawers: ["reply-templates", "notifications-prefs"],
  },

  "reply-templates": {
    audience: [W_ADMIN, W_COORD, TALENT],
    category: "Notifications",
    purpose:
      "Reusable canned replies for inquiries, offers, and rejections.",
    youCanHere: [
      "Pick from a starter library (decline politely, request more info, etc.)",
      "Customize with your own voice",
      "Insert any template into a thread with one click",
    ],
    relatedDrawers: ["inbox-snippets"],
  },

  // ════════════════════════════════════════════════════════════════
  // Talent surface — Today / Inquiries
  // ════════════════════════════════════════════════════════════════

  "talent-today-pulse": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Your day at a glance — call-times, requests waiting on you, offers about to expire.",
    youCanHere: [
      "Tap any line to jump straight into the request",
      "See your next confirmed booking and its details",
      "Block out the day if you're sick or travelling",
    ],
    relatedDrawers: ["talent-availability", "talent-offer-detail"],
  },

  "talent-offer-detail": {
    audience: TALENT,
    category: "Today",
    purpose:
      "An offer from your agency or a direct client — rate, dates, scope, terms.",
    youCanHere: [
      "Accept the offer and the booking confirms automatically",
      "Counter-propose a different rate or date",
      "Decline with a reason the agency can see",
      "Ask a question privately before deciding",
    ],
    relatedDrawers: ["talent-request-detail", "talent-availability"],
    ticketCategory: "Bookings & inquiries",
  },

  "talent-request-detail": {
    audience: TALENT,
    category: "Today",
    purpose:
      "A request that's not yet a formal offer — agency is sounding you out before sending terms.",
    youCanHere: [
      "Confirm interest so the agency can build the offer",
      "Decline early if you can't make the dates",
      "Ask clarifying questions in the thread",
    ],
    relatedDrawers: ["talent-offer-detail", "talent-availability"],
  },

  "talent-booking-detail": {
    audience: TALENT,
    category: "Today",
    purpose:
      "A confirmed booking — call-time, location, contacts, payment status.",
    youCanHere: [
      "See the call sheet and any attached files",
      "Message the agency or client team",
      "Add the booking to your phone calendar",
      "Mark the booking as completed once you wrap",
    ],
    relatedDrawers: ["talent-payouts", "talent-closed-booking"],
  },

  "talent-closed-booking": {
    audience: TALENT,
    category: "Today",
    purpose:
      "A finished booking — final payout status, receipt, and review window.",
    youCanHere: [
      "Confirm receipt of payment",
      "Leave feedback on the client (private to the agency)",
      "Download the invoice or contract for your records",
    ],
    relatedDrawers: ["talent-payouts", "talent-earnings-detail"],
  },

  "talent-add-event": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Add a personal event, travel, or block-out to your calendar so agencies stop offering you those dates.",
    youCanHere: [
      "Mark dates as unavailable with an optional reason",
      "Set a recurring blockout (eg every Sunday)",
      "Make events visible to all your agencies or just one",
    ],
    relatedDrawers: ["talent-availability", "talent-block-dates"],
  },

  "talent-hub-detail": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Detail on a hub directory — what it is, what they pay, how to apply, who else is listed.",
    youCanHere: [
      "Apply to be listed (agency approval required)",
      "Read past success stories from other talent",
      "Compare hubs side by side",
    ],
    relatedDrawers: ["talent-hub-compare", "hub-distribution"],
  },

  "talent-hub-compare": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Side-by-side comparison of every hub you're eligible for.",
    youCanHere: [
      "See payout rates, exclusivity terms, and review timelines",
      "Apply to multiple hubs in one go",
      "Bookmark hubs to apply later",
    ],
    relatedDrawers: ["talent-hub-detail"],
  },

  // ════════════════════════════════════════════════════════════════
  // Talent surface — Profile editing
  // ════════════════════════════════════════════════════════════════

  "talent-profile-edit": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Edit your full talent profile — bio, photos, measurements, credits, rates.",
    youCanHere: [
      "Update any section without affecting the others",
      "Preview how your public page looks before saving",
      "Submit changes to the agency for review (if exclusive)",
    ],
    relatedDrawers: ["talent-profile-section", "talent-public-preview", "talent-portfolio"],
  },

  "talent-profile-section": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Edit a single section of your profile — focused mode for one piece at a time.",
    youCanHere: [
      "Make changes without scrolling through the whole profile",
      "Save just this section",
      "See validation errors specific to this part",
    ],
    relatedDrawers: ["talent-profile-edit"],
  },

  "talent-availability": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Your master availability calendar. Agencies see this when they're trying to offer you work.",
    youCanHere: [
      "Mark days as available, tentative, or blocked",
      "Add travel windows (will be in Lisbon Mar 1–15)",
      "Choose which agencies can see which blocks",
    ],
    relatedDrawers: ["talent-add-event", "talent-block-dates"],
  },

  "talent-block-dates": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Quickly block a range of dates — vacation, family event, maternity leave.",
    youCanHere: [
      "Pick a date range and a reason",
      "Choose visibility (just agencies, also clients)",
      "Lift the block early if plans change",
    ],
    relatedDrawers: ["talent-availability", "talent-add-event"],
  },

  "talent-portfolio": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Your portfolio images, organized into albums (editorial, commercial, runway, etc).",
    youCanHere: [
      "Upload new photos in bulk",
      "Reorder by drag-and-drop",
      "Mark a few as cover images shown on your public page",
    ],
    relatedDrawers: ["talent-photo-edit", "talent-polaroids", "talent-credits"],
  },

  "talent-polaroids": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Casting polaroids — natural, no-makeup digitals shot against a plain wall.",
    youCanHere: [
      "Upload a fresh set (most agencies want them under 90 days old)",
      "Add date and location to each shot",
      "Set which polaroids are visible to which clients",
    ],
    relatedDrawers: ["talent-portfolio", "talent-measurements"],
  },

  "talent-photo-edit": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Crop, retouch, and tag a single photo from your portfolio.",
    youCanHere: [
      "Crop and rotate",
      "Add credits (photographer, stylist, hair, makeup)",
      "Tag which campaign or editorial it's from",
    ],
    relatedDrawers: ["talent-portfolio", "talent-credits"],
  },

  "talent-credits": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Your campaign and editorial credits — the brands and publications you've worked with.",
    youCanHere: [
      "Add a new credit with year, brand, and role",
      "Link credits to specific portfolio photos",
      "Mark some credits as verified by the agency",
    ],
    relatedDrawers: ["talent-portfolio", "talent-press"],
  },

  "talent-skills": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Skills that affect what you get cast for — languages, sports, dance, accents, instruments.",
    youCanHere: [
      "Add a skill with a self-rated proficiency level",
      "Upload demo video for skill verification",
      "See which skills are most asked for in your market",
    ],
    relatedDrawers: ["talent-showreel", "talent-credits"],
  },

  "talent-limits": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "What you will and won't do — nudity, fur, alcohol/tobacco, conflicting brands.",
    youCanHere: [
      "Set hard nos that block any inquiry mentioning them",
      "Set soft preferences (will consider if right)",
      "List conflicting brands you're already exclusive with",
    ],
    relatedDrawers: ["talent-conflict-resolve", "talent-profile-edit"],
  },

  "talent-rate-card": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Your standard rates by job type, market, and usage tier.",
    youCanHere: [
      "Set a base day rate and weekly rate",
      "Add usage tiers (regional, national, global)",
      "Override rates for specific clients or markets",
    ],
    relatedDrawers: ["talent-payouts", "talent-earnings-detail"],
  },

  "talent-travel": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Travel preferences and constraints — passport details, comfort with red-eyes, dietary needs.",
    youCanHere: [
      "Add passport (encrypted) so contracts pre-fill correctly",
      "List airlines you have status with",
      "Set travel windows where you're flexible to relocate",
    ],
    relatedDrawers: ["talent-availability"],
  },

  "talent-links": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "External links shown on your profile — Instagram, agency page, personal site, IMDB.",
    youCanHere: [
      "Add a link with a label and icon",
      "Choose which links are public vs agency-only",
      "Reorder how links appear on your public page",
    ],
    relatedDrawers: ["talent-personal-page", "talent-press"],
  },

  "talent-reviews": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Feedback from past clients and agencies — visible to clients considering booking you.",
    youCanHere: [
      "See your aggregate rating and breakdown",
      "Read individual reviews and respond publicly",
      "Flag a review you believe is unfair",
    ],
    relatedDrawers: ["talent-closed-booking"],
  },

  "talent-showreel": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Video reel — runway clips, commercial spots, behind-the-scenes.",
    youCanHere: [
      "Upload or link from Vimeo/YouTube",
      "Pick a thumbnail frame",
      "Trim to a 60-second highlight cut",
    ],
    relatedDrawers: ["talent-portfolio", "talent-skills"],
  },

  "talent-measurements": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Your measurements as they appear on every casting brief — height, bust/chest, waist, hips, shoe, hair, eyes.",
    youCanHere: [
      "Update measurements with the date taken",
      "Choose imperial or metric per region",
      "See which agencies have synced your latest set",
    ],
    relatedDrawers: ["talent-polaroids", "talent-profile-edit"],
  },

  "talent-documents": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Identity, work-permit, and tax documents — encrypted and shared only with verified agencies.",
    youCanHere: [
      "Upload passport, visa, or work-permit scans",
      "Set expiry reminders so you re-up before they lapse",
      "See which agencies have accessed which documents",
    ],
    relatedDrawers: ["talent-tax-docs", "talent-privacy"],
  },

  "talent-emergency-contact": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Who agencies should call if something goes wrong on set — only revealed in emergencies.",
    youCanHere: [
      "Add up to 3 contacts with relationship and phone number",
      "Pick a primary contact",
      "See who has accessed this in the audit log",
    ],
    relatedDrawers: ["talent-privacy", "audit-log"],
  },

  "talent-public-preview": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Preview exactly what clients see when they land on your public profile.",
    youCanHere: [
      "Toggle between client view and casting director view",
      "See it on desktop, tablet, and phone",
      "Share a private preview link before going live",
    ],
    relatedDrawers: ["talent-personal-page", "talent-profile-edit"],
  },

  // ════════════════════════════════════════════════════════════════
  // Talent surface — Premium personal page
  // ════════════════════════════════════════════════════════════════

  "talent-tier-compare": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Compare Basic (free), Pro, and Portfolio tiers — what each unlocks for your personal page.",
    youCanHere: [
      "See feature differences side by side",
      "Start a Pro or Portfolio upgrade",
      "Read what other talent built with Portfolio",
    ],
    relatedDrawers: ["talent-personal-page"],
    faqs: [
      {
        q: "If I downgrade, do I lose my custom domain?",
        a: "Your custom domain disconnects on downgrade, but your page stays live at tulala.digital/t/<your-slug>. Your data is never deleted.",
      },
    ],
  },

  "talent-personal-page": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Your premium personal page — independent of any agency, owned by you, lives at tulala.digital/t/<your-slug>.",
    youCanHere: [
      "Pick a layout template",
      "Choose which credits, photos, and links to feature",
      "Connect a custom domain (Portfolio tier)",
    ],
    relatedDrawers: ["talent-page-template", "talent-custom-domain", "talent-media-embeds"],
  },

  "talent-page-template": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Pick or customize the layout template for your personal page.",
    youCanHere: [
      "Browse 6+ template variants",
      "Tune typography, colors, and section order",
      "Save as a draft and preview before publishing",
    ],
    relatedDrawers: ["talent-personal-page"],
  },

  "talent-media-embeds": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Drop external media — Vimeo reels, Spotify playlists, Instagram posts — into your personal page.",
    youCanHere: [
      "Paste a URL and the embed renders automatically",
      "Reorder embeds within a section",
      "Hide embeds on mobile if they hurt performance",
    ],
    relatedDrawers: ["talent-personal-page", "talent-showreel"],
  },

  "talent-press": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Press mentions and editorial features — articles where you've appeared.",
    youCanHere: [
      "Add a press item with publication, date, and URL",
      "Upload a screenshot for offline preservation",
      "Mark which press is shown on your public page",
    ],
    relatedDrawers: ["talent-credits", "talent-personal-page"],
  },

  "talent-media-kit": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Downloadable PDF media kit — bio, photos, rate card, contact — for press and brand pitches.",
    youCanHere: [
      "Auto-generate from your profile data",
      "Customize layout and which sections appear",
      "Get a shareable link or password-protected PDF",
    ],
    relatedDrawers: ["talent-rate-card", "talent-portfolio"],
  },

  "talent-custom-domain": {
    audience: TALENT,
    category: "Premium",
    purpose:
      "Connect your own domain (yourname.com) to your personal page — Portfolio tier only.",
    youCanHere: [
      "Add a domain and see the DNS records",
      "Verify the domain and switch your page to it",
      "Configure SSL (auto-renewing)",
    ],
    relatedDrawers: ["talent-personal-page", "talent-tier-compare"],
    ticketCategory: "Public site & domains",
  },

  // ════════════════════════════════════════════════════════════════
  // Talent surface — Agency relationship
  // ════════════════════════════════════════════════════════════════

  "talent-agency-relationship": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "Your relationship with one agency — exclusivity status, commission, contract terms.",
    youCanHere: [
      "See contract start/end dates and renewal terms",
      "View commission percentages by job type",
      "Initiate a leave-agency flow if you want out",
    ],
    relatedDrawers: ["talent-leave-agency", "talent-multi-agency-picker"],
  },

  "talent-leave-agency": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "Initiate the process of leaving an agency — review notice periods, transfer rules, and final settlements.",
    youCanHere: [
      "See the contractual notice period",
      "Send formal notice to the agency",
      "Choose what happens to in-flight bookings",
    ],
    relatedDrawers: ["talent-agency-relationship"],
    ticketCategory: "Account & access",
    devNotes:
      "Triggers a 14-day mediation window before exclusivity formally ends. Both sides get an export of the relationship history.",
  },

  "talent-multi-agency-picker": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "If you work with multiple agencies, pick which one acts on a given inquiry or booking.",
    youCanHere: [
      "Set a default agency by job type or region",
      "Override on a single inquiry",
      "See which agency is currently default",
    ],
    relatedDrawers: ["talent-agency-relationship", "talent-conflict-resolve"],
  },

  "talent-conflict-resolve": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "Handle a conflict — two agencies offering competing dates, an agency missing a previously-set blockout, etc.",
    youCanHere: [
      "See the two requests side by side",
      "Pick one and notify the other with a reason",
      "Escalate to Tulala HQ if you need a mediator",
    ],
    relatedDrawers: ["talent-availability", "talent-multi-agency-picker"],
  },

  "talent-network": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "Other talent you collaborate with — a private network for swapping castings you can't take, recommendations, and shared bookings.",
    youCanHere: [
      "Invite other talent to your network",
      "Refer a casting you can't take to a peer (with optional referral fee)",
      "See bookings other talent have referred to you",
    ],
    relatedDrawers: ["talent-referrals"],
  },

  "talent-referrals": {
    audience: TALENT,
    category: "Agencies",
    purpose:
      "Your referral history and earnings — talent and brands you've sent to others, and what they've sent back.",
    youCanHere: [
      "Track open referrals and their status",
      "See referral earnings (paid and pending)",
      "Generate a personal referral link to share",
    ],
    relatedDrawers: ["talent-network", "talent-earnings-detail"],
  },

  // ════════════════════════════════════════════════════════════════
  // Talent surface — Settings & money
  // ════════════════════════════════════════════════════════════════

  "talent-notifications": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Your notification preferences as a talent — what you get pinged about and how.",
    youCanHere: [
      "Mute event types you don't care about",
      "Set quiet hours",
      "Pick instant, daily, or weekly delivery",
    ],
    relatedDrawers: ["notifications-prefs"],
  },

  "talent-privacy": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Who sees what — measurements, contact, social handles, agency-private info.",
    youCanHere: [
      "Set per-field visibility (public, agency only, private)",
      "Hide your profile from Tulala discovery",
      "Audit who has accessed sensitive data",
    ],
    relatedDrawers: ["talent-contact-preferences", "talent-emergency-contact", "audit-log"],
  },

  "talent-contact-preferences": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Who can contact you directly — by trust tier, agency relationship, or specific brand.",
    youCanHere: [
      "Allow direct contact only from Verified clients and up",
      "Whitelist specific agencies for direct outreach",
      "Block specific brands or competitors",
    ],
    relatedDrawers: ["talent-privacy"],
    devNotes:
      "Defaults are open-ish — talent must opt INTO restrictions. See client-trust-badges memory for how this maps to the trust ladder.",
  },

  "talent-payouts": {
    audience: TALENT,
    category: "Money",
    purpose:
      "Where your money goes — bank accounts, payment processors, payout schedule.",
    youCanHere: [
      "Add or remove a payout method",
      "Pick payout schedule (weekly, biweekly, on-demand)",
      "See pending and paid amounts",
    ],
    relatedDrawers: ["talent-earnings-detail", "talent-tax-docs"],
    ticketCategory: "Billing",
  },

  "talent-earnings-detail": {
    audience: TALENT,
    category: "Money",
    purpose:
      "Detailed earnings — every booking, what came in, what was deducted (commission, taxes, fees).",
    youCanHere: [
      "Filter by year, agency, or job type",
      "Export to CSV for your accountant",
      "See projected earnings from confirmed-but-unpaid bookings",
    ],
    relatedDrawers: ["talent-payouts", "talent-rate-card", "talent-tax-docs"],
  },

  "talent-tax-docs": {
    audience: TALENT,
    category: "Money",
    purpose:
      "Year-end tax documents — 1099, W-9, equivalents per region. Download once your earnings are finalized.",
    youCanHere: [
      "Download forms for the current and past tax years",
      "Update your tax info (W-9, equivalent)",
      "See which agencies have already submitted forms for you",
    ],
    relatedDrawers: ["talent-payouts", "talent-earnings-detail"],
    ticketCategory: "Billing",
  },

  "talent-verification": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Verify your identity to unlock direct-contact tiers and higher-trust badges.",
    youCanHere: [
      "Upload a government ID and a selfie",
      "See your current verification status",
      "Re-submit if a previous attempt was rejected",
    ],
    relatedDrawers: ["talent-privacy", "talent-documents"],
    ticketCategory: "Account & access",
  },

  "talent-voice-reply": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Record a quick voice reply instead of typing — useful when you're on the move.",
    youCanHere: [
      "Record up to 60 seconds of voice",
      "Auto-transcribe and edit before sending",
      "Pin frequently-used replies as voice templates",
    ],
    relatedDrawers: ["reply-templates"],
  },

  "talent-chat-archive": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Archived conversations — closed bookings, declined requests, dormant agency relationships.",
    youCanHere: [
      "Search past conversations by client, agency, or keyword",
      "Restore an archived chat back to active",
      "Export an archive thread for legal records",
    ],
    relatedDrawers: ["talent-closed-booking"],
  },

  // ════════════════════════════════════════════════════════════════
  // Client surface
  // ════════════════════════════════════════════════════════════════

  "client-today-pulse": {
    audience: CLIENT,
    category: "Today",
    purpose:
      "Your day at a glance as a client — open inquiries, pending offers, upcoming shoots.",
    youCanHere: [
      "Tap any item to jump into the inquiry or booking",
      "See call-times for shoots in the next 7 days",
      "Approve pending offers from this view",
    ],
    relatedDrawers: ["client-inquiry-detail", "client-booking-detail"],
  },

  "client-talent-card": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "Quick view of one talent — measurements, top photos, availability snapshot.",
    youCanHere: [
      "Save the talent to a shortlist",
      "Send an inquiry directly",
      "Open the full talent profile",
    ],
    relatedDrawers: ["client-shortlist-detail", "client-send-inquiry"],
  },

  "client-saved-search": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "Saved talent searches — filters you re-run often (eg 'female, 5'10+, US-based, runway').",
    youCanHere: [
      "Re-run a saved search with one tap",
      "Get notified when new talent match a saved search",
      "Edit or delete searches you no longer need",
    ],
    relatedDrawers: ["client-shortlist-detail"],
  },

  "client-shortlist-detail": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "A curated list of talent for a specific job — share with your team, send group inquiries, narrow down.",
    youCanHere: [
      "Add or remove talent",
      "Share the shortlist with your team or external collaborators",
      "Send a single inquiry to all talent on the list",
    ],
    relatedDrawers: ["client-new-shortlist", "client-share-shortlist", "client-send-inquiry"],
  },

  "client-new-shortlist": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "Create a new shortlist — usually one per project or casting brief.",
    youCanHere: [
      "Name the shortlist and set a brief",
      "Add talent now or later",
      "Choose who can see it (just you, your team, external)",
    ],
    relatedDrawers: ["client-shortlist-detail"],
  },

  "client-share-shortlist": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "Share a shortlist with someone outside Tulala — your client, your director, your stylist.",
    youCanHere: [
      "Get a shareable link with optional password",
      "Set an expiry date on the link",
      "Track who's viewed which talent",
    ],
    relatedDrawers: ["client-shortlist-detail"],
  },

  "client-send-inquiry": {
    audience: CLIENT,
    category: "Bookings",
    purpose:
      "Send an inquiry to one talent or a whole shortlist — kicks off the booking conversation.",
    youCanHere: [
      "Pick the talent (or a shortlist)",
      "Set dates, scope, usage, and budget",
      "Attach a creative brief or moodboard",
    ],
    relatedDrawers: ["client-shortlist-detail", "client-inquiry-detail"],
  },

  "client-inquiry-detail": {
    audience: CLIENT,
    category: "Bookings",
    purpose:
      "Your view of one inquiry — messages, offers, agency replies, status.",
    youCanHere: [
      "Reply to the agency in the public thread",
      "Approve or counter an offer",
      "Cancel the inquiry if your needs changed",
    ],
    relatedDrawers: ["client-counter-offer", "client-booking-detail"],
  },

  "client-counter-offer": {
    audience: CLIENT,
    category: "Bookings",
    purpose:
      "Counter the agency's offer with different terms — rate, dates, scope.",
    youCanHere: [
      "Edit any term and add a note explaining why",
      "Send the counter and wait for the agency's response",
      "Withdraw the counter if you change your mind",
    ],
    relatedDrawers: ["client-inquiry-detail"],
  },

  "client-booking-detail": {
    audience: CLIENT,
    category: "Bookings",
    purpose:
      "A confirmed booking — call-time, location, talent, contracts, payment.",
    youCanHere: [
      "See contracts and sign if needed",
      "Message the agency or talent team",
      "Pay the invoice if billing is enabled",
    ],
    relatedDrawers: ["client-contracts", "client-billing"],
  },

  "client-contracts": {
    audience: CLIENT,
    category: "Bookings",
    purpose:
      "Every contract you have with this agency — past, signed, and pending.",
    youCanHere: [
      "Sign a pending contract digitally",
      "Download a copy for your records",
      "Request changes before signing",
    ],
    relatedDrawers: ["client-booking-detail", "client-billing"],
    ticketCategory: "Bookings & inquiries",
  },

  "client-team": {
    audience: CLIENT,
    category: "Settings",
    purpose:
      "Other people on your client team — co-workers, agencies, freelancers — and what they can see.",
    youCanHere: [
      "Invite a teammate by email",
      "Set their role (admin, viewer, collaborator)",
      "Revoke access when projects end",
    ],
    relatedDrawers: ["client-settings"],
  },

  "client-billing": {
    audience: CLIENT,
    category: "Settings",
    purpose:
      "Invoices, payment methods, and payment history.",
    youCanHere: [
      "Add or update a payment method",
      "Pay an open invoice",
      "Download past invoices for your accounting",
    ],
    relatedDrawers: ["client-contracts", "client-booking-detail"],
    ticketCategory: "Billing",
  },

  "client-brand-switcher": {
    audience: CLIENT,
    category: "Settings",
    purpose:
      "If you work for multiple brands or agencies, switch between them without signing out.",
    youCanHere: [
      "See all brands you have access to",
      "Switch between them",
      "Set a default brand for new sessions",
    ],
    relatedDrawers: ["client-team"],
  },

  "client-settings": {
    audience: CLIENT,
    category: "Settings",
    purpose:
      "Your client account — name, email, password, notification preferences.",
    youCanHere: [
      "Update your contact info",
      "Change your password and 2FA settings",
      "Tune what you get notified about",
    ],
    relatedDrawers: ["notifications-prefs", "client-team"],
  },

  "client-quick-question": {
    audience: CLIENT,
    category: "Discovery",
    purpose:
      "Send a quick, no-strings-attached question to an agency or talent — before committing to a formal inquiry.",
    youCanHere: [
      "Ask about availability, fit, or rates",
      "Get a fast yes/no without filling out a brief",
      "Convert into a formal inquiry if it's a fit",
    ],
    relatedDrawers: ["client-send-inquiry"],
  },

  // ════════════════════════════════════════════════════════════════
  // Cross-cutting / shared
  // ════════════════════════════════════════════════════════════════

  "data-export": {
    audience: [W_ADMIN, TALENT, CLIENT],
    category: "Account",
    purpose:
      "Download an archive of your data — for backups, portability, or before you delete the account.",
    youCanHere: [
      "Pick a date range or export everything",
      "Choose which data types (bookings, messages, files)",
      "Get a download link by email when ready",
    ],
    relatedDrawers: ["danger-zone", "audit-log"],
    ticketCategory: "Account & access",
  },

  "audit-log": {
    audience: [W_ADMIN, TALENT, HQ],
    category: "Security",
    purpose:
      "Every consequential action on this account or workspace — who did what, when, from where.",
    youCanHere: [
      "Filter by user, action type, or IP",
      "Export a date-range slice for compliance",
      "Spot suspicious activity",
    ],
    relatedDrawers: ["team-activity", "data-export"],
  },

  "talent-share-card": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Share your talent profile via a clean link, embed code, or downloadable card.",
    youCanHere: [
      "Get a shareable link",
      "Generate a QR code for print",
      "Download a vCard for contacts",
    ],
    relatedDrawers: ["talent-personal-page", "talent-public-preview"],
  },

  "whats-new": {
    audience: [W_ADMIN, W_COORD, TALENT, CLIENT],
    category: "Help",
    purpose:
      "Recent product updates, feature launches, and changes you should know about.",
    youCanHere: [
      "Read the changelog with screenshots",
      "Watch demo clips for new features",
      "Follow links to deep-dive articles",
    ],
    relatedDrawers: ["help"],
  },

  help: {
    audience: [W_ADMIN, W_COORD, TALENT, CLIENT],
    category: "Help",
    purpose:
      "The help hub — search articles, browse by topic, contact support, submit a ticket.",
    youCanHere: [
      "Search the documentation",
      "Browse articles by surface (admin, talent, client)",
      "Open a chat with support",
      "Submit a ticket for issues that need a human",
    ],
    relatedDrawers: ["whats-new"],
    ticketCategory: "General",
  },

  // ════════════════════════════════════════════════════════════════
  // Payments / payouts
  // ════════════════════════════════════════════════════════════════

  "payments-setup": {
    audience: W_ADMIN,
    category: "Money",
    purpose:
      "Connect your workspace to a payments processor — Stripe, Wise, Mercury — so you can receive client payments.",
    youCanHere: [
      "Connect a processor",
      "Set default fees and processing rules",
      "Test the flow with a sandbox transaction",
    ],
    relatedDrawers: ["plan-billing", "payout-receiver-picker"],
    ticketCategory: "Billing",
  },

  "payout-receiver-picker": {
    audience: W_ADMIN,
    category: "Money",
    purpose:
      "Pick who receives payment for a booking — agency, talent direct, or split.",
    youCanHere: [
      "Set the default receiver per talent",
      "Override on a per-booking basis",
      "Configure splits (eg 80/20 with a partner agency)",
    ],
    relatedDrawers: ["payments-setup"],
  },

  "payment-detail": {
    audience: [W_ADMIN, TALENT, CLIENT],
    category: "Money",
    purpose:
      "Detail of a single payment — amount, fees, tax, receiver, status.",
    youCanHere: [
      "See line-items and fee breakdown",
      "Download the receipt or invoice",
      "Open a dispute if something is wrong",
    ],
    relatedDrawers: ["client-billing", "talent-payouts"],
    ticketCategory: "Billing",
  },

  // ════════════════════════════════════════════════════════════════
  // Platform / HQ surface (Tulala internal team only)
  // ════════════════════════════════════════════════════════════════

  "platform-today-pulse": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Cross-tenant pulse — incidents open, tickets in queue, billing failures, today's high-impact tenants.",
    youCanHere: [
      "Triage incidents by severity",
      "Jump into any tenant from a row",
      "See which platform jobs are running or stuck",
    ],
    relatedDrawers: ["platform-incident", "platform-system-job", "platform-support-ticket"],
  },

  "platform-tenant-detail": {
    audience: HQ,
    category: "HQ",
    purpose:
      "One tenant's full record — plan, MRR, usage, key staff, recent activity.",
    youCanHere: [
      "Impersonate to see what they see",
      "Override the plan or extend a trial",
      "Suspend the tenant for billing or abuse",
    ],
    relatedDrawers: ["platform-tenant-impersonate", "platform-tenant-plan-override", "platform-tenant-suspend"],
  },

  "platform-tenant-impersonate": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Sign in as a tenant admin (with their consent) to debug an issue.",
    youCanHere: [
      "Start an impersonation session (logged + time-boxed)",
      "End the session manually or wait for auto-expiry",
      "See what actions HQ took during the session",
    ],
    relatedDrawers: ["platform-tenant-detail", "audit-log"],
    devNotes:
      "Always logged. Tenant admin gets an email at session start AND end. Sessions auto-expire at 60 min.",
  },

  "platform-tenant-suspend": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Suspend a tenant — billing failure, terms violation, security incident.",
    youCanHere: [
      "Pick a reason and severity (read-only, full lockout, deletion)",
      "Set an auto-unsuspend date if appropriate",
      "Notify the tenant or stay silent (security cases)",
    ],
    relatedDrawers: ["platform-tenant-detail"],
  },

  "platform-tenant-plan-override": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Manually override a tenant's plan — bumps, comps, custom enterprise terms.",
    youCanHere: [
      "Bump to a higher tier with custom pricing",
      "Apply a discount or credit",
      "Set an override expiry so it auto-reverts",
    ],
    relatedDrawers: ["platform-tenant-detail", "platform-billing-invoice"],
  },

  "platform-user-detail": {
    audience: HQ,
    category: "HQ",
    purpose:
      "One end-user's record — across tenants, surfaces, devices, sessions.",
    youCanHere: [
      "See every workspace they're in",
      "Force a password reset",
      "Merge with a duplicate account",
    ],
    relatedDrawers: ["platform-user-merge", "platform-user-reset"],
  },

  "platform-user-merge": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Merge two user records — same person signed up twice with different emails.",
    youCanHere: [
      "Pick the surviving record",
      "Preview what gets transferred (memberships, history)",
      "Run the merge (irreversible — confirm twice)",
    ],
    relatedDrawers: ["platform-user-detail"],
  },

  "platform-user-reset": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Force-reset a user's password or 2FA.",
    youCanHere: [
      "Send a password reset email",
      "Clear 2FA if they lost their device",
      "Flag the account for re-verification",
    ],
    relatedDrawers: ["platform-user-detail"],
  },

  "platform-hub-submission": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Tenant has applied to a hub — review their roster fit before approving.",
    youCanHere: [
      "See applicant tenant's profile and sample talent",
      "Approve, reject, or request changes",
      "Leave HQ-internal notes on the decision",
    ],
    relatedDrawers: ["platform-hub-rules", "hub-distribution"],
  },

  "platform-hub-rules": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Curation rules per hub — minimum bar, eligibility filters, exclusivity terms.",
    youCanHere: [
      "Tune eligibility filters",
      "Update the application form questions",
      "Pause new applications during a backlog",
    ],
    relatedDrawers: ["platform-hub-submission"],
  },

  "platform-billing-invoice": {
    audience: HQ,
    category: "HQ",
    purpose:
      "One invoice across the platform — tenant, line items, payment status.",
    youCanHere: [
      "Issue a refund (full or partial)",
      "Mark as paid manually if processed offline",
      "Resend the invoice email",
    ],
    relatedDrawers: ["platform-refund", "platform-tenant-detail"],
  },

  "platform-refund": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Refund a charge — partial or full — with required reason and audit trail.",
    youCanHere: [
      "Pick the charge and refund amount",
      "Choose a reason category (used for finance reporting)",
      "Notify the tenant or refund silently",
    ],
    relatedDrawers: ["platform-billing-invoice"],
  },

  "platform-dunning": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Tenants in dunning — failed charges, retry schedules, suspension countdowns.",
    youCanHere: [
      "See the retry schedule for each failure",
      "Manually retry a charge",
      "Comp a tenant for a stuck failure",
    ],
    relatedDrawers: ["platform-billing-invoice", "platform-tenant-suspend"],
  },

  "platform-feature-flag": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Toggle features per tenant or globally — staged rollouts, beta access, kill switches.",
    youCanHere: [
      "Flip a flag for one tenant or a percentage rollout",
      "See who's currently in/out of each flag",
      "Schedule a flag to flip on a future date",
    ],
    relatedDrawers: ["platform-tenant-detail"],
  },

  "platform-moderation-item": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Content flagged for moderation — inappropriate photos, suspicious profiles, abusive messages.",
    youCanHere: [
      "Approve, reject, or request changes",
      "Take down content with a reason sent to the user",
      "Escalate to legal for serious cases",
    ],
    relatedDrawers: ["platform-user-detail", "audit-log"],
  },

  "platform-system-job": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Background jobs — exports, migrations, daily aggregations. See progress and retry failures.",
    youCanHere: [
      "Filter by job type or status",
      "Retry a failed job",
      "Cancel a stuck job",
    ],
    relatedDrawers: ["platform-incident"],
  },

  "platform-incident": {
    audience: HQ,
    category: "HQ",
    purpose:
      "A live or past incident — what broke, when, how it was resolved.",
    youCanHere: [
      "Update status (investigating, identified, monitoring, resolved)",
      "Post updates that go to the public status page",
      "Link the postmortem doc",
    ],
    relatedDrawers: ["platform-system-job", "platform-support-ticket"],
  },

  "platform-support-ticket": {
    audience: HQ,
    category: "HQ",
    purpose:
      "A support ticket from a tenant or end-user — the queue HQ works through daily.",
    youCanHere: [
      "Assign the ticket to a teammate",
      "Reply to the user (template or freeform)",
      "Link related tickets or known incidents",
      "Close with a resolution category",
    ],
    relatedDrawers: ["platform-tenant-detail", "platform-incident"],
  },

  "platform-audit-export": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Generate a compliance-grade audit export — for legal, security reviews, or tenant requests.",
    youCanHere: [
      "Pick a tenant or scope to all platform",
      "Select a date range and event types",
      "Download a signed, hashed archive",
    ],
    relatedDrawers: ["audit-log"],
  },

  "platform-hq-team": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Tulala HQ staff and their roles, permissions, and on-call schedules.",
    youCanHere: [
      "Add or remove HQ staff",
      "Set roles (engineering, support, ops, finance)",
      "Manage on-call rotation",
    ],
    relatedDrawers: ["platform-incident"],
  },

  "platform-region-config": {
    audience: HQ,
    category: "HQ",
    purpose:
      "Per-region settings — currencies, tax rules, available payment processors, content moderation rules.",
    youCanHere: [
      "Add or edit a region",
      "Set legal text per region",
      "Toggle features region-by-region",
    ],
    relatedDrawers: ["platform-feature-flag"],
  },

  // ════════════════════════════════════════════════════════════════
  // Trust & identity (WS-5)
  // ════════════════════════════════════════════════════════════════

  "client-trust-detail": {
    audience: [W_ADMIN, W_COORD],
    category: "Money",
    purpose:
      "Client trust tier — Basic through Gold — based on identity verification and funded-account signals.",
    youCanHere: [
      "See which tier the client is on and what each tier unlocks",
      "Understand what verification steps are still outstanding",
      "Trigger a manual review or override for edge cases",
    ],
    relatedDrawers: ["kyc-verification", "proof-of-funds", "payment-detail"],
    ticketCategory: "Trust & Safety",
  },

  "escrow-detail": {
    audience: [W_ADMIN, W_COORD, CLIENT],
    category: "Money",
    purpose:
      "Escrow hold for a booking — Authorized → Held → Released lifecycle view.",
    youCanHere: [
      "See the current escrow state and unlock conditions",
      "Review the funds release schedule",
      "Raise a dispute before release if something is wrong",
    ],
    relatedDrawers: ["payment-detail", "refund-flow", "dispute-flow"],
    ticketCategory: "Billing",
  },

  "refund-flow": {
    audience: [W_ADMIN, CLIENT],
    category: "Money",
    purpose:
      "Issue a refund for a booking payment — full or partial — with a required reason.",
    youCanHere: [
      "Select a refund reason for finance reporting",
      "Choose full refund or enter a partial amount",
      "See how long the credit takes to appear",
    ],
    relatedDrawers: ["payment-detail", "escrow-detail", "dispute-flow"],
    ticketCategory: "Billing",
  },

  "dispute-flow": {
    audience: [W_ADMIN, CLIENT, TALENT],
    category: "Money",
    purpose:
      "Open a formal dispute for a payment or delivery issue — structured wizard with evidence upload.",
    youCanHere: [
      "Pick the dispute type (non-delivery, quality, unauthorised charge, other)",
      "Attach evidence (messages, photos, documents)",
      "Review your submission before final confirm",
    ],
    relatedDrawers: ["refund-flow", "escrow-detail", "payment-detail"],
    ticketCategory: "Trust & Safety",
  },

  "kyc-verification": {
    audience: [W_ADMIN, CLIENT, TALENT],
    category: "Money",
    purpose:
      "Identity verification — photo ID + selfie — required to unlock higher trust tiers and payment limits.",
    youCanHere: [
      "Start the verification flow",
      "See which step is pending (ID, selfie, review)",
      "Check verification status after submission",
    ],
    relatedDrawers: ["client-trust-detail", "proof-of-funds"],
    ticketCategory: "Trust & Safety",
  },

  "proof-of-funds": {
    audience: [W_ADMIN, CLIENT],
    category: "Money",
    purpose:
      "Verify a funded account — bank link or wire — to reach Silver or Gold trust tier.",
    youCanHere: [
      "Link a bank account via Plaid for instant verification",
      "Alternatively upload a bank statement for manual review",
      "See verification status and expected timeline",
    ],
    relatedDrawers: ["client-trust-detail", "kyc-verification"],
    ticketCategory: "Billing",
  },

  "payout-method-failure": {
    audience: [W_ADMIN, TALENT],
    category: "Money",
    purpose:
      "Your payout method failed — see the reason and follow guided recovery steps.",
    youCanHere: [
      "Read the specific failure reason code",
      "Update or replace the payout method",
      "Retry the failed payout once the method is fixed",
    ],
    relatedDrawers: ["payment-detail", "payout-receiver-picker"],
    ticketCategory: "Billing",
  },

  // ════════════════════════════════════════════════════════════════
  // Subscriptions (WS-5)
  // ════════════════════════════════════════════════════════════════

  "subscription-lifecycle": {
    audience: [W_ADMIN, TALENT],
    category: "Money",
    purpose:
      "Full subscription lifecycle — trial, active, paused, grace period, and cancelled states.",
    youCanHere: [
      "See the current phase and what changes next",
      "Pause or cancel an active subscription",
      "Reactivate from grace-period or cancelled state",
    ],
    relatedDrawers: ["plan-billing", "payment-detail"],
    ticketCategory: "Billing",
  },

  // ════════════════════════════════════════════════════════════════
  // Notifications (WS-11)
  // ════════════════════════════════════════════════════════════════

  "notification-detail": {
    audience: [W_ADMIN, W_COORD, TALENT, CLIENT],
    category: "Notifications",
    purpose:
      "Full detail of a single notification — what happened, who triggered it, and what action is needed.",
    youCanHere: [
      "Read the full notification body",
      "Jump to the related booking, inquiry, or thread",
      "Mark as read or dismiss",
    ],
    relatedDrawers: ["inquiry-peek", "booking-peek"],
  },

  // ════════════════════════════════════════════════════════════════
  // AI assist (WS-18)
  // ════════════════════════════════════════════════════════════════

  "ai-draft-assist": {
    audience: [W_ADMIN, W_COORD],
    category: "AI",
    purpose:
      "AI-generated message drafts — describe what you want to say and get a polished draft.",
    youCanHere: [
      "Enter a prompt and generate a draft",
      "Edit the draft inline before using it",
      "Insert directly into the active message composer",
    ],
    relatedDrawers: ["inquiry-workspace"],
  },

  "ai-search-explain": {
    audience: [W_ADMIN, W_COORD, CLIENT],
    category: "AI",
    purpose:
      "See how the AI interpreted your search query and which filters were applied.",
    youCanHere: [
      "Review extracted keywords and inferred criteria",
      "See total result count from this interpretation",
      "Understand why certain results appeared (or didn't)",
    ],
    relatedDrawers: [],
  },
};

// ─── Public API ──────────────────────────────────────────────────────

/** Look up help for a drawer. Returns null if no entry exists yet. */
export function getHelp(id: DrawerId | null | undefined): HelpEntry | null {
  if (!id) return null;
  return DRAWER_HELP[id] ?? null;
}

/** Has a non-null entry in the registry. */
export function hasHelp(id: DrawerId | null | undefined): boolean {
  return !!getHelp(id);
}

/**
 * "You haven't opened help here yet" indicator — persisted to
 * localStorage so users don't see the pulse re-appear on every page
 * reload (just on truly-new drawers).
 *
 * Implementation:
 *  - Module-level cache lazily hydrated from localStorage on first
 *    client read.
 *  - Falls back to in-memory Set if storage is unavailable (Safari
 *    private mode, SSR, sandboxed iframes).
 *  - We only mark a drawer "seen" when the user actually clicks the
 *    ⓘ button — passive drawer opens don't count, since the help
 *    panel is what we're hinting at.
 *  - Storage key is versioned so we can invalidate later if entries
 *    materially change.
 */
const HELP_SEEN_STORAGE_KEY = "tulala-help-seen-v1";
let SEEN_CACHE: Set<DrawerId> | null = null;

function getSeenSet(): Set<DrawerId> {
  if (SEEN_CACHE) return SEEN_CACHE;
  if (typeof window === "undefined") {
    // SSR or non-browser context — return ephemeral set; will be
    // replaced on first client-side call.
    return new Set();
  }
  try {
    const raw = window.localStorage.getItem(HELP_SEEN_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        SEEN_CACHE = new Set(parsed as DrawerId[]);
        return SEEN_CACHE;
      }
    }
  } catch {
    // Storage disabled or quota exceeded — fall through to fresh set.
  }
  SEEN_CACHE = new Set();
  return SEEN_CACHE;
}

function persistSeen(set: Set<DrawerId>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HELP_SEEN_STORAGE_KEY, JSON.stringify([...set]));
  } catch {
    // Best-effort. If storage write fails, the in-memory cache still
    // honors the user's actions for this session.
  }
}

export function hasOpenedHelp(id: DrawerId | null | undefined): boolean {
  if (!id) return false;
  return getSeenSet().has(id);
}

export function markHelpOpened(id: DrawerId | null | undefined): void {
  if (!id) return;
  const set = getSeenSet();
  if (set.has(id)) return;
  set.add(id);
  persistSeen(set);
}

/**
 * Test/dev escape hatch — wipe the "seen help" memory so the indicator
 * re-pulses for QA. Exposed for future settings → "reset onboarding"
 * menu, and as a console helper during prototyping.
 */
export function resetSeenHelp(): void {
  SEEN_CACHE = new Set();
  if (typeof window !== "undefined") {
    try { window.localStorage.removeItem(HELP_SEEN_STORAGE_KEY); } catch {}
  }
}

// ─── Help-content feedback (thumbs up / down) ─────────────────────
//
// Lightweight per-drawer feedback so we know which entries need
// rewriting. Persists locally for now; future hook will POST to an
// analytics endpoint so the docs/support team can prioritize.

export type HelpFeedback = "up" | "down";
const HELP_FEEDBACK_STORAGE_KEY = "tulala-help-feedback-v1";
let FEEDBACK_CACHE: Record<string, HelpFeedback> | null = null;

function getFeedbackMap(): Record<string, HelpFeedback> {
  if (FEEDBACK_CACHE) return FEEDBACK_CACHE;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(HELP_FEEDBACK_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        FEEDBACK_CACHE = parsed as Record<string, HelpFeedback>;
        return FEEDBACK_CACHE;
      }
    }
  } catch {}
  FEEDBACK_CACHE = {};
  return FEEDBACK_CACHE;
}

export function getHelpFeedback(id: DrawerId | null | undefined): HelpFeedback | null {
  if (!id) return null;
  return getFeedbackMap()[id] ?? null;
}

export function setHelpFeedback(id: DrawerId, value: HelpFeedback): void {
  const map = getFeedbackMap();
  map[id] = value;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(HELP_FEEDBACK_STORAGE_KEY, JSON.stringify(map));
    } catch {}
  }
  // Future hook: POST {drawerId, value} to /api/help-feedback
}

/** Format a DrawerId into a human label. Mirrors drawerIdToLabel
 * in _primitives.tsx so chips read consistently. */
export function drawerLabel(id: DrawerId): string {
  return id
    .split("-")
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// ─── Help panel UI ───────────────────────────────────────────────────

/**
 * The slide-down help panel rendered inside DrawerShell when the user
 * toggles the ⓘ button. Keeps a stable layout (no jumpy reflow) by
 * always rendering and toggling height + opacity.
 */
export function HelpPanel({
  drawerId,
  open,
  onJumpTo,
  panelId,
}: {
  drawerId: DrawerId | null;
  open: boolean;
  onJumpTo: (id: DrawerId) => void;
  /** DOM id used by the toolbar ⓘ button's aria-controls. */
  panelId: string;
}) {
  const entry = getHelp(drawerId);

  // Mount/unmount nicely — keep panel in DOM during open=true so the
  // collapse transition can run, then unmount when fully closed.
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) setMounted(true);
    else {
      const t = window.setTimeout(() => setMounted(false), 240);
      return () => window.clearTimeout(t);
    }
  }, [open]);

  if (!mounted || !entry) return null;

  const audiences = (Array.isArray(entry.audience) ? entry.audience : [entry.audience]).filter(Boolean);
  // Defensive: every entry should have ≥1 audience, but if a future
  // entry slips in with [], fall back to a workspace tint.
  const audienceColor = audiences.length > 0 ? audienceTint(audiences[0]!) : audienceTint("Workspace admin");

  // Honor prefers-reduced-motion: snap-toggle the panel instead of
  // animating, and disable the pulse keyframe (handled in the icon
  // button via a media query inside its <style>).
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  return (
    <div
      id={panelId}
      // `inert` removes the panel from focus order AND the a11y tree
      // when collapsed — stronger than aria-hidden alone. Some
      // browsers still let focus land on aria-hidden elements; inert
      // is the proper fix. (`@ts-ignore` not needed — React 19 types
      // include it.)
      inert={!open ? true : undefined}
      role="region"
      aria-label="About this view"
      aria-hidden={!open}
      data-tulala-drawer-help-panel="true"
      style={{
        // Grid-rows trick: animates between 0fr (collapsed) and 1fr
        // (auto-content-height) smoothly. Max-height fixed to 1200
        // would run past the actual content in 260ms regardless of
        // size — this animates against the real height every time.
        // Supported: Chrome 117+, Safari 16+, Firefox 119+.
        display: "grid",
        gridTemplateRows: open ? "1fr" : "0fr",
        opacity: open ? 1 : 0,
        transition: prefersReducedMotion
          ? "none"
          : "grid-template-rows 260ms cubic-bezier(.4,0,.2,1), opacity 200ms ease, border-color 200ms ease",
        borderTop: `1px solid ${open ? COLORS.borderSoft : "transparent"}`,
        borderBottom: `1px solid ${open ? COLORS.borderSoft : "transparent"}`,
        background: "linear-gradient(180deg, rgba(244,239,231,0.55) 0%, rgba(244,239,231,0.25) 100%)",
      }}
    >
      <div
        style={{
          // The grid child needs minHeight:0 + overflow:hidden so the
          // 0fr→1fr transition doesn't leak content during collapse.
          minHeight: 0,
          overflow: "hidden",
          // Horizontal 22px matches DrawerShell's body padding so the
          // help text aligns with the form fields below it.
          padding: "16px 22px 18px",
          fontFamily: FONTS.body,
        }}
      >
        {/* Eyebrow row — audience + category */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            marginBottom: 10,
            flexWrap: "wrap",
          }}
        >
          {audiences.map((a) => (
            <span
              key={a}
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                padding: "3px 8px",
                borderRadius: 999,
                background: audienceTint(a).bg,
                color: audienceTint(a).fg,
              }}
            >
              {a}
            </span>
          ))}
          <span
            style={{
              fontSize: 11,
              color: COLORS.inkMuted,
              fontWeight: 500,
              letterSpacing: 0.3,
            }}
          >
            · {entry.category}
          </span>
        </div>

        {/* Purpose */}
        <p
          style={{
            margin: 0,
            fontSize: 14,
            lineHeight: 1.55,
            color: COLORS.ink,
            fontWeight: 450,
          }}
        >
          {entry.purpose}
        </p>

        {/* What you can do here — gated on at least one bullet so a
            terse entry doesn't render an empty heading. */}
        {entry.youCanHere.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <h4
            style={{
              margin: "0 0 6px",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              color: COLORS.inkMuted,
            }}
          >
            What you can do here
          </h4>
          <ul
            style={{
              margin: 0,
              padding: 0,
              listStyle: "none",
              display: "flex",
              flexDirection: "column",
              gap: 4,
            }}
          >
            {entry.youCanHere.map((line, i) => (
              <li
                key={i}
                style={{
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: COLORS.ink,
                  paddingLeft: 16,
                  position: "relative",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: 4,
                    top: 9,
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: audienceColor.fg,
                  }}
                />
                {line}
              </li>
            ))}
          </ul>
        </div>
        )}

        {/* Related drawers */}
        {entry.relatedDrawers && entry.relatedDrawers.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <h4
              style={{
                margin: "0 0 6px",
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 0.5,
                textTransform: "uppercase",
                color: COLORS.inkMuted,
              }}
            >
              Related views
            </h4>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {entry.relatedDrawers.map((rel) => (
                <button
                  key={rel}
                  type="button"
                  onClick={() => onJumpTo(rel)}
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    padding: "5px 10px",
                    borderRadius: 999,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: "#fff",
                    color: COLORS.ink,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    transition: "border-color .12s, background .12s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.background = "rgba(11,11,13,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.borderSoft;
                    e.currentTarget.style.background = "#fff";
                  }}
                >
                  {drawerLabel(rel)}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Was-this-helpful — collects per-drawer feedback so the docs
            team knows which entries need rewriting. Persisted locally;
            future hook POSTs to analytics. */}
        <FeedbackRow drawerId={drawerId} />

        {/* Footer — support / chat / ticket entry points (placeholders
            for future wiring; rendered now so the layout is stable
            once those features land). */}
        <FooterActions entry={entry} drawerId={drawerId} />
      </div>
    </div>
  );
}

// "Was this helpful?" row. Quietly collects feedback per drawer so we
// can prioritize content rewrites. Once the user votes, the row
// switches to a thank-you state with an "Undo" link in case of
// fat-finger.
function FeedbackRow({ drawerId }: { drawerId: DrawerId | null }) {
  const proto = useProto();
  const [vote, setVote] = useState<HelpFeedback | null>(() =>
    getHelpFeedback(drawerId),
  );
  // Re-sync when the drawer changes (panel can stay mounted across
  // related-drawer jumps).
  useEffect(() => {
    setVote(getHelpFeedback(drawerId));
  }, [drawerId]);

  if (!drawerId) return null;

  const submit = (v: HelpFeedback) => {
    // Guard against rapid double-click: if a vote already exists,
    // ignore further clicks until Undo is pressed. Prevents the toast
    // queue from filling up if the button is mashed.
    if (vote) return;
    setHelpFeedback(drawerId, v);
    setVote(v);
    proto.toast(
      v === "up" ? "Thanks — glad this helped." : "Thanks — we'll improve this view.",
      {
        action: {
          label: "Undo",
          onClick: () => {
            // Clear the entry so the row re-prompts.
            const map = getFeedbackMap();
            delete map[drawerId];
            if (typeof window !== "undefined") {
              try {
                window.localStorage.setItem(
                  HELP_FEEDBACK_STORAGE_KEY,
                  JSON.stringify(map),
                );
              } catch {}
            }
            setVote(null);
          },
        },
      },
    );
  };

  const sharedBtn = {
    background: "transparent",
    border: `1px solid ${COLORS.borderSoft}`,
    width: 28,
    height: 24,
    borderRadius: 6,
    cursor: "pointer",
    color: COLORS.inkMuted,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background .12s, color .12s, border-color .12s",
    fontFamily: FONTS.body,
  } as const;

  if (vote) {
    return (
      <div
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: `1px dashed ${COLORS.borderSoft}`,
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          color: COLORS.inkMuted,
          fontFamily: FONTS.body,
        }}
      >
        <span aria-hidden style={{ fontSize: 13 }}>
          {vote === "up" ? "✓" : "✦"}
        </span>
        <span>
          {vote === "up"
            ? "Thanks — feedback saved."
            : "Thanks — we'll revisit this view's help."}
        </span>
      </div>
    );
  }

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: `1px dashed ${COLORS.borderSoft}`,
        display: "flex",
        alignItems: "center",
        gap: 10,
        fontSize: 12,
        color: COLORS.inkMuted,
        fontFamily: FONTS.body,
      }}
    >
      <span>Was this helpful?</span>
      <div style={{ display: "inline-flex", gap: 6 }}>
        <button
          type="button"
          aria-label="Yes, this was helpful"
          onClick={() => submit("up")}
          style={sharedBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.brand;
            e.currentTarget.style.background = COLORS.brandSoft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.borderSoft;
            e.currentTarget.style.color = COLORS.inkMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 11v9H4a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h3z" />
            <path d="M7 11l4-7a2 2 0 0 1 4 0v5h5a2 2 0 0 1 2 2.3l-1.5 7A2 2 0 0 1 18.5 20H7" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="No, this could be better"
          onClick={() => submit("down")}
          style={sharedBtn}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = COLORS.border;
            e.currentTarget.style.color = COLORS.coral;
            e.currentTarget.style.background = COLORS.coralSoft;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = COLORS.borderSoft;
            e.currentTarget.style.color = COLORS.inkMuted;
            e.currentTarget.style.background = "transparent";
          }}
        >
          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 13V4h3a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-3z" />
            <path d="M17 13l-4 7a2 2 0 0 1-4 0v-5H4a2 2 0 0 1-2-2.3L3.5 5.7A2 2 0 0 1 5.5 4H17" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// Small renderer for the footer support links. Split for readability.
function FooterActions({
  entry,
  drawerId,
}: {
  entry: HelpEntry;
  drawerId: DrawerId | null;
}) {
  const proto = useProto();
  if (!drawerId) return null;
  const slug = entry.supportSlug ?? drawerId;

  const linkBtnStyle = {
    background: "transparent",
    border: "none",
    padding: 0,
    color: COLORS.inkMuted,
    cursor: "pointer",
    fontSize: 12,
    fontWeight: 500,
    fontFamily: FONTS.body,
    textAlign: "left" as const,
  };

  return (
    <div
      style={{
        marginTop: 12,
        // No divider here — FeedbackRow above already drew a dashed
        // line for this whole "drawer-meta" footer block. Stacking
        // two horizontal rules created visual noise.
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        fontSize: 12,
        color: COLORS.inkMuted,
        alignItems: "center",
      }}
    >
      <button
        type="button"
        onClick={() =>
          proto.toast(`Support article "/support/${slug}" — coming soon.`)
        }
        style={linkBtnStyle}
        onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
        onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
      >
        {/* No ↗ until the actual /support/<slug> route exists. The
            arrow on a button that just toasts felt like a 404 every
            time you clicked it. Add ↗ back when wired live. */}
        Full guide
        <span style={{ marginLeft: 4, opacity: 0.55, fontSize: 10.5 }}>(soon)</span>
      </button>
      <Fragment>
        <span aria-hidden style={{ opacity: 0.4 }}>·</span>
        <button
          type="button"
          onClick={() =>
            proto.toast(
              `Chat with support — coming soon. We'll pre-load context for "${drawerId}".`,
              {
                action: {
                  label: "Open help drawer",
                  onClick: () => proto.openDrawer("help"),
                },
              },
            )
          }
          style={linkBtnStyle}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
        >
          Ask a question
        </button>
      </Fragment>
      {entry.ticketCategory && (
        <Fragment>
          <span aria-hidden style={{ opacity: 0.4 }}>·</span>
          <button
            type="button"
            onClick={() =>
              proto.toast(
                `Ticket form — coming soon. We'll pre-fill category "${entry.ticketCategory}".`,
                {
                  action: {
                    label: "Open help drawer",
                    onClick: () => proto.openDrawer("help"),
                  },
                },
              )
            }
            style={linkBtnStyle}
            onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
            onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
          >
            Submit a ticket
          </button>
        </Fragment>
      )}
    </div>
  );
}

// Audience → tint. Pulls from the project's semantic color tokens
// (see _state.tsx COLORS) so we stay aligned with the rest of the
// design system. Per feedback_admin_aesthetics.md, gold/rust earth-
// tones are explicitly avoided.
//
//   Workspace  → neutral ink (no hue — the "default" surface)
//   Talent     → brand forest (talent IS the product surface)
//   Client     → indigo (informational/external)
//   Tulala HQ  → critical (internal-only / elevated permissions)
function audienceTint(a: Audience): { bg: string; fg: string } {
  switch (a) {
    case "Workspace admin":
    case "Workspace coordinator":
    case "Workspace editor":
      return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink };
    case "Talent":
      return { bg: COLORS.brandSoft, fg: COLORS.brandDeep };
    case "Client":
      return { bg: COLORS.indigoSoft, fg: COLORS.indigoDeep };
    case "Tulala HQ":
      return { bg: COLORS.criticalSoft, fg: COLORS.criticalDeep };
    default:
      return { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink };
  }
}

