# Tulala Admin-Shell Prototype — Final Roadmap

> **Status:** Draft v1 — ready for UX / PM / Eng review
> **Owner:** TBD (assign before kickoff)
> **Last updated:** 2026-04-28
> **Purpose:** This is the canonical, end-to-end audit + execution plan to take the admin-shell prototype to production-quality. A new designer or engineer should be able to read this document, the listed memory files, and `DRAWERS.md`, and have everything they need to execute. Replaces all earlier audit/plan documents.

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [How to use this document](#2-how-to-use-this-document)
3. [Consolidated audit findings](#3-consolidated-audit-findings)
4. [Master execution plan — 24 workstreams](#4-master-execution-plan)
5. [Cross-cutting concerns](#5-cross-cutting-concerns)
6. [Designer handoff package](#6-designer-handoff-package)
7. [Engineer handoff package](#7-engineer-handoff-package)
8. [Decision log template](#8-decision-log-template)
9. [Glossary](#9-glossary)
10. [Appendix A — File map](#10-appendix-a--file-map)
11. [Appendix B — Memory index](#11-appendix-b--memory-index)
12. [Appendix C — Acceptance-criteria patterns](#12-appendix-c--acceptance-criteria-patterns)

---

## 1. Executive summary

### Where we are
The admin-shell prototype is **architecturally ambitious and conceptually correct**. Multi-surface (workspace / talent / client / HQ), 149 typed drawer surfaces, real pipeline state machine, a now-complete in-app help registry that doubles as the data spine for support pages + chatbot + ticket routing.

### Where we're not
The product currently feels like a **thoughtful design system with prototype scaffolding around it** — not yet a calm, premium app. Specifically:

- **Chat surfaces are overwhelming.** No date dividers, no message grouping, system events mixed with human chat, threads are mutually exclusive tabs.
- **Mobile is retrofitted, not native.** ~24% of viewport is chrome before content. Drawer rail is hard-coded 320 px regardless of viewport.
- **Workspace nav has 9 top-level pages.** Half land behind a "More" tab on phone.
- **149 drawers** is too many. Some should be popovers, some pages, some merged.
- **Money & trust UX is generic** despite being the most sensitive surface.
- **Real-time, error states, loading states, search, bulk actions — mostly absent.**
- **Email / SMS / push / transactional comms — entirely missing** from the prototype layer.
- **No design system docs** — Figma, Storybook, tokens export, motion specs all ad-hoc.

### Where we're going
**33 workstreams** (WS-0 through WS-35) — sequenced, parallelizable, each independently shippable. Estimated **~18 calendar weeks** with 2 designers + 2 engineers in parallel. Critical path: WS-0 (foundation) → WS-1 (chat) + WS-2 (mobile) → WS-35 (reconciliation) → ship.

**Round 5 added** (after auditing the actual `/admin` v1 product):
- **WS-35 Production-feature reconciliation** — the bridge between the v1 production and the prototype's redesign. Demonstrates every existing production feature (AI workspace, analytics, site-setup wizard, translations, fields/definitions, docs, impersonation, locations, taxonomy, etc.) so dev knows what to keep + redesign vs deprecate.
- **WS-18 PROMOTED Low → Medium-High** — production has real AI infrastructure (provider registry, master mode, usage controls, console, logs). The prototype must demonstrate this as a top-level surface, not optional.

**Round 4 audit added:**
- **WS-28 Casting director surface** — currently CDs are lumped into "client", but their workflow is fundamentally different
- **WS-29 Production team & multi-discipline bookings** — HMU, stylists, photographers, photo studios — modeled as first-class
- **WS-30 Image rights & post-booking lifecycle** — usage tracking, re-licensing, royalties, holds/options, no-show flow
- **WS-31 Account lifecycle** — workspace transfer/merge, account merging, **minor accounts (parent co-pilot)**, mother-agency hierarchies, estate management
- **WS-32 Discovery & marketplace primitives** — trending, similar-to, geo-search, **bias-auditing transparency**
- **WS-33 On-set / production-day live features** — live call sheets, check-ins, photo proofing, wrap notifications
- **WS-34 Safety, disputes & incident handling** — incident reporting, photographer safety scoring, **minor protections**, anti-discrimination signals, mediation

### TL;DR for stakeholders

| Question | Answer |
|---|---|
| Is the prototype on the right track? | Yes. Strong foundations. |
| What's the #1 thing to fix? | Inquiry workspace responsiveness + message stream rhythm. |
| What's the existential risk? | Money & trust UX (`WS-5`) — get it wrong, lose users forever. |
| What can we ship in 2 weeks? | `WS-0` foundation + `WS-1` chat overhaul + `WS-2` mobile. Real users feel it. |
| What's the longest tail? | `WS-12` (i18n + a11y) + `WS-17` (design system) — both run continuously. |
| Where are the biggest moats? | `WS-18` (AI assist on the registry data) + `WS-7` (search) + `WS-5` (escrow trust). |

---

## 2. How to use this document

### For a UX designer joining the project
1. Read [§6 Designer handoff package](#6-designer-handoff-package) first
2. Skim [§3 Audit findings](#3-consolidated-audit-findings) — organized by theme
3. Pick a workstream from [§4 Master execution plan](#4-master-execution-plan) where you're assigned
4. Reference [§9 Glossary](#9-glossary) and [§11 Memory index](#11-appendix-b--memory-index) as you go
5. Add entries to [§8 Decision log](#8-decision-log-template) for any non-obvious choice you make

### For an engineer
1. Read [§7 Engineer handoff package](#7-engineer-handoff-package)
2. Skim audit themes that map to your area
3. Pick tasks from your assigned workstream
4. Honor existing conventions (`data-tulala-*` selectors, semantic COLORS, TypeScript types)

### For a PM / stakeholder
- §1 + §5.4 (sequencing) + §5.3 (risk register) is the operating picture
- Drill into specific workstreams as they get scheduled

### For maintenance
- This doc lives alongside `DRAWERS.md`, `_help.tsx`, `_state.tsx` — when those change, update relevant sections here
- Bump the `Last updated` date in the header; don't rewrite history (use the decision log)

---

## 3. Consolidated audit findings

> Findings consolidated from three audit rounds. Organized by **theme**, not chronology. Each finding tagged with severity (`P0` critical, `P1` high, `P2` medium, `P3` low). Each tagged with the workstream that addresses it (`WS-XX`).

### 3.1 Chat & messaging — the single biggest user-pain area

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.1.1 | InquiryWorkspaceDrawer's hard-coded 320px Rail (`_workspace.tsx:111`) breaks on phones — message pane disappears or rail bleeds off-screen | **P0** | WS-1.A |
| 3.1.2 | Message stream has no date dividers, no grouping, no "jump to latest" — long threads = uniform scroll | **P0** | WS-1.B |
| 3.1.3 | System messages indistinguishable from human chat — same visual weight despite very different roles | **P0** | WS-1.B |
| 3.1.4 | System messages requiring action (offer expiring, payment overdue) get no visual prominence | **P0** | WS-1.E |
| 3.1.5 | Threads are mutually exclusive tabs — admins must task-switch between private + group constantly | **P1** | WS-3 |
| 3.1.6 | No real-time presence ("Hannah is typing", "viewing this inquiry now") | **P1** | WS-1.D |
| 3.1.7 | No read receipts — coordinators don't know if their reply was seen | **P1** | WS-1.D |
| 3.1.8 | Group threads with multiple talents have no per-talent filtering — "what did Sofia say?" requires scanning everything | **P1** | WS-1.F |
| 3.1.9 | Roster panel shows status but not "what they last said" — preview snippet missing | **P1** | WS-1.F |
| 3.1.10 | Composer doesn't make active thread context visible — easy to type a private note while looking at group tab | **P1** | WS-1.C |
| 3.1.11 | Offer/payment events appear as both stream messages AND Rail cards — duplicate visibility, no clear canonical | **P1** | WS-1.E |
| 3.1.12 | No file-attachment UX in composer (drag/drop, paste image, voice memo) | **P1** | WS-1.C / WS-10 |
| 3.1.13 | No optimistic send + retry on failure — message stuck "sending" with no recovery | **P1** | WS-6 |
| 3.1.14 | No draft auto-save per thread — closing drawer loses unsent text | **P1** | WS-1.C |
| 3.1.15 | No @-mention typeahead with avatar previews | **P2** | WS-1.C |
| 3.1.16 | No "/" inline thread search | **P2** | WS-1.G |
| 3.1.17 | Pending-offer rows in the inbox have action buttons but no visual signal that this row needs action — looks identical to a row that's just unread | **P0** | WS-1 / WS-2 |
| 3.1.18 | No printable / PDF view of a thread (legal disputes, archives) | **P3** | WS-22 |

### 3.2 Mobile experience — second-most-painful area

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.2.1 | Sticky-stack consumes ~24% viewport on iPhone SE (IdentityBar 50pt + Topbar 56pt + bottom nav 56pt + safe-areas) | **P0** | WS-2 |
| 3.2.2 | Drawer size toolbar (compact / half / full) is meaningless on mobile — everything renders 96vw regardless | **P0** | WS-2 |
| 3.2.3 | Workspace 9-page nav overflows bottom-nav slots — half is behind "More" tab | **P0** | WS-3 |
| 3.2.4 | No bottom-sheet drawer variant — desktop side-drawer feels wrong on phones | **P1** | WS-2 |
| 3.2.5 | No pull-to-refresh anywhere — mobile users expect this | **P1** | WS-2 |
| 3.2.6 | `SwipeableRow` exists but inconsistently applied — no standardized swipe-archive / swipe-unread | **P1** | WS-2 |
| 3.2.7 | iOS keyboard opening doesn't trigger sticky-element layout recompute — composer can hide behind keyboard | **P1** | WS-2 |
| 3.2.8 | Multiple FABs at competing bottom positions (`_primitives.tsx:4320` at 80pt, `5038` at 72pt) can collide | **P2** | WS-2 |
| 3.2.9 | Calendar month grid on phones squeezes cells too small — agenda view should be default below 768pt | **P2** | WS-2 |
| 3.2.10 | Long-form drawers (talent-profile-edit, plan-billing) lack sticky save bar — easy to scroll away from the save action | **P2** | WS-2 |
| 3.2.11 | Tap targets <44pt on inline checkboxes / chips inside list rows | **P2** | WS-2 |
| 3.2.12 | No iOS widget / lock-screen surface — premium apps in this category have them | **P3** | WS-23 |
| 3.2.13 | No native PWA install prompt UX on capable browsers | **P3** | WS-23 |

### 3.3 Information architecture & navigation

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.3.1 | Workspace has 9 top-level pages — `inbox` + `work` overlap, `site` is a CMS hidden under one nav, `billing` rarely needs primary slot | **P1** | WS-3 |
| 3.3.2 | Workspace still uses `inbox` while talent + client moved to `messages` — inconsistency | **P1** | WS-1.2 / WS-3 |
| 3.3.3 | Talent `activity` page is a primary nav slot for what's basically an audit log used ~once | **P2** | WS-8 |
| 3.3.4 | Talent `reach` page lumps agencies + hubs + custom domain + personal page — 3 mental models in one tab | **P2** | WS-8 |
| 3.3.5 | Client `bookings` and `messages` overlap — booking IS a message thread with funded escrow | **P2** | WS-8 |
| 3.3.6 | Platform `users` and `tenants` overlap — confusing cross-link | **P3** | WS-15 |
| 3.3.7 | No global search (Cmd-K) — with 149 drawers + N inquiries, this is a power-user blocker | **P0** | WS-7 |
| 3.3.8 | No "back / forward" semantics on drawer back-stack from browser — only the in-drawer "← Back to X" link | **P2** | WS-4 |
| 3.3.9 | Help drawer is the catch-all but has no real surface — should be the entry point to docs, chat, tickets | **P2** | WS-22 / WS-9 |

### 3.4 Drawer system strain

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.4.1 | 149 drawers — drawer-as-everything is straining the system | **P1** | WS-4 |
| 3.4.2 | Some "drawers" are 4-line settings (`talent-block-dates`) — should be popovers | **P1** | WS-4 |
| 3.4.3 | Some "drawers" are full apps (`inquiry-workspace`, `talent-personal-page`, `client-shortlist-detail`) — should be pages with real URLs | **P1** | WS-4 |
| 3.4.4 | Drawer back-stack model breaks down past 2 levels deep — users get lost | **P2** | WS-4 |
| 3.4.5 | Drawer mobile width clamping ignores the "compact" preference — toolbar is dead weight | **P0** | WS-2 |

### 3.5 Money, trust, and verification

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.5.1 | Escrow flow described in entries but no UI for "money is held safely" | **P0** | WS-5 |
| 3.5.2 | No multi-currency support — Lisbon shoot booked by Tokyo client needs explicit currency UX | **P0** | WS-5 |
| 3.5.3 | Refund flow exists only on platform-side — client/talent/agency-side flows missing | **P0** | WS-5 |
| 3.5.4 | No partial-payment / milestone UX for long projects | **P1** | WS-5 |
| 3.5.5 | No tax breakdown clarity — gross vs net never spelled out | **P1** | WS-5 |
| 3.5.6 | No commission split visualization for talent — "my agency took what?" | **P1** | WS-5 |
| 3.5.7 | Payout method failures (wrong IBAN, expired card) have no recovery UX | **P1** | WS-5 |
| 3.5.8 | No dispute / chargeback flow on either side | **P1** | WS-5 |
| 3.5.9 | Trust ladder documented in memory but UI absent — only a single chip on rows | **P0** | WS-5 |
| 3.5.10 | No KYC / verification flow surface — where does talent upload passport? | **P0** | WS-5 |
| 3.5.11 | No proof-of-funds flow for clients (Silver / Gold per memory) | **P1** | WS-5 |
| 3.5.12 | No fraud-detection signals surfaced (AI-generated photos, fake profiles) | **P2** | WS-5 / WS-21 |
| 3.5.13 | No "report this client/talent" flow — moderation needs entry points | **P2** | WS-5 / WS-21 |
| 3.5.14 | No moderation queue UX beyond a single drawer | **P2** | WS-21 |

### 3.6 Real-time, error, and loading states

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.6.1 | No error toast variants beyond a basic `tone: "error"` — what does "Card declined" look like? | **P0** | WS-6 |
| 3.6.2 | No inline form validation primitives (red borders, field-level errors, `aria-invalid`) | **P0** | WS-6 |
| 3.6.3 | "Unsaved changes" guard is a single boolean (`canClose=false`) — not robust enough | **P1** | WS-6 |
| 3.6.4 | No offline mode — network drop mid-message has no recovery | **P1** | WS-6 |
| 3.6.5 | No optimistic UI rollback pattern when server says no | **P1** | WS-6 |
| 3.6.6 | No retry affordances on failed sends — envelope stuck "sending" | **P1** | WS-6 |
| 3.6.7 | No stale-data detection when another user changes the inquiry | **P1** | WS-6 |
| 3.6.8 | Skeleton states sparsely used — `tulala-skeleton-shimmer` exists but only in 1-2 places | **P1** | WS-0 / WS-6 |
| 3.6.9 | No "page transition" loading indicator — feels frozen on slow networks | **P2** | WS-6 |
| 3.6.10 | No conflict-resolution UI when two users edit simultaneously | **P2** | WS-6 |

### 3.7 Search, bulk actions, and power-user UX

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.7.1 | No Cmd-K palette anywhere | **P0** | WS-7 |
| 3.7.2 | No cross-thread message search ("find that one mention of Casa Pero from last month") | **P1** | WS-7 |
| 3.7.3 | Inquiry list has checkboxes but no bulk-action bar appears on selection | **P1** | WS-7 |
| 3.7.4 | No bulk operations on talent roster, calendar days, or file library | **P2** | WS-7 |
| 3.7.5 | Keyboard shortcuts limited to `Esc` and drawer-`?` — no global shortcuts (`j/k`, `e`, `r`, `c`) | **P2** | WS-7 |
| 3.7.6 | No keyboard shortcut help overlay (`?` outside drawer) | **P2** | WS-7 |
| 3.7.7 | No saved-search inline trigger — register entry exists but no surface to "save this view" | **P2** | WS-7 |

### 3.8 Notifications system

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.8.1 | No multi-channel granularity per notification type (in-app vs email vs push vs SMS) — single mute toggle | **P1** | WS-11 |
| 3.8.2 | No batching ("3 new messages from Casa Pero" instead of 3 entries) | **P1** | WS-11 |
| 3.8.3 | No deep-link routing — email-click on phone should open the right drawer + payload | **P1** | WS-11 |
| 3.8.4 | No "Do not disturb" / quiet hours — mentioned in entries but not real | **P2** | WS-11 |
| 3.8.5 | No notification preview vs full content split (lock-screen privacy) | **P2** | WS-11 |
| 3.8.6 | No notification history beyond 30 days | **P3** | WS-11 |
| 3.8.7 | Toasts disappear in ~5s with no recovery — no "history of recent toasts" | **P2** | WS-11 |
| 3.8.8 | Toast queue limit not enforced — fire 5, they overlap | **P2** | WS-0 |
| 3.8.9 | No read-on-another-device sync | **P3** | WS-11 |

### 3.9 Onboarding & empty states

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.9.1 | Workspace activation checklist exists; talent + client first-run is just empty pages | **P1** | WS-9 |
| 3.9.2 | No guided-tour primitive — only static `<EmptyState>` fallback | **P2** | WS-9 |
| 3.9.3 | No demo-data seeding option ("show me with sample data") | **P2** | WS-9 |
| 3.9.4 | No re-onboarding for users returning after 30+ days idle | **P2** | WS-9 |
| 3.9.5 | No role-aware onboarding (coordinator joining ≠ owner setting up) | **P1** | WS-9 |
| 3.9.6 | Empty states inconsistent — some surfaces have rich states, others render bare `No results.` text | **P2** | WS-9 |
| 3.9.7 | No "skip to setup later" persistent affordance | **P3** | WS-9 |

### 3.10 Files, attachments, and contracts

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.10.1 | No file-attachment UX in composer | **P0** | WS-10 |
| 3.10.2 | No inline previews for PDF / image / video / audio in message stream | **P1** | WS-10 |
| 3.10.3 | No "files" tab on inquiry workspace — files buried in original messages | **P1** | WS-10 |
| 3.10.4 | No bulk download ("zip this booking") | **P2** | WS-10 |
| 3.10.5 | No version history on attachments | **P2** | WS-10 |
| 3.10.6 | E-sign flow doesn't exist — contract list exists, but no signing surface | **P0** | WS-10 |
| 3.10.7 | No countersigning UX (talent signs, agency countersigns, client receives) | **P1** | WS-10 |
| 3.10.8 | No contract diff view between offer-v1 and offer-v2 | **P1** | WS-10 |
| 3.10.9 | No contract template editor | **P2** | WS-21 |
| 3.10.10 | Photo gallery (`talent-portfolio`) lacks bulk upload, drag-reorder, batch tagging, replace-everywhere | **P1** | WS-10 |

### 3.11 Time zones & scheduling complexity

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.11.1 | All times rendered without time-zone indicator | **P0** | WS-12 |
| 3.11.2 | No "your time / their time" dual display on bookings spanning zones | **P1** | WS-12 |
| 3.11.3 | No DST handling | **P2** | WS-12 |
| 3.11.4 | No "schedule across multiple cities" view for traveling talent | **P2** | WS-12 |
| 3.11.5 | Booking call-time has no TZ label — costliest mistake the product can enable | **P0** | WS-12 |
| 3.11.6 | No iCal subscription URL / Google / Outlook two-way sync | **P1** | WS-23 |
| 3.11.7 | No "add to phone calendar" deep link on bookings | **P2** | WS-23 |

### 3.12 Multi-tenant hybrid mode

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.12.1 | No mode-switcher between "I'm acting as talent" vs "as my agency" | **P1** | WS-15 |
| 3.12.2 | No clarity on which inbox is showing in hybrid mode | **P1** | WS-15 |
| 3.12.3 | No conflict-of-interest UX when agency offers a job to you-as-talent | **P1** | WS-15 |
| 3.12.4 | No data-separation visualization (personal money vs workspace books) | **P2** | WS-15 |
| 3.12.5 | Plan-tier × role matrix from memory isn't surfaced anywhere | **P2** | WS-15 |
| 3.12.6 | No special onboarding for hybrid users | **P3** | WS-15 |

### 3.13 Accessibility (beyond the help-system pass)

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.13.1 | Inquiry rows: clickable but not keyboard-traversable (no arrow-key navigation) | **P1** | WS-12 |
| 3.13.2 | Calendar day cells: not announced as buttons, no focus management when selecting | **P1** | WS-12 |
| 3.13.3 | Drawer focus trap exists but doesn't restore focus to trigger when closing | **P1** | WS-12 |
| 3.13.4 | Color is sometimes the only signal (status dots without text labels) | **P1** | WS-12 |
| 3.13.5 | ARIA live regions absent — new toast / new message should announce | **P1** | WS-12 |
| 3.13.6 | No high-contrast mode test | **P2** | WS-12 |
| 3.13.7 | No screen-reader pass on the entire flow | **P1** | WS-12 |
| 3.13.8 | Reduced-motion compliance only on the help panel — not site-wide | **P2** | WS-12 |
| 3.13.9 | Keyboard shortcuts are app-specific — users have no way to discover them | **P2** | WS-7 |
| 3.13.10 | No skip-to-main-content links on most pages | **P2** | WS-12 |

### 3.14 Internationalization (i18n)

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.14.1 | All UI strings hardcoded — no extraction layer | **P0** | WS-12 |
| 3.14.2 | No locale-aware date/number/currency formatting (`Intl.*` not used systematically) | **P1** | WS-12 |
| 3.14.3 | No RTL support — chevrons, drawer-from-side direction, text alignment | **P1** | WS-12 |
| 3.14.4 | EN/ES toggle exists but doesn't actually change anything | **P1** | WS-12 |
| 3.14.5 | Imperial vs metric is per-talent, not workspace-wide preference | **P2** | WS-12 |
| 3.14.6 | No data residency picker during signup (EU / US / etc.) | **P2** | WS-21 |

### 3.15 Performance

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.15.1 | No list virtualization — inquiry inbox can be 500+ rows | **P1** | WS-13 |
| 3.15.2 | No image lazy-loading on talent portfolios (200+ photos) | **P1** | WS-13 |
| 3.15.3 | No code-splitting per surface — workspace + talent + client + platform bundle together | **P1** | WS-13 |
| 3.15.4 | `_talent.tsx` is 18,883 lines as a single module | **P1** | WS-13 |
| 3.15.5 | No prefetch on hover — sidebar feels janky on slow networks | **P2** | WS-13 |
| 3.15.6 | Inline styles everywhere = no CSS extraction = larger HTML payload | **P2** | WS-13 / WS-16 |
| 3.15.7 | No bundle-size budget per surface — drift will go unnoticed | **P3** | WS-13 |

### 3.16 Public-facing surfaces & SEO

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.16.1 | Workspace storefront page is sparse — no real layout | **P1** | WS-14 |
| 3.16.2 | Talent public page (premium tier) is mock-only | **P1** | WS-14 / WS-8 |
| 3.16.3 | Hub directory listing UI is minimal | **P2** | WS-14 |
| 3.16.4 | No SEO preview tool ("here's what your storefront looks like in Google") | **P2** | WS-14 |
| 3.16.5 | OG cards configured but never visually previewed | **P2** | WS-14 |
| 3.16.6 | No "view as visitor" toggle | **P2** | WS-14 |
| 3.16.7 | No public-side analytics (visitor count, top-talent views) | **P3** | WS-14 / WS-19 |
| 3.16.8 | No schema.org / structured-data markup on public pages | **P2** | WS-14 |
| 3.16.9 | No sitemap / robots.txt UX for workspace owners | **P3** | WS-14 |
| 3.16.10 | No cookie-consent UX on public storefronts (GDPR requirement) | **P1** | WS-21 |
| 3.16.11 | No status page / system health visible to users when Tulala has an outage | **P3** | WS-23 |

### 3.17 Operations, automation, and coordinator workflow

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.17.1 | No "my queue" view filtered to current coordinator | **P1** | WS-20 |
| 3.17.2 | No SLA timer per inquiry (X hours since last reply) | **P1** | WS-20 |
| 3.17.3 | No vacation-handover assistant — coordinator out, who covers? | **P1** | WS-20 |
| 3.17.4 | No auto-escalation when SLA missed | **P2** | WS-20 |
| 3.17.5 | No rules engine ("if X then Y") — auto-responder, auto-archive, auto-route | **P1** | WS-20 |
| 3.17.6 | No coordinator workload analytics (who's overloaded) | **P2** | WS-19 |
| 3.17.7 | No on-call rotation UX | **P3** | WS-20 |
| 3.17.8 | No team-wide calendar overlay | **P2** | WS-19 |

### 3.18 Reporting & analytics

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.18.1 | No revenue / MRR analytics for workspace owners | **P1** | WS-19 |
| 3.18.2 | No conversion funnel (inquiry → offer → booking) visible | **P1** | WS-19 |
| 3.18.3 | No top-talent / top-client rankings | **P2** | WS-19 |
| 3.18.4 | No churn signals or retention cohort views | **P2** | WS-19 |
| 3.18.5 | No A/B test result surfaces | **P3** | WS-23 |
| 3.18.6 | Talent has no career analytics ("you got X inquiries this quarter") | **P2** | WS-19 |
| 3.18.7 | Talent has no "your rate trend" insight (am I underpriced?) | **P3** | WS-19 |
| 3.18.8 | Clients have no "spend by talent / by agency" breakdown | **P2** | WS-19 |
| 3.18.9 | Clients have no budget tracking ("80% of Q2 budget used") | **P2** | WS-19 |

### 3.19 Email, SMS, transactional comms

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.19.1 | No email template system in the prototype — but real product needs ~30 email types | **P0** | WS-22 |
| 3.19.2 | No plain-text email variants (legal requirement in some markets) | **P1** | WS-22 |
| 3.19.3 | No email preview / branded customization per workspace | **P2** | WS-22 |
| 3.19.4 | No SMS UX for urgent notifications | **P2** | WS-22 |
| 3.19.5 | No welcome / onboarding email sequence | **P1** | WS-22 |
| 3.19.6 | No dunning email flow for failed payments | **P1** | WS-22 |
| 3.19.7 | No win-back / re-engagement campaigns for dormant users | **P2** | WS-22 |
| 3.19.8 | No event-driven nurture (you saved a search → 3 days later, send matches) | **P2** | WS-22 |

### 3.20 Marketing & growth

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.20.1 | Talent-invite flow exists in registry but not surfaced | **P2** | WS-23 |
| 3.20.2 | No agency-to-agency invite (network effect) | **P2** | WS-23 |
| 3.20.3 | No client invite flow | **P2** | WS-23 |
| 3.20.4 | No referral tracking or reward UX | **P2** | WS-23 |
| 3.20.5 | No affiliate dashboard for hub partners | **P3** | WS-23 |
| 3.20.6 | No A/B testing infrastructure for storefronts | **P3** | WS-23 |
| 3.20.7 | No talent-page / storefront SEO sitemap | **P3** | WS-14 |
| 3.20.8 | No referral attribution UX | **P3** | WS-23 |

### 3.21 Compliance, legal, audit

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.21.1 | No GDPR-grade data-export / data-portability UX | **P1** | WS-21 |
| 3.21.2 | No per-data-type visibility settings (who sees measurements vs contact) | **P1** | WS-21 |
| 3.21.3 | No per-recipient share log ("Atelier Roma viewed your passport on Mar 14") | **P2** | WS-21 |
| 3.21.4 | No "delete this conversation" flow | **P2** | WS-21 |
| 3.21.5 | No anonymized usage data toggle | **P2** | WS-21 |
| 3.21.6 | No consent log for marketing communications | **P1** | WS-21 |
| 3.21.7 | No data residency choice during signup | **P2** | WS-21 |
| 3.21.8 | No regulator-grade exportable signed audit log | **P2** | WS-21 |
| 3.21.9 | No insurance / KYC external-integration UX (Persona, Onfido, Stripe Identity) | **P1** | WS-5 / WS-21 |
| 3.21.10 | No takedown-request UX for talent (stolen polaroids, AI-generated portraits) | **P2** | WS-21 |
| 3.21.11 | No contract templates library (workspace-wide reusable templates) | **P2** | WS-21 |
| 3.21.12 | No "report content / report user" flow | **P2** | WS-21 |
| 3.21.13 | No platform trust signals (SOC 2, GDPR badge, security policy link) | **P3** | WS-21 |

### 3.22 Bulk operations & migration

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.22.1 | No CSV import for talent / clients / past bookings | **P1** | WS-25 |
| 3.22.2 | No email-parser → inquiry creation (forward to a Tulala address) | **P1** | WS-25 |
| 3.22.3 | No "drop me your Excel" migration assistant | **P2** | WS-25 |
| 3.22.4 | No "drop me your WhatsApp export" migration | **P3** | WS-25 |
| 3.22.5 | No bulk export of full workspace (for backup) | **P2** | WS-21 |
| 3.22.6 | No workspace-clone (e.g. start a sister agency) | **P3** | WS-25 |

### 3.23 Brand & creative tools

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.23.1 | No form builder for inquiry intake (custom qualifying questions) | **P2** | WS-26 |
| 3.23.2 | No structured creative-brief authoring tool for clients | **P2** | WS-26 |
| 3.23.3 | No central brand-asset library (logos, OG images, social cards) — currently scattered | **P2** | WS-26 |
| 3.23.4 | No custom code injection (tracking pixels, GA, FB pixel) | **P3** | WS-26 |
| 3.23.5 | No multi-stakeholder approval flow for big-client briefs | **P2** | WS-26 |

### 3.24 Drag & drop, reordering

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.24.1 | Talent portfolio photos use "move up/down" buttons, not drag | **P2** | WS-10 |
| 3.24.2 | Personal-page sections use buttons, not drag | **P2** | WS-10 |
| 3.24.3 | Shortlist priority order: same | **P2** | WS-10 |
| 3.24.4 | Pipeline columns / stages not user-configurable at all | **P3** | WS-20 |

### 3.25 AI-assist (the moat)

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.25.1 | No "suggest a reply" in messages | **P3** | WS-18 |
| 3.25.2 | No "summarize this thread" for long inquiries | **P3** | WS-18 |
| 3.25.3 | No "this offer is unusually low/high vs your past Casa Pero rates" | **P3** | WS-18 |
| 3.25.4 | No talent-side insight ("your last 10 declines were commercial") | **P3** | WS-18 |
| 3.25.5 | No AI chatbot fed by `DRAWER_HELP` registry | **P3** | WS-18 |

### 3.26 Help, support, and customer feedback

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.26.1 | `whats-new` drawer is mock — no real changelog mechanism | **P2** | WS-22 / WS-9 |
| 3.26.2 | No app-wide feedback button ("tell us what's wrong with this page") | **P2** | WS-9 |
| 3.26.3 | No NPS / CSAT survey flow | **P3** | WS-19 |
| 3.26.4 | No feature-request submission | **P3** | WS-9 |
| 3.26.5 | Help drawer is a stub — needs full IA: search, browse by topic, chat, ticket form | **P1** | WS-22 |
| 3.26.6 | Help-feedback thumbs (just shipped) need analytics dashboard for the docs team | **P3** | WS-19 |

### 3.27 Premium polish & system consistency

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.27.1 | Card variety is too high (white, surfaceAlt, bordered, shadowed, eyebrowed — all ad-hoc) | **P2** | WS-16 |
| 3.27.2 | Color drift exists in spots — gold/rust adjacent values flagged repeatedly | **P2** | WS-16 |
| 3.27.3 | Typography hierarchy inconsistent — page titles vary 18px–24px ad-hoc | **P2** | WS-16 |
| 3.27.4 | Empty states uneven — some rich, some bare text | **P2** | WS-9 / WS-0 |
| 3.27.5 | Hover/active state polish inconsistent — some chevrons rotate, some don't | **P3** | WS-16 |
| 3.27.6 | Activity feed re-implemented in 5 different places — needs primitive | **P2** | WS-16 |
| 3.27.7 | Confirmation patterns inconsistent — some confirm, some undo, some neither | **P2** | WS-0 / WS-6 |
| 3.27.8 | Motion specs not documented (durations, easings, choreography) | **P3** | WS-17 |
| 3.27.9 | Iconography reference missing — which icons exist, when to use which | **P3** | WS-17 |

### 3.28 Design system & handoff

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.28.1 | No Figma file exists for the prototype | **P0** | WS-17 |
| 3.28.2 | No Storybook / component playground | **P1** | WS-17 |
| 3.28.3 | No design tokens export (`.json` for Style Dictionary) | **P1** | WS-17 |
| 3.28.4 | No `STYLE.md` / `MOTION.md` / `A11Y.md` / `CONTENT.md` / `ICONS.md` | **P1** | WS-17 |
| 3.28.5 | No PR review checklist for design QA | **P2** | WS-17 / WS-24 |
| 3.28.6 | No public design system documentation site | **P3** | WS-17 |

### 3.29 Quality engineering & release

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.29.1 | No unit tests in the prototype | **P1** | WS-24 |
| 3.29.2 | No e2e tests (Playwright / Cypress) covering the critical flows | **P1** | WS-24 |
| 3.29.3 | No visual regression testing (Chromatic / Percy) | **P2** | WS-24 |
| 3.29.4 | No accessibility automation (axe-core in CI) | **P1** | WS-24 |
| 3.29.5 | No structured dogfood program | **P2** | WS-24 |
| 3.29.6 | No beta program / cohort-based rollout | **P2** | WS-24 |
| 3.29.7 | No release-rhythm convention (weekly? bi-weekly?) | **P2** | WS-24 |
| 3.29.8 | No feature-flag dashboard for cohort rollout | **P2** | WS-0 / WS-24 |
| 3.29.9 | No maintenance-window banner UX | **P3** | WS-23 |
| 3.29.10 | No production telemetry / analytics dashboard | **P1** | WS-19 / WS-24 |

### 3.30 Content & voice

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.30.1 | No content style guide (capitalization, voice, tone) | **P2** | WS-17 |
| 3.30.2 | No standard error message patterns | **P2** | WS-6 |
| 3.30.3 | No empty-state copy patterns | **P2** | WS-9 |
| 3.30.4 | Toast tone-of-voice inconsistent across surfaces | **P3** | WS-16 |

### 3.31 Missing user types (industry-specific)

The prototype models 4 surfaces (workspace / talent / client / HQ) but the real industry has distinct user types that need their own surfaces or extended role models.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.31.1 | **Casting director (CD)** is its own user type — works for brands but has distinct workflow (shortlist building, callbacks, avail-checks, structured feedback). Currently lumped into "client" | **P0** | WS-28 |
| 3.31.2 | **Production crew** (HMU artists, stylists, photographers, set designers) get booked alongside talent — multi-discipline bookings have no UX | **P1** | WS-29 |
| 3.31.3 | **Booker / agent / scout** within an agency are distinct from "coordinator/editor" — different responsibilities, different UI needs | **P1** | WS-20 (extend) |
| 3.31.4 | **Independent manager** (talent's personal manager, not agency-affiliated) — represents single talent, no workspace UX | **P2** | WS-31 |
| 3.31.5 | **Talent's parent/guardian** (for talent under 18) — co-pilot account with approval rights | **P0** | WS-31 |
| 3.31.6 | **Estate manager** for retired/deceased talent (legacy profiles still book) | **P3** | WS-31 |
| 3.31.7 | **Brand client** (in-house at a brand) vs **agency client** (creative/casting agency working for a brand) — different access patterns, neither modeled clearly | **P1** | WS-28 |
| 3.31.8 | **Photo studio owner** — rents space, books crew + talent, distinct from agency | **P2** | WS-29 |

### 3.32 Missing lifecycle stages

The prototype handles "inquiry → booking" well. The before-and-after stages are mostly absent.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.32.1 | **Casting flow** — open castings, closed castings, callbacks, avail-checks — distinct from inquiries, missing | **P0** | WS-28 |
| 3.32.2 | **Test shoots** — free shoots for portfolio (distinct from paid bookings), no surface | **P2** | WS-29 |
| 3.32.3 | **Holds vs options** — 1st-option / 2nd-option model (industry standard for indecision before commitment) — missing | **P1** | WS-30 |
| 3.32.4 | **Image rights / usage tracking** post-booking — when does usage expire, when is re-license needed | **P0** | WS-30 |
| 3.32.5 | **Re-license flow** — "we want to extend usage 6 months" — no surface | **P1** | WS-30 |
| 3.32.6 | **Tear-sheet collection** — published work proof, links to magazines/campaigns | **P2** | WS-30 |
| 3.32.7 | **Royalty schedules** — for usage-based fees (broadcast residuals, etc.) | **P2** | WS-30 |
| 3.32.8 | **Force majeure / cancellation** — weather, illness, no-show — penalty timing matrix not modeled | **P1** | WS-30 |
| 3.32.9 | **No-show / replacement** — talent doesn't appear, replacement found, audit trail | **P1** | WS-30 |
| 3.32.10 | **Career progression markers** — new face → working → established. No surface change as talent ascends | **P3** | WS-32 |

### 3.33 Missing on-set / production-day UX

The "during the booking" lifecycle has nothing live.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.33.1 | Live call-sheet sharing on production day — no real-time sync | **P1** | WS-33 |
| 3.33.2 | On-set check-ins ("Sofia arrived at 09:02") — no surface | **P1** | WS-33 |
| 3.33.3 | Live photo proofing during shoot (photographer pushes selects, client/talent reacts) | **P2** | WS-33 |
| 3.33.4 | Real-time wrap notifications | **P2** | WS-33 |
| 3.33.5 | Per-diems and meal logging | **P3** | WS-33 |
| 3.33.6 | Equipment / wardrobe checklist | **P3** | WS-33 |
| 3.33.7 | Transportation coordination (cars sent, meeting points) | **P2** | WS-33 |
| 3.33.8 | Crew timesheets (HMU started 06:00, ended 14:30 — for billing) | **P2** | WS-33 |

### 3.34 Discovery / marketplace mechanics

The discovery layer is barely modeled. For a multi-sided marketplace, this is core.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.34.1 | No "trending talent" curation | **P2** | WS-32 |
| 3.34.2 | No "just signed / new face" surface | **P2** | WS-32 |
| 3.34.3 | No "Editor's picks" curated by Tulala HQ | **P2** | WS-32 |
| 3.34.4 | No "similar to Sofia" search | **P1** | WS-32 |
| 3.34.5 | No geo-search ("models within 50km of London available next week") | **P1** | WS-32 |
| 3.34.6 | No saved-searches with auto-alerts (registered drawer exists, but no auto-alert UX) | **P1** | WS-32 |
| 3.34.7 | **Bias-auditing surfaces missing** — diverse talent should be equally surfaced; no transparency report | **P0** | WS-32 |
| 3.34.8 | No "who viewed me" surface for talent | **P3** | WS-32 |
| 3.34.9 | No top-X badges (top earner, top reviewed) — could gamify, but useful as social proof | **P3** | WS-32 |
| 3.34.10 | No achievement system (first booking, first 100 bookings) — retention | **P3** | WS-32 |

### 3.35 Safety, disputes, and on-set incident handling

Beyond compliance (WS-21), there's a real safety/trust layer that affects bookings daily.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.35.1 | No on-set incident reporting flow ("photographer was inappropriate") | **P0** | WS-34 |
| 3.35.2 | No photographer / studio safety scoring | **P1** | WS-34 |
| 3.35.3 | No background-check integration UX for production team | **P2** | WS-34 |
| 3.35.4 | No whistleblower / anonymous reporting channel | **P1** | WS-34 |
| 3.35.5 | No anti-trafficking signal flagging (someone may be coerced) | **P1** | WS-34 |
| 3.35.6 | No mediation flow for disputes (Tulala as neutral 3rd party) | **P1** | WS-34 |
| 3.35.7 | No bad-actor blacklist UX | **P2** | WS-34 |
| 3.35.8 | No minor-protection UX (under 18 talent has different rules) — beyond just having a parent account | **P0** | WS-34 |
| 3.35.9 | No pregnancy / health-disclosure UX (sensitive but legally required in some markets) | **P2** | WS-34 |
| 3.35.10 | No anti-discrimination signal flagging (client requesting only one ethnicity / body type) | **P1** | WS-34 |

### 3.36 Marketing & retention emotional UX

The growth/retention layer beyond functional features.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.36.1 | **No "first booking" celebration moment** — when a talent gets their first booking, there should be a magic moment | **P1** | WS-9 (extend) |
| 3.36.2 | **No "year-in-review"** Spotify-Wrapped-style surface (talent / agency / client) — huge retention lever | **P1** | WS-19 (extend) |
| 3.36.3 | No "career retrospective" exportable summary (for press kits, biographies) | **P2** | WS-32 |
| 3.36.4 | No streak tracking ("replied within 24h for 30 days") | **P3** | WS-32 |
| 3.36.5 | No anniversary tracking ("5 years with Atelier Roma") | **P3** | WS-19 |
| 3.36.6 | No "showcase event" UX — agencies host runway shows, open calls, polaroid days; missing | **P2** | WS-23 (extend) |
| 3.36.7 | No "browse without signing up" / sandbox mode for evaluators | **P2** | WS-9 (extend) |
| 3.36.8 | No source-aware onboarding (came via referral / hub / paid ad / organic — each should differ) | **P2** | WS-9 (extend) |

### 3.37 Account lifecycle: transfer / merge / inherit / minor

This is its own thing, not just "settings".

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.37.1 | No workspace-ownership transfer flow ("I'm selling Atelier Roma to a new owner") | **P1** | WS-31 |
| 3.37.2 | No workspace split flow ("starting a sister agency from this template") | **P3** | WS-25 |
| 3.37.3 | No workspace merge flow (acquisition) | **P3** | WS-31 |
| 3.37.4 | No graceful workspace shutdown ("we're closing the agency") — different from delete | **P2** | WS-31 |
| 3.37.5 | No "I have two accounts" merge flow | **P1** | WS-31 |
| 3.37.6 | No linked-account UX (vs merged) — sometimes you want to keep separate but linked | **P2** | WS-31 |
| 3.37.7 | No minor / parent-co-pilot UX — talent under 18 needs guardian approval; current model has no concept | **P0** | WS-31 |
| 3.37.8 | No estate management for retired/deceased talent | **P3** | WS-31 |
| 3.37.9 | No mother-agency / placement-agency hierarchy — just "exclusive vs not". Real industry has tiered representation | **P1** | WS-31 |
| 3.37.10 | No power-of-attorney / trusted-contact for account recovery | **P2** | WS-31 |

### 3.38 Communication beyond chat

Chat is the spine, but real production needs more.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.38.1 | No video call integration (embedded or deep-linked) | **P2** | WS-22 (extend) |
| 3.38.2 | No screen-share for live shoot review | **P2** | WS-22 (extend) |
| 3.38.3 | No whiteboard for shoot planning / mood-boarding live | **P3** | WS-22 (extend) |
| 3.38.4 | No live-streaming integration (remote client watches shoot live) | **P3** | WS-33 |

### 3.39bis Production feature inventory (the `/admin` route as it exists)

> **Critical context:** the `/admin` route is a **partially-built v1 product** that the prototype is replacing with a 360° redesign. But it has significant infrastructure already shipped that the prototype either glosses over or doesn't account for. This section catalogs what exists, what to keep, what to redesign, and what to deprecate.

**Existing nav structure** (3 groups, 13 items — production currently has more nav items than the prototype's planned 6):

| Group | Items | Prototype mapping |
|---|---|---|
| **Workspace** | Home, Requests, Bookings, Talents, Clients | Maps to WS-3 6-page workspace nav (Overview, Messages, Calendar, Roster, Clients) |
| **Site & AI** | Setup, Public site, Talent profiles, AI workspace | Site → WS-27 page-builder mgmt. AI → WS-18 (currently low-priority — needs PROMOTION based on this) |
| **System** | Account & billing, Settings, Team, Help | Folds into WS-3 Settings consolidation |

**Existing infrastructure to KEEP and integrate into the prototype:**

| # | Feature | Production location | Prototype-plan mapping | Action |
|---|---|---|---|---|
| **A** | **Inquiry Workspace v3** (25 component files, 7 panels, drill-sheets, thread switcher, status strip) | `web/src/app/(dashboard)/admin/inquiries/[id]/workspace-v3/` | WS-1 chat, WS-3 inquiry-workspace drawer | KEEP architecture, redesign visual layer |
| **B** | **AI Workspace** (provider registry, master-mode, usage controls, console, logs, match-preview, settings) | `web/src/app/(dashboard)/admin/ai-workspace/` | WS-18 AI assist | **PROMOTE WS-18 from Low → Medium-High priority**. Real infrastructure exists. |
| **C** | **Site Setup Wizard** — 6-step (homepage, pages, posts, navigation, theme, SEO), 1311 lines | `web/src/app/(dashboard)/admin/site/setup/` | WS-9 onboarding | KEEP 6-step flow as the canonical "site activation" template |
| **D** | **Analytics** with 6 cuts (overview, acquisition, funnels, search, seo, talent), 776 lines | `web/src/app/(dashboard)/admin/analytics/` | WS-19 reporting | EXTEND existing — don't rebuild. Add talent + client surfaces; add bias-auditing transparency |
| **E** | **Translations workflow** (bio workflow, tax-loc workflow, bulk-AI CTA) | `web/src/app/(dashboard)/admin/translations/` | WS-12 i18n | INTEGRATE — translations workflow exists; the i18n shell needs to call it |
| **F** | **Fields & Definitions editor** (custom-field schema, group panel, definition edit sheet) | `web/src/app/(dashboard)/admin/fields/` | WS-26.1 form builder + Field-catalog drawer | THIS IS the form builder. Surface in prototype properly. |
| **G** | **Docs system** (14 sub-topics: ai, analytics, api, clients, directory, featured, permissions, release-notes, search, settings, talent, taxonomy, translations, troubleshooting) | `web/src/app/(dashboard)/admin/docs/` | WS-17 design-system docs + WS-22.12 help drawer | DISTINGUISH operator docs (production) vs design-system docs (WS-17 STYLE.md etc). Both should exist. |
| **H** | **Impersonation** | `web/src/app/(dashboard)/admin/impersonation/` | WS-15 hybrid mode + platform-tenant-impersonate drawer | KEEP. Surface in HQ + workspace. |
| **I** | **Multi-agency** (`site/multi-agency`) + **Hub** (`site/hub`) + **Domain** (`site/domain`) + **API keys** (`site/api-keys`) | `web/src/app/(dashboard)/admin/site/` | WS-27 page-builder mgmt + WS-31 account lifecycle (mother-agency) + WS-23 (API keys + status page) | EXTEND each into the prototype's design language |
| **J** | **Site-settings deep tree** (audit, branding, content/{navigation, pages, posts, redirects}, design, identity, navigation, pages, sections, seo, structure, system) | `web/src/app/(dashboard)/admin/site-settings/` | WS-3 settings consolidation + WS-27 page-builder mgmt | RECONCILE — there are TWO site-related areas (`site/` and `site-settings/`). Pick one canonical home. |
| **K** | **Bookings v3 with `[id]/booking-header-form` + manual-booking-form** | `web/src/app/(dashboard)/admin/bookings/` | WS-29 production team multi-discipline | EXTEND for crew/multi-resource |
| **L** | **Locations** (location-rows-table) | `web/src/app/(dashboard)/admin/locations/` | NEW — wasn't in original plan | **Add: Locations as first-class entity (shoot locations, studios, recurring venues)** |
| **M** | **Taxonomy** (taxonomy-kind-panel, taxonomy-forms) | `web/src/app/(dashboard)/admin/taxonomy/` | WS-26 brand & creative tools | INTEGRATE |
| **N** | **Pulse strip** + **Top bar** + **Workspace shell** primitives | `web/src/components/admin/admin-pulse-strip.tsx`, `admin-top-bar.tsx`, etc. | WS-0 + WS-2 mobile | LEARN from these — don't rebuild from scratch. Migrate to design system. |
| **O** | **Command palette already exists** (`admin-command-palette.tsx`) | `web/src/components/admin/admin-command-palette.tsx` | WS-7 search palette | EXTEND — Cmd-K already built. |
| **P** | **Representation requests** with row actions | `web/src/app/(dashboard)/admin/representation-requests/` | Existing drawer in registry | KEEP behavior, redesign visual |
| **Q** | **Talent media manager** + **media library with pending/approved tabs** | `web/src/app/(dashboard)/admin/media/` + `admin-talent-media-manager.tsx` | WS-10 files (photo gallery primitive) | EXTEND |
| **R** | **Inquiry peek sheet** + **Booking peek sheet** + **Talent help popover** + **AI setup help popover** | `web/src/components/admin/admin-*-peek-sheet.tsx`, etc. | WS-1 + WS-22 (help drawer IA) | KEEP "peek" pattern — useful for quick-glance UX |
| **S** | **Status tabs** + **Status chip** + **Filter bar** primitives | `web/src/components/admin/admin-status-*.tsx`, `admin-filter-bar.tsx` | WS-0 primitives | LEARN — these are the production patterns. Migrate to design tokens. |

**Existing patterns to RECONCILE / RENAME for consistency:**
- Production calls inquiries "Requests"; prototype calls them "Inquiries" — pick one and update both
- Production has both `site/` AND `site-settings/` (overlapping) — fold into one
- Production has `users` (staff) vs `accounts` (talent/client?) vs `clients` vs `talent` — naming is muddled

**What's in production but NOT in the prototype's plan (needs to be added):**

1. **AI Workspace** as a primary nav area (PROMOTE WS-18)
2. **Locations** as a first-class entity (NEW)
3. **Taxonomy** as a primary management surface (existing prototype only references in passing)
4. **Bulk AI translation CTA** (deeper than what WS-12 i18n covers)
5. **Pulse strip** for at-a-glance counters (the production has this; prototype's `today-pulse` drawer is different)
6. **Field group panel + definition edit sheet** as the canonical custom-data UX

**What's in the prototype's plan but NOT in the production /admin (needs to be built fresh):**

1. Three-stream messaging architecture
2. Mobile-first design throughout
3. Drawer toolbar + help system (`_help.tsx` / `DRAWERS.md`)
4. 4 surfaces (workspace / talent / client / HQ) — production is workspace + HQ-ish only
5. Trust ladder visualization
6. Image rights / post-booking lifecycle (WS-30)
7. On-set / production-day live (WS-33)
8. Safety / disputes / minor protection (WS-34)
9. Casting director surface (WS-28)
10. Production team multi-discipline (WS-29)
11. Year-in-review + first-booking celebration moments
12. Bias-auditing transparency

---

### 3.39 Tax, banking, treasury depth

WS-5 covers basic money. The deeper financial automation layer is missing.

| # | Finding | Severity | WS |
|---|---|---|---|
| 3.39.1 | No 1099 generation for US talent | **P1** | WS-5 (extend) |
| 3.39.2 | No VAT MOSS / EU one-stop-shop reporting | **P1** | WS-5 (extend) |
| 3.39.3 | No reverse-charge handling for cross-border B2B | **P2** | WS-5 (extend) |
| 3.39.4 | No self-billing invoice mode | **P2** | WS-5 (extend) |
| 3.39.5 | No Net 30 / Net 60 / Net 90 payment timing (industry-standard) | **P1** | WS-5 (extend) |
| 3.39.6 | No holdback periods (e.g. 10% held until air date) | **P2** | WS-5 (extend) |
| 3.39.7 | No talent advance / loan UX (some agencies do this) | **P3** | WS-5 (extend) |
| 3.39.8 | No FX forward-contracts UX for high-value bookings | **P3** | WS-5 (extend) |
| 3.39.9 | No mass-payouts at end of month | **P2** | WS-5 (extend) |
| 3.39.10 | No insurance integration (production / liability / travel) | **P2** | WS-5 (extend) / WS-34 |

---

## 4. Master execution plan

> **32 workstreams** (WS-0 through WS-34, two gaps reserved for future scope). Each independently shippable. Sequenced via dependencies in §5.4. Tasks tagged `WS-N.M` for cross-reference.

**Workstream count by area:**
- Foundation, polish, design system: WS-0, WS-16, WS-17 (3)
- Core surfaces (chat, mobile, IA, drawers): WS-1–4 (4)
- Money + trust + compliance: WS-5, WS-21, WS-34 (3)
- Real-time + errors + search: WS-6, WS-7 (2)
- Surface polish: WS-8, WS-14, WS-15 (3)
- Onboarding + comms + notifications: WS-9, WS-11, WS-22 (3)
- Files, ops, reporting, AI: WS-10, WS-19, WS-20, WS-18 (4)
- i18n, a11y, performance: WS-12, WS-13 (2)
- Marketing, growth, migration, brand tools: WS-23, WS-25, WS-26 (3)
- Quality, release: WS-24 (1)
- Page-builder integration: WS-27 (1)
- **Round-4 additions (industry depth):** WS-28 (CD), WS-29 (production team), WS-30 (image rights), WS-31 (account lifecycle), WS-32 (discovery), WS-33 (on-set), WS-34 (safety) (7)

### WS-0 Foundation (1 wk · blocks everything)

**Goal:** primitives + telemetry + tokens that all other workstreams need.

| Task | Description | Effort |
|---|---|---|
| **0.1** `useViewport()` hook | `phone <768 / tablet <1024 / desktop <1280 / wide ≥1280`. SSR-safe, debounced, listener-cleanup | 0.5d |
| **0.2** `<Card variant>` primitive | `primary / info / quiet`. Locks down bg, border, shadow, padding, radius | 0.5d |
| **0.3** `<EmptyState>` primitive | icon, title, body, CTA | 0.5d |
| **0.4** `useFeatureFlag(key)` hook | URL `?flag=foo,bar` + localStorage override | 0.5d |
| **0.5** `track(event, props)` shim | No-op until analytics SDK lands; events typed | 0.5d |
| **0.6** Typography primitives | `<H1> <H2> <H3> <Eyebrow> <Caption>` | 0.5d |
| **0.7** `<Skeleton>` primitive | text / circle / block / table-row variants | 0.5d |
| **0.8** `<ConfirmDialog>` primitive | unified destructive-action confirm with optional "type the name" | 0.5d |
| **0.9** Toast queueing | max-3 stack, FIFO with priority slot for errors | 0.5d |
| **0.10** Design tokens export | `scripts/export-tokens.ts` → `tokens.json` (Style Dictionary format) | 0.5d |
| **0.11** `data-tulala-*` selector convention header comment in `_primitives.tsx` | Document what exists; new components MUST follow | 1h |
| **0.12** ESLint rule: no inline hex outside `COLORS` | Custom rule in `.eslintrc` | 2h |
| **0.13** ESLint rule: no string literals in JSX (i18n prep) | Allow-list approach | 2h |

**DoD:** all 13 land. `npx tsc --noEmit` 0 errors. Storybook (or equivalent) renders each primitive. Tokens JSON is consumable.

---

### WS-1 Chat & messaging (4 wks · the biggest user-facing win)

**Goal:** chat surfaces feel calm, structured, real-time. Inquiry workspace responsive across viewports. Three-stream model surfaces correctly.

| Phase | Task | Effort |
|---|---|---|
| **A** Responsive inquiry workspace | Replace hard 320px Rail. Phone: vertical stack + horizontal tab strip + bottom-sheet rail cards. Tablet/desktop: current. Wide: dual-pane (private+group) with thin mini-rail | 5d |
| **A.1** Bottom-sheet primitive | Slide-up, drag-down dismiss, snap points (peek/half/full), `safe-area-inset-bottom` | 2d |
| **B.1** Date dividers in message stream | "Today / Yesterday / Mar 14" between message clusters >4h apart | 0.5d |
| **B.2** System-event grouping | 2+ consecutive system events collapse into "3 system updates ▾" stripe | 1d |
| **B.3** Floating "↓ Latest" pill | Visible when scrolled >200px from bottom | 0.5d |
| **B.4** "Mark thread read" toolbar action | New drawer header button; clears unread count | 0.5d |
| **C.1** Composer thread-context | Placeholder + tinted border per active thread | 0.5d |
| **C.2** Composer caption on phones | "Posting to: <thread name>" | 0.5d |
| **C.3** Composer attachments | Drag-drop, paste image, voice memo, file upload | 2d |
| **C.4** @-mention typeahead | Avatar previews + role chips + keyboard-nav | 1.5d |
| **C.5** Smart reply suggestions (flagged) | "Nudge client?" "Confirm date?" — feature-flag for testing | 1d |
| **C.6** Optimistic send with retry | Pending → sent → failed → retry, all visible | 1d |
| **C.7** Per-thread draft auto-save | Closing drawer doesn't lose unsent text | 0.5d |
| **D.1** Typing indicators | "Hannah is typing…" per thread, mocked WebSocket | 1.5d |
| **D.2** Read receipts | Per-message; hover for "seen at" timestamp | 1d |
| **D.3** "Viewing now" badge | "Marco is viewing this inquiry" in Rail | 1d |
| **D.4** Live unread updates | WebSocket-driven count refresh | 1d |
| **D.5** Reconnect-on-flake UX | Loss-of-connection banner, queue messages, replay on reconnect | 1d |
| **E.1** `requiresAction` system messages | Coral inline-banner with "Resolve →" CTA | 1d |
| **E.2** Offer/payment events as pointers | Stream message becomes pill; click scrolls Rail card into view (or opens bottom-sheet on mobile) | 1d |
| **F.1** Participant chip strip on group threads | Avatars above stream; click filters to that person | 1d |
| **F.2** Roster preview snippets | "Last said: 2h ago — '…'" per talent in roster panel | 0.5d |
| **G.1** Inline thread search | "/" focuses search; highlights matches in stream | 1d |

**DoD:** all surfaces clean at 375pt + 1440pt. Telemetry events firing. Internal team dogfoods 1 wk behind `?flag=messages-v2`. Flag flips on after.

---

### WS-2 Mobile & nav (2 wks)

**Goal:** mobile experience native-feeling, not retrofitted. Sticky-stack diet. Bottom-sheet support. 100% tap targets ≥44pt.

| Task | Description | Effort |
|---|---|---|
| **2.1** Drawer size toolbar hides <768pt | Useless on phones (everything is 96vw) | 30m |
| **2.2** Sticky-stack diet | IdentityBar OR Topbar on mobile; page tabs become horizontal scroll under IdentityBar | 1d |
| **2.3** Bottom-sheet primitive | (covered in WS-1.A.1) | — |
| **2.4** Pull-to-refresh | Today + Messages on all surfaces. Single primitive | 1d |
| **2.5** Standardized `SwipeableRow` | Right=archive, left=unread-toggle, applied everywhere | 1.5d |
| **2.6** Calendar agenda view as mobile default | List view <768pt; month grid is opt-in | 1d |
| **2.7** Single FAB system | `<FabHost>` provider — only one FAB visible at once | 1d |
| **2.8** Composer keyboard handling | Recompute layout on iOS keyboard open; visualViewport API | 0.5d |
| **2.9** Tap target audit | Sweep — all interactive elements ≥44pt × 44pt mobile | 1d |
| **2.10** Bottom-nav redesign | Better labels, active polish, badge bump animation, max-5 + "More" | 1d |
| **2.11** Long-form drawer sticky save bar | Auto-applied to forms with multiple sections | 0.5d |

---

### WS-3 Workspace consolidation (1.5 wks · after WS-1 dogfood ≥3d)

**Goal:** workspace nav drops from 9 → 6. URL aliases for compat. Settings unified.

| Task | Description | Effort |
|---|---|---|
| **3.1** New `WorkspacePage` union: 6 pages | `overview / messages / calendar / roster / clients / settings` | 0.5d |
| **3.2** Rename `inbox` → `messages` | Match talent + client. Page component + sidebar label | 0.5d |
| **3.3** Merge `work` content into `messages` as "By stage" filter | Pipeline columns visible as a tab/view | 1d |
| **3.4** Move `site` to standalone route | `/site` is its own surface; IdentityBar gets affordance | 2d |
| **3.5** Settings page redesign | Anchor-link sub-nav (Account · Plan & billing · Workspace · Domain · Branding · Team · Integrations · Danger zone). Dirty-state guard on nav-away | 2d |
| **3.6** URL aliases | `?page=inbox / work / site / billing / workspace` → new structure | 0.5d |
| **3.7** Telemetry: `legacy_page_url_resolved` event | Drop aliases when count is near-zero | 0.5h |
| **3.8** `DRAWER_HELP` + `DRAWERS.md` updates | Reflect new nav | 0.5d |

---

### WS-4 Drawer rationalization (2.5 wks · after WS-3)

**Goal:** drop drawer count from 149 to ~115. Demote ~30 to popovers. Promote ~5 to pages. Confirm dialog primitive lands.

| Task | Description | Effort |
|---|---|---|
| **4.1** Classification sweep (spreadsheet) | Tag each of 149: `popover / drawer / dialog / page` | 2d |
| **4.2** `<ModalPopover>` primitive | Position-aware, click-outside, no full-overlay | 1d |
| **4.3** Demotion: ~30 drawers → popovers | Bulk migration | 4d |
| **4.4** Promotion: 5 drawers → routes | `inquiry-workspace`, `talent-personal-page`, `client-shortlist-detail`, `plan-compare`, `homepage` editor — real URLs, browser-back | 3d |
| **4.5** `DRAWER_HELP.shape` field | Schema extension; `_help.tsx` UI auto-renders correct chrome | 0.5d |
| **4.6** `<ConfirmDialog>` migration | 8–10 destructive-action sites move from toast confirm to dialog | 1d |
| **4.7** Drawer back-stack improvements | Browser-back integration via History API | 1d |

---

### WS-5 Money & trust (2 wks · runs parallel to WS-1)

**Goal:** money screens pass the "where is my money right now?" test. Trust ladder visible everywhere. KYC + proof-of-funds flows real.

| Task | Description | Effort |
|---|---|---|
| **5.1** Escrow visualization | Green padlock when funded; state-machine display Authorized → Held → Released | 2d |
| **5.2** Multi-currency support | Workspace default + per-booking override. Live FX (mocked) | 2d |
| **5.3** Refund flow (all sides) | Client / talent / agency / platform — reasons, partial vs full, audit trail | 3d |
| **5.4** Milestone payments | For long projects (campaigns spanning weeks) | 2d |
| **5.5** Tax breakdown clarity | Every payment: gross / fees / tax / net with hover tooltips | 1d |
| **5.6** Commission split for talent | `talent-earnings-detail` shows agency share + kit fees | 1d |
| **5.7** Payout-method failure UX | Wrong IBAN, expired card, suspicious bank — recovery flows | 1d |
| **5.8** Dispute / chargeback UX | Client-initiates, freezes funds, coordinator-led resolution | 2d |
| **5.9** Trust ladder detail surfaces | Tier explanation drawers; surfaced on talent inbox + inquiry workspace + client profile | 2d |
| **5.10** KYC verification flow | Talent uploads ID + selfie; status visible across app | 2d |
| **5.11** Proof-of-funds for clients | Bank-link or wire-deposit verification (Silver/Gold) | 2d |
| **5.12** Multi-card vault | Multiple payment methods, default per workspace | 1d |
| **5.13** Apple Pay / Google Pay | Modern checkout for mobile | 1d |
| **5.14** Subscription lifecycle UX | Trial → paid, downgrade grace period, pause, reactivate, cancel + win-back | 2d |

---

### WS-6 Real-time + error UX (2 wks · after WS-1 stable)

**Goal:** the app behaves gracefully when things break. Loading states everywhere.

| Task | Description | Effort |
|---|---|---|
| **6.1** Error toast variants | Error / Warning / Success / Info with distinct visual + icon | 0.5d |
| **6.2** `<Field error>` validation primitive | Red border, field-level error, `aria-invalid` | 1d |
| **6.3** `<UnsavedChangesGuard>` | Wraps drawer / page; intercepts close / nav | 1d |
| **6.4** Optimistic UI rollback recipe | `useOptimistic` pattern + visual rollback indicator | 1d |
| **6.5** Offline banner (extend existing) | `_primitives.tsx:4517` extended to queue messages, "will send when online" | 1d |
| **6.6** Stale-data detection | "Updated by Marco — refresh ↻" pill | 1d |
| **6.7** Sending / failed / retry flow | Every async action gets the pattern | 1d |
| **6.8** Conflict-resolution dialog | Two users edit; show diff; pick | 1.5d |
| **6.9** Empty states per surface | 12 surface-specific states using `<EmptyState>` | 2d |
| **6.10** Skeleton states per surface | 8 most-used pages/drawers instrumented | 2d |

---

### WS-7 Search + power-user (1.5 wks)

**Goal:** Cmd-K palette ships. Bulk actions. Keyboard shortcuts. Discoverable.

| Task | Description | Effort |
|---|---|---|
| **7.1** `<CommandPalette>` (Cmd-K) | Searches drawers (from registry), inquiries, clients, talent, settings | 3d |
| **7.2** Cross-thread message search | Separate from inline `/` search; results paginated | 1.5d |
| **7.3** Saved-search inline trigger | "Save this view" chip when filters applied | 0.5d |
| **7.4** Keyboard-shortcut layer | `j/k` (next/prev row), `e` (archive), `r` (reply), `c` (compose), `g+i / g+c / g+t` (go to inbox/calendar/talent) | 2d |
| **7.5** Keyboard-shortcut help overlay | `?` outside drawer pops cheatsheet; in drawer keeps existing behavior | 0.5d |
| **7.6** Bulk-action bar | Appears when 2+ rows selected — bulk archive / assign / export | 1.5d |

---

### WS-8 Talent + client polish (2 wks · independent)

**Goal:** talent + client surfaces feel finished. Premium personal-page editor. Client analytics.

| Task | Description | Effort |
|---|---|---|
| **8.1** Talent: drop `activity` from primary nav | Move into Settings → History | 2h |
| **8.2** Talent: split `reach` into `agencies` + `public-page` | Two clearer tabs | 1.5d |
| **8.3** Talent: earnings tile on Today | Cycle / month / year + sparkline | 1d |
| **8.4** Talent: this-week rhythm view | 7-day strip below earnings tile | 1d |
| **8.5** Talent: career analytics | "You got X inquiries this Q" view | 1d |
| **8.6** Talent: public-page editor | WYSIWYG / side-by-side. Pro vs Portfolio gating. Layout templates | 3d |
| **8.7** Talent: claim-URL flow when slug taken | Suggest alternatives, dispute process | 1d |
| **8.8** Client: saved-search alerts UI | "Email me when matches" toggle per saved search | 1d |
| **8.9** Client: "My talent" page | Repeat-bookings dashboard, quick-rebook CTAs | 1.5d |
| **8.10** Client: counter-offer diff view | Side-by-side current vs counter | 1.5d |
| **8.11** Client: spend by talent / by agency | Reporting tile under bookings | 1d |
| **8.12** Client: budget tracking ("80% of Q2 used") | Budget set + spend alerts | 1d |
| **8.13** Talent: receive reviews UX | After-booking rating prompt; structured dimensions | 1d |
| **8.14** Talent: agency analytics | "Your top agencies by booking volume" | 0.5d |

---

### WS-9 Onboarding + empty states (1.5 wks · after WS-2)

**Goal:** every first-run feels guided, not blank. Demo data option for evaluators.

| Task | Description | Effort |
|---|---|---|
| **9.1** Workspace activation v2 | Progress indicator, smart prompts, dismiss-and-remind | 1d |
| **9.2** Talent first-run | Guided 3-step (claim profile, polaroids, availability) | 2d |
| **9.3** Client first-run | Guided onboarding (verify, save first search, send first inquiry) | 2d |
| **9.4** Demo-data seeding | "Show me with sample data" toggle for evaluators | 1d |
| **9.5** Re-onboarding for returning users | After 30d idle: "what's new since you were here" | 0.5d |
| **9.6** Role-aware onboarding | Coordinator-joining flow ≠ owner-setup flow | 1d |
| **9.7** `<GuidedTour>` primitive | Spotlight + tooltip-step, dismissible, resumable | 2d |
| **9.8** App-wide feedback button | "Tell us what's wrong with this page" | 0.5d |

---

### WS-10 Files, attachments, contracts (2 wks · after WS-1.C)

**Goal:** files become first-class citizens. Real e-sign flow.

| Task | Description | Effort |
|---|---|---|
| **10.1** Composer attachments | (covered in WS-1.C.3) | — |
| **10.2** Inline previews in messages | PDF / image / video / audio | 2d |
| **10.3** Files tab on inquiry workspace | Central library per thread | 1d |
| **10.4** Bulk download (zip) | Per booking | 0.5d |
| **10.5** File version history | Replace, keep prior | 1d |
| **10.6** `<SignaturePad>` + e-sign flow | Audit trail, countersigning | 3d |
| **10.7** Contract diff view | offer-v1 vs offer-v2, line-by-line | 2d |
| **10.8** `<PhotoGallery>` primitive | Bulk upload, drag-reorder, batch tagging, replace-everywhere | 3d |
| **10.9** Drag-drop reordering everywhere | Photos, sections, shortlists | 1d |
| **10.10** File virus-scan / size-limit UX | Visible scanning state | 0.5d |

---

### WS-11 Notifications system (1.5 wks · independent)

**Goal:** notifications match user attention model. Multi-channel granularity.

| Task | Description | Effort |
|---|---|---|
| **11.1** Per-channel granularity | In-app / email / push / SMS toggles per type | 1.5d |
| **11.2** Batching logic | "3 new messages from Casa Pero" instead of 3 entries | 1d |
| **11.3** Deep-link routing | Email-click on phone deep-links to drawer + payload | 1d |
| **11.4** DND / quiet hours | Global toggle + schedule per day | 0.5d |
| **11.5** Preview vs full content | Lock-screen privacy toggle | 0.5d |
| **11.6** Notification history | Beyond 30 days, paginated, filterable | 1d |
| **11.7** Action history surface | "Things you did" view (separate from inbound notifications) | 1d |
| **11.8** Cross-device unread sync | Read on web → cleared on phone | 1d |

---

### WS-12 i18n + a11y (2 wks)

**Goal:** WCAG AA compliance. i18n scaffolding. Time-zone correctness.

| Task | Description | Effort |
|---|---|---|
| **12.1** i18n scaffolding | `next-intl` (or chosen lib); strings extracted to JSON | 3d |
| **12.2** `Intl.DateTimeFormat / NumberFormat` sweep | All date/number/currency rendering | 1d |
| **12.3** Time-zone awareness | Per-booking dual display (your time / their time) | 1.5d |
| **12.4** RTL audit + fixes | Flip layouts, mirror chevrons, mirror drawer-direction | 1.5d |
| **12.5** Imperial / metric workspace-wide | (currently per-talent only) | 0.5d |
| **12.6** Keyboard-only nav pass | Arrow keys on lists, focus management on drawer close | 2d |
| **12.7** Screen-reader pass | VoiceOver + NVDA spot-check; ARIA live regions for toasts + new messages | 1.5d |
| **12.8** High-contrast mode | macOS Increase Contrast + Windows High Contrast | 0.5d |
| **12.9** Color-only-signal removal | Every color signal also has text or icon | 1d |
| **12.10** Skip-to-main-content links sitewide | (currently only one) | 0.5d |
| **12.11** Reduced-motion site-wide | Honor preference everywhere, not just help panel | 0.5d |

---

### WS-13 Performance (1 wk · late)

**Goal:** sub-1s TTI on 4G. Bundle budgets enforced.

| Task | Description | Effort |
|---|---|---|
| **13.1** Code-splitting per surface | Workspace / talent / client / platform are separate chunks | 1d |
| **13.2** Split `_talent.tsx` (18.8k lines) | By page | 1.5d |
| **13.3** List virtualization | react-virtuoso on inbox, calendar, message stream, roster, file library | 2d |
| **13.4** Image lazy-loading | IntersectionObserver-based on portfolios + media | 0.5d |
| **13.5** Prefetch on hover | Sidebar links, message-row hovers | 0.5d |
| **13.6** CSS extraction | vanilla-extract or similar; inline styles → static CSS | 2d |
| **13.7** Bundle-size budgets | Per surface; enforce in CI | 0.5d |
| **13.8** Web Vitals dashboard | `web-vitals` library + telemetry pipe | 0.5d |

---

### WS-14 Public surfaces + SEO (1.5 wks · after WS-8)

**Goal:** public storefront, talent public page, hub directory all production-quality. SEO instrumented.

| Task | Description | Effort |
|---|---|---|
| **14.1** Workspace storefront design | Proper layout, hero, talent grid, CTA | 2d |
| **14.2** Talent public page (covered in WS-8.6) | — | — |
| **14.3** Hub directory listing | Searchable, filterable, paginated | 1.5d |
| **14.4** SEO preview tool | Visual mock of "what Google sees" | 1d |
| **14.5** OG card preview | Drag-drop OG image + visual preview | 0.5d |
| **14.6** "View as visitor" toggle | Anonymous-eye view of any surface | 1d |
| **14.7** Public-side analytics tile | Visitor count, top-talent views | 1d |
| **14.8** schema.org markup | Person/Performer for talent, Organization for workspaces, ItemList for hubs | 1d |
| **14.9** Sitemap / robots.txt UX | Workspace-owner controls | 1d |

---

### WS-15 Multi-tenant hybrid mode (1.5 wks · after WS-3)

**Goal:** talent who own workspaces have a coherent UX.

| Task | Description | Effort |
|---|---|---|
| **15.1** Mode-switcher UX | Top-nav indicator + toggle | 1d |
| **15.2** Inbox separation | Personal vs workspace; tab-strip filter | 1d |
| **15.3** Conflict-of-interest UX | Banner + escalation path when agency offers job to you-as-talent | 1.5d |
| **15.4** Books / money separation | Personal earnings vs workspace's books | 1.5d |
| **15.5** Plan-tier × role matrix surface | Settings reference of what each plan + role can do | 1d |
| **15.6** Hybrid signup flow | Special path that asks "are you also workspace owner?" | 1d |

---

### WS-16 Premium primitives + polish (1 wk · last)

**Goal:** consistency sweep. No drift.

| Task | Description | Effort |
|---|---|---|
| **16.1** Card archetype migration | Sweep `_pages.tsx`, `_talent.tsx`, `_client.tsx`, `_drawers.tsx` | 2d |
| **16.2** Color drift codemod | Regex sweep + manual review; ESLint rule (in WS-0.12) | 0.5d |
| **16.3** Hover/active state consistency | One transition system applied everywhere | 1d |
| **16.4** Empty-state migration | All `No results.` → `<EmptyState>` | 1d |
| **16.5** Motion specs | Durations + easings + choreography table | 0.5d |
| **16.6** Iconography reference | Define icon set, when to use which | 0.5d |
| **16.7** `<ActivityFeed>` primitive | Replace 5 ad-hoc feeds | 1d |
| **16.8** Toast tone-of-voice sweep | Consistent voice across all toasts | 0.5d |

---

### WS-17 Design system handoff (ongoing)

**Goal:** a UX designer can be productive in their first week.

| Task | Description | Effort |
|---|---|---|
| **17.1** Figma file with components | Mirror `_primitives.tsx`, with variants | ongoing |
| **17.2** Storybook | Every primitive in isolation with controls | 3d initial |
| **17.3** Design tokens export | (covered in WS-0.10) | — |
| **17.4** `STYLE.md` | Anatomy of a card, drawer, typography, spacing, color decision tree | 2d |
| **17.5** `MOTION.md` | Durations, easings, choreography, do's/don'ts | 0.5d |
| **17.6** `A11Y.md` | Keyboard map, ARIA conventions, screen-reader patterns | 0.5d |
| **17.7** `CONTENT.md` | Voice, tone, capitalization, error message style, empty-state copy patterns | 1d |
| **17.8** `ICONS.md` | Registry of icons + when-to-use guidance | 0.5d |
| **17.9** PR review checklist | Design-side gate before merge | 0.5d |
| **17.10** Public design system docs site | Optional; markdown rendered | 1d |

---

### WS-18 AI assist (2 wks · **PROMOTED to medium-high — production has real infrastructure**)

**Goal:** the registry becomes a moat via AI features.

| Task | Description | Effort |
|---|---|---|
| **18.1** Reply suggestions in composer | 3 dismissible suggestions; flagged | 2d |
| **18.2** Thread summarize | "Summarize this 80-message thread" button | 1.5d |
| **18.3** Anomaly detection on offers | "Unusually low for Casa Pero" insights | 2d |
| **18.4** Talent-side insights | "Last 10 declines were commercial" | 1.5d |
| **18.5** AI help-bot fed by `DRAWER_HELP` | Contextual chat using registry as RAG corpus | 3d |
| **18.6** "What changed" smart digest | AI-summarized weekly recap email | 1d |

---

### WS-19 Reporting & analytics dashboards (1.5 wks · NEW)

**Goal:** workspace owners, talent, and clients each have a "how am I doing?" dashboard.

| Task | Description | Effort |
|---|---|---|
| **19.1** Workspace revenue / MRR analytics | Trends, breakdowns, forecasts | 2d |
| **19.2** Conversion funnel (inquiry → offer → booking) | Drop-off visible per stage | 1.5d |
| **19.3** Top-talent / top-client rankings | By revenue, by volume, by NPS | 1d |
| **19.4** Coordinator workload analytics | Who's overloaded, who's idle | 1d |
| **19.5** Talent career analytics | (covered in WS-8.5) | — |
| **19.6** Client spend tracking | (covered in WS-8.11) | — |
| **19.7** A/B test result surfaces | (depends on WS-23) | 1d |
| **19.8** NPS / CSAT survey infra | Post-booking + periodic | 1.5d |
| **19.9** Help-feedback dashboard for docs team | (consumes WS-0 telemetry from help thumbs) | 0.5d |
| **19.10** Bundled "Tulala for Owners" weekly digest email | (overlaps WS-22) | 0.5d |

---

### WS-20 Operations & workflow automation (2 wks · NEW)

**Goal:** coordinators have a daily playbook. Automation handles repetition.

| Task | Description | Effort |
|---|---|---|
| **20.1** Coordinator "my queue" view | Filtered to current user; SLA timers visible | 1d |
| **20.2** SLA timer per inquiry | "Hours since last reply"; warns at threshold | 1d |
| **20.3** Vacation handover assistant | "Hannah is out — temp-route her inquiries to Marco" | 1.5d |
| **20.4** Auto-escalation when SLA missed | Notifies senior coordinator + mocked surface | 1d |
| **20.5** Rules engine (`<RulesBuilder>`) | "If X then Y" — auto-archive idle, auto-route by client | 3d |
| **20.6** Common rule templates | Pre-built: auto-respond to new inquiry, auto-archive >30d, auto-route Casa Pero to Hannah | 1d |
| **20.7** On-call rotation UX | Schedule view + handover prompts | 1d |
| **20.8** Team-wide calendar overlay | All coordinators' availability | 1d |
| **20.9** Saved replies / canned responses (extend `inbox-snippets`) | Searchable library, merge tags | 1d |
| **20.10** Pipeline customization | Workspaces edit their stage names + colors | 1d |

---

### WS-21 Compliance, legal, audit (2 wks · NEW)

**Goal:** GDPR / CCPA / LGPD readiness. Regulators-grade audit trail. Legal artifacts.

| Task | Description | Effort |
|---|---|---|
| **21.1** GDPR-grade data export | Per data type (messages, profile, files), portable JSON + ZIP | 1.5d |
| **21.2** Per-data-type visibility settings | Public / agencies-only / private; per-recipient log | 1d |
| **21.3** Per-recipient share log | "Atelier Roma viewed your passport on Mar 14" | 1d |
| **21.4** "Delete this conversation" flow | Soft-delete, 30-day grace, hard-delete after | 1d |
| **21.5** Consent log for marketing | Per-channel, timestamped, exportable | 1d |
| **21.6** Data residency picker | EU / US / etc. during signup | 1d |
| **21.7** Regulator-grade audit log | Exportable, signed, immutable; cryptographic chain | 2d |
| **21.8** Cookie consent UX for storefronts | Customizable per workspace | 1d |
| **21.9** Insurance / KYC external integrations | Persona / Onfido / Stripe Identity flow visualization | 1.5d |
| **21.10** Takedown request UX | Talent flag stolen polaroids / AI-generated portraits | 1d |
| **21.11** Contract templates library | Workspace-wide reusable templates with merge fields | 2d |
| **21.12** "Report content / report user" flow | Entry point + queue routing | 1d |
| **21.13** Platform trust signals | SOC 2, GDPR badge, security policy link in footer | 0.5d |
| **21.14** Anti-fraud signals (AI-generated photo detection) | Flag suspicious uploads | 1.5d |

---

### WS-22 Email + transactional comms (1.5 wks · NEW)

**Goal:** the email / SMS layer that real users actually live in is designed.

| Task | Description | Effort |
|---|---|---|
| **22.1** Email template system (e.g. react-email) | 30+ template inventory; mocked send pipeline | 2d |
| **22.2** Plain-text variants | Required by some regulators / accessibility | 1d |
| **22.3** Branded customization per workspace | Logo, colors, sender name | 1d |
| **22.4** Welcome / onboarding email sequence | 5–7 emails, role-aware | 1d |
| **22.5** Dunning email flow | Failed payment retry sequence | 1d |
| **22.6** Win-back / re-engagement | 30 / 60 / 90-day cadence | 1d |
| **22.7** Event-driven nurture | "You saved a search → 3 days later, send matches" | 1d |
| **22.8** SMS UX for urgent | Booking-day reminders, confirmations | 1d |
| **22.9** Unsubscribe + preferences UX | Granular; double-opt-in | 0.5d |
| **22.10** Email-thread view in app | Show what users received via email | 1d |
| **22.11** `whats-new` proper changelog mechanism | "Mark seen", deep-links, video/GIF embeds | 1d |
| **22.12** Help-drawer proper IA | Search + browse + chat + ticket — replaces stub | 1d |
| **22.13** Print-friendly thread / contract view | PDF export | 1d |

---

### WS-23 Marketing & growth (2 wks · NEW)

**Goal:** referrals, affiliates, A/B testing infra, status page.

| Task | Description | Effort |
|---|---|---|
| **23.1** Talent invite flow surface | (registry exists, surface missing) | 1d |
| **23.2** Agency-to-agency invite | Network effect for hubs | 1d |
| **23.3** Client invite flow | "Invite your brand contact" | 0.5d |
| **23.4** Referral tracking + rewards | Per-referrer dashboard, reward tiers | 1.5d |
| **23.5** Affiliate program for hubs | Hub partners track + earn | 1.5d |
| **23.6** A/B testing infra | Workspaces A/B their storefront hero | 2d |
| **23.7** Public status page | Tulala uptime + incident log | 1d |
| **23.8** Maintenance-window banner UX | Scheduled-downtime notice | 0.5d |
| **23.9** Calendar integrations | iCal sub URL, Google / Outlook sync | 2d |
| **23.10** "Add to phone calendar" deep links | Per booking | 0.5d |
| **23.11** iOS widget / lock-screen | Today's bookings | 2d |
| **23.12** PWA install prompt UX | Capable browsers | 0.5d |

---

### WS-24 Quality, testing, release engineering (1 wk · NEW)

**Goal:** prototype → production quality bar. Tests, CI, dogfood, beta.

| Task | Description | Effort |
|---|---|---|
| **24.1** Unit test scaffolding | Vitest + React Testing Library | 0.5d |
| **24.2** E2E tests for critical flows | Playwright covering: send inquiry, accept offer, fund booking, complete | 2d |
| **24.3** Visual regression testing | Chromatic or Percy on Storybook | 1d |
| **24.4** Accessibility automation | axe-core in CI | 0.5d |
| **24.5** Structured dogfood program | Internal users + feedback loop | 0.5d |
| **24.6** Beta program / cohort rollout | 10% → 50% → 100% via feature flags | 0.5d |
| **24.7** Release rhythm convention | Weekly or bi-weekly; documented | 0.5d |
| **24.8** Production telemetry dashboard | (consumes WS-0.5 events) | 1d |
| **24.9** Error monitoring (Sentry or similar) | Capture frontend errors | 0.5d |
| **24.10** Performance monitoring (Web Vitals) | (overlaps WS-13.8) | — |
| **24.11** Design QA gate per PR | Designer reviews implementation against Figma | ongoing |
| **24.12** Content QA gate per PR | Writer reviews copy | ongoing |

---

### WS-25 Bulk operations + migration (1.5 wks · NEW)

**Goal:** new workspace setup is fast. Migration from WhatsApp / Excel is real.

| Task | Description | Effort |
|---|---|---|
| **25.1** CSV import for talent | Map columns, validate, dry-run, commit | 1.5d |
| **25.2** CSV import for clients | Same pattern | 1d |
| **25.3** CSV import for past bookings | Map to inquiries / bookings | 1d |
| **25.4** Email-parser → inquiry creation | Forward to a Tulala address | 2d |
| **25.5** "Drop me your Excel" migration assistant | AI-assisted column mapping | 1.5d |
| **25.6** WhatsApp export migration | Parse exported `.txt` for prior client conversations | 2d |
| **25.7** Workspace clone | "Start a sister agency from this template" | 1d |
| **25.8** Backup + restore for workspace owners | Full export, import to new workspace | 1d |

---

### WS-26 Brand & creative tools (1.5 wks · NEW)

**Goal:** workspaces own their brand. Clients author rich briefs. Teams approve.

| Task | Description | Effort |
|---|---|---|
| **26.1** `<FormBuilder>` for inquiry intake | Custom qualifying questions per workspace | 2d |
| **26.2** Brief authoring tool (client-side) | Brand info, scope, dates, deliverables, references, budget, constraints | 2d |
| **26.3** Brand-asset library | Central; replaces scattered branding/media/theme-foundations | 1.5d |
| **26.4** Custom code injection | Tracking pixels, GA, FB pixel (Agency tier) | 1d |
| **26.5** Multi-stakeholder approval flow | Brand manager + creative director + procurement | 2d |
| **26.6** Mood-board / references upload | Drag-drop, reorder, annotate | 1.5d |
| **26.7** Brand voice guideline doc per workspace | Auto-applied to outgoing emails | 1d |

---

### WS-27 Site & page-builder management (2.5 wks · NEW)

**Goal:** the management surface for the front-end page builder (already built in a separate codebase) — works for **three site types** (agency storefront / talent personal page / hub directory) — with a context switcher for users who own multiple. Sits ALONGSIDE the front-end editor; doesn't replace it.

**Why this is its own workstream:** the page builder itself is a separate product surface (front-end editing). The admin-shell needs a complementary management plane: page lists, global settings, status, scheduling, plan-gating, and — critically — a context switcher for hybrid users. This is the entry point where users land when they want to manage a site, even if they spend their actual editing time in the builder.

#### 27.1 Information architecture

```
/site                                  ← landing (auto-resolves to your default context)
   ├── /site/<contextId>               ← single context (agency / talent / hub)
   │     ├── pages                     ← list of pages (incl. homepage)
   │     ├── posts                     ← editorial posts
   │     ├── navigation                ← header + footer menus
   │     ├── theme                     ← brand foundations + design tokens for THIS context
   │     ├── domain                    ← custom domain (plan-gated)
   │     ├── media                     ← assets used in this context
   │     ├── seo                       ← per-context SEO defaults
   │     └── settings                  ← visibility, languages, integrations
   └── /site/switch                    ← context picker (hybrid users)

/edit/<contextId>/<pageId>             ← front-end editor (separate codebase, embedded or external nav)
```

**Key principle:** `<contextId>` is the unit of authorship. A user with 3 contexts has 3 totally separate `/site/<id>` trees. **No bleed.** The context switcher is the ONLY way to cross.

#### 27.2 Context types and ownership matrix

| Context type | Who owns | Plan gating | Default URL |
|---|---|---|---|
| **Agency storefront** | Workspace admin/owner | Free (subdomain) / Studio (custom domain) / Agency (full theme + custom code) | `<workspace>.tulala.app` or custom domain |
| **Talent personal page** | Talent (per `talent-subscriptions` memory) | Basic (free, no editor) / Pro (template + customize) / Portfolio (full editor + custom domain) | `tulala.digital/t/<slug>` or custom domain |
| **Hub directory** | Hub owner (per HQ approval) | Hub-only plan tier (TBD) | `<hub>.tulala.network` or custom domain |

A single user can own zero, one, or many of each type. The hybrid case is real — and underweighted in v1 (per `workspace_talent_hybrid.md` memory).

#### 27.3 Tasks

| Task | Description | Effort |
|---|---|---|
| **27.1** Site management surface IA | Top-level `/site` route + sub-nav per context type. Replaces the `site` workspace page (deprecated in WS-3) | 1d |
| **27.2** **Context switcher** (the linchpin for hybrid users) | Persistent affordance at top of `/site/*`: avatar + name + role chip ("Atelier Roma · Agency", "Sofia · Talent", "Roma Models Network · Hub"). Click → dropdown / bottom-sheet with all owned contexts. Most-recently-edited at top. **Visual color-band** at the top of the screen matches the context's accent (forest = agency, indigo = talent, royal = hub) so users always know where they are | 2d |
| **27.3** Page list view | Cards/table of pages in the current context: title, URL slug, status (draft/scheduled/published), last-edited timestamp, last-editor avatar. Per-row: Edit / Duplicate / Settings / Archive | 1.5d |
| **27.4** "Add page" flow | Modal: choose template (filtered by context type + plan tier), set title + URL slug, set audience (public/private/password), pick parent (for nested pages) → creates page → opens editor | 1.5d |
| **27.5** Front-end editor handoff | "Edit" button opens the page builder. Two integration modes: (a) **same tab** — full-page nav to `/edit/<contextId>/<pageId>` with a sticky "← Back to manager" header; (b) **new tab** — opens in fresh tab. User toggles preference per session | 1d |
| **27.6** Save-and-return UX | When editor commits, manager is auto-navigated to with a toast confirming save. If editor was in a new tab, an Undo CTA in the toast triggers a snapshot restore | 1d |
| **27.7** Global settings sub-nav | Per-context header / footer / nav / theme / domain / SEO — each as a section. Dirty-state guard. **Dirty changes are scoped to the current context only** — switching contexts mid-edit warns + saves draft | 2d |
| **27.8** Theme & design-token editor | Lite version of the design system editor: font pairing, color palette, radius, spacing scale. Context-scoped. Plan-gated (free → preset themes; paid → custom values) | 2d |
| **27.9** Plan-gating signals | When a page-builder feature is plan-locked, show inline lock with upgrade CTA. Examples: custom domain (Studio+), custom code injection (Agency+ for workspaces, Portfolio for talent), advanced templates (Pro+ for talent) | 1d |
| **27.10** Page status workflow | Draft → Scheduled (datetime picker) → Published. Unpublish returns to draft. Schedule visible on the list view + ICS export | 1d |
| **27.11** Page versioning | Each save creates a revision. "Revert to version" surface. Compare two revisions visually | 1.5d |
| **27.12** "Recently in another context" cross-link | When you context-switch, the destination's page list highlights "Continue editing: <page X> · 2h ago" if there's a draft from the same user. Reduces friction for serial editors who jump | 0.5d |
| **27.13** Multi-author conflict prevention | If two users (or one user in two tabs) open the same page in editor, the second sees a "<name> is editing now — open read-only / take over / wait" dialog. Hooks into WS-1.D real-time presence | 1d |
| **27.14** Mobile-friendly management | At <768px: page list as cards; context switcher as bottom-sheet; "Edit page" CTA opens editor in fullscreen. Editor itself is the page-builder team's responsibility but the **handoff URL must accept a `?mobile=1` query** so the builder knows to render its mobile UI | 1d |
| **27.15** Audit log integration | Every page-level action (create, edit, publish, schedule, archive, restore, delete) writes to `audit-log`. Visible per-context | 0.5d |
| **27.16** Bulk page operations | Select multiple → bulk publish, bulk archive, bulk move to folder, bulk export. Builds on WS-7.6 bulk-action bar | 1d |
| **27.17** "View as visitor" toggle | Cross-link with WS-14.6. Opens public URL in a new tab with no editor chrome | 0.5d |
| **27.18** Custom domain + DNS UX | Drawer for adding a domain, showing required DNS records, verification status. Plan-gated. Context-scoped (each context has its own domain) | 1.5d |
| **27.19** Site analytics tile | Visitor count, top pages, traffic sources — per context. Light dashboard above the page list. Cross-link with WS-14.7 + WS-19.1 | 1d |
| **27.20** Translations cross-link | The existing `translations` drawer is reachable from the site management surface — but per-context (translating Sofia's personal page is different from Atelier Roma's storefront) | 0.5d |
| **27.21** Empty state for first-context | Brand-new workspace owner / talent / hub: "You don't have a site yet. Start from a template." → opens the add-page flow with template gallery | 0.5d |
| **27.22** Hybrid-user onboarding (cross-link with WS-15.6) | When a user first gains a second context type (e.g. talent who just upgraded to a workspace plan), show a one-time tour of the context switcher | 0.5d |

**DoD:**
- A workspace owner with no other contexts sees `/site` resolve to their workspace's storefront, with no context switcher visible
- A user with 2+ contexts sees the switcher prominently; switching never bleeds state between contexts
- The page builder (front-end editor) can be linked-into from the management plane and linked-back-out cleanly
- Plan-tier gating consistent: lock badges identical to the rest of the app
- Mobile QA at 375pt (page list, context switcher, add-page modal, theme editor)
- TypeScript: 0 errors
- Telemetry events: `site_context_switched`, `page_builder_opened`, `page_published`, `page_scheduled`, `page_reverted`, `domain_verification_started`

#### 27.4 UX patterns specific to this workstream

**Pattern 1 — Color-band for context awareness**
Every screen under `/site/<contextId>/*` has a 3px-tall color-band at the top of the viewport (or under the IdentityBar) that matches the context type:
- Agency context → `COLORS.brand` (forest)
- Talent context → `COLORS.indigo`
- Hub context → `COLORS.royal`

This is the user's permanent "you are here" cue. Switching context is the only way the band's color changes.

**Pattern 2 — Switcher as overloaded entity selector**
The context switcher avatar (top-left, after IdentityBar) shows:
- For agency: workspace logo
- For talent: talent's profile photo
- For hub: hub logo

Click → dropdown lists all owned contexts grouped by type:
```
AGENCY (1)
  [logo] Atelier Roma                  [chevron]
TALENT (1)
  [photo] Sofia                         [chevron]
HUB (1)
  [logo] Roma Models Network            [chevron]
─────
+ Become an agency owner
+ Claim your talent page
+ Apply to run a hub
```

Already-owned contexts open instantly. "Become / claim / apply" entries route to the relevant onboarding (cross-link WS-9).

**Pattern 3 — Editor handoff is "leave + return"**
The page builder is a separate codebase. From the management plane:
1. User clicks Edit on a page
2. URL changes to `/edit/<contextId>/<pageId>` (separate React tree or even separate origin)
3. Editor has its own chrome — but a sticky `← Back to <context name>` anchor bottom-left
4. On Save → editor calls back to `/site/<contextId>/pages?saved=<pageId>`
5. Manager renders a "Saved · 2s ago" toast and highlights the just-edited row

The handoff is **explicit nav**, not iframe-embedded. Iframes have keyboard-focus, accessibility, and history-state nightmares. Two separate full-page surfaces with clean handoff URLs win.

**Pattern 4 — Plan-gating UX is "aspirational, not negative"**
Per `feedback_admin_aesthetics.md` (color memo: "Locked is opportunity, not error"). When a feature is plan-locked, show:
- Lock icon (muted ink, NOT critical/red)
- Hover/focus: royal (premium) tint
- Click → plan-compare drawer pre-filtered to the relevant tier
- Body copy: "Custom domain unlocks at Studio." NOT "You can't do this."

**Pattern 5 — Hybrid user defaults**
When a hybrid user lands on `/site` cold:
- Default to **most-recently-edited context**, not "first" or "alphabetical"
- If no edit history: default to **highest plan tier** (most-paid → most-cared-about)
- If tied: default to **agency** (workspaces are typically the higher-stakes context)

#### 27.5 Mobile considerations
- Context switcher at <768px is a bottom-sheet, not a dropdown
- Page list at <768px is cards (each card has thumbnail of the page's hero, title, status pill, last-edited)
- "Add page" flow at <768px is fullscreen modal
- Theme editor at <768px gets a horizontal-scroll of token chips (color / type / radius / spacing) — full editing happens via tap-into-each-section
- The page builder on mobile should accept `?mobile=1` and render its mobile editor; the manager doesn't need to handle this directly but documents the contract

#### 27.6 Open questions for the page-builder team

The admin-shell management plane needs the following from the page-builder team to integrate cleanly:
1. **Save-and-return URL contract:** what URL pattern + query params does the builder use to navigate back?
2. **Page schema:** what shape is a `page` (id, slug, status, contentJSON, last-edited)? Manager renders the list from this.
3. **Authentication continuity:** how does the editor verify the user has rights to edit this context's pages?
4. **Real-time presence:** does the editor expose a "currently editing" signal we can read from the manager (for WS-27.13 conflict prevention)?
5. **Mobile UX:** does the editor support `?mobile=1` or equivalent?
6. **Versioning:** does the editor's save create a versioned snapshot, or do we version on the manager side?
7. **Deep-link to editor section:** can we link to a specific block / section inside a page?

These should be resolved in a kickoff between admin-shell + page-builder teams in Week 1 of WS-27.

---

### WS-28 Casting director surface + workflows (2 wks · NEW)

**Goal:** make casting directors first-class users. Currently lumped into "client" but the workflow is fundamentally different — they shortlist heavily, run callbacks, request avail-checks, give structured feedback, present to brand stakeholders.

**Why this is its own workstream:** A CD operates in a 3-tier chain (CD ↔ Talent's Agency ↔ Talent). Their workflow is a level of indirection above the client surface I designed. Without this, real CDs fall back to email + spreadsheets.

| Task | Description | Effort |
|---|---|---|
| **28.1** New surface: `cd` (or extend `client` with CD mode) | Distinguish "I'm a brand client" vs "I'm a CD working for a brand" — different defaults, different UX | 1d |
| **28.2** Casting flow: open vs closed | Open casting = anyone can self-apply; closed = invitation-only. Both need different UX | 1.5d |
| **28.3** Callback structure | Multi-round castings (round 1 = 50 talent, round 2 = 12, round 3 = 5). Status tracking per round | 2d |
| **28.4** Avail-check before formal offer | Lightweight "are you available Mar 14?" — no obligations, no commitments. Distinct from holds | 1d |
| **28.5** Structured casting feedback | Per-talent rating dimensions (look fit / vibe / professionalism / availability), client-team-shareable | 1.5d |
| **28.6** Multi-stakeholder approval flow | Brand manager + creative director + procurement each see + approve. Threshold-based ("3-of-5 approvals to advance") | 2d |
| **28.7** "Present to client" mode | CD-curated shortlist exported as a polished review experience for the brand-side stakeholders | 1.5d |
| **28.8** Casting feedback aggregation | Once a casting closes, the agency-side gets aggregate feedback ("12 of 50 advanced; here's why others didn't") for talent coaching | 1d |
| **28.9** Brand client vs agency client distinction | In-house at brand vs working at creative agency for the brand — different access tiers + invoicing rules | 1d |
| **28.10** "Avail check" UI on talent side | Talent sees a lighter prompt than offer ("Avail Mar 14?" yes/no/maybe) — no commitment | 0.5d |
| **28.11** CD playbook: weekly cadence | "What casting did I run this week? What should I follow up on?" | 1d |
| **28.12** CD performance metrics | Casting-to-booking ratio, time-to-cast, talent-pool-diversity indicator | 1d |

**DoD:** A CD can run a 3-round casting with 50 → 12 → 5 talent, collect structured feedback at each stage, route to 3 brand stakeholders for approval, and end with a confirmed booking — all within Tulala. Cross-link with WS-1 (chat) and WS-32 (discovery).

---

### WS-29 Production team & multi-discipline bookings (1.5 wks · NEW)

**Goal:** model the reality that a shoot books **a team** (talent + photographer + HMU + stylist + set designer + photo studio). One inquiry can have multiple resources.

**Why this is its own workstream:** the prototype's data model treats one inquiry = one or more talents. Real productions involve cross-discipline crews, each with their own rates, schedules, and agencies. Without this, Tulala only handles half a production.

| Task | Description | Effort |
|---|---|---|
| **29.1** Crew member type | Beyond "talent" — `talent / photographer / hmu / stylist / set-designer / location-scout / photo-studio` | 1d |
| **29.2** Multi-resource inquiry shape | Inquiry has multiple `slots`, each with role + selected crew member. Schema in `_state.tsx` | 1d |
| **29.3** Crew-side surface | Hair/Makeup artist sees their bookings just like talent does, but with their distinct rate model | 1d |
| **29.4** Photo studio booking surface | Studio rentals — different from talent (unit is the space, not the person) | 1d |
| **29.5** Roster filter by crew type | Workspace owners see roster filtered by crew type (e.g. "show me HMUs" vs "show me models") | 0.5d |
| **29.6** Test shoot vs paid shoot distinction | Test shoots = free for portfolio. Different rate display, different status | 0.5d |
| **29.7** Production crew profile shape | Photographer profile = portfolio + day rate + studio access; HMU profile = kit + brands worked with; etc. | 2d |
| **29.8** Multi-resource availability check | "Is this combination available on this date?" — if any one says no, the booking can't form | 1d |
| **29.9** Cross-resource messaging | One inquiry, multiple participants — three-stream model extends to four+ panes (private with each crew member) | 1.5d |
| **29.10** Crew rate cards | Different from talent (kit fees, assistant fees, studio rentals) | 1d |
| **29.11** Crew commission split | Some crew have their own agencies. Same multi-tier commission as talent | 0.5d |

**DoD:** A workspace owner can build an inquiry with 3 talents + 1 photographer + 1 HMU artist + 1 photo studio, all booked atomically (all confirm or none). All parties see their part of the booking but only what's relevant.

---

### WS-30 Image rights & post-booking lifecycle (2 wks · NEW)

**Goal:** the booking doesn't end on shoot day. Image usage continues for months/years; re-licensing, royalties, and expiration tracking are core to the industry.

**Why this is its own workstream:** Image-rights mismanagement is the single most expensive legal exposure in the industry. Tulala can be the source of truth for "what's licensed for what, until when".

| Task | Description | Effort |
|---|---|---|
| **30.1** Usage scope on contracts | Region (regional/national/global), media (print/digital/broadcast/OOH), duration (6mo/1yr/in-perpetuity), exclusivity | 1d |
| **30.2** Usage tracking dashboard | Per booking: "this campaign has 6 weeks of digital usage left; 3 months of OOH" | 1.5d |
| **30.3** Expiration alerts | Notification 30 / 14 / 7 days before usage expiration. Talent + agency alerted. | 0.5d |
| **30.4** Re-license flow | "We want to extend usage 6 months" — generates new offer; agency negotiates with talent's agreement | 2d |
| **30.5** Auto-detect expired usage | Mock external service "we found this image still being used past expiration"; flag for review | 0.5d |
| **30.6** Tear sheet collection | Where the talent's image actually appeared. URL, screenshot, magazine, page number | 1d |
| **30.7** Royalty schedules | For broadcast residuals, sales royalties — periodic payouts visible in `talent-payouts` | 1d |
| **30.8** Holds & options model | 1st-option / 2nd-option / hold (industry-standard for indecisive timelines). Distinct from a confirmed booking | 1.5d |
| **30.9** Hold-release UX | "Push the 2nd-option to confirm or release" — pressure-test the indecision | 0.5d |
| **30.10** Force majeure / cancellation matrix | Cancellation fee scaled by timing (>1 week / 48h / 24h / day-of). Per-contract overrides | 1d |
| **30.11** No-show / replacement flow | Talent doesn't show; replacement found; original is flagged + penalty applied | 1d |
| **30.12** Post-booking review prompts | After completion: "rate this client/talent" → feeds reviews + trust ladder | 0.5d |
| **30.13** Image-approval workflow | Some talent have veto rights on final selects — surface for approving/rejecting selects | 1.5d |

**DoD:** A booking from 2 years ago can be queried for "is this image still licensed for use?", with a clear yes/no/expired answer. Cancellation 36 hours before shoot triggers the right fee tier automatically.

---

### WS-31 Account lifecycle (1.5 wks · NEW)

**Goal:** workspaces, talent, and clients have lifecycles beyond create+use+close. Transfers, merges, minor accounts, estate management, mother-agency hierarchies — all need real UX.

**Why this is its own workstream:** account-lifecycle issues are infrequent but high-stakes. A user trying to merge two accounts or transfer ownership can't fail; the cost of failure is an angry user lost forever.

| Task | Description | Effort |
|---|---|---|
| **31.1** Workspace ownership transfer | "I'm selling Atelier Roma" — transfer to new owner with KYC + audit trail | 2d |
| **31.2** Workspace graceful shutdown | Different from delete — retain bookings, archive, anonymize. 90-day grace. | 1d |
| **31.3** Workspace merge (acquisitions) | "Atelier Roma is acquiring Roma Models" — combine rosters, dedupe clients, conflict resolution | 2d |
| **31.4** "I have two accounts" merge | Same person, two emails — merge talent profiles, dedupe history | 1.5d |
| **31.5** Linked accounts (vs merged) | Sometimes keep separate identities but link for billing/permissions (family + work email) | 1d |
| **31.6** **Minor / parent-co-pilot accounts** | Talent under 18 has parent/guardian who must approve every offer. Co-account with tiered permissions | **2d** |
| **31.7** Mother-agency / placement-agency hierarchy | International talent has 1 mother agency (career manager) + N placement agencies (per-region bookings). Tier surfaced + commission flow | 2d |
| **31.8** Independent manager (no agency) | Solo manager who reps a small set of talent without running a workspace — hybrid talent-rep + workspace-lite | 1.5d |
| **31.9** Estate management | Retired/deceased talent's profile continues for legacy bookings; named executor controls | 1d |
| **31.10** Power-of-attorney / trusted contacts | Account recovery via verified trusted contact | 0.5d |
| **31.11** Plan downgrade UX | What features lock when you go from Studio → Free? Grace period + data preservation | 1d |
| **31.12** Subscription pause | Don't cancel, pause for 90 days. Common for talent on maternity leave or hiatus | 0.5d |
| **31.13** Win-back flow on cancel | Last-chance offer + feedback collection | 0.5d |

**DoD:** A 17-year-old talent can sign up with a parent account that approves bookings. Two existing accounts owned by the same person merge cleanly without losing history.

---

### WS-32 Discovery & marketplace primitives (1.5 wks · NEW)

**Goal:** the discovery layer that turns Tulala from a directory into a marketplace. Clients find talent they didn't know to ask for. Talent get surfaced beyond their own outreach.

**Why this is its own workstream:** for a multi-sided marketplace, discovery is the core monetization driver. Without it, Tulala is a directory; with it, Tulala is the market.

| Task | Description | Effort |
|---|---|---|
| **32.1** "Trending talent" curation | Algorithmic + editorial. Cross-tenant signal, surfaced on client discover page | 1.5d |
| **32.2** "Just signed" / new face surface | New talent in the last 30d, surfaced to interested clients | 1d |
| **32.3** "Editor's picks" | Tulala HQ-curated weekly feature. Editorial layer | 1d |
| **32.4** "Similar to" search | "Find me more talent like Sofia" — AI-assisted similarity (cross-reference WS-18) | 1.5d |
| **32.5** Geo-search | "Models within 50km of London available next week" | 1d |
| **32.6** Date-aware availability filter | Search "available Mar 14–16" filters out anyone unavailable | 1d |
| **32.7** **Bias-auditing transparency** | Tulala HQ surfaces a transparency report: "X% of search-result-clicks went to Y demographics". Public-facing fairness signal | **2d** |
| **32.8** "Who viewed me" surface for talent | Talent see anonymized: "3 clients viewed your profile this week. 1 created a shortlist with you" | 1d |
| **32.9** Achievement badges | First booking, 100 bookings, response-streak, etc. Tasteful, not gamified to harm | 1d |
| **32.10** Career retrospective summary | Aggregated all-time view exportable for press kits | 1d |
| **32.11** Streak tracking (response time) | "Replied within 24h for 30 days" — shown on client side as trust signal | 0.5d |
| **32.12** Saved-search auto-alerts | (extend WS-7.3) — when new talent match the search, email/in-app alert | 0.5d |
| **32.13** "More like this" on talent profile | Discovery row on every talent profile page | 0.5d |

**DoD:** A client typing "blonde, 5'10+, available next week, has shot for Vogue, based in Milan" finds 8 matches in <5 seconds. Bias-auditing transparency report exists and is auditable.

---

### WS-33 On-set / production-day live features (1.5 wks · NEW)

**Goal:** the "during the booking" UX. Live call sheets, on-set check-ins, photo proofing, wrap notifications.

**Why this is its own workstream:** production day is when the rubber hits the road. Coordinators are not on set; production is happening; communication needs to be tight. Tulala can be the spine.

| Task | Description | Effort |
|---|---|---|
| **33.1** Live call-sheet sharing | Real-time sync; addresses + crew + times always current | 1d |
| **33.2** On-set check-in | Photographer / crew / talent confirm "I've arrived" with timestamp | 1d |
| **33.3** Live photo proofing | Photographer uploads selects; client + agency react in-thread | 2d |
| **33.4** Wrap notifications | When the shoot ends, automatic notification to all parties | 0.5d |
| **33.5** Crew timesheets | HMU started 06:00, ended 14:30 — automatic billing | 1d |
| **33.6** Per-diem + meal logging | Actual amounts spent, receipts captured | 1d |
| **33.7** Equipment / wardrobe checklist | "Talent brought their own black jeans? Yes/No" — production day reality | 0.5d |
| **33.8** Transportation coordination | Cars sent, driver contact info, ETA | 1d |
| **33.9** Live-streaming integration | Remote client watches shoot live (Zoom-integration mock) | 1d |
| **33.10** Production-day mobile UI | Optimized layout for crew on phone at the shoot — bigger tap targets, less chrome | 1.5d |
| **33.11** Off-set incident reporting (cross-link WS-34) | "Photographer was inappropriate" can be reported during/after shoot | 0.5d |

**DoD:** A production-day mobile UI lets a coordinator off-site see all 3 of their shoots in progress, who's checked in, who's late, and the latest selects from each — at a glance.

---

### WS-35 Production-feature reconciliation (1.5 wks · NEW · the bridge)

**Goal:** the prototype is the redesign; production `/admin` is the existing v1. **Dev takes our documentation later to rebuild from the prototype.** Every production feature needs to be demonstrated in the prototype (or explicitly deprecated) so dev knows what to keep, redesign, or drop.

**Scope:** this is a **prototype-only** workstream. We don't refactor production code. We make sure the prototype's drawers / pages / handoff docs cover every production surface listed in §3.39bis.

| Task | Description | Effort |
|---|---|---|
| **35.1** Surface inventory cross-check | Walk every entry in `ADMIN_PROTOTYPE_NAV` (production) against `WORKSPACE_PAGES` + `DRAWER_HELP` (prototype). Tag each as: prototype-covered / prototype-redesigned / prototype-missing / prototype-deferred. | 1d |
| **35.2** Add missing drawer/page entries | For each production feature not in the prototype, add a drawer or page entry to demonstrate its redesigned form. **Key adds:** `ai-workspace`, `locations`, `taxonomy` as primary management surface, `representation-requests` (already there but verify), `pulse-strip` redesigned. | 2d |
| **35.3** Migrate the existing **inquiry workspace v3 panels** | Production has 7 panels (Summary, Coordinators, Roster, Offers/Approvals, Booking, Payment, Recent Activity, Needs Attention) — prototype has these in `_workspace.tsx`. Verify naming + structure align with production v3 + my responsive plan (WS-1.A) | 1d |
| **35.4** Demonstrate the **6-step site setup wizard** in the prototype | Production has it; prototype's WS-9 onboarding should explicitly show this 6-step pattern (homepage → pages → posts → navigation → theme → SEO) | 1d |
| **35.5** Demonstrate **AI workspace** as a top-level area in the prototype | Add as a primary surface (workspace nav). Show: provider registry, master mode, usage controls, console/logs/match-preview/settings sub-nav. WS-18 promoted to reflect this | 1.5d |
| **35.6** Demonstrate **6 analytics cuts** in the prototype | overview, acquisition, funnels, search, seo, talent — each as a drawer or sub-page, even if mock data only. Cross-reference WS-19 | 1d |
| **35.7** Demonstrate **fields & definitions schema editor** | The custom-field group panel + definition edit sheet pattern from production. Maps to my WS-26.1 form builder | 1d |
| **35.8** Demonstrate **translations workflows (3 sub-flows)** | Bio workflow, tax-loc workflow, bulk-AI CTA. Each gets a drawer in the prototype. WS-12 i18n references these | 1d |
| **35.9** Demonstrate **operator docs system** (14 sub-topics) | Help drawer IA (WS-22.12) shows: ai, analytics, api, clients, directory, featured, permissions, release-notes, search, settings, talent, taxonomy, translations, troubleshooting. Distinct from design-system docs (WS-17 STYLE.md etc) | 1d |
| **35.10** Demonstrate **impersonation** workflow in HQ surface | Already exists as drawer in registry; surface it properly with audit-trail + time-box visualization | 0.5d |
| **35.11** Demonstrate **multi-agency surface** | Production has this under `site/multi-agency`. Maps to WS-15 hybrid mode + WS-31 mother-agency hierarchy | 0.5d |
| **35.12** Resolve **`site/` vs `site-settings/` overlap** | Production has both — pick canonical home in the prototype. Recommend folding into `/site/<contextId>/*` per WS-27 | 0.5d |
| **35.13** Add **Locations** as first-class entity in the prototype | Shoot locations, studios, recurring venues. New drawer + roster surface | 1d |
| **35.14** Standardize naming: "Requests" vs "Inquiries" | Pick one across both surfaces. **Recommend: "Inquiries"** to match the registry + memory files. Production "Requests" gets renamed in dev handoff. | 0.5h |
| **35.15** Annotate the **command palette** integration | Production already has `admin-command-palette.tsx`. WS-7 should reference it as the existing implementation to extend, not replace | 0.5h |
| **35.16** Update DRAWERS.md + DRAWER_HELP registry with all reconciled entries | Single source of truth must catch every production feature | 1d |
| **35.17** Write per-feature handoff docs for the 5 highest-leverage migrations | Use `DESIGN_HANDOFF_TEMPLATE.md`. Inquiry Workspace v3, AI Workspace, Site Setup, Analytics, Fields/Definitions. These become the dev team's primary reference | 2d |

**DoD:** A dev opening the prototype + ROADMAP cold can identify, for every production feature, whether to: (a) keep behavior + redesign UI, (b) redesign both, (c) deprecate, or (d) defer. No production feature is silently missing from the redesign.

---

### WS-34 Safety, disputes, and incident handling (2 wks · NEW)

**Goal:** the trust + safety layer. Incidents reported, mediated, documented. Bias signals flagged. Minors protected.

**Why this is its own workstream:** trust is built or lost by safety UX. WS-21 covers regulatory compliance; this covers active safety operations.

| Task | Description | Effort |
|---|---|---|
| **34.1** On-set incident reporting flow | Talent or crew can report inappropriate behavior, anonymously or attributed | 1.5d |
| **34.2** Photographer / studio safety scoring | Aggregate score, displayed at booking time. Built from incident reports + reviews | 1.5d |
| **34.3** Background-check integration UX | Mock external provider call; "all clear" / "flagged" status | 1d |
| **34.4** Whistleblower / anonymous reporting channel | Encrypted, no agency-side visibility, escalates to Tulala HQ | 1d |
| **34.5** Anti-trafficking signal flagging | Automated flags + manual reporting for "this looks coerced" | 1d |
| **34.6** Mediation flow | When a dispute happens, Tulala HQ acts as neutral mediator | 2d |
| **34.7** Bad-actor blacklist | HQ-curated list of banned clients/talent/photographers; warning at booking time | 1d |
| **34.8** **Minor-protection UX** | Talent under 18: can't be alone on set; specific working-hour limits; school requirements | **1.5d** |
| **34.9** Pregnancy / health-disclosure UX | Voluntary disclosure for production safety; sensitive handling | 1d |
| **34.10** Anti-discrimination signal flagging | Client request "only one ethnicity / body type / etc." auto-flags for review (legal in some markets, illegal in others) | 1.5d |
| **34.11** Dispute resolution timeline | Clear stages: Filed → Mediation → Decision → Appeal. Visible to all parties | 1d |
| **34.12** Insurance integration UX | Production / liability / travel coverage selection at booking time | 1d |
| **34.13** Post-incident audit | When an incident is resolved, the timeline + evidence are retained for legal | 0.5d |

**DoD:** A 16-year-old talent with parental account is auto-protected by working-hour limits + chaperone requirement on every booking. An incident reported on-set reaches Tulala HQ within 1h with a full audit trail.

---

## 5. Cross-cutting concerns

### 5.1 Telemetry strategy

Every workstream emits events through `track()` (WS-0.5). Master event list lives in `_state.tsx`.

**Critical events to instrument early:**

| Event | Source | What it tells us |
|---|---|---|
| `chat_overwhelm_self_reported` | In-app feedback widget | UX validation |
| `mobile_chrome_height_ratio` | Page render | % of viewport that's chrome |
| `drawer_count_per_session` | Drawer opens | Drawer-as-everything overuse |
| `time_to_first_meaningful_action` | Per surface | Onboarding effectiveness |
| `legacy_page_url_resolved` | URL parser | When to drop URL aliases |
| `chat_view_mode_active` | Inquiry workspace | Phone vs tablet vs desktop vs wide |
| `chat_typing_indicator_seen` | Real-time | Real-time wiring works |
| `chat_jump_to_latest_clicked` | Message stream | Stream length is a problem |
| `chat_system_group_expanded` | System events | Grouping is helpful |
| `inquiry_pending_offer_acted_on` | Inbox row | Coral treatment works |
| `feature_flag_enabled` | Per-flag | Cohort tracking |
| `webvitals_lcp` / `_fid` / `_cls` | Web Vitals | Performance regression watch |
| `error_boundary_triggered` | Error boundaries | Frontend stability |

### 5.2 Definition of "design-ready"
A task is design-ready when:
1. Audit finding ID is referenced
2. Acceptance criteria are concrete (see §12 patterns)
3. Affected surfaces / files are listed
4. Mobile breakpoint behavior is specified
5. Accessibility implications are called out
6. Telemetry events are listed
7. Decision-log entry exists for any non-obvious choice

### 5.3 Risk register (master)

| Risk | WS | P | I | Mitigation |
|---|---|---|---|---|
| Chat redesign breaks coordinator workflow | 1 | M | H | Feature flag, dogfood week, rollback plan |
| URL changes invalidate bookmarks | 3 | M | M | 1-release alias period |
| Drawer→page promotion breaks back-stack | 4 | M | M | Keep drawer entry as fallback for 2 releases |
| Money UX regressions | 5 | L | H | Money screens get separate QA gate, finance review |
| Real-time wiring is harder than mocked | 6 | H | M | Build with mocks first, plug wire later |
| i18n string-extraction misses dynamic strings | 12 | M | M | ESLint rule (WS-0.13) |
| Performance work breaks SSR | 13 | M | M | Per-PR check on TTFB + hydration |
| Storybook fork drifts from prod | 17 | M | L | Source of truth = code; Storybook imports same primitives |
| AI suggestions look stupid | 18 | H | L | Behind feature flag, dismissible, explicit "AI" label |
| Telemetry events spam the analytics pipeline | 24 | L | M | Sampling per-event; budget per surface |
| Compliance work blocks shipping | 21 | L | H | Lawyer-in-loop early; don't ship `data-export` without sign-off |
| Email template count balloons | 22 | M | M | Strict template inventory; reuse partials |
| Migration assistant import dirty data | 25 | M | M | Always dry-run; preview before commit |

### 5.4 Dependencies between workstreams

```
WS-0 (Foundation) → blocks ALL
WS-1 (Chat)            depends on WS-0
WS-2 (Mobile)          depends on WS-0; unblocks WS-1.A
WS-3 (Workspace consol) depends on WS-1 dogfood (≥3d)
WS-4 (Drawer audit)    depends on WS-3
WS-5 (Money & trust)   independent (parallel to WS-1)
WS-6 (Real-time + err) depends on WS-0, WS-1 stable
WS-7 (Search)          depends on WS-0 (registry)
WS-8 (Talent + client) independent
WS-9 (Onboarding)      depends on WS-2 + WS-0
WS-10 (Files)          depends on WS-1.C
WS-11 (Notifications)  independent
WS-12 (i18n + a11y)    late stage; runs across all surfaces
WS-13 (Performance)    late; after structural work
WS-14 (Public surfaces) depends on WS-8
WS-15 (Hybrid mode)    depends on WS-3
WS-16 (Polish)         depends on WS-0
WS-17 (Design system)  ongoing throughout
WS-18 (AI)             last; needs telemetry + content stable
WS-19 (Reporting)      depends on telemetry pipeline (WS-0.5)
WS-20 (Ops automation) independent
WS-21 (Compliance)     parallel; runs alongside critical paths
WS-22 (Email)          depends on WS-9, WS-22 inventory locked early
WS-23 (Marketing)      independent
WS-24 (Quality)        wraps everything; gates per phase
WS-25 (Migration)      depends on WS-9 (onboarding integration)
WS-26 (Brand tools)    depends on WS-3 settings consolidation
WS-27 (Site & page builder mgmt) depends on WS-3 (site route) + WS-15 (hybrid mode) + WS-4 (drawer→page promotions); kickoff with page-builder team in Week 1
WS-28 (Casting director) depends on WS-1 (chat) + WS-7 (search) — CDs use shortlists + structured feedback
WS-29 (Production team) depends on WS-3 (settings) + schema work — adds new entity types
WS-30 (Image rights)   depends on WS-5 (money) + WS-10 (files/contracts)
WS-31 (Account lifecycle) depends on WS-3 (settings) + WS-15 (hybrid mode) + WS-21 (compliance for KYC)
WS-32 (Discovery)      depends on WS-7 (search) + WS-19 (analytics) + WS-18 (AI for "similar to")
WS-33 (On-set live)    depends on WS-1.D (real-time) + WS-2 (mobile)
WS-34 (Safety/disputes) depends on WS-21 (compliance) + WS-31.6 (minors) + WS-19 (reporting)
```

### 5.5 Suggested 18-week parallel roadmap (2 designers, 2 engineers)

| Wk | Designer 1 | Designer 2 | Eng 1 | Eng 2 |
|---|---|---|---|---|
| 1 | WS-0 + WS-17 specs start | WS-2 mobile drawer specs | WS-0 primitives | WS-2 mobile foundation |
| 2 | WS-1.A chat phase A | WS-2 finishing | WS-1.A | WS-2 finishing |
| 3 | WS-1.B + WS-1.C | WS-3 workspace consolidation | WS-1.B+C | WS-3 |
| 4 | WS-1.D real-time | WS-3 finishing + WS-9 onboarding | WS-1.D | WS-9 |
| 5 | WS-1.E + WS-1.F + WS-1.G | WS-5 money + WS-21 KYC | WS-1.E-G | WS-5 |
| 6 | WS-4 drawer rationalization | WS-5 trust + WS-21 audit log | WS-4 | WS-5 + WS-21 |
| 7 | WS-4 finishing + WS-6 errors | WS-8 talent + WS-26 brief tool | WS-4 + WS-6 | WS-8 |
| 8 | WS-7 search palette | WS-10 files + e-sign | WS-7 | WS-10 |
| 9 | WS-11 notifications | WS-14 public surfaces + WS-22 emails | WS-11 | WS-14 + WS-22 |
| 10 | WS-15 multi-tenant | WS-19 reporting + WS-12 i18n | WS-15 + WS-19 | WS-12 |
| 11 | WS-12 a11y | WS-13 performance + WS-25 migration | WS-12 | WS-13 + WS-25 |
| 12 | WS-20 ops automation | WS-23 growth | WS-20 | WS-23 |
| 13 | WS-27 site & page-builder mgmt | WS-31 account lifecycle (minors first) | WS-27 (page-builder team kickoff Wk 1) | WS-31 |
| 14 | **WS-28 casting director** | **WS-29 production team & multi-discipline** | WS-28 | WS-29 |
| 15 | **WS-30 image rights & post-booking** | **WS-32 discovery & marketplace** | WS-30 | WS-32 |
| 16 | **WS-33 on-set / production-day live** | **WS-34 safety & disputes** | WS-33 | WS-34 |
| 17 | WS-16 polish + WS-18 AI flag-on | WS-24 release engineering | WS-16 | WS-24 |
| 18 | WS-17 design-system docs final | Buffer / launch prep / final QA pass | Buffer | Launch prep |

**Round 4 additions (Weeks 13–16) form a "industry-depth phase"** that takes Tulala from "good prototype" to "complete prototype that demonstrates every major user type and lifecycle stage". Without this phase, casting directors, production crews, on-set workflows, and post-booking image-rights have no surface — and those are core to the business.

---

## 6. Designer handoff package

### 6.1 30-minute onboarding reading list
1. `CLAUDE.md` (root) — Vercel deploy + GitHub auto-deploy (2m)
2. `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/MEMORY.md` — index (5m)
3. **Memory files** in this order:
   - `project_impronta_blueprint.md` — full architecture (10m)
   - `project_product_vision.md` — pipeline philosophy (5m)
   - `project_inquiry_flow_spec.md` — pipeline statuses (5m)
   - `project_admin_workspace_vision.md` — workspace philosophy (3m)
   - `project_talent_subscriptions.md` — talent monetization (3m)
   - `project_client_trust_badges.md` — trust ladder (3m)
   - `project_agency_exclusivity_model.md` — plan/exclusivity (3m)
   - `project_workspace_talent_hybrid.md` — hybrid mode (3m)
   - `feedback_admin_aesthetics.md` — color "do not drift" (2m)
   - `feedback_pre_launch_shipping.md` — shipping rules (1m)
4. `web/src/app/prototypes/admin-shell/DRAWERS.md` — 149 drawer reference (~30m skim)
5. `_help.tsx` registry top — `HelpEntry` shape (5m)

### 6.2 Decision log
A `DECISIONS.md` file should be created next to this roadmap at `web/src/app/prototypes/admin-shell/DECISIONS.md` capturing:
- Why workspace has 9 pages (and why we're consolidating to 6)
- Why drawer-as-everything was chosen, and why we're rationalizing
- Why coral is reserved for "your move"
- Why help-icon went next to copy-link, not the title
- Why we picked grid-rows over max-height for animations
- Why we use brand-soft for talent eyebrow vs other tints
- (designer adds entries as they make decisions)

### 6.3 Strong patterns (don't change)
- Three-stream messaging mental model (private / group / system)
- Drawer toolbar order (link / help / size / close)
- Audience tints (workspace neutral, talent forest, client indigo, HQ critical)
- `data-tulala-*` attributes for QA selectors
- `DRAWER_HELP` registry as source of truth
- The `RICH_INQUIRIES` 8-stage pipeline (don't add stages without good reason)

### 6.4 Weak patterns (rebuild)
- Inline-style sprawl (move to vanilla-extract or similar in WS-13)
- Ad-hoc card variants (use `<Card variant>`)
- Fixed-pixel rail widths (use `useViewport`-aware layouts)
- Bare `No results.` text (use `<EmptyState>`)
- Drawer-for-everything (4-line settings should be popovers per WS-4)

### 6.5 Figma scaffold to build first (WS-17.1)
1. **Token sheet** — colors, type, spacing, radius, shadows, motion
2. **Component library** — buttons, inputs, chips, cards, drawer header, message bubble, toast, popover, modal, dialog, etc.
3. **Surface frames** — 4 surfaces × 3 viewports (375 / 768 / 1440) = 12 anchor frames
4. **Canonical drawer frame** — at compact / half / full / mobile-bottom-sheet
5. **Empty states gallery** — one per surface (12+)
6. **Messages micro-system** — bubbles, system events, banners, dividers, composer states

### 6.6 Designer's first 5 PRs (suggested)
1. Add `DECISIONS.md` + a Figma link in the README of `admin-shell/`
2. Lock down WS-0 primitives in code review (engineers ship, designer reviews)
3. Sketch WS-1.A (responsive inquiry workspace) in Figma at 375 / 768 / 1024 / 1440 before code starts
4. Audit + redraw WS-1.B (message stream rhythm) in Figma before code
5. Drawer classification spreadsheet (WS-4.1) — cross-reference with `DRAWER_HELP`

### 6.7 Done definition for the prototype
The prototype can be considered "design-complete" when:
1. All 24 workstreams have shipped P0/P1 tasks
2. Mobile + chat experience passes a 30-user think-aloud test with <2 confusion incidents per user
3. WCAG AA compliance verified by third-party audit
4. Design system docs (`STYLE.md`, `MOTION.md`, `A11Y.md`, `CONTENT.md`, `ICONS.md`) exist and are 80%+ accurate
5. A new UX designer can deliver a feature in their first week without architectural decisions
6. A new PM can read the registry + decision log + memory files and know what to build next

---

## 7. Engineer handoff package

### 7.1 Codebase map
```
web/src/app/prototypes/admin-shell/
├── ROADMAP.md          # this file
├── DRAWERS.md          # 149 drawer reference
├── DECISIONS.md        # decision log (to be created)
├── _state.tsx          # context, state, types, COLORS, RADIUS, SPACE, FONTS
├── _primitives.tsx     # DrawerShell + UI primitives
├── _help.tsx           # HelpEntry registry + HelpPanel UI
├── _pages.tsx          # Workspace + Client surface pages
├── _talent.tsx         # Talent surface (large; split in WS-13.2)
├── _client.tsx         # Client-only surfaces
├── _drawers.tsx        # Drawer dispatch + bodies
├── _wave2.tsx          # Wave-2 drawer additions
├── _platform.tsx       # Platform / HQ surface
├── _palette.tsx        # Cmd-K palette (built in WS-7)
└── page.tsx            # Prototype root
```

### 7.2 Conventions to honor
- **`use client`** at top of every interactive file (Next.js 16)
- **`data-tulala-*`** on every interactive container for QA targeting
- **No inline hex outside `COLORS`** (ESLint enforced after WS-0.12)
- **No string literals in JSX** without i18n key (after WS-0.13)
- **Type everything** — `any` requires inline justification
- **TypeScript: 0 errors** is non-negotiable per PR
- **Honor `prefers-reduced-motion`** in any animation
- **Honor `inert`** for hidden content per WCAG
- **`safe-area-inset-bottom/right`** on every fixed/sticky bottom or right element
- **Telemetry on every consequential action** (add to WS-0.5 events list)

### 7.3 Per-PR checklist
- [ ] Audit-finding ID(s) referenced in PR description
- [ ] `npx tsc --noEmit` passes (0 errors)
- [ ] Lint passes (no inline hex, no string-literal JSX)
- [ ] Mobile QA at 375pt + 768pt + 1440pt
- [ ] Keyboard nav verified
- [ ] Screen-reader spot-check (VoiceOver or NVDA)
- [ ] Reduced-motion verified
- [ ] `prefers-color-scheme` (when dark mode lands)
- [ ] Telemetry events added to event registry
- [ ] Storybook story added or updated
- [ ] Decision-log entry for non-obvious choices
- [ ] Designer review (WS-24.11)
- [ ] Content review for user-facing strings (WS-24.12)

### 7.4 Verification commands
```bash
# from repo root
cd web && npx tsc --noEmit          # type check
cd web && npm run lint               # lint
cd web && npm run test               # unit tests (after WS-24.1)
cd web && npm run test:e2e           # e2e (after WS-24.2)
cd web && npm run dev                # dev server (port 3000)
cd web && npm run storybook          # storybook (after WS-17.2)
```

---

## 8. Decision log template

A separate file `DECISIONS.md` in this directory should track non-obvious choices. Template entry:

```markdown
## [date] [decision title]

**Context:** what we were trying to do
**Options considered:** A, B, C
**Decision:** B
**Reasoning:** why B over A and C
**Tradeoffs accepted:** what we give up
**Reversibility:** how hard to undo (cheap / medium / expensive)
**Linked:** audit-finding ID(s), task ID(s), PR link
```

**Initial entries to seed:**
1. (date) Workspace nav 9 → 6 (audit 3.3.1; WS-3)
2. (date) Drawer-as-everything → drawer + popover + page (audit 3.4.1; WS-4)
3. (date) Coral semantic = "your move" only (memory feedback_admin_aesthetics)
4. (date) Help-icon next to copy-link, not title (WS-1; help-system v1)
5. (date) Grid-rows animation over max-height (help system; round 2 audit)
6. (date) Brand-soft for talent eyebrow (help system; round 3 audit)
7. (date) Indigo new-dot vs coral (help system; round 3 audit)
8. (date) localStorage-backed help-seen vs session-only (help system; round 3 audit)
9. (date) Inert + aria-hidden for collapsed help panel (help system; round 5 audit)
10. (date) Bottom-sheet primitive over side-drawer on mobile (WS-1.A.1)

---

## 9. Glossary

- **Drawer** — slide-from-side panel; current default for nearly everything
- **Bottom sheet** — slide-from-bottom variant; mobile-friendly
- **Modal popover** — small position-aware popover; lighter than drawer (after WS-4.2)
- **Page** — full-route surface with browser back-button (after WS-4.4)
- **Dialog** — irreversible-action confirmation (`<ConfirmDialog>` after WS-0.8)
- **Workspace** — multi-user tenant; agency or studio
- **Talent** — model / actor / artist; can be on multiple workspaces (Free) or exclusive (Studio/Agency)
- **Client** — brand / casting director / agency that books talent
- **Hub** — curated talent directory; Tulala HQ-curated; sends inbound
- **Surface** — top-level UI scope: workspace / talent / client / platform
- **POV** — point-of-view in shared drawers (admin / coordinator / talent / client)
- **Three-stream messaging** — private (client↔coordinator) / group (talent+coordinator) / system (events)
- **Trust tier** — Basic / Verified / Silver / Gold; client-side only; per memory
- **Plan tier** — Free / Studio / Agency / Network; workspace-side
- **Talent ladder** — Basic / Pro / Portfolio; talent-side; per memory
- **Activation arc** — workspace-owner onboarding checklist
- **Pipeline** — 8-stage inquiry flow: submitted → coordination → offer-pending → approved → booked / rejected / expired / draft
- **Help registry** — `DRAWER_HELP` in `_help.tsx`; spine for in-app help + future support pages + chatbot + ticket routing
- **Hybrid mode** — talent who also own a workspace (per memory)

---

## 10. Appendix A — File map

### Core prototype
- `web/src/app/prototypes/admin-shell/_state.tsx` — context provider, state types, COLORS / RADIUS / SPACE / FONTS, `RICH_INQUIRIES` data, `NOTIFICATIONS`, `track()` (after WS-0.5)
- `web/src/app/prototypes/admin-shell/_primitives.tsx` — `DrawerShell`, `Popover`, `Card`, `EmptyState` (after WS-0.2/3), all interactive primitives
- `web/src/app/prototypes/admin-shell/_help.tsx` — `DRAWER_HELP` registry, `HelpPanel`, persistence, feedback widget
- `web/src/app/prototypes/admin-shell/_pages.tsx` — workspace pages, identity bar, topbar, mobile bottom-nav
- `web/src/app/prototypes/admin-shell/_talent.tsx` — talent surface (large; split in WS-13.2)
- `web/src/app/prototypes/admin-shell/_client.tsx` — client surface
- `web/src/app/prototypes/admin-shell/_drawers.tsx` — drawer dispatch + bodies
- `web/src/app/prototypes/admin-shell/_wave2.tsx` — wave-2 drawer additions
- `web/src/app/prototypes/admin-shell/_platform.tsx` — platform / HQ surface
- `web/src/app/prototypes/admin-shell/_palette.tsx` — Cmd-K palette (after WS-7)
- `web/src/app/prototypes/admin-shell/page.tsx` — prototype root + `?dev=1` control bar

### Documentation (this directory)
- `ROADMAP.md` — this file (canonical plan)
- `DRAWERS.md` — 149 drawer reference (auto-aligns with `_help.tsx`)
- `DESIGN_HANDOFF_TEMPLATE.md` — per-feature handoff template (designer → dev). Copy + fill in per feature; save filled copies under `handoffs/<YYYY-MM-DD>-<slug>.md`
- `DECISIONS.md` — decision log (to be created in WS-17.4 or sooner)
- `STYLE.md` — visual / pattern reference (after WS-17.4)
- `MOTION.md` — durations, easings, choreography (after WS-17.5)
- `A11Y.md` — keyboard map, ARIA conventions (after WS-17.6)
- `CONTENT.md` — voice + tone + copy patterns (after WS-17.7)
- `ICONS.md` — icon registry (after WS-17.8)
- `handoffs/` — completed per-feature handoffs (one file per feature, dated)

### Configuration
- `web/.claude/launch.json` — preview server configurations
- `.claude/launch.json` — root preview configurations
- `web/CLAUDE.md` → `web/AGENTS.md` — Next.js 16 reminders
- `CLAUDE.md` (root) — Vercel deployment notes

---

## 11. Appendix B — Memory index

User-level auto-memory at `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/`:

| File | Purpose |
|---|---|
| `MEMORY.md` | Index of all memory files |
| `project_impronta_blueprint.md` | Stack, architecture, data model, roles, phases, design decisions |
| `project_product_vision.md` | Inquiry & booking engine vision; structured coordination replacing WhatsApp |
| `project_inquiry_flow_spec.md` | 8-stage pipeline spec; offer/approval rules; booking conversion |
| `project_admin_workspace_vision.md` | Admin workspace philosophy; Overview tab default; notifications derived from events |
| `project_talent_subscriptions.md` | Talent monetization (Basic/Pro/Portfolio); canonical `tulala.digital/t/<slug>` URL |
| `project_client_trust_badges.md` | Trust ladder (Basic/Verified/Silver/Gold); contact controls |
| `project_agency_exclusivity_model.md` | Exclusivity rules; plan tiers; commission flows |
| `project_workspace_talent_hybrid.md` | Talent who own workspaces; mode-switcher direction |
| `project_saas_build_charter.md` | Multi-tenant build; plan pointer; phase rhythm |
| `project_api_embeds_strategy.md` | API + embeds + widgets strategy (candidate amendment) |
| `project_vercel_deployment.md` | Vercel project IDs, domain model, alias workaround |
| `project_client_dashboard_status.md` | Client dashboard implementation state |
| `feedback_admin_aesthetics.md` | Color drift warnings; gold/rust to avoid |
| `feedback_pre_launch_shipping.md` | Pre-launch shipping rules (one canonical version) |
| `feedback_chrome_screenshots.md` | Screenshot sizing for Chrome MCP |
| `reference_qa_credentials.md` | Dev environment account emails |
| `reference_preview_hydration.md` | Preview tool hydration limitations |
| `ux_notes_dashboard.md` | Running QA observations |

---

## 12. Appendix C — Acceptance-criteria patterns

Use these patterns when writing task acceptance criteria. Specificity here makes everything else cheaper.

### 12.1 Visible
> "When I open the inquiry workspace at viewport ≥1280px, the private and group threads render side-by-side with no horizontal scroll."

### 12.2 Conditional
> "When 2+ system events fire consecutively in a thread, they collapse into a single 'N system updates' stripe. Clicking expands inline."

### 12.3 Interactive
> "When I focus the help icon and press `?`, the panel toggles. Pressing `Cmd+?` does NOT toggle (preserves macOS Help)."

### 12.4 State change
> "When a payment succeeds, the inquiry workspace's Payment card transitions from `Authorized` (grey) → `Held` (amber, padlock) → `Released` (green, padlock-open) within 200ms each."

### 12.5 Boundary / edge
> "When `youCanHere` is empty, the heading + list don't render."

### 12.6 Performance
> "First Contentful Paint ≤1.5s on a throttled 4G connection on the workspace messages page."

### 12.7 A11y
> "VoiceOver announces 'About: Inquiry workspace, button, expanded' when the help icon is focused with the panel open."

### 12.8 Telemetry
> "Opening the inquiry workspace fires `chat_view_mode_active` with props `{ viewport: 'phone' | 'tablet' | 'desktop' | 'wide' }`."

### 12.9 Reversibility
> "Voting 'down' on a help-feedback shows a toast with an Undo button; clicking Undo clears the vote and returns the row to its prompting state."

### 12.10 Cross-surface
> "The unread-count in the workspace topbar matches the badge on the talent's mobile bottom-nav (consistency across surfaces)."

---

---

## 13. Conclusion & go-execute

> This is the final plan. Below is the operating contract between **the prototype team (us)** and **the dev team (later)**.

### 13.1 What this document is — and isn't

**It is:**
- The complete audit of the existing `/admin` v1 + everything missing from the prototype
- A 33-workstream execution plan for taking the prototype from current state to **demonstrating the full redesigned product**
- The dev team's single-source reference for "what should I build, in what order, with what acceptance criteria"
- The designer's playbook for what to spec next (referencing the handoff template)

**It isn't:**
- A migration plan for the production `/admin` codebase. Dev does that later, *informed by* this doc and the prototype.
- A commitment for any specific timeline — phasing is suggested; ordering is non-negotiable.
- Frozen — bump the `Last updated` and add to the decision log when things change.

### 13.2 Final scope summary

**33 workstreams · ~58 weeks sequential · ~18 weeks with 2 designers + 2 engineers in parallel:**

| Phase | Weeks | Workstreams | Outcome |
|---|---|---|---|
| **Phase α — Foundation** | 1 | WS-0 | Primitives, tokens, telemetry shim, feature-flag layer |
| **Phase β — User-facing critical** | 2–6 | WS-1, 2, 3, 4, 5, 6, 9, 10 | Mobile + chat + nav + drawers + money + errors + onboarding + files |
| **Phase γ — Surface depth** | 7–10 | WS-7, 8, 11, 14, 15, 19, 22 | Search, talent/client polish, notifications, public surfaces, hybrid mode, reporting, email |
| **Phase δ — Industry depth** | 11–14 | WS-12, 13, 18, 20, 21, 23, 25, 26 | i18n, perf, AI, ops automation, compliance, marketing/growth, migration, brand tools |
| **Phase ε — Round 4 industry roles** | 15–18 | WS-27, 28, 29, 30, 31, 32, 33, 34 | Page-builder mgmt, CD surface, production team, image rights, account lifecycle, discovery, on-set live, safety |
| **Phase ζ — Reconciliation + ship** | 19–20 | WS-16, 17, 24, **35** | Polish + design system docs + QA/release + production reconciliation |

### 13.3 The non-negotiable critical path

These workstreams must ship in this order before anything else:

```
WS-0 (Foundation) ──▶ WS-1 (Chat) ──▶ WS-2 (Mobile) ──▶ WS-3 (Workspace consolidation)
                  └─▶ WS-5 (Money & trust) ─────────────▶ WS-21 (Compliance)
                  └─▶ WS-35 (Production reconciliation) ─▶ ship
```

Any deviation from this order creates rework. Everything else can be parallelized or deferred.

### 13.4 Definition of "the prototype is done"

The prototype hits **design-complete** when every item below is true:

- [ ] All 33 workstreams have their P0 + P1 tasks shipped
- [ ] Every production `/admin` feature is demonstrated (or explicitly deprecated) in the prototype — verified by walking §3.39bis
- [ ] DRAWER_HELP registry covers every drawer in the union; coverage script (in DRAWERS.md) returns 100%
- [ ] Mobile + chat experience pass a 30-user think-aloud test with <2 confusion incidents per user
- [ ] WCAG AA verified by third-party audit
- [ ] All design-system docs created: `STYLE.md`, `MOTION.md`, `A11Y.md`, `CONTENT.md`, `ICONS.md`
- [ ] DECISIONS.md has ≥30 entries documenting the non-obvious choices
- [ ] At least 5 per-feature handoff docs filled in under `handoffs/<date>-<slug>.md`
- [ ] A dev cold-reading this ROADMAP + the prototype can write the production code without further design input on the redesign

### 13.5 What we hand to dev

When the prototype is design-complete, the dev handoff package is:

1. **`ROADMAP.md`** (this file) — what to build, in what order, why
2. **`DRAWERS.md`** — every drawer's purpose, audience, related-views, ticket category
3. **`DESIGN_HANDOFF_TEMPLATE.md`** — per-feature spec format
4. **`DECISIONS.md`** — every non-obvious choice the team made
5. **`STYLE.md` + `MOTION.md` + `A11Y.md` + `CONTENT.md` + `ICONS.md`** — the design system as docs
6. **`handoffs/`** directory — filled-in per-feature specs
7. **The prototype itself** — at `web/src/app/prototypes/admin-shell/` — the demonstrated redesign
8. **`_help.tsx` registry** — the typed source-of-truth that doubles as chatbot/support/ticket data
9. **Figma file (built in WS-17.1)** — visual source of truth, components mirroring `_primitives.tsx`
10. **Storybook (built in WS-17.2)** — every primitive in isolation

Dev opens any of these cold and can build. **No backchannel knowledge required.**

### 13.6 What dev does that we don't

The prototype team builds and documents. The dev team handles:
- Migration of production `/admin` data + auth
- Real-time wiring (we ship behind mocks; dev wires WebSocket / SSE)
- Email + SMS pipelines (we design templates; dev wires the providers)
- Payment processor integration (we design the UX; dev wires Stripe / Wise / etc.)
- KYC provider integration (we design the flow; dev wires Persona / Onfido)
- Telemetry + analytics provider (we ship `track()` shim; dev wires PostHog / Segment)
- CI / deploy pipelines, error monitoring, backup/restore

### 13.7 The single most important thing

**The prototype's job is to remove ambiguity.** Every screen the dev team builds should answer "yes" to: "Is this exactly what the prototype shows? Is the acceptance criteria spelled out? Are the edge cases covered?"

When in doubt, **add to the prototype** rather than leaving dev to figure it out. The cost of a half-day in the prototype saves a week of dev rework.

### 13.8 Status — current snapshot

**As of last update (2026-04-28):**

| Area | Status |
|---|---|
| Prototype foundation (DrawerShell, primitives, COLORS) | ✅ exists |
| In-app help system (`DRAWER_HELP`, HelpPanel, persistence, feedback widget) | ✅ shipped (4 audit rounds applied) |
| 149-drawer registry coverage | ✅ 100% verified |
| `DRAWERS.md` reference doc | ✅ shipped |
| `ROADMAP.md` (this file) | ✅ shipped |
| `DESIGN_HANDOFF_TEMPLATE.md` | ✅ shipped |
| `DECISIONS.md` | ⏳ to be created (WS-17) |
| `STYLE.md` / `MOTION.md` / `A11Y.md` / `CONTENT.md` / `ICONS.md` | ⏳ to be created (WS-17) |
| Figma file | ⏳ to be created (WS-17.1) |
| Storybook | ⏳ to be created (WS-17.2) |
| `handoffs/` filled-in | ⏳ as workstreams ship |
| Production reconciliation (WS-35) | ⏳ pending |
| All 33 workstreams' P0/P1 tasks | ⏳ pending |

### 13.9 Go-execute checklist (Day 1 of execution)

Before kicking off Phase α:

- [ ] Assign workstream owners (designer + engineer per workstream)
- [ ] Create `DECISIONS.md` with the seed entries listed in §8
- [ ] Stand up Figma + invite the team
- [ ] Stand up Storybook (`npm run storybook` after WS-17.2)
- [ ] Pick a feature flag service (or commit to URL-param-only for now)
- [ ] Pick an analytics provider for `track()` to wire to in WS-0.5
- [ ] Schedule the page-builder team kickoff (WS-27 dependency, week 13)
- [ ] Schedule the legal review for WS-21 (compliance) + WS-34 (minor protections)
- [ ] Set up a recurring 30-min weekly "audit drift" check — re-validate that the plan still matches reality

---

> **End of document.**
> Bump the `Last updated` date in the front-matter when you change this file. Add to `DECISIONS.md` for any non-obvious choice. Cross-link to PRs and audit-finding IDs.
