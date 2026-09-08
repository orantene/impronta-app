# C12-DIFF — pay-at-door hold blocks competitor, then cash settle

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T21:40Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C12-event-venue.spec.ts -g "C12-DIFF door" --project=chromium`

## Result

Guest A opened `/events/qa-night`, picked Paid admission (`$20`, 1-unit `door` pool), paid **At the door**. The picker showed the held state. Isolated DB: `pending_payment` / 2000 / `ticket_picker`, allocation `hold` on pool `33330020-…0005`, no admission, no Stripe row.

Guest B (new page) picked the same tier. The picker refused **sold out**. Guest B’s attempt left a `cancelled` `ticket_picker` order and **no** allocation on the door pool.

Staff signed in to `/admin/events/door?session=33330013-…0002`. The held list showed the `$20.00` row. Cash → “No held pay-at-door orders”. Isolated DB after settle: Guest A `paid`, allocation `committed`, one valid admission (`admitted_count=0`, not yet seated), one `booking_transactions` row `manual` / `paid` / 2000. Sales still listed `ticket_picker`.

`createPurchase` treats `in_person` as `pending_payment` (not auto-`paid`) so `loadHeldDoorOrders` can see the hold. Settle does **not** stamp `holder_name` / `holder_email` — the door listed the hold by amount. This automated run does **not** tick the human QA row “Pay-at-door hold, then settle cash on the Door screen.”

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 32.4s |
| Guest A customer | `b5517835-d8b4-4f7f-91ae-4106248f7bd6` |
| Guest A order | `857cdb64-bc07-4ee9-85f9-f29ec0c059ce` — paid / 2000 / `ticket_picker` |
| receipt | `cf37u922yddcmum1wf68` |
| line | QA Night ticket — Paid admission `86b2c70f-…` |
| session / variant / pool | `33330013-…0002` / `33330021-…0002` / `33330020-…0005` |
| Allocation | `812d94f8-2123-4510-b00d-4bb8ae8ce5d5` — committed, 1 unit, door pool |
| Admission | `186b3be8-ef94-448e-b626-4d09d3be2b31` — valid, party 1, admitted 0, holder unset |
| Transaction | `723b78cf-fc36-44a8-8246-0b4acf05348c` — `manual` / `paid` / 2000 |
| Guest B order | `839f3bc4-f87d-4b74-9001-55f52d892cd3` — cancelled / 2000 / no allocation |
| Stripe | none — `in_person` collect is `none`; settle is manual |

qa-journeys-only (not git, not production): Paid admission variant `33330021-…0002` and 1-unit door pool `33330020-…0005` (also in `supabase/seed_journeys_program.sql`). Door columns + `check_in` remain qa-journeys repairs from C12-OP.

## Not claimed

Not QR / camera. Not card settle. Not Admit / seated. Not a $0 door hold. Not promo. Not C12 complete. Human door-settle row stays open. Case count stays **0 / 48**.
