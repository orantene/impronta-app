# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2163` on main (`8007c1dd`); production still on `#2162` (`6ca4cbbde`) until structural gate promotes  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-23 (Round 2)

## Final summary (Round 2 in progress)

**Merged to main:** `#2148` required asserts → `#2155` confirm/double-book → `#2156` Stripe spec → `#2157` capacity/locale/payment → `#2158` isolation/hostile/reload → `#2161` vocab picker assert → `#2163` isolated-target guard + D-MSG-328/329 + Stripe remint harness.

**Proven green on QA host (required asserts):** hold expired + live; confirm recheck; double-book loser; payment collect / pay-link / outside cash; locale ES; last-place class busy; restaurant Items = Menu (D-MSG-316 live); isolation Messages/link/pay; hostile + reload.

**Stripe on `qa-stripe-r2` (agent-owned):** Messages v5 mount + remint + `provider=stripe` open link + `confirm=stripe` → `checkout.stripe.com` (D-MSG-329 host origin) proven on preview redeploy `dpl_93JLHK…`. **4242+refund blocked (D-MSG-330):** Checkout session id is `cs_live_…` — production `STRIPE_SECRET_KEY` is livemode; test card cannot pay. `STRIPE_SECRET_KEY` restored to production-only after that proof.

**Red (product):** D-MSG-318 POS 13th seat React #310; D-MSG-319 POS foreign-order React #310; D-MSG-312 concurrent confirm TOCTOU.

**Still owed:** Stripe 4242+refund once a `sk_test_` path exists for agent QA (D-MSG-330); wait main CI → production pointer includes D-MSG-329 then re-alias `qa-stripe-r2` to that production deploy; money-perm live staff; notifications; §7 storefront→Messages chip; event/table capacity host re-run.

**Harness:** `assertQaIsolatedTarget` on `prepareJourneysPage` / `openAdminMessages` (Codex P1 on #2155 — refuse Impronta / production Supabase before mutation).


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
| Stripe mint + confirm=stripe | green (preview; D-MSG-329) | `stripe-pay-refund.spec.ts` |
| Stripe 4242+refund | blocked (D-MSG-330 livemode) | same |

## Scenario run log

| Date | Notes |
|---|---|
| 2026-09-22 | #2148–#2156; confirm/hold/payment paths green |
| 2026-09-23 | #2157 on production + journeys; Menu green; #2158 merged |
| 2026-09-23 | #2163 merged; mint+Checkout redirect green; 4242 blocked cs_live_ (D-MSG-330) |
