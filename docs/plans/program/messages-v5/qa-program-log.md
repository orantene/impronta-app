# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: `cursor/qa-specs-required-11b1` (Round 2)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2 — required-assert hardening in flight)

## Final summary

**Round 1:** merged as PR [#2128](https://github.com/orantene/impronta-app/pull/2128) (`88f7444ce`). Auto-ack migration applied on prod + qa-journeys. D-MSG-301 on QA host after journeys sync.

**Round 2 (this wave):** delete "green soft". Specs must fail when the path is not exercised. Harness `require*` / `sendPricedOffer` / `sendTimesCard` / `requireClientLink`. Soft silent returns removed from remaining-deep, hold-expired, payment, times, client locale/offer, merge/confirm, ladder-realtime, guest dock, §7 deep, identity-header.

**Still owed after harden PR merges:** hold both directions with live seed; confirm recheck refusal; POS double-book; Stripe pay+refund; capacity; ES/FR hard strings; payment collect path; merge/cancel/refund effects; §7 Messages chip proof; restaurant+salon businesses; permissions; isolation; reload; notifications; hostile data.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Inbox / segments / search / chips / unread | green | `admin/inbox-load.spec.ts` |
| New conversation / composer / tray / add-items / offer | green | admin/* |
| Times send (person+service+slots) | hardening → required card | `admin/times-hold-deep.spec.ts` |
| Times hold after client pick | hardening → required hold language | `admin/remaining-deep.spec.ts` |
| Times hold expiry → next-step | hardening → required "Hold expired" (D-MSG-301) | `admin/hold-expired-next.spec.ts` |
| Payment sheet + mint/outside/collect | hardening → separate required paths | remaining-deep + payment-deep |
| Identity / handover / close lost | green | `admin/identity-handover-lost.spec.ts` |
| File attach + voice control | green | `admin/files-voice.spec.ts` |
| Merge / cancel / confirm sheets | hardening → required confirm; merge skip-if-unseeded | `admin/merge-refund-confirm-deep.spec.ts` |
| Confirm recheck refusal | red until seeded POS race | remaining-deep (sheet only) |
| Next-step diversity + ladder ≥3 families | green | `admin/ladder-12.spec.ts` + `ladder-realtime` |
| Realtime client → admin ≤15s | hardening → required client link + message | `admin/ladder-realtime.spec.ts` |
| Phone happy path items→offer | green | `admin/phone-happy-path-deep.spec.ts` |
| Client offer actions | hardening → required Accept | `client/offer-payment-deep.spec.ts` |
| Client ES/FR + pay page | hardening → required mint + locale scan | `client/locale-pay-deep.spec.ts` |
| POS dock deep + phone bar seam | green (dock load) | `pos/dock-deep.spec.ts` |
| Guest dock + tulala.digital | hardening → required dock open/send | `guest/dock-deep.spec.ts` |
| Parity multi-row harden | green | `parity/harden.spec.ts` |
| §7 surface smokes + a11y + perf | green | `product/section7-smokes.spec.ts` |
| §7 deep doors (storefront/admin) | hardening → required affordances | `product/section7-deep-smokes.spec.ts` |
| §7 capacity/Stripe journeys | pending Round 2 | — |
| Spec required-assert contract | in PR | `_harness.ts` + rewritten deep specs |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-18 | 18 pass / 3 skip | wave 1 smoke |
| 2026-09-20 | deep batch green after fixes | wave 2 |
| 2026-09-20 | remaining specs + D-MSG-301 | wave 3 |
| 2026-09-21 | Round 1 merge #2128 | blockers cleared |
| 2026-09-22 | Round 2 harden specs | required asserts; suite re-run pending |
