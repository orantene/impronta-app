# Talent Services (Catalog & Pricing) — Next-Waves Execution Plan

**Written:** 2026-07-08, at the conclusion of the build session that shipped PR #726 (merged to `main` @ `02965070d`, deployed, smoke-green, prod click-verified).
**Purpose:** a self-contained, multi-agent-ready plan for everything that remains. Each lane is independently executable; lanes A–C are small and can run in parallel; D is the big chapter; E–F are operational.
**Read first:** auto-memory `project_rate_pricing_services_audit_2026.md` (the full program history) · `web/docs/talent-services-qa-report-2026-07-08.md` · `web/docs/talent-services-chat-funnel-2026-07-08.md` · `web/docs/talent-storefront-build-plan-2026-07-08.md`.

## Ground rules (every agent, every lane)

1. **Never touch the main checkout's branch** (`git worktree list` first). Work in a fresh worktree off latest `origin/main`. The old worktree `/Users/oranpersonal/Desktop/impronta-services` has the merged branch + a REAL `node_modules` (npm ci'd) — reuse it by branching from updated main, or make a new worktree (then `npm ci`, copy `web/.env.local` + `web/.env.vercel.local`).
2. **Dev server:** `PORT=33xx npm run dev:webpack` (Turbopack breaks in worktrees). Public-page QA via host proxy: `node web/scripts/services-host-proxy.mjs` (3310→3300, Host: improntamodels.com) or `curl -H "Host: improntamodels.com"`.
3. **⚠️ KNOWN ENV DEFECT:** the worktree dev server **never commits React hydration in local browsers** (listeners arm, zero fibers, no errors; `npm ci` didn't fix). Local browser QA = SSR-only. **Interactive click-through must run on production** (improntamodels.com) after deploy — and there, test with **REAL mouse clicks**, never `__reactFiber` probes (they false-negative on prod too).
4. **Migrations:** one `date -u +%Y%m%d%H%M%S` timestamp per agent; `db:push` is drift-blocked → apply via Supabase MCP `execute_sql` + manual `supabase_migrations.schema_migrations` row + write the file in `supabase/migrations/`. Dev DB **is** prod DB (pre-launch).
5. **Gates before commit:** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint` + relevant `test:*` + re-run `web/scripts/qa-offerings-e2e.mts` (22 assertions; needs `set -a; source .env.local; source .env.vercel.local`; creates QA bookings — see Lane A).
6. **Money invariant:** every charge derives from `resolveBookingCommissions`' snapshot (`gross_charged`), never `talent_offerings.amount_cents`. Quote/custom offerings must remain uncharge-able (`offeringIsDirectlyBookable` guard).
7. **Ship:** branch → PR to `main` → squash-merge → Vercel auto-deploys → `cd web && npm run deploy:smoke` → prod click-through w/ screenshots.
8. QA identities: `qa-client-1@impronta.test / Impronta-QA-Client-2026!` (client), `more@impronta.test / Impronta-QA-More-2026!` (talent More TAL-00045, has payout account + 5 offerings + photos), makeup artist TAL-AUDIT-0512 (`eb97dc64-…`, deposit 30% + cash + quote + product w/ stock 8), DJ TAL-00039 (`e2df1bd4-…`, instant + free reserve). Impronta tenant `00000000-0000-0000-0000-000000000001`.

## Lane A — QA-data sweep (小, run FIRST or LAST, never mid-lane)

The E2E runs left ~12+ QA bookings/inquiries visible in the live admin (dashboard shows "$272 +€170 pending · 4 confirmed" from QA Client One). Before real users:
- Identify: `inquiries` where `contact_email='qa-client-1@impronta.test'` OR source_context->offering->>offering_id LIKE '0f0e%' — collect ids.
- Delete in dependency order: `booking_payouts`/ledger rows → `booking_transactions` → `booking_commission_snapshot` → `booking_talent` → `agency_bookings` → `inquiry_offer_line_items` → `inquiry_offers` → `inquiry_messages`/`inquiry_events`/`inquiry_participants`/`inquiry_approvals` → `inquiries`. (Verify each table's FK first; some may cascade.)
- KEEP the 14 seeded `talent_offerings` (they're the demo storefronts) unless the owner says otherwise.
- Verify: admin dashboard money header back to pre-QA numbers; `deploy:smoke` unaffected.
- **Acceptance:** zero rows referencing qa-client-1 bookings; screenshot of clean admin Overview.

## Lane B — free-reserve expiry cron + stock-release wiring (S)

1. `/api/cron/expire-free-reserves/route.ts` (mirror `/api/cron/reconcile-field-mirror` auth: CRON_SECRET header, 401 otherwise — deploy:smoke asserts cron auth).
2. Logic: find `agency_bookings` with `payment_status='unpaid'`, whose inquiry `source_context->offering->>reserve was 'free'` (or via linked offering's `reserve_mode='free'`), older than the offering's `free_reserve_expires_days` (skip null) → set booking `cancelled` + inquiry `closed_lost` (reuse existing cancel helpers if exported; else engine-consistent updates + `inquiry_events` row) + **call `release_offering_stock`** when the offering is a product.
3. **Also wire `release_offering_stock` into the existing manual cancel path(s)** (`cancelTransaction`/booking-cancel actions) for product bookings — currently stock only releases on engine failure compensation, not on human cancellation. Grep `cancelTransaction` call sites.
4. Add the schedule to `vercel.json` crons (match existing entries' cadence style; daily is fine).
5. **Acceptance:** unit-ish test or scripted run against a synthetic stale free reserve (create → age via SQL `created_at` backdate → run endpoint with secret → booking cancelled + stock released + event emitted).

## Lane C — hygiene batch (S, three independent tasks)

1. **Public category filter:** when visible offerings span 2+ distinct `category` values, render filter pills (client island; copy the `ServiceMenuFilter` pattern — island receives items, filters client-side; server renders full list for SEO). File: `_shared/TalentStorefront.tsx` + new `_shared/StorefrontCategoryFilter.tsx`. Seed a second category on a QA talent to verify SSR + (prod) interaction.
2. **`database.types.ts` regen:** canonical `supabase gen types` (see memory `#420` precedent — preserve the file header). Then remove the `as unknown as SupabaseClient` casts in `offerings-*.ts`/engine where the table becomes typed. Gate: `check:types-fresh` in CI must pass.
3. **ES pass on editor copy:** `TalentOfferingsManager` strings are EN-only (platform dashboard is EN-first, so this is optional polish; the PUBLIC surfaces are already bilingual). If done: pickLocale pairs for the ~20 labels. Low priority.

## Lane D — product fulfillment chapter (L — the next real feature wave)

Per the build plan §9/§12 and chat-funnel doc §7. Sub-lanes:
1. **Schema:** `agency_bookings.booking_sub_type` (`service|product|package`, default service) + `booking_fulfillment` sidecar (booking_id unique, fulfillment_type, status pending|preparing|ready_for_pickup|shipped|delivered|picked_up|downloaded|returned, ship_to_json, carrier, tracking_number, shipped_at/delivered_at, digital_asset_id→media_assets, lead_time_days, notes, tenant_id). Engine stamps sub_type='product' for product offerings at convert.
2. **Talent Orders queue:** one surface (extend the talent Messages/Today page or a Bookings list) with ONE action per booking: "Mark completed" (service) / "Mark shipped" + tracking input (product) → writes booking_fulfillment + flips booking `completed`.
3. **Payout gating:** for `booking_sub_type='product'`, `executeBookingTransfers` waits for `booking_fulfillment.shipped_at` (grep transfers.ts for the trigger point; add the gate + a test).
4. **Variants & add-ons UI:** promote from `attributes` to real tables per plan §9 (`talent_offering_variants` w/ label/sku/amount_cents/duration/inventory/media, `talent_offering_addons`, `talent_offering_bundle_items`); editor controls collapsed behind "Add details"; public variant selector; offer-line expansion carries add-ons (fix the composer flattening). THIS IS THE BIGGEST SUB-LANE — its own PR.
5. **Qty stepper** for per-person/per-unit offerings on the public card + `units` flowing to the engine line (`OfferingRequestDetail.quantity` → engine input → line units).
- **Acceptance per sub-lane:** E2E extension proving each (product booking gets sub_type+fulfillment row; payout blocked until shipped; variant purchase prices correctly; qty multiplies subtotal and snapshot).

## Lane E — talent activation (marketing/ops motion, minimal code)

1. Empty-state profession chips already ship; ADD an onboarding nudge: dashboard Today-page card "Add your first service" when a talent has zero offerings (link to /talent/services).
2. Seed/assist real talents: for each active talent, staff can prefill via the composer defaults; optionally bulk-create "Custom quote" offerings — DON'T (no fake data); instead a one-click "Start with a template" per talent in the admin drawer.
3. Announcement copy + how-to (ES-first for Impronta talent base) — deliverable: a short doc `web/docs/talent-services-launch-copy.md` with the "put your menu on your page" pitch + screenshots.
4. schema.org enrichment: add `priceValidUntil`/`itemOffered` typing if SEO agent recommends; verify Rich Results test on prod URL.

## Lane F — dev-env hydration defect (investigation, separate session)

Symptom (fully documented in memory): worktree dev server pages never commit hydration in local Chrome — `_reactListening` arms, zero `__reactFiber$` on any node, no errors, no overlay issues, readyState complete; affects ALL components (incl. pre-existing InquiryDrawer), all tenants, direct connection or proxy; real `node_modules` didn't fix. Prod works.
Plan: (1) minimal repro: `next build && next start` in the worktree — if hydration works, it's dev-mode-only (streaming/HMR); (2) test the MAIN checkout's dev server in the same Chrome (is it repo-wide or worktree-only?); (3) bisect page tree: a bare route (`/login`) vs the profile page; (4) suspect list: client instrumentation hook ("Slow execution" logs), a Suspense boundary that never resolves in dev, React DevTools/extension interference (test in a clean Chrome profile), Next 16 dev-overlay websocket; (5) file upstream issue or pin the config fix. **Deliverable:** root cause + fix or documented workaround (currently: interactive QA on prod only).

## Lane G — catch-all improvements backlog (pick opportunistically)

- Stock release on refund (`markRefunded` path) for product bookings.
- Notification email for offering-carrying inquiries ("New service request: {title}") — needs RESEND key present in prod (it is).
- Cancellation-window ENFORCEMENT (currently display-only): block client self-cancel inside the window / surface policy in refund decisions.
- Playwright e2e for the storefront (SSR + prod-URL interactive smoke) added to the e2e suite (NOT CI — no Supabase in CI).
- Moderation queue UI for `moderation_state` (admin) — silent-by-default stays.
- Analytics: per-talent revenue view extending the quoted/booked stats (join snapshots by source_service_id).
- InquiryDrawer deep QA: verify the W3-4 carry renders/persists through the drawer's submit (needs prod interactive QA).
- Mobile pass on the storefront section (SSR screenshots at 375px + prod touch QA).

## Suggested multi-agent execution order

Wave A (parallel, one PR each or combined): **A** (sweep) + **B** (cron+release) + **C1/C2** (category filter + types regen).
Wave B: **D1–D3** (fulfillment core) one PR; then **D4** (variants) its own PR; **D5** (qty) small PR.
Wave C: **E** (activation) + **G** picks.
**F** whenever a session can afford the investigation.
Every PR: gates + E2E + deploy:smoke + prod screenshots (per ground rule 3).
