# C26-OP — POS pizza pickup then prep handoff

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T21:59Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C26-jesus-frozen-pizza-from-home.spec.ts -g "C26-OP pickup" --project=chromium`

## Result

Staff signed in on `/admin/pos`. New sale, House pizza, email, Collect cash → Payment paid. Prep destination **Pickup**, promised window ~2 hours ahead, Send to preparation → Preparation queued. `/admin/preparation` listed the ticket (`kitchen` · pickup · queued · House pizza). Mark ready → Confirm handoff. Isolated DB: paid POS order, manual cash 1800, ticket `ready` / `pickup` with `promised_at` and `handed_off_at`. Sales still listed `pos` / `$18.00`.

This is not a duplicate of C06-OP walk-in cash: that path stopped at collect. This path proves the pickup window and the Preparation handoff.

This automated run does **not** tick the human POS walk-in row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 48.4s |
| Isolated customer | `e8379bb9-c6cd-4a72-b88a-18f10385f722` |
| Isolated `orders` row | `91a21246-159c-4fd0-b340-d4a6f206c3e7` — paid / 1800 / `pos` |
| line | House pizza `5336c0ad-…` |
| Transaction | `94c428bb-90fc-4264-a807-8807214148c8` — `manual` / `paid` / 1800 |
| Prep ticket | `acab518c-6a1c-4bdb-9dc7-ac9733cb3c8e` — pickup / ready / kitchen / revision 1 |
| promised_at | 2026-09-08T23:59:00Z |
| ready_at / handed_off_at | 2026-09-08T21:59:48Z / 2026-09-08T21:59:50Z |

## Not claimed

Not C26-CUS Friday website pickup. Not offering_stock Friday-only units. Not C26-DIFF Saturday unaffected. Not C26-REC cancel-returns-Friday. Not C26 complete. Human POS walk-in row stays open. Case count stays **0 / 48**.
