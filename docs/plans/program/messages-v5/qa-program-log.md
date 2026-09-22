# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: `cursor/qa-confirm-pos-11b1` (confirm/POS) · `cursor/qa-specs-required-11b1` merged as [#2148](https://github.com/orantene/impronta-app/pull/2148) → `2705dc324`  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-22 (Round 2)

## Final summary (Round 2 in progress)

**Round 1:** merged [#2128](https://github.com/orantene/impronta-app/pull/2128) (`88f7444ce`). Auto-ack migration on both DBs. D-MSG-301 on QA host.

**Round 2 PR1 (#2148):** required asserts; silent soft-bail removed. **Merged** `2705dc324` (awaiting main CI → production pointer → journeys sync).

**Round 2 PR2 (confirm/POS):** confirm recheck refusal + double-book loser path green on QA host.

| Proven this wave | Defects filed |
|---|---|
| Hold expired next-step both directions | D-MSG-302–309 (see decisions) |
| Payment-deep Accept→Full→pay link→card | D-MSG-309 Full amount required |
| Confirm recheck refusal (conflict sentence, no record) | D-MSG-310 Confirm door = Times card, not tray |
| Double-book loser refuses when slot taken | D-MSG-311 shortfall→generic unavailable; D-MSG-312 concurrent TOCTOU both-win |

**Still owed:** Stripe pay+refund; capacity; ES/FR hard; merge/cancel effects; §7 Messages chip; restaurant+salon; permissions; isolation; hostile data; outside/collect as separate specs; concurrent double-book lock fix (D-MSG-312).

## Checklist

| Area | Status | Spec |
|---|---|---|
| Inbox / segments / search / chips / unread | green | `admin/inbox-load.spec.ts` |
| New conversation / composer / tray / add-items / offer | green | admin/* |
| Times send (person+service+slots) | green (times card after Send) | `admin/times-hold-deep.spec.ts` |
| Times hold after client pick | red until remaining-deep re-run | `admin/remaining-deep.spec.ts` |
| Times hold expiry → next-step | green (expired + live both directions) | `admin/hold-expired-next.spec.ts` |
| Payment sheet + mint/outside/collect | green (pay-link mints Payment card; Full amount — D-MSG-309) | `admin/payment-deep.spec.ts` |
| Identity / handover / close lost | green | `admin/identity-handover-lost.spec.ts` |
| File attach + voice control | green | `admin/files-voice.spec.ts` |
| Merge / cancel / confirm sheets | confirm green; merge skip-if-unseeded | `admin/merge-refund-confirm-deep.spec.ts` |
| Confirm recheck refusal | green (conflict sentence + no record) | `admin/confirm-recheck-refusal.spec.ts` |
| Double-book (slot already taken) | green (loser refuses); concurrent both-win = D-MSG-312 | `admin/pos-double-book.spec.ts` |
| Next-step diversity + ladder | green | ladder-12 + ladder-realtime |
| Realtime client → admin ≤15s | required client link | `admin/ladder-realtime.spec.ts` |
| Client offer / ES/FR / pay | required mint | client/* |
| POS / guest / parity / §7 | required affordances | pos/guest/product |
| Spec required-assert contract | green (#2148 merged) | `_harness.ts` |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-18 | 18 pass / 3 skip | wave 1 smoke |
| 2026-09-20 | deep batch green after fixes | wave 2 |
| 2026-09-20 | remaining specs + D-MSG-301 | wave 3 |
| 2026-09-21 | Round 1 merge #2128 | blockers cleared |
| 2026-09-22 | Round 2 harden; hold+times green | D-MSG-302–306; PR #2148 |
| 2026-09-22 | payment-deep green (Accept→Full→pay link→card) | D-MSG-307–309 |
| 2026-09-22 | #2148 merged `2705dc324` | confirm-recheck + double-book loser green |
