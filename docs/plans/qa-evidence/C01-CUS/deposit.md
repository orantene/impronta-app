# C01-CUS — technician deposit (Gel manicure)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB) — deposit **requested**, not collected  
**When:** 2026-09-08T19:13Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C01-nail-salon.spec.ts -g "deposit" --project=chromium`

## Result

Anonymous guest on `/book`. Gel manicure listed. Slots from QA Journeys Talent hours. Guest picked a time, name / email, Confirm this time. Browser opened mock Checkout (`STRIPE_SECRET_KEY` unset on the isolated Next process). Staff Sales listed `instant_book` / `$50.00` / `Still owed` / `pending_payment`. Isolated DB has the order, deposit transaction, booking, and technician hold.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop |
| Isolated `orders` row | `d045c4b2-cac5-4c12-be84-aef991f06ce0` |
| status / channel | `pending_payment` / `instant_book` |
| total / collected | 5000 / 2500 cents (`checkout_type=deposit`) |
| Isolated `booking_transactions` | `5a178b5c-53dd-47bd-b62b-7e28859c77a4` (`draft`) |
| Isolated `agency_bookings` | `3510081e-fb71-4a9c-9753-00314ad608b4` |
| Isolated `talent_holds` | `5bd9f58f-31e5-4aa8-b855-132370d32581` |

Screenshot: `sales.png`.

Cheap-repair on **qa-journeys only**: `talent_booking_hours`, `talent_profiles.profile_kind` / `booking_terms` / `claimed_at`, `agencies.plan_tier`, roster booking gates, `reserve_resource_set` hold-only body (cheap-replay stub returned `empty_batch` for holds with no capacity). Fixture: 45-minute talent-owned Gel manicure, `reserve_mode=deposit` / `deposit_pct=50`, technician hours 09:00–18:00 America/Mexico_City, appointments enabled, plan_tier `agency`.

App: instant book sends `paymentChoice: "deposit"` and redirects to Checkout for `collectCents`. Isolated env has no Stripe secret, so Checkout is the mock success URL and the transaction stays `draft`.

## Not claimed

This is not a collected card deposit. Mock checkout is not a charge. C01-OP balance collect, C01-DIFF bridal set, C01-REC expired-hold compensation, and C01 complete are not started. Case count stays **0 / 48**.
