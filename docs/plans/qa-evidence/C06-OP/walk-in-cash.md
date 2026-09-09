# C06-OP — walk-in cash (House pizza)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T18:15Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C06-restaurant.spec.ts -g "walk-in cash" --project=chromium`

## Result

Staff signed in as `qa-journeys-owner@impronta.test` (passwordless `/api/dev/signin`). POS opened a New sale, added House pizza, collected cash with a unique `@impronta.test` email.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop |
| POS after collect | `Payment: paid` |
| Sales | heading Sales; kind `pos`; `$18.00`; status `paid`; no "We could not load your orders" |
| Isolated `orders` row | `5b7e7f92-744b-4271-9c22-f7a41462edf9` |
| status / total / channel | `paid` / 1800 / `pos` |
| line | House pizza |

Screenshot: `sales.png` (Sales after the paid collect).

Cheap-repair on **qa-journeys only** (not a git migration, not production): `agency_bookings.order_id`, `booking_transactions` (POS cash shape), `orders.guest_session_id` + nullable `customer_id`, `orders.receipt_code`, `talent_offerings.capacity_pool_id`.

App fixes that this run needed: host-proxy Host/Origin/port agreement; POS `crypto.randomUUID` fallback on http `*.local`; `go()` hard-navigates `?order=`; Sales ignores null `customer_id` and missing extras tables so a paid order still lists.

## Not claimed

This is not the C06 complete restaurant path (QR, courses, move, three-way split, shift cash-up). C06-CUS / DIFF / REC are not started. Case count stays **0 / 48**. Do not treat the remaining C06 smoke specs as passes.
