# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: `cursor/qa-messages-v5-11b1` → PR [#2128](https://github.com/orantene/impronta-app/pull/2128)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-20 (wave 2)

## Final summary

**Wave 1:** harness + smoke (18 pass) + D-MSG-300 em-dash fix.  
**Wave 2:** rebased onto main (migration renamed `20261231277000_*` after collision with cards_v5), deep specs for times/payment/identity/files/ladder/realtime/phone/client/POS/guest/parity/§7 smokes.

**Still owed (not green yet):** hold *expiry* after client pick; payment mint on order+Stripe test charge; confirm recheck refusal (POS race); duplicates merge end-to-end; full 12-state ladder proof (sample only); phone pay after client accept; guest cards_v5 toggle matrix; production QA Cursor tenant onboarding; §7 deep overbook/13th-seat/refund-one-ticket journeys.

**Integrator:** merge #2128 when CI green; sync `program/journeys-2026-09` to main; optional `VERCEL_AUTOMATION_BYPASS_SECRET` for this VM.

## Checklist (wave 2)

| Area | Status | Spec |
|---|---|---|
| Inbox / segments / search / chips / unread | green | `admin/inbox-load.spec.ts` |
| New conversation / composer / tray / add-items / offer | green | admin/* |
| Times send (person+service+slots) | green | `admin/times-hold-deep.spec.ts` |
| Times hold expiry after client pick | pending | |
| Payment sheet affordances | green | `admin/payment-deep.spec.ts` |
| Payment link mint + outside paid + collect | pending (needs order target) | |
| Identity / handover / close lost | green | `admin/identity-handover-lost.spec.ts` |
| File attach + voice control | green | `admin/files-voice.spec.ts` |
| Merge / cancel / confirm sheets | green (soft) | `admin/merge-refund-confirm-deep.spec.ts` |
| Confirm recheck refusal | pending | |
| Next-step diversity sample | green | `admin/ladder-realtime.spec.ts` |
| Realtime client → admin ≤15s | green | same |
| Phone happy path items→offer | green | `admin/phone-happy-path-deep.spec.ts` |
| Client offer actions | green | `client/offer-payment-deep.spec.ts` |
| Client ES/FR | deferred (skip when no link) | |
| POS dock deep + phone bar seam | green | `pos/dock-deep.spec.ts` |
| Guest dock + tulala.digital | green | `guest/dock-deep.spec.ts` |
| Parity multi-row | green | `parity/five-states.spec.ts` |
| §7 surface smokes + a11y + perf | green | `product/section7-smokes.spec.ts` |
| §7 deep journeys | pending | |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-18 | 18 pass / 3 skip | wave 1 smoke |
| 2026-09-20 | deep batch green after fixes | times/payment/ladder/realtime/phone/client/parity/§7 |
