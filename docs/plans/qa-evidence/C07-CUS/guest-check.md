# C07-CUS — Guest reads open tab check

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T22:19Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C07-bar.spec.ts -g "C07-CUS tab" --project=chromium`

## Result

Staff signed in on `/admin/tables`, **Open tab** on Table 1, **Open check**, House pizza. A separate guest browser context opened `/visit/<public_token>` (no staff cookies). The page heading **Your table** listed House pizza and **Total: 1800 USD**. Reload still showed the line. Staff collected cash and **Close visit**. Guest reload showed **This visit has ended**. Isolated DB: paid POS order on `tab:` source page, visit `service_kind=tab` closed.

The website does **not** let a guest open a tab. This path is the public check view for a staff-opened visit.

This is not a duplicate of C07-OP collect-at-close: that path never opened `/visit/<token>`.

This automated run does **not** tick the human POS walk-in row.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 30.0s |
| Guest token | `qsc98mv3zxdw5uhtvrfa` |
| Tab visit | `a8aaf62e-2e57-4ecb-97c4-bedba15ab3fb` — tab / closed / Table 1 |
| Isolated customer | `cf05ac13-4a10-45f6-99ab-4e4977c76c28` |
| Isolated `orders` row | `1c38e692-1b02-48ba-be0a-2b080d334939` — paid / 1800 / `pos` / `tab:33330011-…0001` |
| line | House pizza `defc3af7-…` |
| Transaction | `5ace304b-7284-4fb8-83db-1323e3327913` — `manual` / `paid` / 1800 |

## Not claimed

Not guest-opened tab. Not booth vs gig ticket. Not performer fee. Not printed QR `/q/…`. Not C07 complete. Human POS walk-in row stays open. Case count stays **0 / 48**.
