# Browser QA Report — Pricing, Signup, Tenant, Stripe

Date: 2026-05-28
Branch: `codex/browser-pricing-signup-qa-20260528`
Commit: `1af0ae2340acb47125b64ecbece48876558da99b`, `2ec6265228cd587f1ef51dd63bd74fb2ba00c1e2`, `928bbea80229850ced9375bd0b6d1ad954c77dfc`
Environment: local Next dev server, marketing proxy `http://127.0.0.1:3101`, app proxy `http://127.0.0.1:3102`, Supabase dev database, Stripe test account `acct_1RnWGdRrZLyWJgP5`
Tester: Codex browser QA agent

## Executive Summary

- Overall status: Conditional pass for pricing/catalog/signup pre-payment flows, discount behavior, free-workspace creation, Free seat limits, tenant routing smoke, and Impronta inquiry/message smoke.
- Production readiness: Not a full end-to-end greenlight until a real Stripe paid-session completion/webhook return path is verified. Pricing display, catalog sync, active Stripe Price selection, promo application, cleanup, and gates are green locally.
- Highest-risk issue: Paid workspaces correctly reach Stripe Checkout with the active catalog Price ID, but this pass did not complete a paid Stripe session to verify webhook-driven plan upgrade/seat-limit mutation.
- Bugs fixed: catalog-driven get-started names, active catalog Stripe Price lookup, promo propagation to Checkout, invalid promo error copy, MXN fallback clarity, Free plan 5-seat copy drift, Rostra/Tulala upgrade-modal copy drift, and stale workspace Free feature value text.
- Bugs remaining: site-control-center plan modal still has a local static plan table for prices/features; email delivery was not tested because local `RESEND_API_KEY` is absent; in-app browser became blocked by a stale Chrome error document during late retests.

## Tests Completed

| Area | URL | Role | Action | Expected | Actual | Status |
|---|---|---|---|---|---|---|
| Phase 0 health | `http://127.0.0.1:3101/pricing` | Anonymous | Load pricing | Marketing host serves pricing | 200 | Pass |
| Phase 0 health | `http://127.0.0.1:3101/get-started?tier=free` | Anonymous | Load signup | Marketing signup loads | 200 | Pass |
| Phase 0 routing | `http://localhost:3000/pricing` | Anonymous | Load marketing on app/default host | Host allow-list blocks | 404 | Pass |
| Admin login | `/platform/admin/pricing` | Super admin | Dev sign-in and open dashboard | Pricing dashboard opens | Opened and used for mutations | Pass |
| Tier rename | `/platform/admin/pricing`, `/pricing`, `/get-started?tier=studio` | Super admin / anonymous | Rename Studio, verify, revert | Public + Stripe Product follow catalog | Fixed and retested | Pass |
| Product display | `/get-started?tier=agency`, `/get-started?tier=network` | Anonymous | Rename/revert Agency/Network | Labels, CTA/fineprint, ladder follow catalog | Fixed and retested | Pass |
| Price changes | admin, `/pricing`, `/get-started`, Checkout | Super admin / owner | Temp price edits for Studio/Agency/Network | New immutable Stripe Prices, checkout uses active price, restore originals | All restored | Pass |
| Promo percent | `/get-started?tier=studio&promo=QATEST10` | Anonymous / owner | Create, apply, Checkout, archive | UI + Stripe agree | 10% discount applied; archived | Pass |
| Invalid promo | `/get-started?tier=studio&promo=NOPE` | Anonymous | Load bad code | Clear human error | Alert renders; promo chip absent | Pass after fix |
| Intro offer | `/get-started?tier=studio&promo=QATEST3MONTHS` | Super admin / owner | Create 3-month free intro, Checkout, archive | UI + Stripe agree; disabling removes public promo | Checkout total 0; archived; public stale link errors | Pass |
| Currency | `/pricing?currency=MXN`, `/get-started?tier=studio&currency=MXN` | Anonymous | Load MXN query | No misleading MXN checkout if USD fallback | Get-started says `$49 USD/mo` | Pass |
| Free signup | `/get-started?tier=free`, `/onboarding/workspace` | New owner | Create Free workspace | Free plan, 5-seat limit, owner lands in admin | Workspace created as Free with limit 5 | Pass |
| Free seat cap | `/qa-free-03545833/admin/roster/new` | Owner | Fill 5 seats, attempt 6th path | UI + backend block over cap | Create form hidden; server check denies 6th | Pass |
| Paid signup | `/get-started?tier=studio|agency|network` | New owners | Create leads/workspaces and start checkout | Checkout uses active tier price | Studio/Agency/Network sessions created with active prices | Pass pre-payment |
| Tenant routing | marketing/app/path tenant URLs | Anonymous / admin | Smoke host allow-list and tenant routes | Correct surface gating | Marketing/app/tenant smoke passed | Pass smoke |
| Impronta | `/impronta`, `/impronta/admin/messages/[id]` | Client-like guest / admin | Submit inquiry, add participant, send message, open admin route | Inquiry/message visible, no crash | Inquiry and message persisted; admin route 200 | Pass smoke |
| Cleanup | Supabase + Stripe | QA admin | Revert names/prices, archive promos, suspend QA workspaces | No production-like QA data left active | Clean evidence captured | Pass |

## Bugs Found

### Bug 1 — Get-started retained hardcoded tier names after admin rename
- Severity: P1
- Surface: `/get-started`
- Steps to reproduce: Rename Studio to `Studio QA Browser Test`, save, reload `/get-started?tier=studio`.
- Expected: selected tier label, submit CTA, fineprint, checkout wording, and ladder copy use catalog names.
- Actual: Some copy still said Studio.
- Root cause: local static copy in `get-started` page/form.
- Fix: Threaded catalog names through headline, CTA, fineprint, success panels, recommendation hints, and ladder copy.
- Retest: `phase1-get-started-renamed-after-fix.png`; static scan confirms remaining literals are fallback labels/comments.
- Commit: `1af0ae234`, `928bbea80`

### Bug 2 — Checkout could charge stale env Price IDs
- Severity: P0
- Surface: Workspace subscription Checkout
- Steps to reproduce: Change admin price, then start Checkout.
- Expected: Checkout uses active `product_prices` row.
- Actual: Resolver used static env Price IDs.
- Root cause: workspace billing called env resolver directly.
- Fix: Added active catalog Price lookup with env fallback only when no catalog price exists.
- Retest: Studio/Agency/Network temp prices each produced Checkout sessions using active temp Stripe Price IDs, then restored.
- Commit: `1af0ae234`

### Bug 3 — Promo code did not reliably reach Stripe Checkout
- Severity: P1
- Surface: `/get-started?promo=...` through onboarding/Checkout
- Steps to reproduce: Create `QATEST10`, start Studio checkout.
- Expected: UI displays promo; Checkout receives promotion code.
- Actual: Promo label rendered, but canonical code was not preserved through provisioning.
- Root cause: form/onboarding/provisioning did not pass `promoCode`.
- Fix: Preserved `appliedDiscountCode` through signup/onboarding and applied validated Stripe promotion code in Checkout.
- Retest: `phase4-qatest10-checkout-session.json` shows subtotal 4900, discount 490, total 4410.
- Commit: `1af0ae234`

### Bug 4 — Invalid promo links failed silently
- Severity: P2
- Surface: `/get-started?promo=BADCODE`
- Steps to reproduce: Load `/get-started?tier=studio&promo=NOPE`.
- Expected: Clear invalid/expired promo message.
- Actual: Promo was ignored silently.
- Root cause: invalid `validateDiscount` results were intentionally discarded.
- Fix: Rendered a `role="alert"` message with the invalid reason.
- Retest: `phase4-invalid-promo-after-fix.png`, `phase4-invalid-promo-after-final-html-check.json`.
- Commit: `2ec626522`

### Bug 5 — Free plan copy drifted from the actual 5-seat limit
- Severity: P1
- Surface: `/get-started`, `/help/operators`, site-control-center upgrade modal, product feature catalog.
- Steps to reproduce: Compare public/admin copy to `agencies.talent_seat_limit=5`.
- Expected: Free copy says 5 profiles/talents.
- Actual: Some copy and DB feature value said 10.
- Root cause: old copy/data from before `free_plan_seat_limit_five`.
- Fix: Updated public/admin copy to 5 and changed workspace Free `People profiles` value from `Up to 10` to `Up to 5`.
- Retest: `phase12-free-seat-copy-db-catalog-fix.json`, `phase12-free-seat-copy-regression-check.json`.
- Commit: `928bbea80`

### Bug 6 — Rostra copy remained in active upgrade surfaces
- Severity: P2
- Surface: site-control-center upgrade/domain UI
- Steps to reproduce: Open site control center upgrade/domain copy.
- Expected: Tulala branding and `tulala.digital`.
- Actual: `Rostra`, `rostra.app`, and `nova.rostra.app`.
- Root cause: old prototype copy.
- Fix: Replaced user-facing strings with `PLATFORM_BRAND`.
- Retest: static scan in `phase12-free-seat-copy-regression-check.json`.
- Commit: `928bbea80`

## Data Mutations Performed

| Mutation | Purpose | Reverted? | Evidence |
|---|---|---|---|
| Studio/Agency/Network names renamed to QA labels | Rename propagation and Stripe Product sync | Yes | `phase1-*`, `phase2-*`, `phase2-names-reverted-stripe-products.json` |
| Studio `$49 -> $51 -> $49` | Immutable price creation and restore | Yes | `phase3-studio-price-51-stripe-checkout.json`, `phase3-studio-price-restored-stripe.json` |
| Agency `$149 -> $151 -> $149` | Immutable price creation and restore | Yes | `phase3-agency-network-temp-checkout.json`, `phase3-agency-network-restored-stripe.json` |
| Network `$499 -> $501 -> $499` | Immutable price creation and restore | Yes | `phase3-agency-network-temp-checkout.json`, `phase3-agency-network-restored-stripe.json` |
| `QATEST10` | Percent promo UI/Checkout proof | Archived/inactive | `phase4-discount-archived-db-stripe.json` |
| `QATEST3MONTHS` | Intro offer / free months proof | Archived/inactive | `phase5-intro-promo-archived-db-stripe.json` |
| `qa-free-03545833` workspace + 5 QA roster profiles | Free signup and seat-limit proof | Suspended/test-marked | `cleanup-final-state.json` |
| `qa-studio-244988`, `qa-agency-244988`, `qa-network-244988` | Paid pre-payment checkout proof | Suspended/test-marked | `cleanup-final-state.json` |
| Impronta QA inquiry/message | Inquiry/message smoke | Archived | `phase10-11-impronta-inquiry-message-smoke.json`, `cleanup-final-state.json` |
| Workspace Free `People profiles` feature `Up to 10 -> Up to 5` | Correct final catalog state | Intentionally final | `phase12-free-seat-copy-db-catalog-fix.json` |

## Stripe Verification

| Tier | Product ID | Active Price | Test Action | Result |
|---|---|---|---|---|
| Studio | `prod_USqz7caN3C05as` | `price_1TcAFvRrZLyWJgP5qoemV0ov`, USD 4900 monthly | Rename/revert, temp price, checkout, restore | Product name `Studio`; active price restored |
| Agency | `prod_USqzOU4yezKAUy` | `price_1TcAIpRrZLyWJgP5Q6WbXbA6`, USD 14900 monthly | Rename/revert, temp price, checkout, restore | Product name `Agency`; active price restored |
| Network | `prod_UbB6sySzjqz45y` | `price_1TcAJ3RrZLyWJgP5bI3H1O1S`, USD 49900 monthly | Rename/revert, temp price, checkout, restore | Product name `Network`; active price restored |
| `QATEST10` | Coupon `Q2444i53` | Promotion code `promo_1TcAMRRrZLyWJgP5TV6N45Cx` | 10% off Checkout | Applied, then inactive |
| `QATEST3MONTHS` | Coupon `DgOQc1f6` | Promotion code `promo_1TcBGyRrZLyWJgP5DXY22ZQg` | First 3 months free Checkout | Total 0, then inactive |

## Supabase Verification

| Table | Query / Check | Result |
|---|---|---|
| `product_tiers` | Workspace tier names and Stripe Product IDs | Free, Studio, Agency, Network restored |
| `product_prices` | Active USD monthly rows | Studio 4900, Agency 14900, Network 49900 active |
| `product_discounts` | `QATEST10`, `QATEST3MONTHS`, `QAMXN` | QATEST10/QATEST3MONTHS inactive; QAMXN not created |
| `agencies` | QA workspace cleanup | Four QA workspaces suspended/test-marked |
| `agency_talent_roster` | Free seat cap setup | 5 QA profiles active for Free cap proof before suspension |
| `profiles`, `talent_profiles` | QA account flags | QA owner/talent profiles marked `is_test_account=true` |
| `inquiries`, `inquiry_messages`, `inquiry_participants` | Impronta smoke | Inquiry/message/participants persisted; inquiry archived after proof |

## Browser Screenshots

- Before: `qa-evidence/browser-pricing-signup-20260528/phase0-admin-pricing-initial.png`
- Rename: `phase1-pricing-renamed.png`, `phase1-get-started-renamed-after-fix.png`
- Price QA: `phase3-pricing-studio-51.png`, `phase3-pricing-restored.png`
- Promo QA: `phase4-get-started-qatest10-after-fix.png`, `phase4-invalid-promo-after-fix.png`
- Intro offer: `phase5-intro-promo-get-started.png`, `phase5-intro-promo-archived-public.png`
- Free signup/seat limit: `phase7-free-workspace-onboarding-result.png`, `phase7-free-owner-roster-new-before-seeding.png`
- Impronta/routing: `phase9-impronta-public.png`, `phase10-impronta-admin-roster.png`
- Cleanup/final state: `cleanup-final-state.json`, `phase12-free-seat-copy-regression-check.json`

## Final Acceptance

- [x] TypeScript passes: `NODE_OPTIONS="--max-old-space-size=8192" npx tsc --noEmit`
- [x] Repo typecheck passes: `npm run typecheck`
- [x] Lint passes: `npm run lint`
- [x] Full local CI passes: `npm run ci`
- [x] Browser QA passes for completed pricing, rename, price, promo, currency, free signup, tenant, and Impronta smoke areas
- [x] Stripe sync verified
- [x] DB state clean for QA mutations
- [x] QA test data reverted, archived, suspended, or test-marked
- [x] Studio QA / Agency QA / Network QA names reverted
- [x] Temporary prices restored
- [x] QA discounts archived/inactive
- [x] Dev server restarted
- [ ] Paid post-payment webhook/return path fully browser-verified
- [ ] Actual email/notification delivery verified with provider credentials
- [ ] Site-control-center upgrade modal wired fully to live product catalog instead of static local plan card data
