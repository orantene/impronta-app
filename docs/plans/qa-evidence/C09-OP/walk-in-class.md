# C09-OP — walk-in complimentary class (POS)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T19:36Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C09-yoga-or-fitness-studio.spec.ts -g "walk-in class" --project=chromium`

## Result

Owner on `/admin/pos`. Complimentary class listed with Morning class selected. New sale, add the class, email, Collect cash. Payment flipped to paid. Sales listed the POS row. Isolated DB has a $0 paid order whose line carries the morning session. Sales did not mark it overdue.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 27.0s |
| Isolated customer | `5365c4d5-e12a-410c-a2d4-0750926e2fe0` |
| Isolated `orders` row | `59da3895-d85f-4628-bed7-fe81e5c95d01` |
| status / total / channel | `paid` / 0 / `pos` |
| line | Complimentary class · Morning class |
| `order_lines.session_id` | `33330013-0000-4000-8000-000000000001` |
| Isolated `order_lines` row | `6c296e60-f0b7-4818-beec-470c9f959005` |
| Isolated `capacity_allocations` row | `ef56ebed-4582-4996-85d9-478b67cf8f82` — 1 unit, state `hold`, pool `33330020-…0001` |
| booking_transactions | none — zero-total, no fabricated charge |

App fix on this branch: zero-total collect attaches the supplied contact before leaving draft. `orders_identified_before_payment` forbids `paid` without `customer_id`. The operator typed the email; nothing was invented.

## Not claimed

This is not C09-CUS (guest register is `qa-evidence/C09-CUS/class-register.md`). C09-DIFF last-seat sold-out is a separate record (`qa-evidence/C09-DIFF/same-pool-sold-out.md`). This is not C09-OP attendance. Recurring publish and REC are not started. Case count stays **0 / 48**.
