# C07-OP — Tab collect at close

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T22:09Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C07-bar.spec.ts -g "C07-OP tab" --project=chromium`

## Result

Staff signed in on `/admin/tables`. Table 1 started Free. **Open visit** showed `Table · Occupied`, then **Close visit** returned Free. **Open tab** showed `Tab · Occupied` (not Table). **Open check** landed on POS with the visit draft. House pizza on the check; returning to Tables and **Close visit** while unpaid showed **Collect or cancel the check before resetting the table.** Open check again, email, Collect cash → Payment paid. Tables still `Tab · Occupied` after collect. Close visit → Free. Isolated DB: paid POS order on `tab:` source page, visit `service_kind=tab` closed on Table 1, manual cash 1800. Sales listed `pos` / `$18.00`.

This is not a duplicate of C06-OP walk-in cash: that path started from POS New sale with no visit. This path opens a tab on the floor, refuses unpaid close, then collects and closes.

This automated run does **not** tick the human POS walk-in row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 51.1s |
| Table occupancy visit | `c1f3e8ed-c4af-4394-bf5a-458023c80a24` — table / closed |
| Tab visit | `0b9586e2-c2cc-4aa5-bd82-4f3e325adb48` — tab / closed / Table 1 |
| Isolated customer | `e3b06820-5878-49d7-8e19-79dcc761a60a` |
| Isolated `orders` row | `40a3d38b-76d6-4eeb-be76-72e77527fbf6` — paid / 1800 / `pos` / `tab:33330011-…0001` |
| line | House pizza `74c4c0a2-…` |
| Transaction | `768db0f7-8fc8-4751-9d1d-4c3165bb374c` — `manual` / `paid` / 1800 |

## Not claimed

Not C07-CUS guest tab. Not booth vs gig ticket. Not performer fee. Not QR / visit token. Not C07 complete. Human POS walk-in row stays open. Case count stays **0 / 48**.
