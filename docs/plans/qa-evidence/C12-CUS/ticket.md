# C12-CUS — public $0 night ticket

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T21:02Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C12-event-venue.spec.ts -g "C12-CUS ticket" --project=chromium`

## Result

Guest opened `/events/qa-night` (real event page; event id is not hard-coded into a page design). Picked the scheduled night and General admission (`$0`). Confirm → `/r/<receipt>`. Isolated DB has a paid `ticket_picker` order, one committed `session_tier` unit on the QA Night pool, and one valid admission (`line_seq` 0, party 1). Staff Sales listed `ticket_picker` and did not mark it overdue.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 26.2s |
| Isolated customer | `9facd08c-7ceb-4a88-af1e-f248fed339b4` |
| Isolated `orders` row | `3140e6c8-6d64-49f3-8422-5ad6424e8e22` |
| status / total / channel | `paid` / 0 / `ticket_picker` |
| receipt | `1bdj2959c88wecqstvx8` → `/r/1bdj2959c88wecqstvx8` |
| line | QA Night ticket — General admission `3dd012e1-…` |
| session / variant | `33330013-…0002` / `33330021-…0001` |
| Admission | `59829b12-2ad7-4239-a2c9-6a8d552ea310` — valid, party 1 |
| Allocation | `018c19ef-7ac0-4723-a1d6-8a8f52e3dfbf` — committed, 1 unit, pool `33330020-…0004` |
| booking_transactions | none — zero-total, no fabricated charge |
| agency_bookings | none for this order — admission + allocation are the ticket |

qa-journeys-only (not git, not production): `public.events`, `sessions.event_id`, ticket columns on `talent_offering_variants`, `admissions.line_seq`, `sessions_select_public`. Fixture rows live in `supabase/seed_journeys_program.sql`.

## Not claimed

Not a card charge (isolated Next has no Stripe secret). Not C12-OP door check-in. Not pay-at-door. Not promo. Not sold-out. Not private-hire / performer / layout. Not C12 complete. Case count stays **0 / 48**.
