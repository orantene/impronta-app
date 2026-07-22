# Money Program — Full Execution Plan (Migration Hygiene → Cash Completion → Card Proof → USDC Rail)

**Date:** 2026-07-22 · **Owner:** Oran (product) · **Status:** BINDING — this is the pickup document for the next money sessions.
**Written at the close of the offer-hardening + off-platform-settlement sessions.** Everything below assumes the state of `main` at `55e23d0e5`.

---

## 0. State of the world (what this plan builds on)

Shipped and prod-proven in the preceding sessions (all smoke-green):

- **Off-platform settlement works end to end** (PRs #833/#836/#838). Two rails keyed on `booking_transactions.provider`: `stripe` (needs a payout receiver) vs `manual` (cash/wire/venue_paid/crypto — needs none; platform fee accrues to the workspace off-platform balance). Coordinator has a one-click **"Mark as paid in cash"** on the Payment tab. Hybrid self-coordination authorized (multi-role participants). Architecture doc: `web/docs/off-platform-settlement-architecture-2026-07-14.md`.
- **Offer conversation hardened** (PRs #805–#809, #825–#827): save-trust, calm thread, catalog prefill, coordinator guarantee, `offer.sent.talent` notification (talent sees their own net), cash-cycle proof harness `web/scripts/qa-cash-cycle-e2e.mts`.
- **Money invariant** `talent_net + workspace_fee + platform_fee === gross_charged` holds on both rails; money suite 165/165.

**Verification standard for ALL work below** (owner directive, proven valuable — it caught 3 bugs unit tests missed):
1. Harness-first for money paths (mirror `qa-cash-cycle-e2e.mts`; run against prod DB via the `register-server-only-test.cjs` shim).
2. **Human-test the UI in a real browser + screenshot** — localhost dev server (webpack, symlinked node_modules breaks Turbopack), `/api/dev/signin?email=qa-admin@impronta.test`. Verify the DB state after every UI action, not just the toast.
3. Full-project tsc (`NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`) before merging anything touching money/shell files — scoped tsc has shipped two P0s.
4. Test-data rules: never touch `qa-client-1/2` fixtures beyond rows your run created; talent-direct bookings do NOT accrue to `platform_commission_balances` (don't "reverse" what never accrued — baseline USD = 1080).

---

## PHASE 0 — Supabase migration-history reconciliation — **DONE 2026-07-22 (this PR)**

**Executed + proven:** `db push` runs clean; second push = "Remote database is up to date"; `migration list --linked` = 547 rows, **0 remote-only / 0 local-only**; `db:check` 547/547.

**Corrected diagnosis (the plan below was written before the fix):**
- The 2 "crypto migrations mis-detected as pending" were actually a **timestamp collision**: main carried TWO files per version (`20261018000000_recipient_safety_blocks_reports.sql` + `20261018000000_talent_crypto_payouts_enabled.sql`; same for `20261019000000`). One history row per version exists, so the CLI forever re-tried the twin and died on the duplicate insert. Fix: renamed the crypto pair to fresh timestamps `20260722210335/6` (their SQL is `add column if not exists` — idempotent; push re-applied as no-op skips and recorded history).
- The 7 remote-only versions (`20260531003041…20260613063759`, MCP-applied historically) were materialized as documented no-op placeholder files (`*_applied_via_mcp_placeholder.sql`) — their schema is live; the files exist so the CLI history comparison passes.
- `20261110100000` was a false alarm: it is the deliberately parked `_pending_stripe/*.sql.pending` file (excluded from push by design).

Original plan (for reference):

### (original) PHASE 0 — Supabase migration-history reconciliation *(superseded by the executed fix above)*

**Why first:** `npm run db:push` currently REFUSES to run. During #833 the migration had to be applied through a direct pooler connection. Every future migration (Phase 1 probably, Phase 3 certainly) hits this wall, and the failure mode is the known catastrophic one: code auto-deploys, schema doesn't → silent 500s.

**The drift, precisely:**
- 7 versions exist in remote `supabase_migrations.schema_migrations` with **no local file** on main: `20260531003041, 20260601015117, 20260601201119, 20260602170239, 20260605201344, 20260612191743, 20260613063759` (applied historically via MCP `execute_sql` + manual history rows).
- 2 local files (`20261018000000_talent_crypto_payouts_enabled.sql`, `20261019000000_talent_gp_recipient_account.sql`) are applied remotely but the CLI mis-detects them as pending, then dies on the duplicate history insert.

**How:**
1. In a worktree, run `npx supabase migration list --linked` to get the authoritative local/remote diff.
2. For the 7 remote-only versions: `supabase db pull` to materialize them as local files (preferred — the repo then reflects reality), or commit documented no-op placeholder files if pull output is unusable. Never `--status reverted` them — they ARE applied.
3. For the 2 crypto migrations: `supabase migration repair --status applied 20261018000000 20261019000000` so the CLI stops re-attempting them.
4. Prove: `npm run db:check` green AND `npm run db:push` exits clean as a no-op, from a fresh worktree with no placeplaceholders.
5. Add the resolution to `web/docs/development-workflow.md` + update the `project_supabase_push_protocol` memory.

**Acceptance:** a brand-new trivial migration pushes cleanly with stock `npm run db:push`. **Risk:** LOW (history metadata only — no schema changes). **Owner needed:** no.

---

## PHASE 1 — Cash flow completion  *(M; no owner blockers; highest user-visible value per effort)*

The cash button records the FULL amount in one shot. Real cash deals in Mexico are deposit-first. Close the gaps:

### 1A. Deposit-in-cash
- **What:** when the booking has deposit terms (`deposit_pct`/`deposit_amount_cents`) and no deposit collected, the Payment tab offers **"Mark deposit paid in cash"** (and later "Mark balance paid in cash") instead of only the full-amount button.
- **Where:** `markInquiryPaidInCash` (`_pipeline-actions.ts`) — add a `checkoutType: "deposit" | "balance" | "full"` param and pass it to `createInquiryTransactionDraft` (the 6.3 deposit split already exists there; `markPaid` already flips a deposit txn to `payment_status='partial'` + balance-due card). UI: `machinery-6.tsx` PaymentTab — mirror the existing deposit/full button pair.
- **Acceptance (harness + browser):** deposit-cash → booking `partial`, balance-due card in thread; balance-cash → `paid`/`confirmed`; snapshot stays `cash/efectivo` throughout; invariant holds. **Effort:** M.

### 1B. Instant-book pay-in-person → settled by the cash button
- **What:** instant-book with `payInPerson` already stamps the snapshot cash at creation (#819) and drafts a manual txn. Verify (browser + DB) the Payment-tab cash button completes that booking, and fix any seam. Mostly QA; expect S fixes at most.

### 1C. Client sees the cash settlement
- **What:** confirm the `payment_paid` / balance-due chat cards render correctly for the client/guest thread on a cash settle (amount labels, ES copy "efectivo"). Add the method label to the card payload if missing. **Effort:** S.

### 1D. Method picker (cash / wire / venue-paid)
- **What:** `markInquiryPaidInCash` already accepts any off-platform `method` + `reason`. Add a small dropdown (default cash/efectivo) so wire transfers and venue-paid settle through the same click. **Effort:** S.

---

## PHASE 2 — Stripe card rail live proof — **PROVEN IN TEST MODE 2026-07-22 (this PR)**

**The human-KYC blocker dissolved:** Stripe TEST mode allows a CUSTOM connected account to be fully enabled via API (prefilled test identity + tos_acceptance + test bank 110000000/000123456789) — no owner onboarding needed. `scripts/qa-stripe-card-e2e.mts` proves, on the prod DB + real Stripe test objects:
- test account `payouts_enabled` via API, platform balance funded by a real (test) card charge;
- a card-rail booking's talent leg records **HELD** with no account at pay time;
- stamping the account + `releaseHeldPayouts` → **real transfer lands** (`tr_…`, destination = the talent's account, amount = exact `talent_net` 48500);
- a **payout** (`po_…`, status pending) is created from the connected account to the test bank — money-lands, test-mode equivalent;
- both prod webhook routes (`/api/webhooks/stripe`, `/api/stripe/webhook`) are mounted and reject unsigned (400);
- full cleanup: test account deleted, talent columns restored, all rows removed.

**What remains for LIVE mode is launch ops, not code:** swap `sk_live`, set `STRIPE_ALLOW_LIVE_PAYOUTS=true`, one real talent completes Express KYC, re-run this harness pointed at live (small amount). The code path is proven.

Original plan (reference):

### (original) PHASE 2 — Stripe card-rail live proof  *(M; mostly verification; has OWNER steps)*

The card rail is code-complete but never proven with money movement past the charge. Pre-launch, prove the chain: charge → split → transfer → payout lands.

- **What exists:** `qa-money-loop.mjs` proves a test-mode charge + split arithmetic + that transfers to non-onboarded accounts are correctly refused/held. `STRIPE_ALLOW_LIVE_PAYOUTS=false`; held-payouts release flow exists (memory: `project_held_payouts_release`); prod rail = Connect.
- **Steps:**
  1. **OWNER:** in the Stripe dashboard (test mode), complete Connect onboarding/KYC for one test talent account (I cannot enter credentials or complete KYC — hard rule). Everything else below is autonomous.
  2. Harness: charge a test card for a real booking → `executeBookingTransfers` → assert the transfer reaches the connected account and the payout leg records `payout_sent` with a real `stripe_transfer_id`.
  3. Prove the **held-payout release** path: settle a booking whose talent lacks an account (legs held), then attach the account and release — assert legs flip held → sent.
  4. Webhook path on prod: verify the Stripe webhook route processes `payment_intent.succeeded` → `markPaid` sync on the deployed host (send a test event from the Stripe CLI/dashboard).
  5. Decision memo for the owner: flip `STRIPE_ALLOW_LIVE_PAYOUTS` when ready + what the first real charge should be.
- **Acceptance:** a documented, repeatable run showing money land in a connected test account, held→release proven, webhook proven on prod. **Effort:** M (verification-heavy).

---

## PHASE 3 — USDC / stablecoin rail — **AUDITED 2026-07-22: CODE-COMPLETE + TESTED; blocked only on Stripe-side enablement**

**Correction to this plan's framing:** the "4 owner decisions (provider/chain/conversion/keys)" were already decided and BUILT — the provider is **Stripe**, inside the Connect ecosystem. There is no separate chain/conversion decision: Stripe handles delivery (talent links a wallet, USDC arrives). Two complementary flavors, both on main:

1. **Connect crypto payouts** (owner's stated model): the classic Connect transfer — **proven end-to-end in Phase 2** — with the talent linking a crypto wallet in their Express dashboard and setting **USDC as their payout currency**. Zero app change needed; the login-link helper that drops talents into the Express dashboard already exists (`stripe-connect-talent.ts`).
2. **v2 Global Payouts rail** (for wallet/local-bank recipients outside Connect): `disburse.ts` OutboundPayments from the platform financial account → v2 recipient (`gp_recipient_account_id`), per-talent opt-in `crypto_payouts_enabled`, country eligibility, and the super-admin master switch `platform_settings.active_payout_system` on `/platform/admin/settings`. Onboarding (`global-payouts-onboarding.ts`) creates the v2 core-account recipient + Stripe-hosted collection link. **35/35 rail tests green**; `disburse` + `payout-rail-policy` run in the standing `test:money` suite.

**Probed facts (2026-07-22, test key):** the v2 API is reachable and authorized with the current key, but `/v2/money_management/financial_accounts` is **empty** → `isGlobalPayoutsActive()` = false, and the master switch is `connect`. The rail is dormant purely because Stripe has not provisioned the money-management/Global-Payouts capability on this account.

### Owner activation runbook (the one real step is asking Stripe)
1. **Stripe dashboard:** request/enable **Global Payouts** (money management) and — for the Express-wallet flavor — **crypto payouts** for Connect, if offered for your account. When Stripe provisions it, a financial account appears and `isGlobalPayoutsActive()` flips true automatically (the code polls that endpoint).
2. Flip the master switch on `/platform/admin/settings` → `global_payouts`.
3. Pilot one talent: crypto opt-in (`crypto_payouts_enabled`) → GP onboarding (recipient created, `gp_recipient_account_id` stamped) → small disburse; verify the leg in `booking_payouts` with `payout_rail='global_payouts'`.
4. Going live-money: `sk_live` + `STRIPE_ALLOW_LIVE_PAYOUTS=true` (the guard only bites on live keys).

Original plan (reference):

### (original) PHASE 3 — USDC / stablecoin payout rail  *(L; the strategic program; OWNER decisions gate the start)*

**Grounding (verified 2026-07-22):**
- Branch `feat/usdc-stablecoin-payouts` (`1e2538162`, worktree `~/Desktop/impronta-usdc`) holds a ~384-line spike: **Stripe Connect crypto payouts (preview)** incl. `stripe/webhook-routing.ts` — but it's based on a ~June base and predates the off-platform architecture.
- `main` already has the **global-payouts rail**: `web/src/lib/payments/disburse.ts`, `talent-global-payouts.ts`, `payout-rail-policy.ts`, `transfers.ts`; `talent_profiles.crypto_payouts_enabled` + `gp_recipient_account_id` columns exist (the 2 drifted migrations); `PaymentMethod` includes `crypto` and it's off-platform.

### 3A. Audit + rebase decision (first, S)
Diff the spike against today's main; decide **keep-and-rebase** vs **re-implement on the global-payouts rail**. Recommendation: treat the spike as reference, build on `disburse.ts`/`payout-rail-policy.ts` — that's where the payout architecture lives now, and Stripe's crypto-payout preview availability for MX recipients must be re-verified before betting on it.

### 3B. OWNER decisions (block the build — answer these before any code)
1. **Provider/custody:** Stripe crypto payouts (preview — confirm MX availability + invite) vs Circle programmable wallets vs exchange payout API (e.g. Bitso, MX-native). Each has a different KYC + treasury model.
2. **Chain + asset:** USDC on which network (Solana/Base/Polygon = low fee, vs Ethereum). Wallet UX for talents (self-custody address vs provider-hosted).
3. **Who converts:** does the platform charge fiat and disburse USDC (FX conversion on us), or hold a USDC treasury?
4. Provider account + API keys (owner provisions; keys go into Vercel env, never in chat).

### 3C. MVP scope (once 3B is answered)
USDC is a **payout leg on the existing rails, not a new settlement system**: booking settles (card or cash) → the talent's payout leg disburses in USDC via the provider adapter.
1. **Recipient onboarding:** talent settings surface to register a wallet/recipient → `gp_recipient_account_id`; gate on `crypto_payouts_enabled`.
2. **Disburse adapter:** provider implementation behind `disburse.ts` with idempotency keys, sandbox mode, and explicit ledger entries (`booking_payouts` leg with provider reference).
3. **Policy:** `payout-rail-policy.ts` picks USDC when the talent opted in + booking currency supported; falls back to held otherwise.
4. **Proof:** sandbox harness (mirror the cash harness): settle a booking → USDC payout leg lands in a sandbox wallet → ledger + invariant assertions; then a browser/screenshot pass on the talent Money view.
- **Effort:** L (multiple PRs; probably 1 migration → Phase 0 first). **Never test with real funds until the owner explicitly flips it.**

---

## Order of execution + what closes when

```
PHASE 0 (drift)        ─── first, unconditionally. Everything with a migration depends on it.
PHASE 1 (cash)         ─── next: no owner blockers, direct market value, small surface.
PHASE 2 (card proof)   ─── start its OWNER step (Stripe test KYC) early; harness work can interleave with Phase 1.
PHASE 3 (USDC)         ─── 3A audit any time; the build waits on the 3B owner decisions + Phase 0.
```

**Owner's short list (the only things blocking full autonomy):**
1. Phase 2 step 1 — complete Stripe test-mode Connect KYC for one talent account.
2. Phase 3B — the four USDC decisions (provider, chain, conversion model, keys).
3. Approve the staged CDMX demo offer whenever you want the live demo (inquiry `44b6d1f4`, $3,800, sent).

**Standing docs this plan supersedes/joins:** `off-platform-settlement-architecture-2026-07-14.md` (architecture), `talent-notifications-and-cash-cycle-execution-plan-2026-07-13.md` (fully executed — historical), `offer-conversation-hardening-plan-2026-07-11.md` (fully executed — historical).
