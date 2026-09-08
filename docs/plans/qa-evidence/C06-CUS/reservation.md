# C06-CUS — table reservation (reserve_table)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T18:46Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C06-restaurant.spec.ts -g "reservation" --project=chromium`

## Result

Anonymous guest on the restaurant storefront. `reserve_table` offered party, dates and dinner times. Guest picked 13:00, name / email, Reserve at. Confirmation status appeared. Refresh still showed the book. Staff Sales listed `reservation`. Isolated DB has the order and an admission of party 2.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop |
| Isolated `orders` row | `2a178567-6f38-4d1f-be05-261fd3471f24` |
| status / channel | `paid` / `reservation` (free table offering, no fabricated charge) |
| Isolated `admissions` row | `ab639422-8c7a-4150-b154-c791085c5073` |
| party_size | 2 |

Screenshot: `reservation-sales.png`.

Cheap-repair on **qa-journeys only**: `venue_service_rules` / `venue_service_windows` / `space_groups` / `admissions`. Fixture: dinner window 12:00–10h every day, party band 1–4 with 4-unit `space_group` pool, unlisted free "Table reservation" offering.

App: `restaurant-orderable` now carries `reserve_table` (booking door). Header Reserve still opens `?inquiry=open` until a published CMS page carries the block.

## Not claimed

This is not one guest who reserved and then ordered in the same visit. Public menu is a separate path (`public-menu.md`). QR / courses / split / C06-DIFF / REC are not started. Case count stays **0 / 48**.
