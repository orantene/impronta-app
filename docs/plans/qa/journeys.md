# Journeys program — human QA rows

Scenario IDs live in `docs/plans/program/cases/`. This file is the human-only list in the established form.

| what to do | proves | falsified by |
|---|---|---|
| After `seed:journeys-program` on an isolated DB, open `qa-journeys.local` as staff and reach Sales, Orders, Discounts, Door. | Fixture tenant is reachable and the new destinations render. | Host not registered; 404; blank page. `BLOCKED:` until seed is applied. |
| Buy a ticket with a promo code on the guest picker, refresh, reopen the order. | P1-04 promo input is connected; order and redemption persist. | Promo field missing; refusal not shown; redemption not recorded. |
| Pay-at-door hold, then settle cash on the Door screen. | P1-05 collection, allocation and admission stay separate. | Settle missing; paid with no admission; duplicate collection. |
| On a paid order, pick effect "cancel one ticket" and confirm. | P1-06 states the effect before money moves. | Refund with no named effect; seat not released; duplicate refund. |
| Confirm Sessions lists DST collisions in the operator UI. | P1-07 is not log-only. | Collision only in `improntaLog`. |

Ten representative cases (C01, C06, C08, C09, C12, C13, C24, C26, C27, C31) get complete browser journeys once `JOURNEYS_FIXTURE_READY=1`. Until the seed is applied, those rows stay `BLOCKED: fixture harness not applied`.
