# Messages v5 QA program log

Host: `https://staging-qa-journeys.tulala.digital`  
Branch: `cursor/qa-messages-v5-11b1` → PR [#2128](https://github.com/orantene/impronta-app/pull/2128)  
Isolated DB: `fxlankepwnvelxjrahwk`  
Updated: 2026-09-21 (rebased onto main; PR ready for review)

## Final summary

**Wave 1:** harness + smoke (18 pass) + D-MSG-300 em-dash fix.  
**Wave 2:** deep specs for times/payment/identity/files/ladder/realtime/phone/client/POS/guest/parity/§7 smokes.  
**Wave 3:** remaining plan rows + **D-MSG-301** holdExpiresAt wiring; auto-ack migration applied on prod + qa-journeys.  
**2026-09-21:** rebased onto `main` (kept D-MSG-225 deep-link from main); PR #2128 marked ready for review.

**Agent-blocked (human only):** merge #2128; sync `program/journeys-2026-09` so D-MSG-301 is live on QA host.

**After human merge+sync, agent can:** re-prove hold-expired next-step; push POS double-book / Stripe / capacity journeys where fixtures allow.

## Checklist

| Area | Status | Spec |
|---|---|---|
| Inbox / segments / search / chips / unread | green | `admin/inbox-load.spec.ts` |
| New conversation / composer / tray / add-items / offer | green | admin/* |
| Times send (person+service+slots) | green | `admin/times-hold-deep.spec.ts` |
| Times hold after client pick | green (signal) | `admin/remaining-deep.spec.ts` |
| Times hold expiry → next-step | code shipped (D-MSG-301); needs QA deploy | same |
| Payment sheet + mint/outside/collect | green soft | `admin/remaining-deep.spec.ts` |
| Identity / handover / close lost | green | `admin/identity-handover-lost.spec.ts` |
| File attach + voice control | green | `admin/files-voice.spec.ts` |
| Merge / cancel / confirm sheets | green (soft) | `admin/merge-refund-confirm-deep.spec.ts` |
| Confirm recheck refusal | soft (sheet+POS tab) | `admin/remaining-deep.spec.ts` |
| Next-step diversity + ladder ≥3 families | green | `admin/ladder-12.spec.ts` + `ladder-realtime` |
| Realtime client → admin ≤15s | green | `admin/ladder-realtime.spec.ts` |
| Phone happy path items→offer | green | `admin/phone-happy-path-deep.spec.ts` |
| Client offer actions | green | `client/offer-payment-deep.spec.ts` |
| Client ES/FR + pay page | green soft (link seam; offer-payment-deep covers when `/c/` present) | `client/locale-pay-deep.spec.ts` + `offer-payment-deep` |
| POS dock deep + phone bar seam | green | `pos/dock-deep.spec.ts` |
| Guest dock + tulala.digital | green | `guest/dock-deep.spec.ts` |
| Parity multi-row harden | green | `parity/harden.spec.ts` |
| §7 surface smokes + a11y + perf | green | `product/section7-smokes.spec.ts` |
| §7 deep doors (storefront/admin) | green soft | `product/section7-deep-smokes.spec.ts` |
| §7 capacity/Stripe journeys | deferred to e2e/journeys | — |
| Human merge + journeys sync | pending | integrator |

## Scenario run log

| Date | Result | Notes |
|---|---|---|
| 2026-09-18 | 18 pass / 3 skip | wave 1 smoke |
| 2026-09-20 | deep batch green after fixes | wave 2 |
| 2026-09-20 | remaining specs + D-MSG-301 | wave 3 |
