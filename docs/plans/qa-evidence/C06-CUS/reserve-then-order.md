# C06-CUS — reserve then order (one guest, one visit)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T19:22Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C06-restaurant.spec.ts -g "reserve-then-order" --project=chromium`

## Result

Anonymous guest on the restaurant storefront. Same visit: picked a dinner slot, reserved as C06 diner, then increased House pizza and sent the menu order with the same email. Confirmation status appeared on the book; menu board said the order was in. Refresh still showed both blocks. Staff Sales listed `reservation` and `menu`. Isolated DB has both orders on one customer.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 16.4s |
| Isolated customer | `fafc840f-5239-4966-ba4e-ea448304bc09` |
| Reservation order | `611d6127-45d2-4b01-bafd-022cd0dc4e87` — `paid` / 0 / `reservation` / Table reservation |
| Admission | `86048c38-80a4-4f37-9589-c101d3644c5d` — party 2 |
| Menu order | `10a0c6e4-e66d-48ff-913d-fdd2f0f1bda7` — `paid` / 1800 / `menu` / House pizza |
| Same customer on both orders | yes |

Pay-in-person menu collect is `none`: the pizza order is paid with no fabricated charge. The table offering is free.

## Not claimed

This is C06-CUS basic (reserve then order), not C06 complete. QR / courses / move / three-way split / shift cash-up / C06-DIFF / REC are not started. Header Reserve still opens `?inquiry=open` because `verb-destination` reads published `cms_pages`. Case count stays **0 / 48**.
