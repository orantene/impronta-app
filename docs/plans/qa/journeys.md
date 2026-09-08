# Journeys program — human QA rows

Scenario IDs live in `docs/plans/program/cases/`. This file is the human-only list in the established form.

| what to do | proves | falsified by |
|---|---|---|
| After `seed:journeys-program` on an isolated DB, open `qa-journeys.local` as staff and reach Sales, Orders, Discounts, Door. | Fixture tenant is reachable and the new destinations render. | Host not registered; 404; blank page. `BLOCKED:` until seed is applied. |
| Buy a ticket with a promo code on the guest picker, refresh, reopen the order. | P1-04 promo input is connected; order and redemption persist. | Promo field missing; refusal not shown; redemption not recorded. |
| Pay-at-door hold, then settle cash on the Door screen. | P1-05 collection, allocation and admission stay separate. | Settle missing; paid with no admission; duplicate collection. |
| On a paid order, pick effect "cancel one ticket" and confirm. | P1-06 states the effect before money moves. | Refund with no named effect; seat not released; duplicate refund. |
| Confirm Sessions lists DST collisions in the operator UI. | P1-07 is not log-only. | Collision only in `improntaLog`. |
| Open `/admin/pos`, start a New Sale, add a catalog item, try Collect cash with no email/phone. | P3 walk-in draft + no_contact at collect. | Draft missing; collect succeeds without a named buyer; `createPurchase` per add. |
| Collect a walk-in class place that is sold out. | P3-05: collect refuses; no cash recorded. | Settle succeeds; oversell. `BLOCKED:` until fixture. |
| Same sale: enter email, Collect cash. | Cash recorded as a method on the existing order. | Second order created; Stripe session opened for cash. |
| Collect card on a named sale. | Online Checkout at the existing Stripe boundary. | Direct Charge on a connected account; Terminal used. |
| On a paid hybrid package, cancel catering only (`refund_hybrid_component`). | P8 L55 effect 5: that line's allocations release; other lines stand. | Whole order refunded; other allocations released; second order created. `BLOCKED:` until fixture. |
| Staff desk `/admin/pos`, `/admin/tables`, `/admin/preparation` on an agency host. | P3/P5 surfaces are on the allow-list, not marketing. | 404 Host not registered; marketing host serves the desk. |
| From workspace A, add a line from workspace B's catalog, or open B's table. | Isolation: sale/visit writes nothing. | Line or visit created; `wrong_tenant` missing. |
| On POS, add a class place for a session belonging to another workspace. | Walk-in session is tenant-scoped. | Line created; foreign `session_id` stored. |
| Paste workspace A's table token on workspace B's host. | Guest visit / QR / floor stay tenant-scoped. | B sees A's check; floor lists B's tables on A. |
| Open a cash shift on A while B's drawer is open; close A's. | P5-05: one open shift per tenant; drawers independent. | A's open blocked; B's shift closed. |

Ten representative cases (C01, C06, C08, C09, C12, C13, C24, C26, C27, C31) get complete browser journeys once `JOURNEYS_FIXTURE_READY=1`. Until the seed is applied, those rows stay `BLOCKED: fixture harness not applied`.
