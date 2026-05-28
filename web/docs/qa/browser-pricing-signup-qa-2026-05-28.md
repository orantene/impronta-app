# Browser QA Report — Pricing, Signup, Tenant, Stripe

Date: 2026-05-28
Branch: `codex/browser-pricing-signup-qa-20260528` (started from local `main`, which was behind `origin/main` by 2 commits)
Commit: `1af0ae234` (implementation, QA report, and evidence bundle)
Environment: local Next dev server, marketing proxy at `http://127.0.0.1:3101`, app host at `http://app.local:3102`, Supabase dev database, Stripe test mode account `acct_1RnWGdRrZLyWJgP5`
Tester: Codex browser QA agent

## Executive Summary

- Overall status: Partial pass with fixes landed for pricing/get-started/catalog/Stripe checkout paths.
- Production readiness: Improved, but not a full greenlight because sale/intro-offer QA, complete new-user workspace creation, post-payment paid checkout return paths, and deep inquiry/message smoke were not completed in this pass.
- Highest-risk issue: Workspace subscription checkout was using static env Stripe Price IDs instead of the active Product Pricing catalog rows. Admin price edits could display publicly but checkout could still charge the wrong Price ID.
- Bugs fixed: Dynamic get-started tier names, catalog-backed checkout Price IDs, promo code propagation to Stripe Checkout, MXN fallback display clarity, and Agency Stripe Product name drift.
- Bugs remaining: Invalid promo codes currently fail silently instead of showing a clear human error; sale/intro-offer behavior needs a dedicated pass.

## Tests Completed

| Area | URL | Role | Action | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| Phase 0 health | `http://127.0.0.1:3101/pricing` | Anonymous | Load marketing pricing | Marketing page loads on marketing host | 200 OK | Pass |
| Phase 0 host allow-list | `http://app.local:3102/platform/admin/pricing` | Anonymous | Load platform admin | Redirect to login | 307 to `/login?next=/platform/admin` | Pass |
| Phase 0 host allow-list | `http://localhost:3000/pricing` | Anonymous | Load marketing pricing on app/default host | Not exposed on app/default host | 404 | Pass |
| Platform admin pricing | `/platform/admin/pricing` | Super admin | Sign in with dev signin | Pricing dashboard opens | Opened as `qa admin` | Pass |
| Studio rename | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=studio` | Super admin / anonymous | Rename Studio to `Studio QA Browser Test` | Admin, pricing, get-started, Stripe Product all update | Initial gap found in get-started hero/ladder; fixed and retested | Pass after fix |
| Agency/Network rename | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=agency`, `/get-started?tier=network` | Super admin / anonymous | Rename and revert Agency and Network | Public CTAs, fineprint, card labels, and Stripe Products follow catalog names | Passed after dynamic copy path was fixed | Pass |
| Studio price edit | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=studio`, app checkout action | Super admin / signed-in workspace owner | Change `$49` to `$51`, create checkout, restore `$49` | New immutable Stripe Price created, old inactive, checkout uses new active price | Checkout used `price_1TcAEHRrZLyWJgP5LK6sPtTO` at 5100; restored to 4900 on `price_1TcAFvRrZLyWJgP5qoemV0ov` | Pass |
| Agency price edit | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=agency`, app checkout action | Super admin / signed-in workspace owner | Change `$149` to `$151`, create checkout, restore `$149` | New immutable Stripe Price created and checkout uses it | Checkout used `price_1TcAHLRrZLyWJgP5ZEufquLN` at 15100; restored to 14900 on `price_1TcAIpRrZLyWJgP5Q6WbXbA6` | Pass |
| Network price edit | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=network`, app checkout action | Super admin / signed-in workspace owner | Change `$499` to `$501`, create checkout, restore `$499` | New immutable Stripe Price created and checkout uses it | Checkout used `price_1TcAHaRrZLyWJgP5jvmJLEFS` at 50100; restored to 49900 on `price_1TcAJ3RrZLyWJgP5bI3H1O1S` | Pass |
| Promo code | `/platform/admin/pricing`, `/get-started?tier=studio&promo=QATEST10`, app checkout action | Super admin / anonymous / signed-in workspace owner | Create `QATEST10`, verify UI and Checkout, archive it | UI shows promo and Checkout receives discount | Checkout subtotal 4900, discount 490, total 4410; archived afterward | Pass |
| Invalid promo | `/get-started?tier=studio&promo=NOPE` | Anonymous | Load invalid promo URL | Clear invalid promo copy | Invalid code silently ignored | Fail |
| Currency fallback | `/pricing?currency=MXN`, `/get-started?tier=studio&currency=MXN` | Anonymous | Load MXN query | UI must not imply MXN checkout when only USD Stripe price exists | Pricing shows USD fallback context; get-started now says `$49 USD/mo` | Pass after fix |
| Impronta routing smoke | `/impronta`, `/impronta/admin/roster` | Anonymous / super admin | Load public and admin routes | Public resolves; admin requires auth and opens with auth | Public loaded 200; admin roster loaded with signed-in QA admin | Pass smoke |
| Full local gate | `npm run ci` | Local shell | Run repo CI ladder | Typecheck, tests, lint, build pass | Passed; migration drift subcheck skipped because its script did not load Supabase env | Pass with note |

## Bugs Found

### Bug 1 — Get-started still had hardcoded tier names after admin rename
- Severity: P1
- Surface: `/get-started`
- Steps to reproduce: Rename Studio to `Studio QA Browser Test`, save, reload `/get-started?tier=studio`.
- Expected: selected tier label, submit CTA, fineprint, hero eyebrow, checkout wording, and ladder references use the catalog name.
- Actual: CTA/fineprint had already been fixed, but hero eyebrow still said `Studio · $49/mo` and the ladder still said `Everything in Studio, plus:`.
- Root cause: `web/src/app/(marketing)/get-started/page.tsx` kept local static copy for headline/ladder text.
- Fix: Threaded catalog tier names and fallback-aware price text through get-started headline, form props, and plan ladder copy.
- Retest: `phase1-get-started-renamed-after-fix.png` shows `Studio QA Browser Test · $49/mo`, matching CTA/fineprint/ladder copy.
- Commit: pending final local commit.

### Bug 2 — Checkout could charge stale env Price IDs instead of active catalog prices
- Severity: P0
- Surface: Workspace subscription checkout for Studio, Agency, Network
- Steps to reproduce: Change a tier price in Platform Admin, then start the matching workspace checkout.
- Expected: Checkout uses the active `product_prices` row created by the pricing dashboard.
- Actual: Checkout resolver read static `STRIPE_PRICE_*` env vars, so displayed price and charged price could diverge.
- Root cause: `createWorkspaceCheckoutSession` called `getWorkspacePriceId` directly.
- Fix: Added `getActiveWorkspacePriceId` backed by `product_packages` / `product_tiers` / `product_prices`, with env vars as fallback only. Updated workspace checkout, workspace provisioning, and upgrade actions to use it.
- Retest: Studio, Agency, and Network temporary prices each produced a new Stripe Checkout Session using the active temporary Price ID, then restored cleanly.
- Commit: pending final local commit.

### Bug 3 — Promo code UI did not reliably reach Stripe Checkout
- Severity: P1
- Surface: `/get-started?promo=...` to workspace checkout
- Steps to reproduce: Create `QATEST10`, load `/get-started?tier=studio&promo=QATEST10`, continue to workspace checkout.
- Expected: UI shows promo and Checkout receives Stripe promotion code.
- Actual: Promo UI rendered after fix, but the code was not threaded into onboarding/provisioning/checkout.
- Root cause: `GetStartedForm` only received the promo label, not the canonical code, and onboarding did not pass promo into `provisionWorkspaceFromLead`.
- Fix: Passed `appliedDiscountCode` into the form, preserved it on workspace onboarding URLs, passed `promoCode` through provisioning, and applied validated Stripe Promotion Codes during session creation.
- Retest: `phase4-qatest10-checkout-session.json` shows promotion code `promo_1TcAMRRrZLyWJgP5TV6N45Cx`, subtotal 4900, discount 490, total 4410.
- Commit: pending final local commit.

### Bug 4 — MXN get-started fallback looked like exact local currency pricing
- Severity: P2
- Surface: `/get-started?tier=studio&currency=MXN`
- Steps to reproduce: Load get-started with `currency=MXN` while only USD workspace Stripe prices exist.
- Expected: UI clearly labels fallback USD pricing.
- Actual: Fineprint/headline showed bare `$49/mo`, which could be read as the selected currency.
- Root cause: get-started form received the raw formatted price without the `fellBackToUSD` context used by the pricing catalog.
- Fix: Added fallback-aware price text so get-started displays `$49 USD/mo` when currency resolution falls back.
- Retest: `phase6-get-started-studio-mxn-after-fix.png`.
- Commit: pending final local commit.

### Bug 5 — Agency DB/Stripe Product name drift
- Severity: P2
- Surface: Platform Admin pricing / Stripe sync
- Steps to reproduce: Compare final Product Pricing catalog to Stripe Products.
- Expected: Product names match catalog after rename/revert.
- Actual: Baseline Agency Stripe Product name was `Tulala Agency` while DB name was `Agency`.
- Root cause: Pre-existing Stripe sync drift.
- Fix: Browser rename/revert path resynced the Stripe Product name to `Agency`.
- Retest: `phase2-names-reverted-stripe-products.json` and `catalog-after.json` show DB and Stripe both `Agency`.
- Commit: no code fix required; data state corrected through admin UI.

### Bug 6 — Invalid promo code gives no user-facing error
- Severity: P2
- Surface: `/get-started?promo=BADCODE`
- Steps to reproduce: Load `/get-started?tier=studio&promo=NOPE`.
- Expected: Clear invalid/expired promo copy.
- Actual: Promo is ignored silently.
- Root cause: Existing page logic intentionally falls back silently when `validateDiscount` fails.
- Fix: Not fixed in this pass.
- Retest: `phase4-get-started-invalid-promo.png` captures the remaining behavior.
- Commit: not applicable.

## Data Mutations Performed

| Mutation | Purpose | Reverted? | Evidence |
|---|---|---|---|
| Studio name -> `Studio QA Browser Test` | Rename propagation and Stripe Product sync | Yes, back to `Studio` | `phase1-studio-renamed-admin-after-wait.png`, `phase1-studio-reverted-admin.png`, `catalog-after.json` |
| Agency name -> `Agency QA Browser Test` | Rename propagation and Stripe Product sync | Yes, back to `Agency` | `phase2-agency-renamed-admin.png`, `phase2-agency-reverted-admin.png`, `catalog-after.json` |
| Network name -> `Network QA Browser Test` | Rename propagation and Stripe Product sync | Yes, back to `Network` | `phase2-network-renamed-admin.png`, `phase2-network-reverted-admin.png`, `catalog-after.json` |
| Studio monthly `$49` -> `$51` | Immutable price creation and checkout proof | Yes, restored to `$49` | `phase3-studio-price-51-stripe-checkout.json`, `phase3-studio-price-restored-stripe.json`, `catalog-after.json` |
| Agency monthly `$149` -> `$151` | Immutable price creation and checkout proof | Yes, restored to `$149` | `phase3-agency-network-temp-checkout.json`, `phase3-agency-network-restored-stripe.json`, `catalog-after.json` |
| Network monthly `$499` -> `$501` | Immutable price creation and checkout proof | Yes, restored to `$499` | `phase3-agency-network-temp-checkout.json`, `phase3-agency-network-restored-stripe.json`, `catalog-after.json` |
| Discount `QATEST10` | Promo UI and Checkout discount proof | Yes, archived/inactive in DB and Stripe | `phase4-qatest10-checkout-session.json`, `phase4-discount-archived-db-stripe.json`, `catalog-after.json` |
| Stripe Checkout Sessions | Verify active Price IDs and promo discount math | No payment completed; sessions left incomplete | Session JSON evidence under `qa-evidence/browser-pricing-signup-20260528/` |

## Stripe Verification

| Tier | Product ID | Active Price | Test Action | Result |
|---|---|---|---|---|
| Studio | `prod_USqz7caN3C05as` | `price_1TcAFvRrZLyWJgP5qoemV0ov`, USD 4900 monthly | Rename/revert, `$51` temp price, checkout, restore | Product name `Studio`; checkout used temp price during test; final price restored |
| Agency | `prod_USqzOU4yezKAUy` | `price_1TcAIpRrZLyWJgP5Q6WbXbA6`, USD 14900 monthly | Rename/revert, `$151` temp price, checkout, restore | Product name `Agency`; final price restored |
| Network | `prod_UbB6sySzjqz45y` | `price_1TcAJ3RrZLyWJgP5bI3H1O1S`, USD 49900 monthly | Rename/revert, `$501` temp price, checkout, restore | Product name `Network`; self-serve checkout used active catalog price |
| Promo `QATEST10` | Coupon `Q2444i53` | Promotion code `promo_1TcAMRRrZLyWJgP5TV6N45Cx` | Create, apply to checkout, archive | Applied 10% discount in Checkout; final DB and Stripe promo state inactive |

## Supabase Verification

| Table | Query / Check | Result |
|---|---|---|
| `product_tiers` | Workspace package tiers, final names and Stripe product IDs | Free, Studio, Agency, Network restored; paid tier Stripe Product names match DB |
| `product_prices` | Active canonical USD monthly rows for Studio/Agency/Hub | Studio 4900, Agency 14900, Hub 49900 active; temporary rows no longer canonical |
| `product_discounts` | `code in ('QATEST10','QATEST3MONTHS','QAMXN')` | `QATEST10` exists but `is_active=false`; no active QA promo left |
| `agency_billing_customers` | Existing QA tenant/customer used for checkout session creation | Existing QA customer reused; no real payment completed |

## Browser Screenshots

- Before: `qa-evidence/browser-pricing-signup-20260528/phase0-admin-pricing-initial.png`
- Studio rename failure/fix: `phase1-pricing-renamed.png`, `phase1-get-started-renamed.png`, `phase1-get-started-renamed-after-fix.png`
- Agency/Network rename: `phase2-pricing-agency-network-renamed.png`, `phase2-get-started-agency-renamed.png`, `phase2-get-started-network-renamed.png`
- Price QA: `phase3-pricing-studio-51.png`, `phase3-get-started-studio-51.png`, `phase3-get-started-agency-151.png`, `phase3-get-started-network-501.png`, `phase3-pricing-restored.png`
- Promo QA: `phase4-get-started-qatest10-after-fix.png`, `phase4-get-started-qatest10-archived.png`, `phase4-get-started-invalid-promo.png`
- Currency QA: `phase6-pricing-mxn.png`, `phase6-get-started-studio-mxn-after-fix.png`
- Routing/Impronta smoke: `phase9-impronta-public.png`, `phase10-impronta-admin-roster.png`
- Final state snapshots: `catalog-before.json`, `catalog-after.json`

## Areas Not Finished

- Full sale / introductory offer browser QA was not completed.
- Complete free workspace signup with a brand-new account and 6th-talent seat-limit attempt was not completed.
- Complete paid signup after successful Stripe payment and return-path tenant creation was not completed.
- Deep Impronta inquiry/message/notification flow was not completed; only routing/admin roster smoke was completed.
- Invalid promo code clear-error UX remains unfixed.

## Final Acceptance

- [x] TypeScript passes: `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit`
- [x] Lint passes: `npm run lint`
- [x] Focused tenant isolation passes: `npm run test:tenant-isolation`
- [x] Focused billing passes: `npm run test:billing`
- [x] Full local CI passes: `npm run ci`
- [x] Browser QA passes for pricing, tier rename, price mutation, promo apply/archive, currency fallback, host routing smoke, and Impronta admin smoke
- [x] Stripe sync verified for Product names, active Price IDs, and archived promo code
- [x] DB state clean for tested pricing/discount mutations
- [x] QA names reverted: Studio, Agency, Network are restored
- [x] QA prices restored: Studio `$49`, Agency `$149`, Network `$499`
- [x] QA promo archived: `QATEST10` inactive in DB and Stripe
- [x] Dev server restarted and available through the marketing/app host proxies
- [ ] Browser QA fully passes for every requested phase
- [x] Implementation/evidence commit created: `1af0ae234`
