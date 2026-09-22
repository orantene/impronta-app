# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2148` on production `2705dc324`; `#2155` merged `ba7db4de`; Stripe `#2156`; capacity/locale `#2157`; isolation `#2158`  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2)

## Final summary (Round 2 in progress)

**Round 1:** merged [#2128](https://github.com/orantene/impronta-app/pull/2128) (`88f7444ce`). Auto-ack on both DBs. D-MSG-301 on QA host.

**Round 2 PR1 (#2148):** required asserts. **On production** `2705dc324`; journeys synced.

**Round 2 PR2 (#2155):** confirm recheck + double-book loser. **Merged** `ba7db4de` (awaiting pointer).

**Round 2 PR3–5:** Stripe `#2156`; capacity/locale `#2157` (D-MSG-314–318); isolation `#2158` (D-MSG-319).

| Proven | Defects |
|---|---|
| Hold expired both ways; payment-deep; confirm/double-book loser | D-MSG-302–312 |
| Last-place Messages busy; ES locale; isolation link/pay/Messages; hostile; reload | D-MSG-314–317 |
| Restaurant Menu wiring fix | D-MSG-316 |
| 13th POS / foreign POS order crash | D-MSG-318 / D-MSG-319 |

**Still owed:** Stripe 4242+refund live; event/table capacity green; salon vocab; money-perm; notifications; §7 chip; D-MSG-312 lock.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert | green (#2148) | `_harness.ts` |
| Hold expired | green | `hold-expired-next.spec.ts` |
| Payment pay-link | green | `payment-deep.spec.ts` |
| Confirm recheck / double-book loser | green (#2155) | confirm / pos-double-book |
| Class last-place busy | green | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | red (D-MSG-318) | same |
| Isolation Messages/link/pay | green | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign order | red (D-MSG-319) | same |
| Hostile + reload | green | isolation/* |
| Stripe pay+refund | required (prod) | `stripe-pay-refund.spec.ts` |
| Restaurant Menu | red until #2157 on host | `vocabulary-restaurant.spec.ts` |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148 production + journeys; #2155 merged |
| 2026-09-22 | capacity last-place green; D-MSG-316–318 |
| 2026-09-22 | isolation+hostile+reload green; D-MSG-319 |
