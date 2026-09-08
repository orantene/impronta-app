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
| W-AUDIT | cloud-safe | implementing | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Standing. Human rows in `docs/plans/qa/journeys.md`. |
| P1-01 | local-only | awaiting external verification | — | — | cursor/journeys-program-c4d3 | Script refuses without `CAPACITY_PROOF_ISOLATED=1`. Never production. |
| P1-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Coordinating: order engine. Compensation via `ticket_refund_intents`. |
| P1-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Runner + cron + heartbeat. Update also filters status. |
| P1-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Guest picker promo field. Independent of P1-05. |
| P1-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Door settle wired. Browser proof awaits fixture. |
| P1-06 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Five effects + Orders desk form. |
| P1-07 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | SessionsPage already lists collisions; static test enrolled. |
| P2-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Authorized types from 48 cases + 20 presets. Target remains 120. |
| P2-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | theme-layers.ts. Roster not hidden because solo. |
| P2-03 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Nine destinations. `pos` built in P3; tables/preparation still unbuilt. |
| P2-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Sales reads existing orders. |
| P2-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:03Z | cursor/journeys-program-c4d3 | Discounts over `tenant_promo_codes`. |
| P3-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Command module. Line mutation does not purchase; promo only on reprice. |
| P3-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | `/admin/pos` counter. Walk-in draft without customer; collect refuses without contact. |
| P3-04 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Same shell sells appointment offerings as lines. Bridal group / dual resource is P6. |
| P3-05 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | `sessionId` on addLine for walk-in class places. Capacity reserve still on reprice/collection of the purchase engine, not line edits. |
| P4-01 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Collection interface + Stripe adapter at Checkout boundary. Cash via settle. Terminal unavailable. |
| P4-02 | cloud-safe | implemented, awaiting focused verification | cloud-agent | 2026-09-08T06:34Z | cursor/journeys-program-c4d3 | Mercado Pago discovery from live MX docs. No credentials. Adapter not implemented. |

## Case matrix (overall)

See [`cases/`](cases/). Each case: required scenarios → passed / failed / blocked → overall. Basic vs Complete are separate. No case is verified in this checkpoint.

## Defects

See [`defects.md`](defects.md). Blocking and high-risk open a GitHub issue. Normal and cosmetic stay here.
