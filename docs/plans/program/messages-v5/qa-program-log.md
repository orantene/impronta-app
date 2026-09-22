# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2148` on production `2705dc324`; `#2155` merged `ba7db4de`; Stripe `#2156`; capacity/locale `#2157`; isolation `#2158`  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2)

## Final summary (Round 2 in progress)

**Round 1:** merged [#2128](https://github.com/orantene/impronta-app/pull/2128) (`88f7444ce`). Auto-ack migration on both DBs. D-MSG-301 on QA host.

**Round 2 PR1 (#2148):** required asserts. **Merged** → production `2705dc324`; journeys synced.

**Round 2 PR2 (#2155):** confirm recheck + double-book loser. **Merged** `ba7db4de` (awaiting main CI → pointer → journeys).

**Round 2 PR3 (#2156):** Stripe pay+refund required spec (D-MSG-313; production host).

**Round 2 PR4 (#2157):** capacity + ES/FR hard + payment outside/collect + restaurant Menu (D-MSG-314–318).

**Round 2 PR5 (#2158):** isolation + hostile + reload (D-MSG-319).

| Proven this wave | Defects filed |
|---|---|
| Hold expired both directions | D-MSG-302–309 |
| Payment-deep Accept→Full→pay link→card | D-MSG-309 |
| Confirm recheck + double-book loser | D-MSG-310–312 |
| Last-place Messages Classes busy | D-MSG-314 |
| Admin ES locale (cookie) | D-MSG-315 |
| Restaurant Items → Menu wiring | D-MSG-316 |
| Isolation Messages/link/pay | D-MSG-319 POS crash |
| Hostile + reload/resume | — |

**Still owed:** Stripe live 4242+refund; event/table capacity green on host; 13th POS (D-MSG-318); salon vocab; money-perm live; notifications; §7 chip; merge/cancel effects; D-MSG-312 lock.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert contract | green (#2148) | `_harness.ts` |
| Hold expired next-step | green both directions | `admin/hold-expired-next.spec.ts` |
| Payment pay-link | green | `admin/payment-deep.spec.ts` |
| Payment outside / collect | required | `admin/payment-outside.spec.ts` / `payment-collect.spec.ts` |
| Confirm recheck refusal | green (#2155) | `admin/confirm-recheck-refusal.spec.ts` |
| Double-book loser | green (#2155); concurrent D-MSG-312 | `admin/pos-double-book.spec.ts` |
| Class last-place Messages busy | green | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | red (D-MSG-318 React #310) | `capacity/class-seat-limit.spec.ts` |
| Admin ES / client ES/FR | green / required | `locale-es` / `locale-pay-deep` |
| Restaurant Menu vocabulary | red until #2157 on host (D-MSG-316) | `vocabulary-restaurant.spec.ts` |
| Cross-tenant Messages/link/pay | green | `isolation/cross-tenant.spec.ts` |
| Cross-tenant POS order | red (D-MSG-319) | `isolation/cross-tenant.spec.ts` |
| Hostile data | green | `isolation/hostile-data.spec.ts` |
| Reload / resume | green | `isolation/reload-resume.spec.ts` |
| Stripe pay + refund | required (production) | `admin/stripe-pay-refund.spec.ts` |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-22 | Round 2 harden; hold+times+payment green | D-MSG-302–309; PR #2148 |
| 2026-09-22 | #2148 on production `2705dc324`; journeys synced | |
| 2026-09-22 | #2155 merged `ba7db4de` | confirm/POS |
| 2026-09-22 | capacity last-place green; 13th red D-MSG-318 | #2157 |
| 2026-09-22 | isolation + hostile + reload green (POS crash D-MSG-319) | #2158 |
