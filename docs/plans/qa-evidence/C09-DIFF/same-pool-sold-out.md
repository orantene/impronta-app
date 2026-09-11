# C09-DIFF — website last seat blocks POS walk-in on the same pool

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T21:51Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C09-yoga-or-fitness-studio.spec.ts -g "C09-DIFF" --project=chromium`

## Result

Guest opened the storefront Classes picker and took the last seat at **Last place class** (1-unit `session_tier` pool). Island showed “You are in”. Reload disabled that radio and showed sold out.

Staff opened `/admin/pos`, selected Last place class, New sale, added Complimentary class, typed email, Collect cash. Aside alert: **That is no longer free.** Payment did not flip to paid. Isolated DB: guest `session_picker` paid 0 with a hold on pool `33330020-…0006`. POS draft exists (contact attached before hold) with the Last place `session_id` and **no** allocation and **no** `booking_transactions` row.

This automated run does **not** tick the human QA row “Collect a walk-in class place that is sold out.”

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 30.4s |
| Guest customer | `77f1e433-bd3f-4713-9df3-7338bacbeda7` |
| Guest order | `a0d793fc-f749-48dc-b9b1-9dddbe9299b1` — paid / 0 / `session_picker` |
| Guest line | Complimentary class `36234e01-…` session `33330013-…0003` |
| Guest allocation | `5124aae2-4c55-46d7-ab7e-d7c686ee92e1` — hold, 1 unit, pool `33330020-…0006` |
| POS customer | `bd39f11f-d8f0-4442-810c-07b54a1acb4e` |
| POS order | `d8752df4-9e75-4948-b2c0-98216cdc05e2` — draft / 0 / `pos` |
| POS line | Complimentary class · Last place class `037e0630-…` — no allocation |
| booking_transactions | none — zero-total, collect refused before money |

The hold carries a ~15 minute `expires_at` (900s TTL), same as other $0 class proofs on this fixture. Counts were asserted while live. Fixture: Last place class + 1-unit pool in `supabase/seed_journeys_program.sql` (also applied on qa-journeys via MCP). Morning class stays the 12-unit first radio so C09-CUS / C09-OP do not steal this seat.

## Not claimed

Not attendance. Not recurring publish. Not C09-REC DST. Not C09 complete. Human sold-out row stays open. Case count stays **0 / 48**.
