# Full dev execution plan: every pending improvement, built nonstop, then tested on localhost (2026-10-19)

Owner request (Oran): load DEV heavily and get ALL pending dev work built in waves, continuously, in large batches, with the consultant managing execution and the board. No deadlines: work flows until every wave is done. Then the whole result is tested responsibly on localhost, watching CPU and memory and restarting the server every 15 minutes so the computer never crashes. Pre-launch, test clients only, so build aggressively. Gates that protect data and money stay.

## 1. How it runs automatically
1. **Queue**: every pending improvement is a package in a wave below. A package = one outcome, a fixed file list, the ticket items it closes, its tests.
2. **Always full**: DEV runs many Sonnet build agents in parallel (up to 10 packages in flight; Opus for money, sign-in, data access and migrations). When a slot frees up DEV pulls the next package itself; the consultant keeps the queue topped up. DEV never waits for work.
3. **No collisions**: two packages in flight never share a file; files owned by open PRs wait until merged; es.json, en.json and lane lists are append-only and sorted.
4. **Large batches**: finished packages fold into one `integ/batch-N` branch: one full-ci run (never local tsc or build), one review, one merge by Build & Merge. Member PRs stay open with "landed via integ/batch-N".
5. **Review gate**: a Sonnet reviewer checks every diff against its ticket items; the consultant personally reviews money, sign-in, data access and migration changes, and records the verdict on the flow ticket before Build & Merge merges.
6. **Merging**: Build & Merge merges batches one at a time; main green before the next. Staging builds whenever Oran says go (via PM).
7. **Board**: the consultant keeps TUL-1267 (rollup) and TUL-1268 to TUL-1273 current (each numbered item gets its PR and moves per PM's board rules) and reports to PM every 30 minutes.
8. **Proof first**: every code-reading finding gets a failing test before the fix; every new label in Spanish and English.
9. **Stop the line**: main red means no merges until fixed; anything touching real data or money pauses and goes to PM; CI registry failures are fixed at the root (Wave I).

## 1b. Decided by PM (final, do not re-ask)
- Migrations renamed: #4023 415000 → 415400, #4025 415200 → 415500; applied only by the Production Migration Manager through the audited gate with a rollback note, after #4019, #4022 and #4024 merge. DEV makes no direct production applies; the 414600, 415100 and 415300 direct applies are a logged deviation.
- A /blog index plus a nav entry is in scope for TUL-1003 and TUL-1006 (package F7).
- Merges only by Build & Merge (routed through PM). Board: no PR = Building; open PR = In review; merged = Pass & Merged within the hour.
- Held: staging build or QA cut (Oran's manual GO), live Stripe switch (Oran, around Oct 20), #3212 / TUL-526 money PR, #4000 until before/after PDF proof.
- PM-login only: Stripe TEST keys and webhook endpoint for staging; Verify chat Remote Control reconnect.

## 1c. Live PR map (ordered by the consultant, ratified)
Wave 0: #4019 #4020 #4021 #4022 #4023 #4024 #4025 · Wave A: A1 #4027, A3 #4030, A6 #4028, A5 seed fix #4026; A2 and A4 owed · Wave I: I1 #4029.


**Staging build timing (Oran, 2026-10-19):** ONE staging build, only after ALL dev and waves are finished and everything passes the localhost QA (per-batch desktop + 390 checks, the one full theme pass, then the final full pass). No intermediate staging cuts.

## 2. The waves

### Wave 0: safety (PRs open, merge first)
#4023 profiles, #4025 talent private details, #4022 storage, #4024 database functions, #4020 checkout refuses private services, #4019 hidden tiers, #4021 data loss. Held migrations 415000 and 415200 renamed above 415300 and applied through the gate.

### Wave I: infrastructure that unblocks everything
- **I1** CI caches the local Supabase images (no more "toomanyrequests" reds); per-branch concurrency.
- **I2** CI check that fails when a new database function is executable by signed-in users; default privileges revoked for new functions (held migration).
- **I3** Regenerate database.types.ts from the migrations; list placeholder migrations for PM.

### Wave A: launch blockers and quick wins
- **A1** POS counter and QR menu never list event tickets or the reservation item (TUL-1271 #6).
- **A2** Guests and talents told about every cancellation and deposit booking (TUL-1268 #3).
- **A3** Card fee shown before Stripe; chat prices in the right currency (TUL-1268 #5, TUL-1272 #10). Display only.
- **A4** Accounts hardening: header spoofing, open redirect, staging sign-in lock that keeps localhost QA sign-in working on the isolated database, SVG sanitizer, portfolio path check, team role checks (TUL-1269 #5 app, #7 to #11).
- **A5** Stripe TEST seed plus Billing E2E; unblocks TUL-817, 829, 830, 831, 835.
- **A6** SEO quick wins: llms.txt services, no platform graph on talent pages, no repeated ratings, private links noindex, /book canonical (TUL-1273 #1, #3, #4, #6, #7).

### Wave B: services editor and catalog
- **B1** Talent editor: legacy English editor retired, real ready-to-publish check, plan notice for instant booking, lasting share link plus QR (TUL-1270 #10 to #13).
- **B2** Business catalog: photos everywhere, POS switch separate from status, deeper publish checks, unpriced drafts save, owner rows editable (TUL-1271 #1, #2, #3, #7, #8, #9).
- **B3** Catalog and QR depth: categories translatable and driving the counter, QR menu shows full items, kitchen stations wired, dead stubs removed (TUL-1271 #4, #5, #11).
- **B4** Renamed or removed service pages answer correctly; Reservar opens the right service (TUL-1273 #5, TUL-1272 #7).
- **B5** Fast services and catalog screens (TUL-1270 speed list, TUL-1271 #12).
- **B6** Talent editor completeness: existing extras editable and translatable, longer descriptions, photo reorder and alt text, Spanish validation messages, one price formatter (TUL-1270 deferred list).

### Wave C: service presentation engine
- **C1** Service content fields (slug and history, summary, SEO, OG image, presentation, page link, type, tags): held migration, code defaults first (TUL-1272 #1).
- **C2** Presentation resolver: own page, quick view, expand, book direct, with trade defaults and plan rules, behind a flag (TUL-1272 #2).
- **C3** Quick view popup and phone bottom sheet with photos, FAQ, reviews, policies; every card a real link (TUL-1272 #3, #9).
- **C4** Services widget on business sites with the "Al tocar" setting (TUL-1272 #4).
- **C5** Business service pages with clean addresses, sitemap and structured data (TUL-1272 #5).
- **C6** Service page design once per site in the builder with a protected booking panel; custom page per service; "Edit this page" on talent sites (TUL-1272 #6).
- **C7** Rich service pages and built-in designs in every language; Posts link to services (TUL-1272 #8).

### Wave D: one engine underneath (PM approves money items before merge)
- **D1** One "can this be sold" rule everywhere, enforced at checkout.
- **D2** One price calculation for checkout, display, POS, cart and offers (TUL-1268 M9).
- **D3** Who performs it: services linked to people and rooms, "anyone available", business services bookable by slot (TUL-1271 #13).
- **D4** Options that change duration.
- **D5** Stock held on every sales path; no double orders (TUL-1268 #4, M7).
- **D6** One editor for talents and businesses: simple and full mode, smart create flow, safe type change.

### Wave E: payments correctness (PM approves each; E1 jumps the queue if Verify confirms it)
- **E1** Hosted Checkout bookings marked paid (TUL-1268 M1).
- **E2** Duplicate charges refunded or flagged; settle race closed; amount mismatch alert and reconciler (TUL-1268 M2 to M4).
- **E3** Webhook refunds restore tickets, seats and promos (TUL-1268 M5).
- **E4** Refund permissions and limits on every path (TUL-1268 M6).
- **E5** Fractional quantity refused; payout over-reversal fixed; shared extras and travel fee priced (TUL-1268 M9, TUL-1270 M1, M2).
- **E6** Workspace membership and plan tier protected; offer and fee functions guarded (TUL-1269 #5 RLS, M1 to M3).

### Wave F: search, AI and growth
- **F1** Services searchable in the directory and AI search (held migration).
- **F2** Offering contract: one structured source per service feeding page, structured data, markdown, llms.txt, public API.
- **F3** Public catalog API and AI-agent access for businesses; consistent AI switch (TUL-1273 #2).
- **F4** Events on Google: sitemap, Event structured data, Spanish titles.
- **F5** Sitemap and URL hygiene, share images sized for WhatsApp, image srcset, speed budgets in CI (TUL-1273 #8 and deferred).
- **F6** AI and search traffic measurement.

### Wave G: communications, reviews, reporting, onboarding
- **G1** Booking emails carry the service facts; one calendar file attached; reminders for every booking; Spanish fixes.
- **G2** Reviews tied to the service; automatic review request after a completed booking; review page in Spanish (TUL-1272 #11).
- **G3** Sales by item and per-service reporting (TUL-1271 #14).
- **G4** Onboarding packs for more trades; arrival links to Servicios.
- **G5** Workspace promos with targeting, dates, limits and the business currency (PM approves).

### Wave H: remaining hardening
- **H1** Upload hardening: size checks before download, image pixel limits, type sniffing, location data stripped from photos, SSRF guard fix.
- **H2** Public reads tightened: sessions, offering eligibility, internal columns, directory by-ids, ticket lookup limit (TUL-1269 #12).
- **H3** Session and rate-limit hardening.

### Rolling: failed cards
After every staging build, any card still Failed becomes a package in the matching wave (never its own ticket).

## 3. Final localhost QA, after ALL waves are merged

**Per-batch dev QA (Oran, 2026-10-19):** after every merge batch, the consultant runs a desktop + 390 px localhost check of the changed flows on the lh slot (isolated fxlank) before anything goes to staging QA. Failures go back to DEV as fix items in the same wave. The full pass below still runs after all waves.
Run by the consultant (integrator), never by build agents. Sub-agents only prepare checklists and read logs.

**Machine safety (checked before every turn and every 5 minutes during it):**
- `uptime`: do not start if the 5-minute load is above 12; pause if it passes 12.
- `memory_pressure`: start only with 25% or more free; under 25% stop the server and wait; under 15% close stale browser tabs too.
- One server only: the shared slot. No `next dev`, `next build` or test swarms anywhere else.

**Server rotation (every 15 minutes):**
- `~/tulala-localhost/lh reserve "Consultant QA" main` (run in the background); READY at http://localhost:3001 (app) and http://localhost:3002 (marketing).
- Before the first request, confirm the build uses the isolated database: `grep -o 'pluhda\|fxlank' ~/tulala-localhost/wt/web/.env.local` must say fxlank, and the GRANT line must show db=fxlank. Never sign in or write if it says pluhda.
- Each turn is 15 minutes. Then `lh release "Consultant QA"`, check load and memory, and reserve again (same commit reuses the build, so the server simply restarts fresh).

**What gets tested (personas from ~/tulala-localhost/TESTING.md, signed in through the isolated-only passwordless link; never TAL-93938 or TUL-52):**
1. Guest: browse a talent site, open a service as a page and as a quick view, book (instant, request, deposit) with a Stripe TEST card, cancel through the manage link, get the messages.
2. Talent: create a service fast, set every rule, add options, extras and photos, share the lasting link, check plan notices, see the public page update.
3. Business owner: catalog with photos and translations, POS counter and QR menu (no tickets or reservation items), publish checks, Services widget on the business site, business service pages.
4. Accounts and safety: an owner cannot reach another business's people, files or admin role; logged-out visitors cannot read private talent details.
5. Search and AI: llms.txt, structured data, sitemap, renamed service redirects.
6. Phone (390 px) and desktop, Spanish and English, for each of the above.

Results go on the flow tickets as TESTED (localhost, isolated database, persona, viewport, date). Anything failing becomes a package and goes back into the queue.

## 4. Not in the dev queue (owner or other owner)
- Themes and demos: paused by Oran.
- Idan Offer DMC and Namaste Tacos client builds: waiting on Oran's scope and the clients' materials.
- Passes, memberships, gift cards: Oran decides scope first.
- Mexico Stripe webhooks (TUL-186): needs the production build.
- Analytics row clean-up (TUL-751): production data change for the migration manager.
- Live Stripe switch: Oran.

## 5. What every package PR must contain
Items covered (ticket and number), failing test then fix, evidence label, money classification (display or calculation), Spanish and English strings, rollback line, file list.
