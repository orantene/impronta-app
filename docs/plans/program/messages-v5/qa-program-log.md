# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2148`/`#2155` on production (`ba7db4de`); Stripe `#2156` merged `22b34ddd` (awaiting pointer); capacity/locale `#2157`; isolation `#2158`  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2)

## Final summary (Round 2 in progress)

**Round 1:** [#2128](https://github.com/orantene/impronta-app/pull/2128). Auto-ack both DBs. D-MSG-301 on QA host.

**PR1 #2148** required asserts — on production. **PR2 #2155** confirm+double-book — on production `ba7db4de`; journeys synced; **re-proven green** on QA host (confirm, both hold directions, double-book loser) with `VERCEL_AUTOMATION_BYPASS_SECRET`.

**PR3 #2156** Stripe spec — merged `22b34ddd`; structural queued behind `#2159`. Live 4242+refund still owed on production-ref host (D-MSG-313).

**PR4 #2157** capacity/locale/payment paths — open. Collect + pay-link + outside cash green against QA host from this branch's specs; restaurant Menu red until D-MSG-316 lands on host; class 13th POS red D-MSG-318.

**PR5 #2158** isolation — open; Messages/link/pay green; POS foreign order red D-MSG-319.

| Proven on QA host | Defects |
|---|---|
| Hold expired + live (D-MSG-320 seed); confirm; double-book loser | D-MSG-302–312, 320 |
| Payment collect href→POS; pay-link Request sent; outside cash change_result | D-MSG-321–324 |
| Collect path | — |
| Restaurant Menu | red until #2157 on host (D-MSG-316) |
| 13th POS / foreign POS | D-MSG-318 / D-MSG-319 |

**Still owed:** Stripe 4242+refund live; event/table capacity green on host; salon vocab; money-perm live; notifications; §7 chip; D-MSG-312 lock; merge #2157/#2158 after pointer.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert | green (#2148) | `_harness.ts` |
| Hold expired both ways | green (QA host) | `hold-expired-next.spec.ts` |
| Payment pay-link | green (QA host) | `payment-deep.spec.ts` |
| Payment collect | green (QA host) | `payment-collect.spec.ts` |
| Payment outside cash | green (QA host) | `payment-outside.spec.ts` |
| Confirm recheck / double-book loser | green (#2155 + QA re-run) | confirm / pos-double-book |
| Class last-place busy | green (pre-merge) | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | red (D-MSG-318) | same |
| Isolation Messages/link/pay | green | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign order | red (D-MSG-319) | same |
| Hostile + reload | green | isolation/* |
| Stripe pay+refund | required (prod host) | `stripe-pay-refund.spec.ts` |
| Restaurant Menu | red until #2157 on host | `vocabulary-restaurant.spec.ts` |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148+#2155 on production; journeys sync; confirm/hold/double-book re-green |
| 2026-09-22 | #2156 merged; waiting structural behind #2159 |
| 2026-09-22 | payment collect/deep/outside green; D-MSG-320–324; capacity PR iterating |
