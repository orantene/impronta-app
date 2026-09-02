/**
 * Drawer help registry data. Kept free of `"use client"` so server modules
 * (support AI corpus) can import it without pulling the HelpPanel island.
 */
import type { DrawerId } from "./state/drawer-ids";

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
      "Single sheet for one inquiry. Clients ask questions, you negotiate, talent confirms, all in one place.",
    youCanHere: [
      "Reply in the client thread (visible to client + talent)",
      "Coordinate privately with talent (the client never sees this)",
      "Send offers and watch for client approval",
      "Track funded escrow and convert to a confirmed booking",
      "See the full event timeline: every reply, offer, status change",
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
      "Manually create an inquiry, usually for clients who reached out via WhatsApp or email and you want them tracked inside Tulala.",
    youCanHere: [
      "Add the client (existing or new) and the talent involved",
      "Set the date(s), shoot type, and budget range",
      "Choose initial status, usually Draft if you're still negotiating",
      "Email the client a Tulala link so they can take over from there",
    ],
    relatedDrawers: ["pipeline", "inquiry-workspace", "client-list"],
    ticketCategory: "Bookings & inquiries",
  },

  "booking-peek": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Read-only summary of one confirmed booking (call-time, talent, contracts, payment status) without leaving the page you're on.",
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
    relatedDrawers: ["confirmed-bookings", "new-inquiry"],
    ticketCategory: "Bookings & inquiries",
  },

  "today-pulse": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "What needs your attention right now: overdue replies, expiring offers, today's call-times, unresolved holds.",
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
    relatedDrawers: ["new-booking", "today-pulse"],
  },

  "archived-work": {
    audience: [W_ADMIN, W_COORD],
    category: "Operations",
    purpose:
      "Cancelled, expired, and completed work, your historical record.",
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
      "Everything happening on a single calendar day: bookings, holds, blockouts, talent availability.",
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
      "Talent requesting to join your roster, claims to existing profiles or fresh sign-ups.",
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
      "The agency-side view of one talent: measurements, rates, availability, internal notes the talent never sees.",
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
        a: "On Studio and Agency plans, yes: adding a talent auto-assigns exclusivity. On Free plan, talents stay non-exclusive (the friend-link case). You can always change this later from the talent's profile.",
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
      "Read-only snapshot of your workspace's plan, usage, and settings, for sharing with finance or legal.",
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
      "First-time setup wizard for your public storefront: domain, branding, and the talent who'll show up first.",
    youCanHere: [
      "Pick a tulala.app subdomain or connect a custom one",
      "Upload logo and pick brand colors",
      "Choose which talent appear on the public roster",
    ],
    relatedDrawers: ["domain", "branding", "homepage"],
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
      "Managers, editors, and other admins on your workspace, and what each can do.",
    youCanHere: [
      "Invite teammates by email",
      "Assign roles (admin, manager, editor)",
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
    relatedDrawers: ["domain", "homepage"],
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
      "Legal entity, billing address, and tax info, used on invoices and contracts.",
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
      "Workspace-wide defaults: currency, locale, weekly schedule, notification rules.",
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
      "Irreversible workspace operations: exporting everything, transferring ownership, deleting the workspace.",
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
      "Your onboarding progress: the steps that turn a fresh workspace into a live, bookable storefront.",
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
      "Edit your public storefront homepage, the first thing visitors see at yoursite.tulala.app.",
    youCanHere: [
      "Reorder hero, talent grid, and any custom sections",
      "Drop in widgets (booking form, featured talent, press logos)",
      "Preview on desktop, tablet, and mobile before publishing",
    ],
    relatedDrawers: ["pages", "widgets"],
  },

  pages: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Static pages on your storefront: About, Press, Contact, Terms, etc.",
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
      "Editorial posts: campaign roundups, talent spotlights, agency news.",
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
      "Every image, video, and file uploaded across your workspace, central library.",
    youCanHere: [
      "Upload new media (drag-and-drop, bulk OK)",
      "Search and tag assets so others on the team can find them",
      "Replace an image everywhere it's used in one move",
    ],
    relatedDrawers: ["homepage", "posts", "talent-portfolio"],
  },


  seo: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "SEO defaults and per-page overrides: meta title, description, OG image, robots.",
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
      "The categorization system (talent specialties, client industries, inquiry types) used for filtering across the app.",
    youCanHere: [
      "Add or rename a category",
      "Reorder how categories appear in filter menus",
      "Merge two categories that should be one",
    ],
    relatedDrawers: ["field-catalog", "filter-config"],
  },

  widgets: {
    audience: [W_ADMIN, W_EDIT],
    category: "Public site",
    purpose:
      "Embeddable Tulala blocks (booking forms, talent grids, hub directories) that you can drop into pages.",
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
      "Storefront-side checks: broken links, missing meta tags, slow pages, indexability.",
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
      "Who can see your storefront: public, link-only, password-protected, or hidden from Tulala discovery.",
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
      "Submit your roster to industry hubs, curated talent directories that send you inbound clients.",
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
      "Every client your workspace has worked with: past, present, and prospective.",
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
      "The client's full record: contacts, brands, past bookings, payment history.",
    youCanHere: [
      "Update contact details and brand affiliations",
      "See every past inquiry and booking",
      "Set client-specific rates or commission overrides",
      "Add internal notes the client never sees",
    ],
    relatedDrawers: ["client-list", "private-client-data", "relationship-history"],
  },

  "relationship-history": {
    audience: [W_ADMIN, W_COORD],
    category: "Clients",
    purpose:
      "Chronological log of every interaction with one client: bookings, messages, contracts, payments.",
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
      "Client info that's locked to admins only: internal credit ratings, do-not-book flags, sensitive notes.",
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
      "Every alert your workspace has generated: replies, offers, payments, system events.",
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
      "What your teammates have been doing: replies sent, bookings closed, talents added.",
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
      "Talent-side actions visible to you: accepted offers, updated availability, new portfolio uploads.",
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
      "Saved reply templates: for common questions, follow-ups, polite-no's.",
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
      "Your day at a glance: call-times, requests waiting on you, offers about to expire.",
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
      "An offer from your agency or a direct client: rate, dates, scope, terms.",
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
      "A request that's not yet a formal offer, agency is sounding you out before sending terms.",
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
      "A confirmed booking: call-time, location, contacts, payment status.",
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
      "A finished booking: final payout status, receipt, and review window.",
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
      "Detail on a hub directory: what it is, what they pay, how to apply, who else is listed.",
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
      "Edit your full talent profile: bio, photos, measurements, credits, rates.",
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
      "Edit a single section of your profile, focused mode for one piece at a time.",
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
      "Add travel windows (will be in Lisbon Mar 1-15)",
      "Choose which agencies can see which blocks",
    ],
    relatedDrawers: ["talent-add-event", "talent-block-dates"],
  },

  "talent-block-dates": {
    audience: TALENT,
    category: "My profile",
    purpose:
      "Quickly block a range of dates: vacation, family event, maternity leave.",
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
      "Casting polaroids: natural, no-makeup digitals shot against a plain wall.",
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
      "Your campaign and editorial credits, the brands and publications you've worked with.",
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
      "Skills that affect what you get cast for: languages, sports, dance, accents, instruments.",
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
      "What you will and won't do: nudity, fur, alcohol/tobacco, conflicting brands.",
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
      "Travel preferences and constraints: passport details, comfort with red-eyes, dietary needs.",
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
      "External links shown on your profile: Instagram, agency page, personal site, IMDB.",
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
      "Feedback from past clients and agencies, visible to clients considering booking you.",
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
      "Video reel: runway clips, commercial spots, behind-the-scenes.",
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
      "Your measurements as they appear on every casting brief: height, bust/chest, waist, hips, shoe, hair, eyes.",
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
      "Identity, work-permit, and tax documents, encrypted and shared only with verified agencies.",
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
      "Who agencies should call if something goes wrong on set, only revealed in emergencies.",
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
      "Compare Basic (free), Pro, and Portfolio tiers, what each unlocks for your personal page.",
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
      "Your premium personal page: independent of any agency, owned by you, lives at tulala.digital/t/<your-slug>.",
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
      "Drop external media (Vimeo reels, Spotify playlists, Instagram posts) into your personal page.",
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
      "Press mentions and editorial features, articles where you've appeared.",
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
      "Downloadable PDF media kit (bio, photos, rate card, contact) for press and brand pitches.",
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
      "Connect your own domain (yourname.com) to your personal page, Portfolio tier only.",
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
      "Your relationship with one agency: exclusivity status, commission, contract terms.",
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
      "Initiate the process of leaving an agency: review notice periods, transfer rules, and final settlements.",
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
      "Handle a conflict: two agencies offering competing dates, an agency missing a previously-set blockout, etc.",
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
      "Other talent you collaborate with: a private network for swapping castings you can't take, recommendations, and shared bookings.",
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
      "Your referral history and earnings: talent and brands you've sent to others, and what they've sent back.",
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
      "Your notification preferences as a talent, what you get pinged about and how.",
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
      "Who sees what: measurements, contact, social handles, agency-private info.",
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
      "Who can contact you directly: by trust tier, agency relationship, or specific brand.",
    youCanHere: [
      "Allow direct contact only from Verified clients and up",
      "Whitelist specific agencies for direct outreach",
      "Block specific brands or competitors",
    ],
    relatedDrawers: ["talent-privacy"],
    devNotes:
      "Defaults are open-ish, talent must opt INTO restrictions. See client-trust-badges memory for how this maps to the trust ladder.",
  },

  "talent-payouts": {
    audience: TALENT,
    category: "Money",
    purpose:
      "Where your money goes: bank accounts, payment processors, payout schedule.",
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
      "Detailed earnings: every booking, what came in, what was deducted (commission, taxes, fees).",
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
      "Year-end tax documents: 1099, W-9, equivalents per region. Download once your earnings are finalized.",
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
      "Legacy entry: superseded by `talent-trust-detail` (the talent-side trust dashboard) and the per-method drawers (`talent-phone-verify`, `talent-id-verify`, etc.). Kept for backward compatibility with old deep links.",
    youCanHere: [
      "(Routes to `talent-trust-detail`)",
    ],
    relatedDrawers: ["talent-trust-detail", "talent-id-verify", "talent-phone-verify", "talent-business-verify", "talent-domain-verify", "talent-payment-verify"],
    ticketCategory: "Account & access",
  },

  "talent-voice-reply": {
    audience: TALENT,
    category: "Today",
    purpose:
      "Record a quick voice reply instead of typing, useful when you're on the move.",
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
      "Archived conversations: closed bookings, declined requests, dormant agency relationships.",
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

















  // ════════════════════════════════════════════════════════════════
  // Cross-cutting / shared
  // ════════════════════════════════════════════════════════════════

  "data-export": {
    audience: [W_ADMIN, TALENT, CLIENT],
    category: "Account",
    purpose:
      "Download an archive of your data: for backups, portability, or before you delete the account.",
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
      "Every consequential action on this account or workspace: who did what, when, from where.",
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
    // Pinned to what the drawer does: it advertised "search articles" and
    // "browse by topic", neither of which exists. Describe the real thing.
    purpose: "Keyboard shortcuts, the help centre, and a way to reach support.",
    youCanHere: [
      "See the keyboard shortcuts for this workspace",
      "Open the help centre in a new tab",
      "Start a support ticket when you need a person",
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
      "Connect your workspace to a payments processor (Stripe, Wise, Mercury) so you can receive client payments.",
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
      "Pick who receives payment for a booking: agency, talent direct, or split.",
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
      "Detail of a single payment: amount, fees, tax, receiver, status.",
    youCanHere: [
      "See line-items and fee breakdown",
      "Download the receipt or invoice",
      "Open a dispute if something is wrong",
    ],
    relatedDrawers: ["talent-payouts"],
    ticketCategory: "Billing",
  },

  // ════════════════════════════════════════════════════════════════
  // Platform / HQ surface (Tulala internal team only)
  // ════════════════════════════════════════════════════════════════






















  // ════════════════════════════════════════════════════════════════
  // Trust & identity (WS-5)
  // ════════════════════════════════════════════════════════════════

  "client-trust-detail": {
    audience: [W_ADMIN, W_COORD],
    category: "Money",
    purpose:
      "Client trust tier (Basic through Gold) based on identity verification and funded-account signals.",
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
      "Escrow hold for a booking, Authorized → Held → Released lifecycle view.",
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
      "Issue a refund for a booking payment (full or partial) with a required reason.",
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
      "Open a formal dispute for a payment or delivery issue, structured wizard with evidence upload.",
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
      "Identity verification (photo ID + selfie) required to unlock higher trust tiers and payment limits.",
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
      "Verify a funded account (bank link or wire) to reach Silver or Gold trust tier.",
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
      "Your payout method failed, see the reason and follow guided recovery steps.",
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
      "Full subscription lifecycle: trial, active, paused, grace period, and cancelled states.",
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
      "Full detail of a single notification: what happened, who triggered it, and what action is needed.",
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
      "AI-generated message drafts, describe what you want to say and get a polished draft.",
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

  // ════════════════════════════════════════════════════════════════
  // Trust & Verification (Phase 1 + Phase 2)
  // ────────────────────────────────────────────────────────────────
  // The trust system splits into three concerns:
  //   • Account verification (security — never a public badge)
  //   • Profile claiming (ownership — talent ↔ agency)
  //   • Profile trust verification (public badges + admin signals)
  // Platform admins decide which methods exist; workspace admins
  // review submissions; talent initiate flows; clients see badges.
  // See TRUST.md for the full schema, wiring, and lifecycle docs.
  // ════════════════════════════════════════════════════════════════

  "trust-verification-queue": {
    audience: [W_ADMIN, W_COORD],
    category: "Settings",
    purpose:
      "Review every Instagram + Tulala + ID + business + domain + payment verification submitted by talent. Approve, reject, or ask for more info, talent gets notified.",
    youCanHere: [
      "Filter by status (Pending / In review / Needs info / Approved / Rejected)",
      "Filter by method (only enabled methods are shown)",
      "Search by talent name, IG handle, code, or method",
      "Bulk-approve via the row checkboxes",
      "Open a request to see evidence URL, talent's note, full activity timeline, and risk-health score",
      "Approve / reject (with reason) / mark in review / request more info",
    ],
    relatedDrawers: ["trust-disputed-claims", "platform-verification-methods", "talent-trust-detail"],
    ticketCategory: "Account & access",
  },

  "trust-disputed-claims": {
    audience: [W_ADMIN],
    category: "Settings",
    purpose:
      "Resolve agency-created profiles that the claimed talent flagged as not theirs. Three outcomes: release (talent wins), uphold (agency wins, re-issue invite), or remove (take profile down).",
    youCanHere: [
      "Review the talent's dispute reason and the original invite metadata",
      "See the talent's risk-health score (claim disputes drop it −25)",
      "Add admin-only notes recording the rationale for the decision",
      "Pick one of three resolutions; UI fans out to update claim status, profile state, and audit log",
    ],
    relatedDrawers: ["trust-verification-queue", "talent-claim-invite"],
    ticketCategory: "Account & access",
  },

  "platform-verification-methods": {
    audience: [HQ],
    category: "Operations",
    purpose:
      "Source-of-truth registry for which verification methods exist on Tulala. Platform admins enable / disable methods, change review mode, set tier-gating, evidence requirements, and expiry.",
    youCanHere: [
      "Toggle a method on or off platform-wide (warns if active badges exist: they stay valid until expiry, but disappear from public storefronts immediately)",
      "Set review mode (automated / manual / hybrid)",
      "Set visibility (public_profile / admin_only / internal)",
      "Restrict who can use it by talent tier (Basic / Pro / Portfolio / All)",
      "Toggle whether evidence is required to submit",
      "Set badge expiry in days (blank = never)",
      "Inspect the audit log of every change made to the registry",
    ],
    relatedDrawers: ["trust-verification-queue"],
    ticketCategory: "Account & access",
  },

  "talent-trust-detail": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Your trust dashboard. See your trust-health score, the badges you've earned, and what verifications would lift your score the most. Also where you set who can contact you.",
    youCanHere: [
      "See your trust-health score (0-100, internal heuristic)",
      "Open suggestions like 'Verify your phone (+5)' that route to the right flow",
      "Start the Instagram DM flow (handle + code + optional evidence URL)",
      "Request Tulala manual review",
      "Open Phone / ID / Business / Domain / Payment flows when enabled platform-wide",
      "Set your contact gate: Anyone / Verified clients only / Trusted clients only",
    ],
    relatedDrawers: ["talent-phone-verify", "talent-id-verify", "talent-business-verify", "talent-domain-verify", "talent-payment-verify", "talent-claim-invite"],
    ticketCategory: "Account & access",
  },

  "talent-claim-invite": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Accept (or dispute) a profile that an agency created in your name. Three actions: claim it (becomes yours), say 'not me' (admin reviews), or report it.",
    youCanHere: [
      "Review the profile the agency built: photos, fields, agency name",
      "Claim ownership (verifies your email + flips claim status to 'claimed')",
      "Dispute the invite if the profile isn't actually yours (lands in the admin disputed-claims queue)",
      "Report the invite as suspicious (takes profile offline pending admin review)",
    ],
    relatedDrawers: ["talent-trust-detail", "trust-disputed-claims"],
    ticketCategory: "Account & access",
  },

  "talent-phone-verify": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Confirm a working phone number via SMS OTP. Internal-only signal, never shown publicly. Speeds up account-recovery and lifts your trust-health score.",
    youCanHere: [
      "Enter your phone with country code",
      "Receive a 6-digit code (prototype shows it inline; production sends real SMS)",
      "Type the code to auto-verify",
      "Re-run the flow if your number changes",
    ],
    relatedDrawers: ["talent-trust-detail", "talent-id-verify"],
    ticketCategory: "Account & access",
  },

  "talent-id-verify": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Upload a government-issued ID for manual admin review. Internal-only, used to confirm name + age + identity uniqueness. Never shared with clients or agencies.",
    youCanHere: [
      "Pick your document type (passport / driver's license / national ID)",
      "Provide a secure URL to the document (in production this is a direct upload)",
      "Add a reviewer note explaining anything the document needs context for",
      "Submit, admin reviews within 48h",
    ],
    relatedDrawers: ["talent-trust-detail", "talent-phone-verify"],
    ticketCategory: "Account & access",
  },

  "talent-business-verify": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Confirm the registered legal entity behind your work, VAT / company-house / DIC / equivalent. Public badge for talent who run their work as a business.",
    youCanHere: [
      "Enter your legal entity name + VAT/registration number",
      "Optionally (or required by platform policy) attach a public registry URL",
      "Submit for manual admin review (3 business days)",
    ],
    relatedDrawers: ["talent-trust-detail"],
    ticketCategory: "Account & access",
  },

  "talent-domain-verify": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Prove you control a domain (e.g. martareyes.com) by adding a DNS TXT record. Public badge, adds credibility to talent who maintain their own websites.",
    youCanHere: [
      "Enter the domain you want to verify",
      "Copy the generated TXT record value",
      "Add it via your DNS provider (GoDaddy / Namecheap / Cloudflare / etc.)",
      "Click 'check now' to run the lookup, auto-approves on match",
    ],
    relatedDrawers: ["talent-trust-detail", "talent-custom-domain"],
    ticketCategory: "Account & access",
  },

  "talent-payment-verify": {
    audience: TALENT,
    category: "Settings",
    purpose:
      "Confirm a working payout method via a small Stripe authorization-then-refund. Internal-only, improves your trust score for clients who care about payment reliability.",
    youCanHere: [
      "Run the verification (€1 hold + immediate refund, no money actually moves)",
      "See the result inline; auto-approves on success",
    ],
    relatedDrawers: ["talent-trust-detail", "talent-payouts"],
    ticketCategory: "Billing",
  },

  "support-ticket": {
    audience: [W_ADMIN, TALENT, CLIENT, HQ],
    category: "Help",
    purpose:
      "Your conversation with Tulala support. Every ticket stays attached to this workspace and this user.",
    youCanHere: [
      "Read the full thread, including system updates",
      "Reply so support can keep helping",
      "Rate the resolution when the ticket is marked resolved",
    ],
    ticketCategory: "General",
  },
};
