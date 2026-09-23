# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2163` on main + production (`8007c1dd`); `#2165` open (D-MSG-330/331)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-23 (Round 2)

## Final summary (Round 2 in progress)

**Merged to main:** `#2148` → `#2155` → `#2156` → `#2157` → `#2158` → `#2161` → `#2163` (isolated-target + D-MSG-328/329). Production pointer at `8007c1dd`; `qa-stripe-r2` re-aliased to production deploy `dpl_7UXH8f…`.

**Proven green on QA host:** hold expired + live; confirm recheck; double-book loser; payment collect / pay-link / outside cash; locale ES; last-place class busy; restaurant Items = Menu; isolation Messages/link/pay; hostile + reload; §7 shallow + deep (events heading fix); money-perm Refund hidden after opt-in (D-MSG-331).

**Stripe on `qa-stripe-r2`:** mint + `confirm=stripe` → Checkout proven (D-MSG-329). **4242+refund blocked (D-MSG-330):** `cs_live_…` — need `sk_test_`. `STRIPE_SECRET_KEY` production-only again.

**Red / still owed:** event-tier sold-out + table-overbook host re-run (storefront hold/submit doors); notifications (no qa-program spec yet); 4242 once test key exists.

**Red (product):** D-MSG-318 POS 13th seat React #310; D-MSG-319 POS foreign-order React #310; D-MSG-312 concurrent confirm TOCTOU.


## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert | green (#2148) | `_harness.ts` |
| Hold expired both ways | green | `hold-expired-next.spec.ts` |
| Payment pay-link / collect / outside | green | payment-*.spec.ts |
| Confirm / double-book loser | green (#2155) | confirm / pos-double-book |
| Class last-place busy | green | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | red (D-MSG-318) | same |
| Event tier / table overbook | red (host re-run) | capacity/* |
| Restaurant Menu | green (D-MSG-316) | `vocabulary-restaurant.spec.ts` |
| Isolation Messages/link/pay | green (#2158) | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign | red (D-MSG-319) | same |
| Hostile + reload | green | isolation/* |
| Money-perm live staff | green (D-MSG-331) | `permissions-money.spec.ts` |
| §7 storefront + admin doors | green | section7-*.spec.ts |
| Stripe mint + confirm=stripe | green (D-MSG-329) | `stripe-pay-refund.spec.ts` |
| Stripe 4242+refund | blocked (D-MSG-330 livemode) | same |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148–#2156; confirm/hold/payment paths green |
| 2026-09-23 | #2157–#2161; Menu green; #2163 merged + production pointer |
| 2026-09-23 | mint+Checkout redirect green; 4242 blocked cs_live_; money-perm + §7 green; #2165 |
