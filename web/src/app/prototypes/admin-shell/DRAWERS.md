# Tulala Drawer Reference

> **Source of truth:** [`_help.tsx`](./_help.tsx) (the `DRAWER_HELP` constant).
> This Markdown file is hand-generated from that registry — when you change
> entries, update both. Future TODO: `npm run gen:drawers-doc` script that
> emits this from `_help.tsx` automatically. The registry shape is also
> consumed by the future `/support/<slug>` pages, the in-app chat Q&A, and
> the ticket-submission category routing.
>
> **For the bigger picture** — audit findings, execution plan, designer
> handoff package — see [`ROADMAP.md`](./ROADMAP.md) in this directory.
> Drawer rationalization (demote ~30 to popovers, promote ~5 to pages) is
> tracked there as workstream WS-4.

Each entry covers:
- **Who** — the primary audience (drives the eyebrow chip in the in-app help panel)
- **Purpose** — one sentence answering "what is this view for"
- **What you can do here** — concrete actions
- **Related** — drawer ids users typically jump to from here
- **Dev notes** — internal notes, surfaced here only (never in UI)

---

## Table of contents

- [Workspace — Operations](#workspace--operations)
- [Workspace — Roster](#workspace--roster)
- [Workspace — Settings](#workspace--settings)
- [Workspace — Public site](#workspace--public-site)
- [Workspace — Clients](#workspace--clients)
- [Workspace — Notifications](#workspace--notifications)
- [Talent — Today](#talent--today)
- [Talent — My profile](#talent--my-profile)
- [Talent — Premium personal page](#talent--premium-personal-page)
- [Talent — Agencies](#talent--agencies)
- [Talent — Settings & money](#talent--settings--money)
- [Trust & Verification](#trust--verification)
- [Client surface](#client-surface)
- [Cross-cutting / shared](#cross-cutting--shared)
- [Payments / payouts](#payments--payouts)
- [Platform / HQ](#platform--hq)

---

## Workspace — Operations

### `inquiry-workspace`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Single sheet for one inquiry. Clients ask questions, you negotiate, talent confirms — all in one place.
**What you can do here:**
- Reply in the client thread (visible to client + talent)
- Coordinate privately with talent (the client never sees this)
- Send offers and watch for client approval
- Track funded escrow and convert to a confirmed booking
- See the full event timeline — every reply, offer, status change

**Related:** `pipeline`, `new-inquiry`, `today-pulse`
**Ticket category:** Bookings & inquiries

### `inquiry-peek`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Quick read-only summary of an inquiry. Use this when you just need to glance at status without opening the full workspace.
**What you can do here:**
- See the request, dates, and the client's name
- Check current stage and who's waiting on whom
- Jump to the full inquiry workspace if you need to act

**Related:** `inquiry-workspace`, `pipeline`

### `new-inquiry`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Manually create an inquiry — usually for clients who reached out via WhatsApp or email and you want them tracked inside Tulala.
**What you can do here:**
- Add the client (existing or new) and the talent involved
- Set the date(s), shoot type, and budget range
- Choose initial status — usually Draft if you're still negotiating
- Email the client a Tulala link so they can take over from there

**Related:** `pipeline`, `inquiry-workspace`, `client-list`
**Ticket category:** Bookings & inquiries

### `booking-peek`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Read-only summary of one confirmed booking — call-time, talent, contracts, payment status — without leaving the page you're on.
**What you can do here:**
- See the booking at a glance
- Jump to the full booking detail to act
- Open the linked inquiry to see how it was negotiated

**Related:** `confirmed-bookings`, `inquiry-workspace`

### `new-booking`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Skip the inquiry phase and create a booking directly. Use this for already-negotiated deals, repeat clients, or back-office records.
**What you can do here:**
- Pick the client and talent
- Enter the date, rate, and any commission terms
- Mark the booking as funded if escrow is already in place
- Generate the invoice on confirmation

**Related:** `confirmed-bookings`, `client-billing`, `new-inquiry`
**Ticket category:** Bookings & inquiries

### `today-pulse`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** What needs your attention right now — overdue replies, expiring offers, today's call-times, unresolved holds.
**What you can do here:**
- Tap any line to jump straight into the inquiry that needs action
- Dismiss items you'll handle later (they reappear next morning)
- See which talent has a confirmed booking starting today

**Related:** `pipeline`, `inquiry-workspace`, `drafts-holds`

### `pipeline`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Every inquiry from first request to booked, grouped by what's blocking forward motion.
**What you can do here:**
- Filter by stage (drafts, awaiting client, confirmed, archived)
- Open any inquiry to see its full workspace
- Spot stalled requests and nudge the right side
- Reassign coordinators to rebalance load

**Related:** `today-pulse`, `inquiry-workspace`, `drafts-holds`

### `drafts-holds`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Inquiries you started but haven't sent, plus tentative date holds that haven't been confirmed.
**What you can do here:**
- Pick up where you left off on a draft
- Convert a hold into a sent offer or release the date back
- Clear out abandoned drafts in bulk

**Related:** `pipeline`, `new-inquiry`

### `awaiting-client`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Offers waiting on a client decision. Sorted by how long they've been sitting.
**What you can do here:**
- Send a polite nudge if the client has been silent
- Withdraw or revise an offer that's gone stale
- Open the inquiry to add context or attachments

**Related:** `pipeline`, `inquiry-workspace`

### `confirmed-bookings`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Every booking that's been approved and funded. Source of truth for upcoming work.
**What you can do here:**
- See call-time, location, talent, and contract status at a glance
- Open a booking to send updates to talent or client
- Mark a booking as completed once the shoot wraps

**Related:** `new-booking`, `client-billing`, `today-pulse`

### `archived-work`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Cancelled, expired, and completed work — your historical record.
**What you can do here:**
- Search past bookings by client or talent
- Reopen a cancelled inquiry if a client comes back
- Export a date-range report for accounting

**Related:** `confirmed-bookings`, `data-export`

### `day-detail`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Everything happening on a single calendar day — bookings, holds, blockouts, talent availability.
**What you can do here:**
- See who's working, who's holding the date, who's free
- Tap a booking to open its full sheet
- Block out a date for personal time, travel, or studio days

**Related:** `confirmed-bookings`, `talent-availability`

### `representation-requests`
**Who:** Workspace admin
**Purpose:** Talent requesting to join your roster — claims to existing profiles or fresh sign-ups.
**What you can do here:**
- Approve or reject each request with a reason
- Send the talent a sign-on contract before approving
- Flag suspicious requests for the platform team

**Related:** `talent-profile`, `new-talent`

---

## Workspace — Roster

### `talent-profile`
**Who:** Workspace admin, Workspace coordinator, Workspace editor
**Purpose:** The agency-side view of one talent — measurements, rates, availability, internal notes the talent never sees.
**What you can do here:**
- Edit measurements, polaroids, and credits
- Set rate cards and territory restrictions
- Leave private internal notes for your team
- See the agency's commission split with this talent

**Related:** `new-talent`, `talent-rate-card`, `pipeline`

### `new-talent`
**Who:** Workspace admin, Workspace editor
**Purpose:** Add a talent to your roster. Choose between a draft profile (you fill in everything) or invite the talent to claim and finish their own profile.
**What you can do here:**
- Create an unclaimed draft profile to start booking immediately
- Send the talent a claim-link so they manage their own page
- Pre-fill measurements, polaroids, and rates

**Related:** `talent-profile`, `representation-requests`

### `my-profile`
**Who:** Workspace admin, Workspace coordinator, Workspace editor
**Purpose:** Your own talent profile, if you also work as talent. Editing it here is identical to the talent surface.
**What you can do here:**
- Update your measurements, photos, and credits
- Manage your availability calendar
- Switch to the dedicated talent dashboard for the full experience

**Related:** `talent-profile-edit`, `talent-availability`

---

## Workspace — Settings

### `tenant-summary`
**Who:** Workspace admin
**Purpose:** Read-only snapshot of your workspace's plan, usage, and settings — for sharing with finance or legal.
**What you can do here:**
- Copy a permalink to send to your accountant
- See current plan, billing date, and seat count
- Jump to the relevant settings tab to change anything

**Related:** `plan-billing`, `plan-compare`, `team`

### `site-setup`
**Who:** Workspace admin
**Purpose:** First-time setup wizard for your public storefront — domain, branding, and the talent who'll show up first.
**What you can do here:**
- Pick a tulala.app subdomain or connect a custom one
- Upload logo and pick brand colors
- Choose which talent appear on the public roster

**Related:** `domain`, `branding`, `homepage`

### `theme-foundations`
**Who:** Workspace admin
**Purpose:** Brand-level design tokens — fonts, colors, spacing — that propagate across your storefront and emails.
**What you can do here:**
- Pick a font pairing or upload custom webfonts
- Define your primary, accent, and ink colors
- Preview changes on a sample page before saving

**Related:** `design`, `branding`, `homepage`

### `plan-billing`
**Who:** Workspace admin
**Purpose:** Your subscription, payment method, invoices, and seat count.
**What you can do here:**
- Upgrade or downgrade your plan
- Update the card on file
- Download past invoices
- Add or remove seats for team members

**Related:** `plan-compare`, `team`, `data-export`
**Ticket category:** Billing

### `team`
**Who:** Workspace admin
**Purpose:** Coordinators, editors, and other admins on your workspace — and what each can do.
**What you can do here:**
- Invite teammates by email
- Assign roles (admin, coordinator, editor)
- Revoke access when someone leaves
- See last-active timestamps for each member

**Related:** `plan-billing`, `audit-log`
**Ticket category:** Account & access

### `branding`
**Who:** Workspace admin
**Purpose:** Logo, favicon, and brand assets used across your storefront, emails, and shareable links.
**What you can do here:**
- Upload your logo (light + dark variants)
- Set the favicon shown in browser tabs
- Upload a default OG image for social shares

**Related:** `theme-foundations`, `domain`, `homepage`

### `domain`
**Who:** Workspace admin
**Purpose:** Connect a custom domain (yours.com) instead of the default tulala.app subdomain.
**What you can do here:**
- Add a new domain and see the DNS records to set
- Verify and switch your storefront to the new domain
- Set up a redirect from your old subdomain

**Related:** `site-setup`, `branding`
**Ticket category:** Public site & domains

### `identity`
**Who:** Workspace admin
**Purpose:** Legal entity, billing address, and tax info — used on invoices and contracts.
**What you can do here:**
- Update your registered business name and address
- Add a VAT or tax ID
- Choose what appears on outgoing invoices

**Related:** `plan-billing`
**Ticket category:** Billing

### `workspace-settings`
**Who:** Workspace admin
**Purpose:** Workspace-wide defaults — currency, locale, weekly schedule, notification rules.
**What you can do here:**
- Set the default currency for new bookings
- Pick which weekday your dashboard week starts on
- Define default reply windows and SLA targets

**Related:** `notifications-prefs`, `team`

### `danger-zone`
**Who:** Workspace admin
**Purpose:** Irreversible workspace operations — exporting everything, transferring ownership, deleting the workspace.
**What you can do here:**
- Export a full archive (clients, bookings, files) before leaving
- Transfer the workspace to another admin
- Delete the workspace permanently (90-day grace period)

**Related:** `data-export`, `plan-billing`
**Ticket category:** Account & access
**Dev notes:** All actions trigger a 2FA prompt. Workspace deletion is soft-deleted for 90 days then hard-deleted by a platform job.

### `activation-checklist`
**Who:** Workspace admin
**Purpose:** Your onboarding progress — the steps that turn a fresh workspace into a live, bookable storefront.
**What you can do here:**
- See which setup steps are still incomplete
- Tap any step to jump straight into it
- Mark steps as done manually if you skipped the in-app flow

**Related:** `site-setup`, `homepage`, `new-talent`

### `tenant-switcher`
**Who:** Workspace admin
**Purpose:** If you belong to multiple workspaces (eg you run both a studio and an agency), switch between them here.
**What you can do here:**
- See all workspaces you have access to
- Switch to another workspace without signing out
- Set a default workspace for new sessions

**Related:** `workspace-settings`

### `plan-compare`
**Who:** Workspace admin, Talent, Client
**Purpose:** Side-by-side comparison of every plan tier so you can pick (or upgrade) the one that fits.
**What you can do here:**
- See feature parity across Free, Studio, Agency, and Network
- Toggle monthly vs annual pricing
- Start an upgrade flow from any tier card

**Related:** `plan-billing`

---

## Workspace — Public site

### `homepage`
**Who:** Workspace admin, Workspace editor
**Purpose:** Edit your public storefront homepage — the first thing visitors see at yoursite.tulala.app.
**Related:** `pages`, `design`, `widgets`

### `pages`
**Who:** Workspace admin, Workspace editor
**Purpose:** Static pages on your storefront — About, Press, Contact, Terms, etc.
**Related:** `homepage`, `navigation`, `seo`

### `posts`
**Who:** Workspace admin, Workspace editor
**Purpose:** Editorial posts — campaign roundups, talent spotlights, agency news.
**Related:** `pages`, `media`, `seo`

### `navigation`
**Who:** Workspace admin, Workspace editor
**Purpose:** The header and footer menus on your public storefront.
**Related:** `pages`, `homepage`

### `media`
**Who:** Workspace admin, Workspace editor
**Purpose:** Every image, video, and file uploaded across your workspace — central library.
**Related:** `homepage`, `posts`, `talent-portfolio`

### `translations`
**Who:** Workspace admin, Workspace editor
**Purpose:** Multilingual storefront — translate your pages, posts, and UI strings.
**Related:** `pages`, `posts`

### `seo`
**Who:** Workspace admin, Workspace editor
**Purpose:** SEO defaults and per-page overrides — meta title, description, OG image, robots.
**Related:** `pages`, `homepage`, `site-health`

### `field-catalog`
**Who:** Workspace admin
**Purpose:** Custom fields on talent profiles, clients, and inquiries. Define your own data model on top of the defaults.
**Related:** `taxonomy`, `talent-profile`
**Dev notes:** Custom fields are an Agency-tier feature. Free + Studio plans see a read-only preview with an upgrade nudge.

### `taxonomy`
**Who:** Workspace admin
**Purpose:** The categorization system — talent specialties, client industries, inquiry types — used for filtering across the app.
**Related:** `field-catalog`, `filter-config`

### `design`
**Who:** Workspace admin, Workspace editor
**Purpose:** Section-level design controls — typography, spacing, button styles — beyond the brand foundations.
**Related:** `theme-foundations`, `homepage`

### `widgets`
**Who:** Workspace admin, Workspace editor
**Purpose:** Embeddable Tulala blocks — booking forms, talent grids, hub directories — that you can drop into pages.
**Related:** `api-keys`, `homepage`, `hub-distribution`

### `api-keys`
**Who:** Workspace admin
**Purpose:** API keys for pulling your roster data into external sites or third-party tools.
**Related:** `widgets`, `audit-log`
**Ticket category:** Developer & API

### `site-health`
**Who:** Workspace admin
**Purpose:** Storefront-side checks — broken links, missing meta tags, slow pages, indexability.
**Related:** `seo`, `pages`, `homepage`

### `storefront-visibility`
**Who:** Workspace admin
**Purpose:** Who can see your storefront — public, link-only, password-protected, or hidden from Tulala discovery.
**Related:** `site-setup`, `domain`

### `hub-distribution`
**Who:** Workspace admin
**Purpose:** Submit your roster to industry hubs — curated talent directories that send you inbound clients.
**Related:** `widgets`, `site-health`
**Dev notes:** Hub listings are reviewed by Tulala HQ. See `platform-hub-submission` for the HQ side.

### `filter-config`
**Who:** Workspace admin
**Purpose:** Which filters appear on your public roster page (height, location, specialty, etc).
**Related:** `taxonomy`, `homepage`

---

## Workspace — Clients

### `client-list`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Every client your workspace has worked with — past, present, and prospective.
**Related:** `client-profile`, `private-client-data`, `relationship-history`

### `client-profile`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** The client's full record — contacts, brands, past bookings, payment history.
**Related:** `client-list`, `private-client-data`, `relationship-history`, `client-billing`

### `relationship-history`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Chronological log of every interaction with one client — bookings, messages, contracts, payments.
**Related:** `client-profile`, `audit-log`

### `private-client-data`
**Who:** Workspace admin
**Purpose:** Client info that's locked to admins only — internal credit ratings, do-not-book flags, sensitive notes.
**Related:** `client-profile`, `audit-log`
**Dev notes:** Coordinators and editors see no trace this drawer exists.

---

## Workspace — Notifications

### `notifications`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Every alert your workspace has generated — replies, offers, payments, system events.
**Related:** `notifications-prefs`, `today-pulse`

### `team-activity`
**Who:** Workspace admin
**Purpose:** What your teammates have been doing — replies sent, bookings closed, talents added.
**Related:** `audit-log`, `team`

### `talent-activity`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Talent-side actions visible to you — accepted offers, updated availability, new portfolio uploads.
**Related:** `talent-profile`, `team-activity`

### `notifications-prefs`
**Who:** Workspace admin, Workspace coordinator, Workspace editor, Talent, Client
**Purpose:** Which notifications you receive (in-app, email, push), and at what frequency.
**Related:** `notifications`

### `inbox-snippets`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Saved reply templates — for common questions, follow-ups, polite-no's.
**Related:** `reply-templates`, `notifications-prefs`

### `reply-templates`
**Who:** Workspace admin, Workspace coordinator, Talent
**Purpose:** Reusable canned replies for inquiries, offers, and rejections.
**Related:** `inbox-snippets`

---

## Talent — Today

### `talent-today-pulse`
**Who:** Talent
**Purpose:** Your day at a glance — call-times, requests waiting on you, offers about to expire.
**Related:** `talent-availability`, `talent-offer-detail`

### `talent-offer-detail`
**Who:** Talent
**Purpose:** An offer from your agency or a direct client — rate, dates, scope, terms.
**Related:** `talent-request-detail`, `talent-availability`
**Ticket category:** Bookings & inquiries

### `talent-request-detail`
**Who:** Talent
**Purpose:** A request that's not yet a formal offer — agency is sounding you out before sending terms.
**Related:** `talent-offer-detail`, `talent-availability`

### `talent-booking-detail`
**Who:** Talent
**Purpose:** A confirmed booking — call-time, location, contacts, payment status.
**Related:** `talent-payouts`, `talent-closed-booking`

### `talent-closed-booking`
**Who:** Talent
**Purpose:** A finished booking — final payout status, receipt, and review window.
**Related:** `talent-payouts`, `talent-earnings-detail`

### `talent-add-event`
**Who:** Talent
**Purpose:** Add a personal event, travel, or block-out to your calendar so agencies stop offering you those dates.
**Related:** `talent-availability`, `talent-block-dates`

### `talent-hub-detail`
**Who:** Talent
**Purpose:** Detail on a hub directory — what it is, what they pay, how to apply, who else is listed.
**Related:** `talent-hub-compare`, `hub-distribution`

### `talent-hub-compare`
**Who:** Talent
**Purpose:** Side-by-side comparison of every hub you're eligible for.
**Related:** `talent-hub-detail`

### `talent-voice-reply`
**Who:** Talent
**Purpose:** Record a quick voice reply instead of typing — useful when you're on the move.
**Related:** `reply-templates`

### `talent-chat-archive`
**Who:** Talent
**Purpose:** Archived conversations — closed bookings, declined requests, dormant agency relationships.
**Related:** `talent-closed-booking`

---

## Talent — My profile

### `talent-profile-edit`
**Who:** Talent
**Purpose:** Edit your full talent profile — bio, photos, measurements, credits, rates.
**Related:** `talent-profile-section`, `talent-public-preview`, `talent-portfolio`

### `talent-profile-section`
**Who:** Talent
**Purpose:** Edit a single section of your profile — focused mode for one piece at a time.
**Related:** `talent-profile-edit`

### `talent-availability`
**Who:** Talent
**Purpose:** Your master availability calendar. Agencies see this when they're trying to offer you work.
**Related:** `talent-add-event`, `talent-block-dates`

### `talent-block-dates`
**Who:** Talent
**Purpose:** Quickly block a range of dates — vacation, family event, maternity leave.
**Related:** `talent-availability`, `talent-add-event`

### `talent-portfolio`
**Who:** Talent
**Purpose:** Your portfolio images, organized into albums (editorial, commercial, runway, etc).
**Related:** `talent-photo-edit`, `talent-polaroids`, `talent-credits`

### `talent-polaroids`
**Who:** Talent
**Purpose:** Casting polaroids — natural, no-makeup digitals shot against a plain wall.
**Related:** `talent-portfolio`, `talent-measurements`

### `talent-photo-edit`
**Who:** Talent
**Purpose:** Crop, retouch, and tag a single photo from your portfolio.
**Related:** `talent-portfolio`, `talent-credits`

### `talent-credits`
**Who:** Talent
**Purpose:** Your campaign and editorial credits — the brands and publications you've worked with.
**Related:** `talent-portfolio`, `talent-press`

### `talent-skills`
**Who:** Talent
**Purpose:** Skills that affect what you get cast for — languages, sports, dance, accents, instruments.
**Related:** `talent-showreel`, `talent-credits`

### `talent-limits`
**Who:** Talent
**Purpose:** What you will and won't do — nudity, fur, alcohol/tobacco, conflicting brands.
**Related:** `talent-conflict-resolve`, `talent-profile-edit`

### `talent-rate-card`
**Who:** Talent
**Purpose:** Your standard rates by job type, market, and usage tier.
**Related:** `talent-payouts`, `talent-earnings-detail`

### `talent-travel`
**Who:** Talent
**Purpose:** Travel preferences and constraints — passport details, comfort with red-eyes, dietary needs.
**Related:** `talent-availability`

### `talent-links`
**Who:** Talent
**Purpose:** External links shown on your profile — Instagram, agency page, personal site, IMDB.
**Related:** `talent-personal-page`, `talent-press`

### `talent-reviews`
**Who:** Talent
**Purpose:** Feedback from past clients and agencies — visible to clients considering booking you.
**Related:** `talent-closed-booking`

### `talent-showreel`
**Who:** Talent
**Purpose:** Video reel — runway clips, commercial spots, behind-the-scenes.
**Related:** `talent-portfolio`, `talent-skills`

### `talent-measurements`
**Who:** Talent
**Purpose:** Your measurements as they appear on every casting brief — height, bust/chest, waist, hips, shoe, hair, eyes.
**Related:** `talent-polaroids`, `talent-profile-edit`

### `talent-documents`
**Who:** Talent
**Purpose:** Identity, work-permit, and tax documents — encrypted and shared only with verified agencies.
**Related:** `talent-tax-docs`, `talent-privacy`

### `talent-emergency-contact`
**Who:** Talent
**Purpose:** Who agencies should call if something goes wrong on set — only revealed in emergencies.
**Related:** `talent-privacy`, `audit-log`

### `talent-public-preview`
**Who:** Talent
**Purpose:** Preview exactly what clients see when they land on your public profile.
**Related:** `talent-personal-page`, `talent-profile-edit`

---

## Talent — Premium personal page

### `talent-tier-compare`
**Who:** Talent
**Purpose:** Compare Basic (free), Pro, and Portfolio tiers — what each unlocks for your personal page.
**Related:** `talent-personal-page`

### `talent-personal-page`
**Who:** Talent
**Purpose:** Your premium personal page — independent of any agency, owned by you, lives at tulala.digital/t/<your-slug>.
**Related:** `talent-page-template`, `talent-custom-domain`, `talent-media-embeds`

### `talent-page-template`
**Who:** Talent
**Purpose:** Pick or customize the layout template for your personal page.
**Related:** `talent-personal-page`

### `talent-media-embeds`
**Who:** Talent
**Purpose:** Drop external media — Vimeo reels, Spotify playlists, Instagram posts — into your personal page.
**Related:** `talent-personal-page`, `talent-showreel`

### `talent-press`
**Who:** Talent
**Purpose:** Press mentions and editorial features — articles where you've appeared.
**Related:** `talent-credits`, `talent-personal-page`

### `talent-media-kit`
**Who:** Talent
**Purpose:** Downloadable PDF media kit — bio, photos, rate card, contact — for press and brand pitches.
**Related:** `talent-rate-card`, `talent-portfolio`

### `talent-custom-domain`
**Who:** Talent
**Purpose:** Connect your own domain (yourname.com) to your personal page — Portfolio tier only.
**Related:** `talent-personal-page`, `talent-tier-compare`
**Ticket category:** Public site & domains

---

## Talent — Agencies

### `talent-agency-relationship`
**Who:** Talent
**Purpose:** Your relationship with one agency — exclusivity status, commission, contract terms.
**Related:** `talent-leave-agency`, `talent-multi-agency-picker`

### `talent-leave-agency`
**Who:** Talent
**Purpose:** Initiate the process of leaving an agency — review notice periods, transfer rules, and final settlements.
**Related:** `talent-agency-relationship`
**Ticket category:** Account & access
**Dev notes:** Triggers a 14-day mediation window before exclusivity formally ends. Both sides get an export of the relationship history.

### `talent-multi-agency-picker`
**Who:** Talent
**Purpose:** If you work with multiple agencies, pick which one acts on a given inquiry or booking.
**Related:** `talent-agency-relationship`, `talent-conflict-resolve`

### `talent-conflict-resolve`
**Who:** Talent
**Purpose:** Handle a conflict — two agencies offering competing dates, an agency missing a previously-set blockout, etc.
**Related:** `talent-availability`, `talent-multi-agency-picker`

### `talent-network`
**Who:** Talent
**Purpose:** Other talent you collaborate with — a private network for swapping castings you can't take, recommendations, and shared bookings.
**What you can do here:**
- Invite other talent to your network
- Refer a casting you can't take to a peer (with optional referral fee)
- See bookings other talent have referred to you

**Related:** `talent-referrals`

### `talent-referrals`
**Who:** Talent
**Purpose:** Your referral history and earnings — talent and brands you've sent to others, and what they've sent back.
**Related:** `talent-network`, `talent-earnings-detail`

---

## Talent — Settings & money

### `talent-notifications`
**Who:** Talent
**Purpose:** Your notification preferences as a talent — what you get pinged about and how.
**Related:** `notifications-prefs`

### `talent-privacy`
**Who:** Talent
**Purpose:** Who sees what — measurements, contact, social handles, agency-private info.
**Related:** `talent-contact-preferences`, `talent-emergency-contact`, `audit-log`

### `talent-contact-preferences`
**Who:** Talent
**Purpose:** Who can contact you directly — by trust tier, agency relationship, or specific brand.
**Related:** `talent-privacy`
**Dev notes:** Defaults are open-ish — talent must opt INTO restrictions. See `client-trust-badges` memory for how this maps to the trust ladder.

### `talent-payouts`
**Who:** Talent
**Purpose:** Where your money goes — bank accounts, payment processors, payout schedule.
**Related:** `talent-earnings-detail`, `talent-tax-docs`
**Ticket category:** Billing

### `talent-earnings-detail`
**Who:** Talent
**Purpose:** Detailed earnings — every booking, what came in, what was deducted (commission, taxes, fees).
**Related:** `talent-payouts`, `talent-rate-card`, `talent-tax-docs`

### `talent-tax-docs`
**Who:** Talent
**Purpose:** Year-end tax documents — 1099, W-9, equivalents per region. Download once your earnings are finalized.
**Related:** `talent-payouts`, `talent-earnings-detail`
**Ticket category:** Billing

### `talent-verification` — **deprecated**
**Who:** Talent
**Purpose:** Legacy alias. Superseded by `talent-trust-detail` (dashboard) and the per-method drawers below. Kept so old deep links don't 404.
**Related:** `talent-trust-detail`
**Ticket category:** Account & access

---

## Trust & Verification

> The trust system splits into three concerns:
> - **Account verification** (security — never a public badge)
> - **Profile claiming** (ownership — talent ↔ agency)
> - **Profile trust verification** (public badges + admin signals)
>
> Platform admins decide which methods exist via `platform-verification-methods`. Workspace admins review submissions via `trust-verification-queue` and `trust-disputed-claims`. Talent initiate flows from `talent-trust-detail`. The full schema, lifecycle, and wiring contract lives in [`TRUST.md`](./TRUST.md).

### `trust-verification-queue`
**Who:** Workspace admin, Workspace coordinator
**Purpose:** Review every Instagram + Tulala + ID + business + domain + payment verification submitted by talent. Approve, reject, or ask for more info.
**What you can do here:**
- Filter by status (Pending / In review / Needs info / Approved / Rejected) and by method (only platform-enabled methods appear)
- Search by talent name, IG handle, code, or method
- Bulk-approve via row checkboxes
- Open a request to see evidence URL, talent's note, full activity timeline, and risk-health score
- Approve / reject (with reason) / mark in review / request more info
**Related:** `trust-disputed-claims`, `platform-verification-methods`, `talent-trust-detail`
**Ticket category:** Account & access
**Dev notes:** Method-filter dropdown calls `isVerificationMethodEnabled` to hide disabled methods. Activity log is synthesised from `request.createdAt` / `updatedAt` / `reviewedAt` (no separate event table yet). Bulk approve iterates `approveVerificationRequest` per id.

### `trust-disputed-claims`
**Who:** Workspace admin
**Purpose:** Resolve agency-created profiles that the claimed talent flagged as not theirs.
**What you can do here:**
- Review the talent's dispute reason and the original invite metadata
- See the talent's risk-health score (claim disputes drop it −25)
- Add admin-only notes recording your rationale
- Pick one of three outcomes:
  - **Release** — talent wins; profile freed (claim status → `released`)
  - **Uphold** — agency wins; invite re-issued (claim status → `invite_sent`)
  - **Remove** — neither owns it; profile taken down
**Related:** `trust-verification-queue`, `talent-claim-invite`
**Ticket category:** Account & access
**Dev notes:** `resolveProfileClaimDispute(claimId, outcome, adminNotes?)` patches both `profileClaims` array (status) and `claimStatusByTalent` map. Removing a profile entirely is partial in the prototype — claim record flips to `revoked`, claimStatus is deleted; production should also strip the talent profile row.

### `platform-verification-methods`
**Who:** Tulala HQ
**Purpose:** Source-of-truth registry for which verification methods exist on Tulala. Platform admins decide what's available to the entire ecosystem.
**What you can do here:**
- Toggle a method on / off (warning modal fires if active badges exist — they stay valid until expiry, but are hidden from public storefronts immediately via the disable-cascade gate)
- Set review mode (`automated` / `manual` / `hybrid`)
- Set visibility (`public_profile` / `admin_only` / `internal`)
- Restrict by talent tier (`Basic` / `Pro` / `Portfolio` / `All`)
- Toggle `evidenceRequired` and `expiresAfterDays`
- Inspect the audit log of every change
**Related:** `trust-verification-queue`
**Ticket category:** Account & access
**Dev notes:** Linked from HQ Settings → Platform card. Every change emits one `VerificationMethodAuditEntry` per modified key via `updateVerificationMethod`. The disable cascade is enforced inside `getTrustSummary` (sets `methodEnabled` on each badge) and `ProfilePhotoBadgeOverlay` / `TrustBadgeGroup` filter on it for public surfaces.

### `talent-trust-detail`
**Who:** Talent
**Purpose:** Your trust dashboard — health score, badges, what to verify next, who can contact you.
**What you can do here:**
- See your trust-health score (0–100) and active-badge count
- Open the next 1–3 highest-impact verifications, ranked by score lift
- Run Instagram DM flow (handle + code + optional evidence URL)
- Request Tulala manual review
- Open Phone / ID / Business / Domain / Payment flows when enabled platform-wide
- Set your contact gate: Anyone / Verified clients only / Trusted clients only (score ≥ 60)
**Related:** `talent-phone-verify`, `talent-id-verify`, `talent-business-verify`, `talent-domain-verify`, `talent-payment-verify`, `talent-claim-invite`
**Ticket category:** Account & access
**Dev notes:** Renders only methods where `isVerificationMethodEnabled` returns true. Suggestion ranking uses a hardcoded `lift` value per method type. Contact gate calls `setTalentContactGate` which feeds into `canClientContactTalent` checked on the client send-inquiry button.

### `talent-claim-invite`
**Who:** Talent
**Purpose:** Accept (or dispute) a profile that an agency created in your name.
**What you can do here:**
- Review the profile the agency built (photos, fields, agency name)
- **Claim** → flips `claimStatusByTalent` to `claimed`, marks email verified
- **Not me / dispute** → flips `ProfileClaimInvitation.status` to `disputed`, lands in admin queue
- **Report** → takes profile offline pending admin review
**Related:** `talent-trust-detail`, `trust-disputed-claims`
**Ticket category:** Account & access

### `talent-phone-verify`
**Who:** Talent
**Purpose:** Confirm a working phone number via SMS OTP. Internal-only — never a public badge.
**What you can do here:**
- Enter phone with country code
- Receive a 6-digit OTP (prototype shows it inline; production sends real SMS)
- Type the code to auto-verify
**Related:** `talent-trust-detail`
**Ticket category:** Account & access
**Dev notes:** Runs purely on the client; `createVerificationRequest` → `approveVerificationRequest` on code match. No admin review path.

### `talent-id-verify`
**Who:** Talent
**Purpose:** Upload a government-issued ID for manual admin review. Internal-only — confirms name + age + identity uniqueness.
**What you can do here:**
- Pick document type (passport / driver's license / national ID)
- Provide a secure URL (production: direct upload)
- Add a reviewer note
- Submit for manual admin review (~48h)
**Related:** `talent-trust-detail`, `talent-phone-verify`
**Ticket category:** Account & access
**Dev notes:** Reads `cfg.evidenceRequired` from the platform-admin config — if true, blocks submission without a URL.

### `talent-business-verify`
**Who:** Talent
**Purpose:** Confirm the registered legal entity behind your work — VAT / company-house / DIC / equivalent. Public badge.
**What you can do here:**
- Enter legal name + VAT number
- Optionally (or required by platform policy) attach a public registry URL
- Submit for manual review (~3 business days)
**Related:** `talent-trust-detail`
**Ticket category:** Account & access
**Dev notes:** When `cfg.evidenceRequired === true` the registry URL becomes required. Asterisk + helper copy adapt accordingly.

### `talent-domain-verify`
**Who:** Talent
**Purpose:** Prove you control a domain via DNS TXT record. Public badge — adds credibility for talent who maintain their own websites.
**What you can do here:**
- Enter your domain
- Copy the generated TXT value
- Paste into your DNS provider
- Click 'check now' to run the lookup — auto-approves on match
**Related:** `talent-trust-detail`, `talent-custom-domain`
**Ticket category:** Account & access
**Dev notes:** The lookup is currently simulated (1.5s timeout → auto-approve). Production needs a real DNS resolver behind a `/api/verify/domain` endpoint with retry semantics for propagation.

### `talent-payment-verify`
**Who:** Talent
**Purpose:** Confirm a working payout method via Stripe authorization-then-refund. Internal-only — improves trust score with payment-reliability-conscious clients.
**What you can do here:**
- Run the check (€1 hold + immediate refund — no money actually moves)
- Result auto-resolves inline
**Related:** `talent-trust-detail`, `talent-payouts`
**Ticket category:** Billing
**Dev notes:** Simulated in prototype. Production wires to Stripe `PaymentIntent` with capture method `manual` then `payment_intents.cancel`.

---

## Client surface

### `client-today-pulse`
**Who:** Client
**Purpose:** Your day at a glance as a client — open inquiries, pending offers, upcoming shoots.
**Related:** `client-inquiry-detail`, `client-booking-detail`

### `client-talent-card`
**Who:** Client
**Purpose:** Quick view of one talent — measurements, top photos, availability snapshot.
**Related:** `client-shortlist-detail`, `client-send-inquiry`

### `client-saved-search`
**Who:** Client
**Purpose:** Saved talent searches — filters you re-run often (eg "female, 5'10+, US-based, runway").
**Related:** `client-shortlist-detail`

### `client-shortlist-detail`
**Who:** Client
**Purpose:** A curated list of talent for a specific job — share with your team, send group inquiries, narrow down.
**Related:** `client-new-shortlist`, `client-share-shortlist`, `client-send-inquiry`

### `client-new-shortlist`
**Who:** Client
**Purpose:** Create a new shortlist — usually one per project or casting brief.
**Related:** `client-shortlist-detail`

### `client-share-shortlist`
**Who:** Client
**Purpose:** Share a shortlist with someone outside Tulala — your client, your director, your stylist.
**Related:** `client-shortlist-detail`

### `client-send-inquiry`
**Who:** Client
**Purpose:** Send an inquiry to one talent or a whole shortlist — kicks off the booking conversation.
**Related:** `client-shortlist-detail`, `client-inquiry-detail`

### `client-inquiry-detail`
**Who:** Client
**Purpose:** Your view of one inquiry — messages, offers, agency replies, status.
**Related:** `client-counter-offer`, `client-booking-detail`

### `client-counter-offer`
**Who:** Client
**Purpose:** Counter the agency's offer with different terms — rate, dates, scope.
**Related:** `client-inquiry-detail`

### `client-booking-detail`
**Who:** Client
**Purpose:** A confirmed booking — call-time, location, talent, contracts, payment.
**Related:** `client-contracts`, `client-billing`

### `client-contracts`
**Who:** Client
**Purpose:** Every contract you have with this agency — past, signed, and pending.
**Related:** `client-booking-detail`, `client-billing`
**Ticket category:** Bookings & inquiries

### `client-team`
**Who:** Client
**Purpose:** Other people on your client team — co-workers, agencies, freelancers — and what they can see.
**Related:** `client-settings`

### `client-billing`
**Who:** Client
**Purpose:** Invoices, payment methods, and payment history.
**Related:** `client-contracts`, `client-booking-detail`
**Ticket category:** Billing

### `client-brand-switcher`
**Who:** Client
**Purpose:** If you work for multiple brands or agencies, switch between them without signing out.
**Related:** `client-team`

### `client-settings`
**Who:** Client
**Purpose:** Your client account — name, email, password, notification preferences.
**Related:** `notifications-prefs`, `client-team`

### `client-quick-question`
**Who:** Client
**Purpose:** Send a quick, no-strings-attached question to an agency or talent — before committing to a formal inquiry.
**Related:** `client-send-inquiry`

---

## Cross-cutting / shared

### `data-export`
**Who:** Workspace admin, Talent, Client
**Purpose:** Download an archive of your data — for backups, portability, or before you delete the account.
**Related:** `danger-zone`, `audit-log`
**Ticket category:** Account & access

### `audit-log`
**Who:** Workspace admin, Talent, Tulala HQ
**Purpose:** Every consequential action on this account or workspace — who did what, when, from where.
**Related:** `team-activity`, `data-export`

### `talent-share-card`
**Who:** Talent
**Purpose:** Share your talent profile via a clean link, embed code, or downloadable card.
**Related:** `talent-personal-page`, `talent-public-preview`

### `whats-new`
**Who:** Workspace admin, Workspace coordinator, Talent, Client
**Purpose:** Recent product updates, feature launches, and changes you should know about.
**Related:** `help`

### `help`
**Who:** Workspace admin, Workspace coordinator, Talent, Client
**Purpose:** The help hub — search articles, browse by topic, contact support, submit a ticket.
**Related:** `whats-new`
**Ticket category:** General

---

## Payments / payouts

### `payments-setup`
**Who:** Workspace admin
**Purpose:** Connect your workspace to a payments processor — Stripe, Wise, Mercury — so you can receive client payments.
**Related:** `plan-billing`, `payout-receiver-picker`
**Ticket category:** Billing

### `payout-receiver-picker`
**Who:** Workspace admin
**Purpose:** Pick who receives payment for a booking — agency, talent direct, or split.
**Related:** `payments-setup`

### `payment-detail`
**Who:** Workspace admin, Talent, Client
**Purpose:** Detail of a single payment — amount, fees, tax, receiver, status.
**Related:** `client-billing`, `talent-payouts`
**Ticket category:** Billing

---

## Platform / HQ

> Internal-only — accessible only to Tulala HQ staff. Drawer ids prefixed `platform-`.

### `platform-today-pulse`
**Who:** Tulala HQ
**Purpose:** Cross-tenant pulse — incidents open, tickets in queue, billing failures, today's high-impact tenants.
**Related:** `platform-incident`, `platform-system-job`, `platform-support-ticket`

### `platform-tenant-detail`
**Who:** Tulala HQ
**Purpose:** One tenant's full record — plan, MRR, usage, key staff, recent activity.
**Related:** `platform-tenant-impersonate`, `platform-tenant-plan-override`, `platform-tenant-suspend`

### `platform-tenant-impersonate`
**Who:** Tulala HQ
**Purpose:** Sign in as a tenant admin (with their consent) to debug an issue.
**Related:** `platform-tenant-detail`, `audit-log`
**Dev notes:** Always logged. Tenant admin gets an email at session start AND end. Sessions auto-expire at 60 min.

### `platform-tenant-suspend`
**Who:** Tulala HQ
**Purpose:** Suspend a tenant — billing failure, terms violation, security incident.
**Related:** `platform-tenant-detail`

### `platform-tenant-plan-override`
**Who:** Tulala HQ
**Purpose:** Manually override a tenant's plan — bumps, comps, custom enterprise terms.
**Related:** `platform-tenant-detail`, `platform-billing-invoice`

### `platform-user-detail`
**Who:** Tulala HQ
**Purpose:** One end-user's record — across tenants, surfaces, devices, sessions.
**Related:** `platform-user-merge`, `platform-user-reset`

### `platform-user-merge`
**Who:** Tulala HQ
**Purpose:** Merge two user records — same person signed up twice with different emails.
**Related:** `platform-user-detail`

### `platform-user-reset`
**Who:** Tulala HQ
**Purpose:** Force-reset a user's password or 2FA.
**Related:** `platform-user-detail`

### `platform-hub-submission`
**Who:** Tulala HQ
**Purpose:** Tenant has applied to a hub — review their roster fit before approving.
**Related:** `platform-hub-rules`, `hub-distribution`

### `platform-hub-rules`
**Who:** Tulala HQ
**Purpose:** Curation rules per hub — minimum bar, eligibility filters, exclusivity terms.
**Related:** `platform-hub-submission`

### `platform-billing-invoice`
**Who:** Tulala HQ
**Purpose:** One invoice across the platform — tenant, line items, payment status.
**Related:** `platform-refund`, `platform-tenant-detail`

### `platform-refund`
**Who:** Tulala HQ
**Purpose:** Refund a charge — partial or full — with required reason and audit trail.
**Related:** `platform-billing-invoice`

### `platform-dunning`
**Who:** Tulala HQ
**Purpose:** Tenants in dunning — failed charges, retry schedules, suspension countdowns.
**Related:** `platform-billing-invoice`, `platform-tenant-suspend`

### `platform-feature-flag`
**Who:** Tulala HQ
**Purpose:** Toggle features per tenant or globally — staged rollouts, beta access, kill switches.
**Related:** `platform-tenant-detail`

### `platform-moderation-item`
**Who:** Tulala HQ
**Purpose:** Content flagged for moderation — inappropriate photos, suspicious profiles, abusive messages.
**Related:** `platform-user-detail`, `audit-log`

### `platform-system-job`
**Who:** Tulala HQ
**Purpose:** Background jobs — exports, migrations, daily aggregations. See progress and retry failures.
**Related:** `platform-incident`

### `platform-incident`
**Who:** Tulala HQ
**Purpose:** A live or past incident — what broke, when, how it was resolved.
**Related:** `platform-system-job`, `platform-support-ticket`

### `platform-support-ticket`
**Who:** Tulala HQ
**Purpose:** A support ticket from a tenant or end-user — the queue HQ works through daily.
**Related:** `platform-tenant-detail`, `platform-incident`

### `platform-audit-export`
**Who:** Tulala HQ
**Purpose:** Generate a compliance-grade audit export — for legal, security reviews, or tenant requests.
**Related:** `audit-log`

### `platform-hq-team`
**Who:** Tulala HQ
**Purpose:** Tulala HQ staff and their roles, permissions, and on-call schedules.
**Related:** `platform-incident`

### `platform-region-config`
**Who:** Tulala HQ
**Purpose:** Per-region settings — currencies, tax rules, available payment processors, content moderation rules.
**Related:** `platform-feature-flag`

---

## Sprint 2026-05-01 additions

The following drawers landed in the modernization sprint (commit `5e0ce66`). They are routed in `_drawers.tsx`'s `DrawerRoot` switch but most do not yet have a `DRAWER_HELP` entry — add help text in a follow-up pass.

### `client-csv-bulk-add`
**Who:** Workspace owner / admin
**Purpose:** Bulk-import clients from a CSV (name, contact, email). Validation: name + at least one of contact or email required. Imports go straight to the active client list — no approval queue.
**Related:** `new-talent` (CSV mode), `talent-approvals`

### `platform-verification-methods`
**Who:** Tulala HQ
**Purpose:** Toggle which of the 8 verification methods are enabled platform-wide. Disabled methods don't appear in the talent's verification picker.
**Related:** `trust-verification-queue`, `feature-controls`

### `talent-phone-verify`
**Who:** Talent
**Purpose:** Submit phone number for SMS-code verification. Raises trust tier; enables agency outreach.
**Related:** `trust-verification-queue`, `talent-trust-detail`

### `talent-id-verify`
**Who:** Talent
**Purpose:** Upload government ID for HQ review. Never shared with clients or agencies.
**Related:** `trust-verification-queue`

### `talent-business-verify`
**Who:** Workspace owner / agency
**Purpose:** Confirm registered business details (legal name, tax ID, country). Unlocks Verified Business badge + payment routing.
**Related:** `trust-verification-queue`

### `talent-domain-verify`
**Who:** Talent (Portfolio tier)
**Purpose:** Verify ownership of a custom domain via DNS TXT record. Required to use a custom domain on `tulala.digital/t/<slug>`.
**Related:** `talent-tier-compare`, `domain` (workspace)

### `talent-payment-verify`
**Who:** Talent
**Purpose:** Connect bank or Stripe account so agencies can pay through Tulala. Funded-account status raises trust tier + contact priority.
**Related:** `trust-verification-queue`, `talent-tier-compare`

### `minor-account` (extended)
**Who:** Talent guardian / agency coordinator
**Purpose:** Manage parent/guardian co-pilot for under-18 talent. Sets working-hour window, max on-set hours per day, chaperone requirement, school-hour accommodation. Surfaces inline on every inquiry workspace via `<MinorProtectionBanner>` (non-dismissible).
**Related:** `inquiry-workspace`, `talent-trust-detail`

---

## Coverage check

This document covers every drawer with a registry entry as of generation. New drawers added to `_state.tsx` (`DrawerId` union) without a corresponding entry in `_help.tsx` will:
- Render the drawer normally
- Skip the ⓘ button (graceful no-op)
- Not appear here

To add help for a new drawer:
1. Add an entry to `DRAWER_HELP` in [`_help.tsx`](./_help.tsx) keyed by the new drawer id
2. Re-run the doc generator (or hand-update this file) so support pages and the chatbot pick it up
3. Verify the ⓘ button appears in the drawer's header
