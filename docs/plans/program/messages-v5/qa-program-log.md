# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2163` on main + production (`8007c1dd`); `#2165` open (D-MSG-330–336)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-23 (Round 2)

## Final summary (Round 2 in progress)

**Merged to main:** `#2148` → `#2155` → `#2156` → `#2157` → `#2158` → `#2161` → `#2163` (isolated-target + D-MSG-328/329). Production pointer at `8007c1dd`; `qa-stripe-r2` re-aliased to production deploy `dpl_7UXH8f…`. `STRIPE_SECRET_KEY` production-only (confirmed).

**Proven green on QA host:** hold expired + live; confirm recheck; double-book loser; payment collect / pay-link / outside cash; locale ES; last-place class busy; restaurant Items = Menu; isolation Messages/link/pay; hostile + reload; §7 shallow + deep; money-perm Refund hidden (D-MSG-331); event door sold-out + Messages door tier disabled (D-MSG-332); table overbook Fully booked + Tables chip absent (D-MSG-333); IncomingToast + shell notifications hub (D-MSG-334); **Confirm + Merge card + Paid payment card required asserts (D-MSG-335/336)**; appointment double-book refusal; ladder realtime client reply.

**Stripe on `qa-stripe-r2`:** mint + `confirm=stripe` → Checkout proven (D-MSG-329). **4242+refund blocked (D-MSG-330):** `cs_live_…` — need `sk_test_`.

**Still owed:** merge `#2165` when CI green; 4242 once test key exists.

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
| Event tier sold-out | green (D-MSG-332) | `capacity/event-tier-sold-out.spec.ts` |
| Table overbook | green (D-MSG-333) | `capacity/table-overbook.spec.ts` |
| Restaurant Menu | green (D-MSG-316) | `vocabulary-restaurant.spec.ts` |
| Isolation Messages/link/pay | green (#2158) | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign | red (D-MSG-319) | same |
| Hostile + reload | green | isolation/* |
| Money-perm live staff | green (D-MSG-331) | `permissions-money.spec.ts` |
| §7 storefront + admin doors | green | section7-*.spec.ts |
| Notifications IncomingToast + hub | green (D-MSG-334) | `admin/notifications.spec.ts` |
| Merge / Confirm / Paid card required | green (D-MSG-335/336) | `admin/merge-refund-confirm*.spec.ts` |
| Appointment double-book refuse | green | `capacity/appointment-double-book.spec.ts` |
| Stripe mint + confirm=stripe | green (D-MSG-329) | `stripe-pay-refund.spec.ts` |
| Stripe 4242+refund | blocked (D-MSG-330 livemode) | same |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148–#2156; confirm/hold/payment paths green |
| 2026-09-23 | #2157–#2161; Menu green; #2163 merged + production pointer |
| 2026-09-23 | mint+Checkout redirect green; 4242 blocked cs_live_; money-perm + §7 green; #2165 |
| 2026-09-23 | event+table capacity green (D-MSG-332/333); qa-stripe-r2 still on dpl_7UXH8f |
| 2026-09-23 | notifications IncomingToast + hub popover green (D-MSG-334) |
| 2026-09-23 | merge soft→required; D-MSG-336 matchCustomers identity-key fix; merge card green |
