# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: `cursor/qa-specs-required-11b1` → PR [#2148](https://github.com/orantene/impronta-app/pull/2148)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2 — required-assert PR in flight)

## Final summary (Round 2 in progress)

**Round 1:** merged [#2128](https://github.com/orantene/impronta-app/pull/2128) (`88f7444ce`). Auto-ack migration on both DBs. D-MSG-301 on QA host.

**Round 2 PR1 (#2148):** required asserts; silent soft-bail removed. Suite now fails when path not exercised.

| Proven this wave | Defects filed |
|---|---|
| Hold expired next-step (D-MSG-301) on seeded inquiry after clearing Lost | D-MSG-302 Lost rows refuse Continue-to-offer |
| Times send → times card on confirmed-identity inquiry | D-MSG-303 empty slots without person iteration |
| Confirm sheet opens when door present | D-MSG-304 Lost short-circuits Hold expired (fixed) |
| | D-MSG-305 Continue-to-offer opens empty offer |
| | D-MSG-306 identity_unconfirmed on fresh draft times |
| | D-MSG-307 sendPricedOffer soft-passed without offer card |

**Still owed:** payment mint with client Accept (D-MSG-307 fix in flight); POS double-book; Stripe pay+refund; capacity; ES/FR hard; merge/cancel effects; §7 Messages chip; restaurant+salon; permissions; isolation; hostile data.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Inbox / segments / search / chips / unread | green | `admin/inbox-load.spec.ts` |
| New conversation / composer / tray / add-items / offer | green | admin/* |
| Times send (person+service+slots) | green (times card after Send) | `admin/times-hold-deep.spec.ts` |
| Times hold after client pick | red until remaining-deep re-run | `admin/remaining-deep.spec.ts` |
| Times hold expiry → next-step | green (`Hold expired` title) | `admin/hold-expired-next.spec.ts` |
| Payment sheet + mint/outside/collect | red (D-MSG-307 — require offer card before Accept) | payment-deep + remaining-deep |
| Identity / handover / close lost | green | `admin/identity-handover-lost.spec.ts` |
| File attach + voice control | green | `admin/files-voice.spec.ts` |
| Merge / cancel / confirm sheets | confirm green; merge skip-if-unseeded | `admin/merge-refund-confirm-deep.spec.ts` |
| Confirm recheck refusal | red — needs POS race seed | remaining-deep |
| Next-step diversity + ladder | green | ladder-12 + ladder-realtime |
| Realtime client → admin ≤15s | required client link | `admin/ladder-realtime.spec.ts` |
| Client offer / ES/FR / pay | required mint | client/* |
| POS / guest / parity / §7 | required affordances | pos/guest/product |
| Spec required-assert contract | in #2148 | `_harness.ts` |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-18 | 18 pass / 3 skip | wave 1 smoke |
| 2026-09-20 | deep batch green after fixes | wave 2 |
| 2026-09-20 | remaining specs + D-MSG-301 | wave 3 |
| 2026-09-21 | Round 1 merge #2128 | blockers cleared |
| 2026-09-22 | Round 2 harden; hold+times green | D-MSG-302–306; PR #2148 |
