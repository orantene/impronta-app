# C09-CUS — website class register (session_picker)

**Status:** verified in test environment (qa-journeys Next UI + isolated DB)  
**When:** 2026-09-08T20:02Z  
**Target:** `fxlankepwnvelxjrahwk` via `http://qa-journeys.local:3103`. Never production.  
**Command:** `JOURNEYS_FIXTURE_READY=1 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_BASE_URL=http://qa-journeys.local:3103 npx playwright test e2e/cases/C09-yoga-or-fitness-studio.spec.ts -g "class register" --project=chromium`

## Result

Anonymous guest on the restaurant storefront. Classes band rendered a live `session_picker`. Guest picked Morning class, entered email, Take a seat. Island showed "You are in". Refresh still showed Classes. Staff Sales listed `session_picker` and did not mark it overdue. Isolated DB has a $0 paid order whose line carries the morning session.

| Check | Value |
|---|---|
| Playwright | 1 passed, chromium desktop, 50.9s |
| Isolated customer | `8538f544-88a5-4fd4-b21b-926f57c74c35` |
| Isolated `orders` row | `7a183ab5-52b2-4615-b564-7a3a61731f84` |
| status / total / channel | `paid` / 0 / `session_picker` |
| line | Complimentary class |
| `order_lines.session_id` | `33330013-0000-4000-8000-000000000001` |
| Isolated `order_lines` row | `184b062c-d342-43d5-8e52-34a118520e61` |
| Isolated `capacity_allocations` row | `a376f2bc-366b-4a27-9250-1671d7362b2c` — 1 unit, state `hold`, pool `33330020-…0001` |
| booking_transactions | none — zero-total, no fabricated charge |

The restaurant-orderable fallback nests `session_picker` with an empty `offeringId`. The island binds to this tenant's next published scheduled class. `bookSessionSeat` writes `session_id` on the purchase line so mint-on-paid can bind the seat. Morning class has `venue_id` (QA Floor, `America/Mexico_City`); the picker drops zoneless sessions.

## Not claimed

This is not C09-OP walk-in (that is POS). This is not attendance. Recurring publish, sold-out door, and C09-DIFF / REC are not started. Case count stays **0 / 48**.
