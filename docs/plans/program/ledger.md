# Program ledger

One owner per task. Statuses: not started · implementing · in active audit · implemented, awaiting focused verification · QA failed · blocked by defect · awaiting external verification · verified in test environment · release verified.

Claim stale after 6 hours if the session is gone. Shared schema/service changes name a single coordinating task.

| Task | Kind | Status | Owner | Claimed | Branch / commit | Notes |
|---|---|---|---|---|---|---|
| P0-01 | cloud-safe (docs) | blocked | — | — | cursor/journeys-program-c4d3 | Source documents not in workspace. README records gap. |
| P0-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | START-HERE, ledger, decisions, defects, automation draft. |
| P0-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | 48 case files from authorized matrix. Check vs verbatim docs when they land. |
| P0-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | L52–L56. |
| P0-05 | mixed | awaiting external verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Instruction docs updated. `db:check` not run (no credentials). |
| P0-06 | mixed | awaiting external verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | SQL + script + contract. Apply needs DATABASE_URL. |
| P0-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | tablet-pos + mobile-checkout; `e2e/cases/` scaffold. |
| W-AUDIT | cloud-safe | implementing | cloud-agent | 2026-09-08T11:42Z | cursor/journeys-program-c4d3 | Isolation: POS, visits, hybrid, prep, shifts. Purchase refuses a foreign pool before `reserve_capacity_batch`. |
| P1-01 | local-only | awaiting external verification | — | — | cursor/journeys-program-c4d3 | Script refuses without `CAPACITY_PROOF_ISOLATED=1`. Never production. |
| P1-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Coordinating: order engine. Compensation via `ticket_refund_intents`. |
| P1-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Runner + cron + heartbeat. Update also filters status. |
| P1-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Guest picker promo field. Independent of P1-05. |
| P1-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Door settle wired. Browser proof awaits fixture. |
| P1-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Five effects + Orders desk form. |
| P1-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | SessionsPage already lists collisions; static test enrolled. |
| P2-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Authorized types from 48 cases + 20 presets. Target remains 120. |
| P2-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | theme-layers.ts. Roster not hidden because solo. |
| P2-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Nine destinations. `pos` built in P3; `tables` / `preparation` built in P5. |
| P2-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Sales reads existing orders. |
| P2-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Discounts over `tenant_promo_codes`. |
| P3-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Command module. Line mutation does not purchase; promo only on reprice. |
| P3-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | `/admin/pos` counter. Walk-in draft without customer; collect refuses without contact. |
| P3-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Same shell sells appointment offerings as lines. Bridal group / dual resource is P6. |
| P3-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | `sessionId` on addLine for walk-in class places. Capacity reserve still on reprice/collection of the purchase engine, not line edits. |
| P4-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Collection interface + Stripe adapter at Checkout boundary. Cash via settle. Terminal unavailable. |
| P4-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Mercado Pago discovery from live MX docs. No credentials. Adapter not implemented. |
| P5-01 | mixed | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Visits + open checks. `orders.visit_id` occupancy; `space_id` stays the table. Apply awaiting credentials. |
| P5-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Pickup destination and `promised_at` on the same prep ticket. Per-window caps stay on `offering_stock`. |
| P5-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Ready state on the ticket. Guest/staff notification not built. |
| P5-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Preparation tickets + revisions. Amendment bumps revision; not a second ticket. `/admin/preparation`. |
| P5-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:05Z | cursor/journeys-program-c4d3 | Shift open/close on `/admin/pos`. One open per tenant. Expected = opening + cash allocations. Navigating away does not close. Apply `20261230000300` awaiting credentials. |
| P5-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:05Z | cursor/journeys-program-c4d3 | One order, several cash allocations. Unique idempotency per allocation. No second order / no check entity. |
| P5-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Remaining minimum displayed from `spaces.min_spend_cents`. Not a charge. |
| P5-08 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:49Z | cursor/journeys-program-c4d3 | Handoff on a ready ticket. Sellable limits remain `offering_stock`. |
| P6-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `reserveResourceSet`: capacity first, talent holds by id, unwind, 3 deadlock retries. Wired through `createPurchase`. |
| P6-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Stations/rooms are `capacity_pools` with `subject_kind: space`. `spaceCapacityPool`. No person-capacity migration. |
| P6-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Travel/setup buffers extend the hold window (`bufferBeforeSeconds` / `bufferAfterSeconds`). |
| P6-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `markAttendance` via `check_in` (tenant-scoped). No payment write. Complimentary `$0` is not overdue on Sales. |
| P6-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `listPrivateClients` refuses cross-workspace reads; does not query the other tenant. |
| P7-01 | mixed | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `booking_deliverables`: draft→submitted→approved/revision_requested. Revision limit. `passthrough_budget` ≠ service. Apply `20261230000400` awaiting credentials. |
| P7-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Recurring agreement = `session_series`. Skip one visit (`sessions.status=cancelled`) without deactivating the series. |
| P7-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | `visitFitsServiceArea` against existing `talent_service_areas`. No parallel area table. |
| P7-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Agreed change inserts a new `inquiry_offers` version. Accepted quote is not rewritten. |
| P7-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Departure = session + admissions manifest. Vehicle cap via capacity remaining. Performer fee ≠ admission. |
| P7-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T07:20Z | cursor/journeys-program-c4d3 | Appointment phases flatten into one `reserveResourceSet`. Sold-out later phase writes no earlier hold. |
| P8-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T08:30Z | cursor/journeys-program-c4d3 | Component cancel; supervised set; tournament omits cafe; breakouts; live recording; exclusive kitchen; retreat days + add-on (cancel day 3 leaves massage); grooming vs event rooms. |

## Case matrix (overall)

See [`cases/`](cases/). Each case: required scenarios → passed / failed / blocked → overall. Basic vs Complete are separate. No case is verified in this checkpoint.

## Defects

See [`defects.md`](defects.md). Blocking and high-risk open a GitHub issue. Normal and cosmetic stay here.
