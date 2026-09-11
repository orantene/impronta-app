# C02-CUS — couples set (two therapists + Room A)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T20:41Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C02-spa.spec.ts -g "two therapists" --project=chromium`

## Result

Guest on `/book` selected Couples massage and the **second** slot (Tue Sep 8, 9:45 AM Mexico City = 15:45–16:30 UTC) so it does not collide with last-resource / leftover Massage on the first slot. Confirm → `$0` `in_person` → `/c/<inquiry>?instant_booked=1`. Isolated DB has a paid order, firm holds on Therapist A and Therapist B for the same window, and a 1-unit Room A allocation on the line. Staff Sales listed `instant_book` and did not mark it overdue.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 14.4s |
| Isolated customer | `b5e6fce5-376b-4675-bba1-2cb7fc7f078b` |
| Isolated `orders` row | `a8285df0-748d-4583-ad97-aef6e660077c` |
| status / total / channel | `paid` / 0 / `instant_book` |
| line | Couples massage |
| Isolated `order_lines` row | `a722cada-a50d-4c42-9209-ffcd1595b5c4` |
| Therapist A hold | `32bae369-e7d4-4878-8f0d-d4345ac7708e` — Couples massage, 15:45–16:30 UTC |
| Therapist B hold | `344198de-d1be-4dd8-9e54-4b122dbb149d` — Couples therapist, same window |
| Room A allocation | `732e10c7-e442-4015-9bd2-3457973c8471` — 1 unit, state `hold`, pool `33330020-…0003` |
| booking_transactions | none — zero-total, no fabricated charge |
| agency_bookings | none for this order — holds + allocation are the set |

`attributes.resourceSet` on the Couples offering binds companion T2 + Room A. Instant book passes those holds plus the space pool into `createPurchase` with the primary slot.

## Not claimed

This is not last-resource (that is Massage-then-refuse). Not C02-OP assign. Not C02-TAL. Not C02-DIFF as a competing request after this book. Not C02-REC. Case count stays **0 / 48**.
