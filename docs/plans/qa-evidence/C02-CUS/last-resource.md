# C02-CUS — last-resource (Massage then Couples set refuses)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T20:35Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C02-spa.spec.ts -g "last-resource" --project=chromium`

## Result

Guest A on `/book` selected Massage (Therapist B), first slot (Tue Sep 8, 9:00 AM Mexico City = 15:00–15:45 UTC), confirmed. $0 `in_person` → paid instant book. Therapist B hold stands. Room A was not allocated.

Guest B selected Couples massage (Therapist A primary; Therapist B companion + Room A). The same wall-clock slot stayed visible (Therapist A is free). Confirm refused. Couples order was written then cancelled (unwind). No live Therapist A hold at that start. Sales listed the paid Massage `instant_book` and did not mark it overdue.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 22.1s |
| Guest A customer | `7cbfc575-7abf-4df6-a631-60d3eb89c468` |
| Guest A order | `0f049465-66a4-46a9-bc82-b2b33a33cf16` — paid / 0 / `instant_book` |
| Guest A line | Massage |
| Therapist B hold | `07d0cf90-306f-4768-a658-eef52cf9d091` — firm, 15:00–15:45 UTC |
| Guest B customer | `afce2990-c258-4c15-acd2-88da2af1a32e` |
| Guest B order | `13c2a066-461a-4d7f-ab8e-fa0e9caa3547` — **cancelled** / 0 / `instant_book` |
| Guest B line | Couples massage |
| Live Therapist A hold at 15:00 | none |
| Room A allocation on Guest B | none (unwind) |

Couples binding is `talent_offerings.attributes.resourceSet` (companion T2 + Room A). Instant book passes those holds plus the space pool into `createPurchase` with the primary slot.

qa-journeys-only DDL (not git, not production): `btree_gist`, `talent_holds_firm_no_overlap`, expire reaper, and `reserve_resource_set` EXCEPTION deletes earlier holds before returning `slot_taken`. Cheap-repair had dropped the gist; catching gist and returning JSON was committing Therapist A. Production already has the constraint.

## Not claimed

This is not a successful couples book (C02 complete). Not C02-OP assign. Not C02-TAL. Not C02-DIFF as “couples books then a competitor fails.” Not C02-REC compensation. Case count stays **0 / 48**.
