# Global Payouts — status, findings & plan (2026-06-04)

QA + build session on taking talent payouts global (USDC / worldwide). This doc is
the committed source of truth (the earlier `global-payouts-migration-plan-2026-06-01.md`
was wiped by a concurrent agent's git clean in the shared checkout). Everything below is
marked **PROVEN** (with evidence) vs **BLOCKED** vs **BUILT (untested live)**.

## TL;DR
- There are **two different Stripe "go global" payout products**, and they are different integrations:
  1. **Connect stablecoin payouts** — what PR #241 targets. Talent links a USDC wallet in
     their **Express Dashboard**; payout rides the existing `transfers.create` rail and Stripe
     auto-converts USD→USDC. Drivable on the sandbox **today** for the rail; the USDC step is
     private-preview.
  2. **Global Payouts v2 (Outbound Payments)** — what the get-started doc describes.
     `FinancialAccount → OutboundPayment → recipient Account + PayoutMethod`, **v2 API**.
     The app had **zero** v2 code; this session built the rail (see below).
- **The real limiter for USDC is Stripe private preview**, not our code. Neither rail can
  end-to-end prove a USDC settlement in test mode.
- **Live (real-money) payouts were NOT executed** and won't be by the agent. Sandbox/test only.

## Stripe account topology (verified)
| Account | Id | Mode | Use |
|---|---|---|---|
| Tulala Digital **sandbox** | `acct_1TdcQn95hTmH6Mbu` | test (USD) | All QA here. MCP connector points here. |
| Tulala Digital **live** | `acct_1TdcQX5C0mUEeRd1` | live (USD) | Production; GP provisioned. **No agent money movement.** |
| MX (retired) | `acct_1Q8V1402cKHAMrWo` | settles MXN | The app's `.env.local` in the shared checkout still points here. |

- The **app's main SDK** (`lib/stripe/client.ts`) is pinned to v1 `apiVersion 2026-04-22.dahlia`.
  Stripe SDK 22.1.0 ships v2 resource files but does **not** wire `stripe.v2.moneyManagement` on
  the stable channel → we call v2 over HTTPS with the preview header instead (see build).

## Global Payouts v2 — PROVEN vs BLOCKED
**PROVEN (live, sandbox key + `Stripe-Version: 2026-05-27.preview`):**
- v2 Money Movement API reachable: `GET /v2/money_management/financial_accounts` → HTTP 200.
- `GET /v2/core/accounts` → HTTP 200; existing recipients visible (Sofía `acct_1TdecR5oVqehJgOx`,
  Luis `acct_1TdpWL9uHyfRVN7B`) with `recipient` config applied.
- **Recipient creation works**: `POST /v2/core/accounts` created a real **Mexico** recipient
  `acct_1TeV3n95hTVInGYt` (`configuration.recipient.applied: true`; requirements returned
  `given_name`+`surname` to activate `bank_accounts.local`).

**BLOCKED (one owner action, currently broken):**
- **No FinancialAccount** (`financial_accounts` → `data: []`) and it is **not API-creatable**
  (`POST` → HTTP 404). It's auto-provisioned only when Global Payouts is **activated in the
  Dashboard**.
- Activation is **paused on the sandbox**: the platform task **"Accept Terms of Service for
  Global Payouts"** is past-due and the Dashboard "Review" button won't accept it (a Stripe
  **sandbox bug**; support engaged 2026-06-04).
- There is **no API to accept the platform GP ToS** (confirmed via docs search; the only
  `tos_acceptance` API is for Issuing *connected* accounts). So we cannot self-unblock — it
  needs Stripe support to fix the sandbox task, then activation provisions the `fa_test_…`.
- Once a FinancialAccount exists, the remaining chain (fund via test ACH → add payout method →
  `OutboundPayment` → settle) is straightforward to drive and prove.

## Connect-stablecoin (PR #241) — PROVEN vs ceiling
**PROVEN (browser, localhost dev, signed in as Sofía — MX, enabled Connect account):**
- The **"Global payouts · USDC" card renders** with the correct **"Available in 🇲🇽 Mexico"**
  badge → eligibility logic works (`getTalentStablecoinEligibility`).
- CTA **"Link a crypto wallet for USDC payouts"** present.

**Ceiling / findings:**
- CTA → `createTalentDashboardLink` → `stripe.accounts.createLoginLink`. This **fails for the
  current sandbox accounts**: Sofía/Luis are `type: none` (Custom, no Express dashboard) →
  HTTP 400 *"does not have access to the Express Dashboard"*. The card shows the graceful error
  *"finish onboarding first."*
- The happy path (CTA opens the Express Dashboard) needs a **fully-onboarded `type: express`
  account**. That **cannot be created via API** — Stripe: *"You cannot accept the Terms of
  Service on behalf of accounts where `controller[requirement_collection]=stripe` (Standard and
  Express)."* Express onboarding (ToS+KYC+bank) must run through Stripe's hosted/embedded flow
  (the app's `ConnectEmbeddedOnboarding`). A real talent who completes onboarding gets a working
  CTA; it can't be headlessly automated.
- **PR #241 does not *route* USDC** — it only deep-links the talent to their Express Dashboard to
  self-configure a wallet + USDC. Actual USDC settlement is **Stripe private preview**.
- Latent eligibility gap: `resolveTalentPayoutCountry` normalizes against the 17-country
  `PAYOUT_COUNTRIES` list, so a talent in a stablecoin-eligible country **not** in that 17-list
  (e.g. TH) would read ineligible. MX/US/AR/CO are fine. Widen the normalize list if needed.

## What was BUILT this session (gated; opt-in/dormant)
Commit `593c46e68` on `feat/talent-global-payouts`. **tsc 0 · test:billing 362 · test:notifications 81 · lint 0.**
- `lib/payments/stripe-v2.ts` — thin fetch client for the v2 (preview) Money Movement API
  (JSON bodies, preview version header, idempotency + Stripe-Context). Keeps the v1 SDK untouched.
- `lib/payments/global-payouts.ts` — `getPrimaryFinancialAccountId`, `isGlobalPayoutsActive`,
  `createOutboundPayment`, `getOutboundPayment`, `outboundPaymentLedgerStatus`.
- `lib/payments/disburse.ts` — `disburse({rail})` router: `connect_transfer` (preserves the exact
  idempotency key + status semantics of the old `payParty`) or `global_payouts` (OutboundPayment).
  Both rails unit-tested.
- `lib/payments/transfers.ts` — `executeBookingTransfers` routes talent legs via the resolved rail
  (`resolvePayoutRail`, **defaults to `connect_transfer`** → GP rail off until a talent is
  provisioned); workspace legs stay on Connect. **Zero behavior change for current bookings**
  (proven by the unchanged `transfers.test.ts`).
- Tests: `disburse.test.ts`, `stripe-v2.test.ts`, `global-payouts.test.ts`.

Commit `7aa41cec9` (gated tsc 0 / test:billing 385 / test:notifications 81 / lint 0; pushed to PR #241):
- migration `20261018000000` — `talent_profiles.crypto_payouts_enabled` (default false; applied + registered to remote Supabase).
- `payout-rail-policy.ts` — `decidePayoutRail` (pure) + `resolveTalentPayoutRail` (DB-backed; short-circuits to Connect before any Stripe call); wired as the default talent-leg resolver in `transfers.ts` (still Connect for everyone until opt-in + GP active + eligible country).
- `webhook-v2.ts` + `app/api/webhooks/stripe-v2/route.ts` — verify v2 thin-event signature (HMAC) + reconcile `booking_payouts` on `outbound_payment.*` (flip leg + resync `payout_lifecycle`); returns 503 until `STRIPE_V2_WEBHOOK_SECRET` is set.
- `global-payouts-onboarding.ts` — `createGlobalPayoutsRecipient`, bank `PayoutMethod` via `outbound_setup_intents`, financial-address get-or-create, `fundFinancialAccountFromBalance` (v1 payout → FA).

## Remaining work to GO LIVE on Global Payouts v2
The rail is now code-complete + gated; what's left is activation, a small UI write, config, and the live proof:
1. **Unblock activation** (owner/Stripe): fix the sandbox GP-ToS task → FinancialAccount provisions.
   Then drive fund → payout method → OutboundPayment → settle and confirm the webhook flips the ledger.
   Every step's code now exists (`global-payouts.ts`, `disburse.ts`, `global-payouts-onboarding.ts`, `webhook-v2.ts`).
2. **Talent opt-in UI write** to set `crypto_payouts_enabled` (resolver + rail are ready; PR #241 already has the talent card).
3. **Wire the v2 webhook destination** for `outbound_payment.*` + set `STRIPE_V2_WEBHOOK_SECRET`.
4. **Not-yet-coded (endpoints undocumented at build time):** sandbox `test_helpers` inbound-credit simulation; the v2 AccountLink for Stripe-hosted recipient collection. `fundFinancialAccountFromBalance` covers sandbox funding via a bypass-pending charge.
5. **USD/USDC**: OutboundPayments are created in USD; Stripe converts to USDC at the recipient once they've linked a USDC wallet (Stripe private preview).
6. **Cutover**: point the app at the US account + re-onboard talent (connected accounts don't migrate). Real-money payouts are run by the owner.

DONE this session (was "remaining"): rail-selection policy + `crypto_payouts_enabled` flag; recipient + bank payout-method onboarding; FinancialAccount funding-from-balance; the v2 `outbound_payment.*` webhook; country gating via `isStablecoinPayoutCountry` in the policy.

## Owner / Stripe dependencies (cannot be done by the agent)
- **Stripe support**: fix the sandbox "Accept ToS for Global Payouts" task so GP can activate.
- **Activation**: click Dashboard → Balances → Financial account → Get started **on the sandbox**.
- **Stablecoin/USDC**: Stripe **private-preview** access (escalation in progress) — gates the USDC
  leg for BOTH rails. Not test-mode-provable until granted.
- **Live payouts**: any real-money OutboundPayment/transfer is run by the owner, not the agent.

## Test artifacts to clean up (sandbox, test mode)
- `acct_1TeV3n95hTVInGYt` (MX v2 recipient), `acct_1TeW6z5HfKdCGhmr` (minimal express) — created
  while probing v2 recipient/Express creation. Safe to delete (`DELETE /v1/accounts/{id}`).
