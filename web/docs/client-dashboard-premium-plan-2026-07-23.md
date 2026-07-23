# Client Dashboard — Premium Program (audit + execution plan, 2026-07-23)

Binding plan for bringing `/[tenantSlug]/client/*` to the same quality bar as the
talent dashboard (W1–W14 program) and the workspace admin. Audited live as
`qa-client-1@impronta.test` on a fresh build plus two deep code audits
(surface + data plumbing).

## Honest score today: 6/10

The client dashboard's data spine is REAL and healthy — better starting point
than the talent dashboard had. What keeps it from premium: dated chrome (top
tab strip), invisible monetization, anonymous booking rows, dead-end payment
states, and an unprioritized Today.

## Architecture facts (do not re-litigate)

1. **The real client dashboard is the App Router tree** at
   `src/app/(workspace)/[tenantSlug]/client/*` — server components with real
   loaders, real server actions (offer approve/decline, reviews, trust Stripe
   rails), real i18n. THIS is the surface to improve.
2. **`internal/client.tsx` (`ClientSurface`, 3,541 lines) is a dead mock
   prototype** — reachable only via the admin-shell dev surface switcher, 100%
   fixtures, 0 i18n, 20+ dead CTAs. DO NOT invest here. Retirement is a
   separate cleanup decision, out of this program's scope.
3. Per-page loaders are all wired (`loadClientInquiries`, `loadClientBookings`,
   `loadClientFavoritesForUser`, `loadClientShortlistsForUser`,
   `loadClientPitches`, `loadClientUpcoming`, review loaders). The layout
   under-fetches: no trust/subscription/money summary reaches the shell.
4. **Monetization is fully built and almost fully hidden**:
   - `client_subscriptions` (standard/pro/enterprise, Stripe checkout route,
     `/client/subscription` page with a polished 3-tier card) — NOT in the nav;
     only reachable via shortlist-limit paywalls.
   - Trust ladder (`client_trust_state`: basic/verified/silver/gold; $5
     verification + $100/$250/$500 top-ups → funded balance) — buried at the
     bottom of Settings.
5. **No client payment history**: `booking_transactions` carries
   `payer_user_id` + refund lineage but has no client-scoped loader. Clients
   get per-booking PDF receipts only.
6. Cross-tenant client hub does not exist (favorites + subscription are the
   global seams). Out of scope for this program.

## Live QA findings (real account, fresh build)

- **Today**: real counts (3 active / 1 needs reply / 8 confirmed / 27 total),
  BUT: an ARCHIVED inquiry appears under "Needs your decision"; the "Agency is
  coordinating" list is an 18-row unprioritized wall; many rows are titled
  just "Booking inquiry" with no talent/venue context; duplicate New-inquiry
  CTAs (topbar + floating pill); zero talent faces; no money summary; no
  plan/trust presence.
- **Bookings**: real amounts + PAID/PAYMENT DUE chips + receipt downloads, BUT
  rows are anonymous ("Confirmed booking", no talent name/photo), dates render
  as "TBC" squares, and **PAYMENT DUE rows offer no action at all** — the
  single worst dead-end for a paying client.
- **Favorites**: real (8 saved, select-to-inquire modal). Good.
- **Reviews**: real, honest empty states. Good.
- **Settings**: strong — profile/account edits, notification matrix with
  auto-save, trust verification + social connections. All real.
- **Subscription**: polished 3-tier pricing page — orphaned from nav.
- **Chrome**: old top tab strip; not the workspace/talent sidebar design
  language shipped in talent W11.
- Dev-only: `/client/settings` and `/client/subscription` cold-compile in
  8–11 min (module-graph bloat; not user-facing, worth a later look).

## Standing rules (inherited from the talent program)

- Ship straight to prod via short-lived branches off `main`; one migration per
  agent; full tsc + lint gate; structural gate green → squash-merge; goldens
  red = known flake; deploy:smoke after.
- No em dashes in user-facing copy. "Cliente" never "comprador". Bilingual
  (en + es) for every new string via the catalog (`useT`/server translator).
- No new inline-style ratchet debt in frozen files; className-only where the
  file is frozen.
- Real data or honest empty state — never fixture leaks, never dead CTAs.
- QA each wave on localhost with `qa-client-1@impronta.test` before merge.

## Execution waves

### CW1 — Sidebar chrome (design language parity)  [ship first]
Replace the client top tab strip with the workspace-style left sidebar,
reusing the talent W11 patterns (`data-tulala-workspace-grid`,
`data-tulala-app-sidebar`, same mobile collapse CSS). Grouped nav:
- (top) Today
- WORK: Messages, Inquiries, Bookings
- FIND: Discover, Favorites, Shortlists, Pitches
- ACCOUNT: Reviews, Settings
Rail footer: **plan badge** (Standard/Pro/Enterprise → links to
/client/subscription) + **trust badge** (Basic/Verified/Silver/Gold → links to
Settings→Trust). This alone surfaces both monetization axes persistently.
Keep the mobile bottom nav. Note: this tree is server-rendered — the sidebar
is a server component + tiny client active-state; do NOT import the admin
shell's client-only state barrel.

### CW2 — Today, prioritized and premium
- Fix the "Needs your decision" filter (no archived rows).
- Rows get talent faces (loadWorkspaceRosterLite thumbs) and real titles
  (derive from talent/venue when the inquiry has no title — kill the bare
  "Booking inquiry" wall).
- Collapse "Agency is coordinating" to the 5 most recent + "View all" into
  Inquiries.
- Money strip: payment-due total (from bookings) + next confirmed date.
- One New-inquiry CTA (topbar); remove the floating duplicate pill.
- Plan/trust upsell card when tier = standard AND trust = basic (honest copy,
  links to subscription/trust — no fake pricing claims).

### CW3 — Bookings, from list to management surface
- Talent name + photo on every row; venue and city where present.
- Real dates (the data has them — TBC only when genuinely unset).
- PAYMENT DUE gets an action: "Review & pay" → deep-link into the messages
  offer/payment context for that inquiry (the real payment rail lives there);
  never a dead chip.
- Keep receipts; add "All receipts" affordance (see CW5).

### CW4 — Monetization surfaces
- `/client/subscription` added to nav (ACCOUNT group) + plan badge (CW1).
- Trust progress module at top of Settings (level, what unlocks next, verify
  CTA) — reuse `loadClientTrustBillingState`.
- Shortlist paywall copy aligned with the subscription page.

### CW5 — Billing history (new loader, no schema change)
- `loadClientTransactions(userId)` over `booking_transactions`
  (`.eq("payer_user_id", …)`, refund lineage included).
- "Billing" section (Settings or Bookings tab): rows + receipt links +
  refunds. Gross-only, same as receipts.

### CW6 — Riders
- Notifications: bell panel already real; ensure mark-read works from client
  surface.
- i18n sweep of any new strings (en + es).
- Empty states for Pitches/Shortlists reviewed for honesty.

## Out of scope (explicit)
- Cross-tenant client hub (aggregate across agencies).
- Stripe pay-in-full checkout for bookings (money-spine decision needed).
- Retiring `internal/client.tsx` prototype (separate cleanup PR).
- Client-side of the messages shell redesign (Jon-360 owns it).
