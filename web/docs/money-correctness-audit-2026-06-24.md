# Money-spine correctness audit — 2026-06-24

A multi-agent adversarial correctness audit of the money spine (commission,
transfers, payout ledger, webhooks, refunds/disputes). 11 findings raised → **8
confirmed real** by an independent verify pass (3 rejected as already-guarded;
see bottom). This doc records them, triaged by **reachability in current prod**
and **fix safety**, because money changes need owner awareness + live-money QA
(currently deferred to test-mode) and must not be patched blindly.

**Current prod payout rail = Connect** (`active-payout-system.ts`:
`DEFAULT_PAYOUT_SYSTEM = "connect"`; Global Payouts only active when
`platform_settings.active_payout_system === "global_payouts"`). This is the key
triage axis: the GP-rail findings are **latent** until GP is switched on.

---

## A. Global Payouts rail — LATENT (not reachable in prod today; fix BEFORE enabling GP)

Root cause for all three: **`booking_payouts` has no `rail` column**, so a leg's
original rail isn't persisted, and `releaseHeldPayouts()` unconditionally retries
via `stripe.transfers.create()` (Connect). Harmless while prod is Connect-only;
becomes a **P0 double-pay** the moment GP is enabled.

### A1 — P0 · Double payment via rail mismatch on held-leg release
- `web/src/lib/payments/booking-payouts-ledger.ts:181-275` (`releaseHeldPayouts`)
- Scenario: GP leg fails `skipped_no_account` → held. Later `releaseHeldPayouts()`
  creates a **Connect** transfer (`transfer_…` key). A subsequent
  `executeBookingTransfers` retry routes to **GP** (`op_…` key, different key →
  not deduped) and also succeeds. Talent paid **twice** (once Connect, once GP).
- Fix: add `booking_payouts.payout_rail`; in `releaseHeldPayouts` route the retry
  through the original rail via `disburse()` (reuses the rail-specific idempotency
  key) instead of calling `stripe.transfers.create()` directly. Migration + design.

### A2 — P1 · GP legs can never be retried via `releaseHeldPayouts`
- Same file/lines. `releaseHeldPayouts` only knows Connect; a held GP leg is
  retried as a Connect transfer to a v2 account id → fails forever → talent never
  paid, funds stranded on platform. Same fix as A1 (rail-aware release).

### A3 — P1 · Missing `rail` field on `PayoutLeg` / ledger
- `booking-payouts-ledger.ts:27-42` (type) + migration
  `20260601014922_booking_payouts_ledger.sql`. `disburse()` returns `outcome.rail`
  but `recordPayoutLeg` persists only `transferId`, discarding the rail. This is
  the root of A1/A2. Fix: persist `outcome.rail`.

**Verdict:** one coherent fix (rail column + rail-aware release). Owner-gated,
needs a migration; **must land before flipping `active_payout_system` to
`global_payouts`.** Spawned as a task.

---

## B. Commission rounding — BY DESIGN / negligible (do NOT "fix")

`commission.ts` splits the platform take into client-surcharge + seller-deduction
and rounds each half independently. Against a "round the whole take" reading this
drifts by **±1¢** — but ONLY at tiny subtotals (< ~$10) combined with non-default
low take-rates (5–10 bps; the default is 500 bps, which is exact on realistic
amounts). Critically, the existing **characterization tests pin this behavior as
intended** (`commission.test.ts:604`, `commission.characterization.test.ts`
document the 333→166/167 split as expected), and the lane-sum invariant
(`commission.ts:356`) guarantees lanes always sum to the gross charged — no money
is lost from the booking total.

- B1 P1 — split rounding loss, odd bps (`commission.ts:291-292`)
- B2 P1 — split over-collect, even bps (`commission.ts:291-292`)
- B3 P2 — `Math.floor` vs `Math.round` asymmetry in the even-split default (`commission.ts:287`)

**Verdict:** documented design choice, ≤1¢ at non-default edge configs. Changing
it would break the pinned characterization tests for zero practical benefit and
real risk. **Leave as-is** unless the commission spec is formally re-decided; if
so, do it spec-first with the test suite updated deliberately.

---

## C. Prod-reachable logic bugs — ACTIONABLE (owner-aware, with tests)

### C1 — P1 · `payment_status` can regress `paid` → `partial` (deposit/balance race)
- `web/src/lib/bookings/transactions.ts:644-661`
- The deposit `markPaid` writes `payment_status:'partial'` via an **unconditional**
  `.update().eq("id", bookingId)`. On concurrent deposit+balance webhook delivery,
  if the balance update (`'paid'`) lands first, the deposit's later update
  **regresses** the booking to `'partial'`/`'deposit_paid'`. Consequence: a fully
  paid booking shows as partially paid — talent earnings + workspace financials
  read wrong. No money is mis-moved (display/state only).
- **Reachable in prod** (Connect rail, deposit+balance flow exists).
- Fix (low-risk, monotonic): guard the deposit update so it can't overwrite a
  terminal state, e.g. `.not("payment_status", "in", "(paid,refunded,cancelled)")`
  on the deposit branch. Cannot move money; worst case skips a `deposit_paid_at`
  write in the rare race. Needs a regression test — but markPaid booking-sync is
  integration-level (needs a DB/mock; `test:commission-pipeline` is a live-DB
  no-op in CI), so this wants either a small pure-helper extraction to unit-test
  the monotonic decision, or a deliberate integration test. Owner-aware fix.

### C2 — P1 · Partial-refund clawback ignores held workspace legs (under-claw)
- `web/src/lib/payments/refunds.ts:317-319` + `booking-payouts-ledger.ts:655`
- `reconcilePartialRefund` derives the workspace clawback from **commission
  snapshots** (no ledger-status filter), but `reverseBookingPayouts` only reverses
  legs with `status='transferred'`. A **held** workspace leg is included in the
  math but skipped on reversal → computed clawback isn't actually reversed; the
  held leg lingers. Reconciliation mismatch (not direct money loss; funds stay on
  platform). Reachable only when a workspace leg is held (workspace not onboarded)
  AND a partial refund is issued — rare.
- Fix: filter the clawback computation to transferred legs (join the ledger status
  before computing), or escalate the held portion to manual. Needs care + a test.

---

## D. Rejected (verify pass refuted — recorded so they aren't re-raised)

- **Base-fee cap double-round** (`commission.ts:315-321`) — `min(round(A),round(B))
  == round(min(A,B))` holds when capping; arithmetically a non-issue.
- **NaN balance not filtered** (`commission.ts:433-436` `balanceSummary`) — real
  quirk but `balanceSummary` is **dead in prod** (test-only export); pinned as a
  known quirk in a characterization test.
- **Empty-currency webhook bypass** (`webhook-handler.ts:202-211`) — the
  `booking_transactions.currency` column is `NOT NULL DEFAULT 'USD'`, so the
  amount/currency mismatch guard always fires (`"usd" !== ""`) before `markPaid`.

---

## Recommended priority
1. **A (GP rail)** — before enabling Global Payouts. Latent P0; cheap to get wrong
   at launch. One migration + rail-aware release.
2. **C1 (payment_status race)** — real prod state bug; low-risk monotonic guard +
   test.
3. **C2 (partial-refund held leg)** — rare reconciliation edge; fix with the GP/
   ledger work.
4. **B** — no action (documented design).
