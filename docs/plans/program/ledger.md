# Program ledger

One owner per task. Statuses: not started · implementing · in active audit · implemented, awaiting focused verification · QA failed · blocked by defect · awaiting external verification · verified in test environment · release verified.

Claim stale after 6 hours if the session is gone. Shared schema/service changes name a single coordinating task.

| Task | Kind | Status | Owner | Claimed | Branch / commit | Notes |
|---|---|---|---|---|---|---|
| P0-01 | cloud-safe (docs) | implemented, awaiting focused verification | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | Both product documents committed under `docs/product/`. |
| P0-02 | cloud-safe | implementing | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | Honest count 0/48 cases, 0/~240 scenarios. |
| P0-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | Sampled against verbatim docs; no invented requirements. Browser still not started. |
| P0-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | L52–L56. |
| P0-05 | mixed | implemented, awaiting focused verification | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | `20261230000200`–`00600` on production. Do not re-apply. `00700` RPCs on this branch and on qa-journeys only. |
| P0-06 | mixed | verified in test environment | cloud-agent | 2026-09-08T18:15Z | cursor/journeys-program-c4d3 | SQL fixture + staff login on qa-journeys.local:3103. Flag only in gitignored isolated env. Do not seed Impronta. |
| P0-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | tablet-pos + mobile-checkout; `e2e/cases/` scaffold. |
| W-AUDIT | cloud-safe | implementing | cloud-agent | 2026-09-08T12:15Z | cursor/journeys-program-c4d3 | Isolation: POS, visits, hybrid, prep, shifts. Purchase refuses a foreign pool before `reserve_capacity_batch`. POS collect holds before money; foreign session writes nothing. Cancel releases this tenant's held places. |
| P1-01 | local-only | verified in test environment | cloud-agent | 2026-09-08T17:20Z | cursor/journeys-program-c4d3 | 200 HTTP `reserve_capacity` vs 12-unit pool: 12 ok / 188 sold_out; table agrees. Never production. `qa-evidence/P1-01/`. |
| P1-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Coordinating: order engine. Compensation via `ticket_refund_intents`. |
| P1-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Runner + cron + heartbeat. Update also filters status. |
| P1-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Guest picker promo field. Independent of P1-05. |
| P1-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Door settle wired. Browser proof awaits fixture. |
| P1-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Five effects + Orders desk form. |
| P1-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | SessionsPage already lists collisions; static test enrolled. |
| P2-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | ≥120 catalog types excluding `custom`. Accent-fold search. Settings search-to-select. |
| P2-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | theme-layers.ts. Roster not hidden because solo. |
| P2-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Nine destinations. `pos` built in P3; `tables` / `preparation` built in P5. |
| P2-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T15:35Z | cursor/journeys-program-c4d3 | Combined Sales read: orders + bookings/reservations/registrations without manufacturing orders. |
| P2-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Discounts over `tenant_promo_codes`. |
| P3-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Command module. Line mutation does not purchase; promo only on reprice. |
| P3-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | `/admin/pos` counter. Walk-in draft without customer; collect refuses without contact. |
| P3-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Same shell sells appointment offerings as lines. Bridal group / dual resource is P6. |
| P3-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T12:15Z | cursor/journeys-program-c4d3 | `sessionId` on addLine. Collect holds the session `session_tier` pool (guest picker pool) via `tierReserveRequest`; offering stock only when there is no session. Split collect does not hold twice. POS lists this tenant's upcoming classes; cancel releases this tenant's holds. |
| P4-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T13:30Z | cursor/journeys-program-c4d3 | Collection interface + Stripe adapter at Checkout. Cash via settle. Point adapter is Mercado Pago Orders API; without credentials `point_not_landed`. |
| P4-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T13:30Z | cursor/journeys-program-c4d3 | Mercado Pago Point adapter (`mercado-pago-collection.ts`). Discovery notes remain. Live half waits on credentials. |
| P5-01 | mixed | implemented, awaiting focused verification | cloud-agent | 2026-09-08T13:30Z | cursor/journeys-program-c4d3 | Visits + open checks. `orders.visit_id` occupancy; `space_id` stays the table. `service_kind` table vs tab (C07). Remote applied. |
| P5-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Pickup destination and `promised_at` on the same prep ticket. Per-window caps stay on `offering_stock`. |
| P5-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T13:30Z | cursor/journeys-program-c4d3 | Ready state + guest email / staff in-app (`prep.order_ready`). |
| P5-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Preparation tickets + revisions. Amendment bumps revision; not a second ticket. `/admin/preparation`. |
| P5-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:05Z | cursor/journeys-program-c4d3 | Shift open/close on `/admin/pos`. One open per tenant. Expected = opening + cash allocations. Navigating away does not close. Remote `20261230000300` applied. |
| P5-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:05Z | cursor/journeys-program-c4d3 | One order, several cash allocations. Unique idempotency per allocation. No second order / no check entity. |
| P5-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Remaining minimum displayed from `spaces.min_spend_cents`. Not a charge. |
| P5-08 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Handoff on a ready ticket. Sellable limits remain `offering_stock`. |
| P6-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `reserveResourceSet`: capacity first, talent holds by id, unwind, 3 deadlock retries. Wired through `createPurchase`. |
| P6-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Stations/rooms are `capacity_pools` with `subject_kind: space`. `spaceCapacityPool`. No person-capacity migration. |
| P6-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Travel/setup buffers extend the hold window (`bufferBeforeSeconds` / `bufferAfterSeconds`). |
| P6-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `markAttendance` via `check_in` (tenant-scoped). No payment write. Complimentary `$0` is not overdue on Sales. |
| P6-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `listPrivateClients` refuses cross-workspace reads; does not query the other tenant. |
| P7-01 | mixed | implemented, awaiting focused verification | cloud-agent | 2026-09-08T13:30Z | cursor/journeys-program-c4d3 | `booking_deliverables` + `selected_asset_ids` (C37). Remote applied. `passthrough_budget` ≠ service. |
| P7-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Recurring agreement = `session_series`. Skip one visit (`sessions.status=cancelled`) without deactivating the series. |
| P7-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `visitFitsServiceArea` against existing `talent_service_areas`. No parallel area table. |
| P7-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Agreed change inserts a new `inquiry_offers` version. Accepted quote is not rewritten. |
| P7-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Departure = session + admissions manifest. Vehicle cap via capacity remaining. Performer fee ≠ admission. |
| P7-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Appointment phases flatten into one `reserveResourceSet`. Sold-out later phase writes no earlier hold. |
| P8-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T08:30Z | cursor/journeys-program-c4d3 | Component cancel; supervised set; tournament omits cafe; breakouts; live recording; exclusive kitchen; retreat days + add-on (cancel day 3 leaves massage); grooming vs event rooms. |

## Case matrix (overall)

See [`cases/`](cases/). Each case: required scenarios → passed / failed / blocked → overall. Basic vs Complete are separate. No case is verified in this checkpoint. C06-CUS reserve-then-order is in `qa-evidence/C06-CUS/reserve-then-order.md`. That is C06-CUS basic, not C06 complete.

## Defects

See [`defects.md`](defects.md). Blocking and high-risk open a GitHub issue. Normal and cosmetic stay here.
