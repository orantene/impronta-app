# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2148`–`#2157` on production (`c596e5c2`); `#2158` merged `630819f7` (CI); vocab assert `#2161`  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-23 (Round 2)

## Final summary (Round 2 in progress)

**Merged to main:** `#2148` required asserts → `#2155` confirm/double-book → `#2156` Stripe spec → `#2157` capacity/locale/payment → `#2158` isolation/hostile/reload.

**Proven green on QA host (required asserts):** hold expired + live; confirm recheck; double-book loser; payment collect / pay-link / outside cash; locale ES; last-place class busy; restaurant Items = Menu (D-MSG-316 live); isolation Messages/link/pay; hostile + reload.

**Red (product):** D-MSG-318 POS 13th seat React #310; D-MSG-319 POS foreign-order React #310; D-MSG-312 concurrent confirm TOCTOU.

**Still owed:** Stripe 4242+refund on agent-owned **production** business (D-MSG-313 — journeys is mock); salon vocab; money-perm live staff; notifications; §7 storefront→Messages chip; event/table capacity host re-run; `#2161` merge after `#2158` pointer.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert | green (#2148) | `_harness.ts` |
| Hold expired both ways | green | `hold-expired-next.spec.ts` |
| Payment pay-link / collect / outside | green | payment-*.spec.ts |
| Confirm / double-book loser | green (#2155) | confirm / pos-double-book |
| Class last-place busy | green | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | red (D-MSG-318) | same |
| Restaurant Menu | green (D-MSG-316) | `vocabulary-restaurant.spec.ts` |
| Isolation Messages/link/pay | green (#2158) | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign | red (D-MSG-319) | same |
| Hostile + reload | green | isolation/* |
| Stripe pay+refund | required (prod host) | `stripe-pay-refund.spec.ts` |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148–#2156; confirm/hold/payment paths green |
| 2026-09-23 | #2157 on production + journeys; Menu green; #2158 merged |
