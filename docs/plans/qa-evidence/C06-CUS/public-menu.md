# C06-CUS — public menu order (House pizza)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T18:33Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C06-restaurant.spec.ts -g "public menu" --project=chromium`

## Result

Anonymous guest on the restaurant storefront. Tonight's selection listed House pizza. Quantity +1, name / email / phone, Order now. Board said "Your order is in". Refresh still showed the menu. Staff Sales listed the same record.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop |
| Storefront after send | `Your order is in` |
| Sales | heading Sales; kind `menu`; `$18.00`; status `paid`; no "We could not load your orders" |
| Isolated `orders` row | `d889d726-6f3e-42a3-a8d0-f6093294f8d6` |
| status / total / channel | `paid` / 1800 / `menu` |
| line | House pizza |
| booking / transaction | none — pay-in-person collect is `none`; no fabricated charge |

Screenshot: `sales.png` (Sales after the guest send).

Cheap-repair on **qa-journeys only** (not a git migration, not production): `talent_offerings` public-read RLS; `reserve_mode` / `deposit_pct` / `require_account_to_book` / `cancellation_hours`; empty `talent_offering_variants` / `talent_offering_addons`. House pizza `allow_pay_in_person = true`.

Harness: a public header "Sign in" / "Log in" link is not an auth wall.

## Not claimed

This is not a table reservation. Header Reserve still opens `?inquiry=open` because no published page carries `reserve_table`. Venue service windows / bands / `admissions` are still missing on the cheap-repaired schema. C06-CUS reservation, C06-DIFF / REC, and the complete restaurant path are not started. Case count stays **0 / 48**. Do not treat the C06-CUS smoke spec as a pass.
