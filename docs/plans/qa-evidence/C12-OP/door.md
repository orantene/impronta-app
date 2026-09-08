# C12-OP — door check-in on QA Night

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T21:24Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C12-event-venue.spec.ts -g "C12-OP door" --project=chromium`

## Result

Guest bought a fresh `$0` General admission on `/events/qa-night`. Staff signed in and opened `/admin/events/door?session=33330013-0000-4000-8000-000000000002`. Find-by-name found the stamped holder. Admit → green verdict `In`. Reload kept the row as In (no second Admit). Sales still listed `ticket_picker`. Isolated DB: `admitted_count=1`, `seated_at` set, allocation still `committed`.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 32.4s |
| Isolated customer | `7e154a0c-35c1-41e5-96b9-dc508aa5d012` |
| Isolated `orders` row | `248b48ee-74a3-4e8b-b4a0-b37cad03fb46` |
| status / total / channel | `paid` / 0 / `ticket_picker` |
| receipt | `4xwypkhsjew94akwza84` |
| holder | `C12 door 1788902668881` |
| Admission | `550d15f8-a64c-46b3-b73b-99f6113d992f` — valid, party 1, admitted 1, seated 2026-09-08T21:24:48Z |
| Allocation | `f7fb8574-540a-426d-9c12-c77f303f123b` — committed, pool `33330020-…0004` |

qa-journeys-only (not git, not production): `admissions.seated_at` / `no_show_at` / `token_version` / `door_amount_cents` / `door_paid_via` / `completed_at`, and `check_in(uuid, text, int, uuid, int)` matching `20261229000374` (EXECUTE for `service_role` + `postgres` only). App stamp: `$0` ticket mint now writes `holder_name` / `holder_email` so the door list is not a row of "Ticket".

## Not claimed

Not QR / camera scan. Not pay-at-door settle (C12-DIFF). Not a card ticket. Not promo, sold-out, private-hire, performer, or layout. Not C12 complete. Case count stays **0 / 48**.
