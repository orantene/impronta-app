# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: Round 2 — `#2165` merged to main (`68f9eef2a`, D-MSG-330–337); production pointer advances on green CI  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-23 (Round 2 — CLEAN)

## Final summary (Round 2 — CLEAN)

**Merged to main:** `#2148` → `#2155` → `#2156` → `#2157` → `#2158` → `#2161` → `#2163` → **`#2165`** (D-MSG-330–337). Squash commit `68f9eef2a`. `STRIPE_SECRET_KEY` production-only (confirmed).

**Proven green on QA host:** hold expired + live; confirm recheck; double-book loser; payment collect / pay-link / outside cash; locale ES; last-place class busy; restaurant Items = Menu; isolation Messages/link/pay; hostile + reload; §7 shallow + deep; money-perm Refund hidden (D-MSG-331); event door sold-out + Messages door tier disabled (D-MSG-332); table overbook Fully booked + Tables chip absent (D-MSG-333); IncomingToast + shell notifications hub (D-MSG-334); **Confirm + Merge card + Paid payment card required asserts (D-MSG-335/336)**; appointment double-book refusal; ladder realtime client reply; context-panel / new-conversation / POS dock required.

**Stripe on `qa-stripe-r2`:** mint + `confirm=stripe` → Checkout proven (D-MSG-329). **4242+refund blocked (D-MSG-330):** `cs_live_…` — need `sk_test_` on agent QA path (does not block CLEAN).

**Locale (D-MSG-337):** client `?lang=es|fr` proven on agent-host preview (`qa-stripe-r2` → `dpl_E79aQPv…` with `NEXT_PUBLIC_MESSAGES_V5` + `GUEST_COOKIE_SECRET`). Evidence: `remain-client-locale-es.jpg` (**Aceptar esta oferta**), `remain-client-locale-fr.jpg` (**Accepter cette offre**). Offer accepted on agent tenant after Accept click.

**Still owed (non-blocking):** 4242+refund once `sk_test_` exists. Forever-skip client placeholders removed — covered by `*-deep` + locale-pay-deep.

**Red (product, logged):** D-MSG-312 concurrent confirm TOCTOU (remaining hole: offer with no reservation stamp — Round 3 Job 4). D-MSG-318 / D-MSG-319 POS React #310 closed in Round 3 Job 1 (`fix/msg-310-pos-remount`): cause was `page.tsx` mode-fill `redirect()`, not sell/chooser hooks.


## Checklist

| Area | Status | Spec |
|---|---|---|
| Spec required-assert | green (#2148) | `_harness.ts` |
| Hold expired both ways | green | `hold-expired-next.spec.ts` |
| Payment pay-link / collect / outside | green | payment-*.spec.ts |
| Confirm / double-book loser | green (#2155) | confirm / pos-double-book |
| Class last-place busy | green | `capacity/class-seat-limit.spec.ts` |
| Class 13th POS | fixed Round 3 Job 1 (D-MSG-318/412) | same — #310 was mode `redirect()`, not capacity |
| Event tier sold-out | green (D-MSG-332) | `capacity/event-tier-sold-out.spec.ts` |
| Table overbook | green (D-MSG-333) | `capacity/table-overbook.spec.ts` |
| Restaurant Menu | green (D-MSG-316) | `vocabulary-restaurant.spec.ts` |
| Isolation Messages/link/pay | green (#2158) | `isolation/cross-tenant.spec.ts` |
| Isolation POS foreign | fixed Round 3 Job 1 (D-MSG-319/412) | same — line still hidden; #310 gone |
| Hostile + reload | green | isolation/* |
| Money-perm live staff | green (D-MSG-331) | `permissions-money.spec.ts` |
| §7 storefront + admin doors | green | section7-*.spec.ts |
| Notifications IncomingToast + hub | green (D-MSG-334) | `admin/notifications.spec.ts` |
| Merge / Confirm / Paid card required | green (D-MSG-335/336) | `admin/merge-refund-confirm*.spec.ts` |
| Appointment double-book refuse | green | `capacity/appointment-double-book.spec.ts` |
| Context panel Client/Items/Money | green | `admin/context-panel.spec.ts` |
| New conversation Start → thread | green | `admin/new-conversation.spec.ts` |
| POS messages dock | green | `pos/dock.spec.ts` |
| Client ES/FR `?lang=` | green (D-MSG-337) | `client/locale-pay-deep.spec.ts` |
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
| 2026-09-23 | context-panel / new-conversation / POS dock soft→required |
| 2026-09-23 | D-MSG-337 `?lang=` on `/c/t`; ES/FR Accept proven on qa-stripe-r2 preview; #2165 rebase onto main |
| 2026-09-23 | **#2165 squashed to main** (`68f9eef2a`); Round 2 Final summary → **CLEAN** (4242 blocked; reds 318/319/312) |
