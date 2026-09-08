# Journeys program — human QA rows

Scenario IDs live in `docs/plans/program/cases/`. This file is the human-only list in the established form.

| what to do | proves | falsified by |
|---|---|---|
| After `seed:journeys-program` on an isolated DB, open `qa-journeys.local` as staff and reach Sales, Orders, Discounts, Door. | Fixture tenant is reachable and the new destinations render. | Host not registered; 404; blank page. `BLOCKED:` isolated SQL is applied; Next app still needs qa-journeys env + that host. |
| Buy a ticket with a promo code on the guest picker, refresh, reopen the order. | P1-04 promo input is connected; order and redemption persist. | Promo field missing; refusal not shown; redemption not recorded. |
| Pay-at-door hold, then settle cash on the Door screen. | P1-05 collection, allocation and admission stay separate. | Settle missing; paid with no admission; duplicate collection. |
| On a paid order, pick effect "cancel one ticket" and confirm. | P1-06 states the effect before money moves. | Refund with no named effect; seat not released; duplicate refund. |
| Confirm Sessions lists DST collisions in the operator UI. | P1-07 is not log-only. | Collision only in `improntaLog`. |
| Open `/admin/pos`, start a New Sale, add a catalog item, try Collect cash with no email/phone. | P3 walk-in draft + no_contact at collect. | Draft missing; collect succeeds without a named buyer; `createPurchase` per add. |
| Collect a walk-in class place that is sold out. | P3-05: collect refuses; no cash recorded. Walk-in holds the session `session_tier` pool. | Settle succeeds; oversell; offering stock held instead of the class. `BLOCKED:` until fixture. |
| Same sale: enter email, Collect cash. | Cash recorded as a method on the existing order. | Second order created; Stripe session opened for cash. |
| Collect card on a named sale. | Online Checkout at the existing Stripe boundary. | Direct Charge on a connected account; Terminal used. |
| On a paid hybrid package, cancel catering only (`refund_hybrid_component`). | P8 L55 effect 5: that line's allocations release; other lines stand. | Whole order refunded; other allocations released; second order created. `BLOCKED:` until fixture. |
| Staff desk `/admin/pos`, `/admin/tables`, `/admin/preparation` on an agency host. | P3/P5 surfaces are on the allow-list, not marketing. | 404 Host not registered; marketing host serves the desk. |
| From workspace A, add a line from workspace B's catalog, or open B's table. | Isolation: sale/visit writes nothing. | Line or visit created; `wrong_tenant` missing. |
| On POS, add a class place for a session belonging to another workspace. | Walk-in session is tenant-scoped. | Line created; foreign `session_id` stored. |
| Paste workspace A's table token on workspace B's host. | Guest visit / QR / floor stay tenant-scoped. | B sees A's check; floor lists B's tables on A. |
| Open a cash shift on A while B's drawer is open; close A's. | P5-05: one open shift per tenant; drawers independent. | A's open blocked; B's shift closed. |
| Cancel a POS draft that already held a class place. | P3-05: cancel releases that allocation; foreign allocations stay. | Place stays held; B's allocation released. |

Ten representative cases (C01, C06, C08, C09, C12, C13, C24, C26, C27, C31) get complete browser journeys once `JOURNEYS_FIXTURE_READY=1`. Isolated SQL fixture is applied on `qa-journeys`; staff login on `qa-journeys.local:3103` is verified. Honest count: **0 of 16 human rows executed**. Automated C06-OP walk-in cash and C06-CUS public menu are in `qa-evidence/` — those do not tick the human POS walk-in row.

Checkpoint 2026-09-08T22:38Z: P1-01 HTTP concurrency passed (`qa-evidence/P1-01/`). C06 restaurant path proofs in `qa-evidence/C06-*`. C01-CUS technician deposit requested (`qa-evidence/C01-CUS/deposit.md`) — charge not collected. C09 class paths in `qa-evidence/C09-*`. C09-DIFF last-seat sold-out in `qa-evidence/C09-DIFF/same-pool-sold-out.md`. Automated C09-DIFF does **not** tick the human sold-out class row. C02-CUS last-resource and couples set in `qa-evidence/C02-CUS/`. C02-DIFF competitor-after-couples in `qa-evidence/C02-DIFF/`. C12-CUS $0 night ticket in `qa-evidence/C12-CUS/ticket.md`. C12-OP door Admit in `qa-evidence/C12-OP/door.md`. C12-DIFF pay-at-door cash settle in `qa-evidence/C12-DIFF/pay-at-door.md`. Automated C12-DIFF does **not** tick the human door-settle row. C26-OP pickup handoff in `qa-evidence/C26-OP/pickup-handoff.md` — cash pizza, pickup window, Mark ready, Confirm handoff. Automated C26-OP does **not** tick the human POS walk-in row. C07-OP tab collect-at-close in `qa-evidence/C07-OP/collect-at-close.md` — Open tab ≠ Open visit; unpaid Close refused; cash then Close. Automated C07-OP does **not** tick the human POS walk-in row. C07-CUS guest check in `qa-evidence/C07-CUS/guest-check.md` — guest `/visit/<token>` reads the staff-opened tab; ended after Close. Guest cannot open a tab. Automated C07-CUS does **not** tick the human POS walk-in row. C08-CUS directory inquiry in `qa-evidence/C08-CUS/directory-inquiry.md` — guest `/directory` chat submitted; offer not accepted. Automated C08-CUS does **not** tick a human QA row. Do not record passes from skipped Playwright.

