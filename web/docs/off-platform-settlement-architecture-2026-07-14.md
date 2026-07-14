# Off-Platform Settlement Architecture (Cash / Efectivo / Wire / Crypto)

**Date:** 2026-07-14 · **Status:** SHIPPED (migration applied to prod, proven live) · **Author:** engineering (Oran product)

This is the money-spine design for **off-platform** settlement — the default path for the Mexico / cash-first market and the foundation the USDC/stablecoin rail builds on. It documents the model, the three coupled bugs that blocked it (E2), and the fix.

## Two settlement rails

Every booking settles on exactly one rail, marked by **`booking_transactions.provider`**:

| Rail | `provider` | How the client pays | Payout receiver | Platform fee |
|---|---|---|---|---|
| **On-platform** | `stripe` | Card, through the platform (Stripe Connect) | **Required** (`payout_receiver_id` → `payout_accounts`) — the payout routes to a connected account | Skimmed from the Stripe charge |
| **Off-platform** | `manual` | Cash / efectivo / wire / venue-paid / crypto, **directly** to the agency or talent | **None** — the platform routes no money | **Accrued** to the workspace off-platform balance ledger (it's owed, not skimmed) |

`isOffPlatformPaymentMethod(method)` (`commission.ts`) is the semantic predicate: `cash | wire | venue_paid | crypto | other`. `createBookingTransaction` always drafts `provider='manual'`; the Stripe checkout flow promotes it to `provider='stripe'` when it opens a PaymentIntent. A transaction that never touches Stripe stays `manual` — that IS the off-platform signal.

## What "settling cash" means (no money moves through the platform)

1. The commission snapshot is stamped `payment_method='cash'` + `off_platform_reason` (e.g. `efectivo`). The split is still fully recorded.
2. A `provider='manual'` transaction advances `draft → payment_requested → paid`. `paid` records that the cash was received in person; there is no payout leg (no `payout_pending`/`payout_sent`), and zero Stripe calls.
3. The **platform's fee** — which it couldn't skim off a Stripe charge — **accrues to the workspace off-platform balance** (`platform_commission_balances` / `platform_commission_movements`) as money the workspace owes the platform. Proven: Lane B, `1080 → 4080` (+`$30`).
4. In the **talent-direct** lane, the talent already holds the cash (client paid them); they keep the full client price minus the platform's seller cut, and there is no workspace accrual.

Invariant preserved on both rails: `talent_net + workspace_fee + platform_fee === gross_charged`.

## The bug (E2): three coupled blockers made cash impossible

An offer-path booking was **born on-platform and could never become cash**:

1. **`convertToBooking` defaults the snapshot to `payment_method='card'`.**
2. **`markBookingPaymentMethodAction` refused to reclassify** card→cash ("needs a refund-style reversal") — even before any money moved.
3. **The DB trigger `validate_booking_transaction_status_transition` required a `payout_receiver_id` for every advancing status, regardless of rail** — so a cash-only workspace with no connected Stripe account literally could not mark a cash booking paid.

Instant-book dodged this by stamping cash up front (`payInPerson`); the coordinator offer path had no escape. For a cash-first market, this blocked the core flow.

## The fix (shipped)

1. **Migration `20260714161746_off_platform_settlement_rail_aware.sql`** — the receiver requirement is now **rail-aware**: it applies only when `NEW.provider IS DISTINCT FROM 'manual'` (on-platform). Off-platform transactions advance to `paid` with no receiver. Every other guard (transition legality, timestamps, refund rules) is byte-preserved. `IS DISTINCT FROM` keeps a NULL provider on the safe (receiver-required) side.
2. **`markBookingPaymentMethodAction` allows reclassification before settlement.** Re-stamping the rail (card→cash) is safe as long as nothing has settled (booking `payment_status` not `paid`/`partial` and no active transaction in a money-moved state); it re-persists the snapshot with the new method + reason. Only a **settled** booking is blocked (that genuinely needs a refund-style reversal).
3. The downstream (accrual, `applyBookingPaymentSync`, payout gating) already worked receiver-free — verified by the E2E below.

## Proof

`scripts/qa-cash-cycle-e2e.mts` drives the real offer→booking→cash cycle on the prod DB, **with no temp-receiver workaround**, both lanes:
- ✅ off-platform txn advances to `payment_requested` **with no receiver** (rail-aware)
- ✅ `markPaid` → booking `payment_status=paid`, status `confirmed`, zero Stripe transfers
- ✅ money invariant holds; talent protected ($400) in the workspace lane; talent nets $485 in the direct lane
- ✅ workspace off-platform balance accrues the platform fee (Lane B) and is restored to baseline on cleanup

Money suite 165/165. Migration applied to prod and behavior proven live.

## Follow-ups (not in this change)

- **Coordinator UI**: surface a "Mark as paid in cash / efectivo" control in the Messages shell that calls `markBookingPaymentMethodAction(bookingId, 'cash', reason)` then records the cash receipt — the engine now supports it end to end; the button is the remaining UX.
- **E1** (hybrid self-coordination `.maybeSingle()` collision) is tracked separately in the talent-notifications plan.
- Reconcile the pre-existing Supabase migration-history drift (7 remote-only versions + the two crypto migrations) so `db push` runs clean without placeholder files.
