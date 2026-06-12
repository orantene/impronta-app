# Stripe — Consolidated Completion Brief & Pending-Work Audit

**Date:** 2026-05-29
**Owner:** orantene@gmail.com
**Purpose:** Single source of truth that consolidates every Stripe ask scattered
across multiple agent chats. One audit of what's done / pending / decided, plus a
pasteable agent prompt + test playbook at the bottom. If you find Stripe work not
covered here, fold it into the right section rather than spinning a parallel effort.

> **How this doc is organized**
> - **§0–§3** = the audit (honest status + the punch list, with file:line).
> - **§4–§5** = operational setup (Stripe Dashboard / Connect / live-mode cutover).
> - **§6** = the test & QA playbook.
> - **§7–§8** = coordination, blockers, and a reference index.
> - **Appendix** = a self-contained prompt you can paste to a single agent.

---

## 0. TL;DR — honest status

The Stripe **code** is ~80% built and far more complete than "it's stubbed" suggests.
Almost every money path has working code; the gaps are (a) **one correctness landmine**
(duplicate webhook routes + duplicate Stripe client), (b) **one genuinely missing
feature** (talent payout *execution*), (c) a handful of **log-only events** to wire,
and (d) the **operational Dashboard/Connect/live-mode setup** — which the user has
explicitly deferred until "we're ready to test money."

- ✅ **Subscriptions (all 3 products) — code complete.** Workspace (Studio/Agency
  self-serve, Network sales-assisted), Talent (Pro/Portfolio), Client trust
  (verification + balance top-up). Checkout + billing portal + DB sync all wired.
- ✅ **Connect onboarding — code complete for BOTH agency and talent** (Express
  accounts, onboarding links, status snapshot sync). *Note: this is newer than the
  15-day-old memory that said talent onboarding was unbuilt — it now exists.*
- ✅ **Commission → application fee — wired.** `getApplicationFeeForBooking` reads the
  per-participant `booking_commission_snapshot`; `startInquiryCheckout` routes a Direct
  Charge to the agency's Connect account with `application_fee_amount`.
- ✅ **Booking money — two flows, both wired (in code):** the `booking_transactions`
  invoice (Checkout Session → `markPaid`) and the `agency_bookings` deposit
  (PaymentIntent via `bank-link.ts` → `payment_intent.succeeded`).
- ✅ **DB schema — fully applied.** `npm run db:check` is GREEN: all 382 local
  migrations are live on remote Supabase, including every payment-related one. **No
  `db:push` needed.**
- ✅ **Billing/payment notifications — code complete (Slice 15.4), dormant until
  `RESEND_API_KEY`.** Plan up/down/cancel, dunning, payment receipt, payout settled.
- 🔴 **P0 correctness landmine:** TWO live webhook routes + TWO `getStripe` singletons
  with overlapping-but-divergent event handling; only one route is idempotent; the ops
  script registers only one URL. As-is, whichever route isn't registered, its flows die
  silently. **§2.**
- 🟠 **Genuinely NOT built:** talent payout *transfer execution* (talent share never
  actually leaves the agency/platform account). **§3.1.**
- 🟠 **Log-only events to wire:** `payout.*`, `charge.dispute.created`,
  `customer.subscription.trial_will_end`, `payment_intent.payment_failed`. **§3.3.**
- 🟡 **Intentionally sales-led / deferred (not bugs):** client *premium subscription*
  self-serve checkout (§3.7), Network plan self-serve (§3.7), shortlist paid feature.
- 🟡 **Platform-admin billing dashboards show placeholder data** ("Phase 8"). **§3.6.**
- 🐛 **Two known commission bugs** pinned in skipped tests. **§3.9.**
- ⏸️ **OPS deferred by the user:** Dashboard/Connect config + live-mode cutover. **§4–§5.**
- 🗺️ **NEW (2026-05-29) — all in-flight money work reconciled into ONE plan.** 12 overlapping
  branches (Claude `feat/*` + Codex `codex/*`), **none yet merged to `main`**, mapped with a
  file-level conflict matrix, canonical-per-cluster decisions, and a sequenced merge order —
  then the net-new code gaps and the user-gated ops. **§9 is the master "run it to completion"
  plan + the decisions I need from you.**

---

## 1. What's already built — DO NOT REBUILD (verify, then extend)

### Stripe library — `web/src/lib/stripe/`
- `client.ts` — `getStripe()` / `isStripeConfigured()`. `server-only`. Returns null
  without `STRIPE_SECRET_KEY` → everything degrades to no-op/mock. API `2026-04-22.dahlia`.
- `price-ids.ts` — `getWorkspacePriceId(plan,interval)`, `getTalentPriceId(plan,interval)`.
  Reads `STRIPE_PRICE_*` via `process.env[key]`; returns null when unset. `network`
  refuses self-serve unless `STRIPE_PRICE_NETWORK_*` is set. Has `price-ids.test.ts`.
- `utils.ts` — `deriveAppBaseUrl()`, `mapStripeStatus(raw)→AllowedStatus`
  (canceled→cancelled, unpaid→past_due, unknown→incomplete).
- `workspace-billing.ts` — `getOrCreateStripeCustomer`, `createWorkspaceCheckoutSession`,
  `createBillingPortalSession`, `syncStripeSubscriptionToDb` (upserts
  `workspace_subscriptions` + `agencies.plan_tier` + seat limits {free:5,studio:50,
  agency:200,network:null} + `stripe_customers`), `loadWorkspaceSubscriptionState`.
- `talent-billing.ts` — full Pro/Portfolio lifecycle (`talent_stripe_customers`,
  `talent_subscriptions`, `talent_profiles.talent_plan_key`); has out-of-order-webhook
  guard (Audit H2).
- `client-billing.ts` — client verification ($5, sets `client_trust_state.verified_at`),
  balance top-up ($100/$250/$500 → `client_balance_ledger` + `funded_balance_cents`), and
  refund reconciliation (idempotent on payment_intent_id+charge_id).

### Payments / Connect — `web/src/lib/payments/`
- `stripe-checkout.ts` — **its own** `getStripe()` (singleton #2, no `server-only`) +
  `createCheckoutSessionForTransaction` (Direct Charge to `connectedAccountId` with
  `application_fee_amount` when Connect enabled, else single-account; mock mode without key).
- `stripe-connect.ts` — agency Express lifecycle: `createOrGetConnectedAccount`,
  `createOnboardingLink`, `createDashboardLink`, `refreshAccountStatus`,
  `persistAccountSnapshot`, `findAgencyByStripeAccountId`, `disconnectAccount`,
  `canRouteCheckoutsToAgency`, `getApplicationFeeForBooking` (live fee path),
  `getApplicationFeeForAgency` (**@deprecated, returns 0**). Account state mirrored on
  `agencies.stripe_account_id/_status/_charges_enabled/_payouts_enabled/_details_submitted/_account_synced_at`.
- `stripe-connect-talent.ts` — talent Express onboarding: `createOrGetTalentConnectedAccount`,
  `createTalentOnboardingLink`, `persistTalentAccountSnapshot`,
  `getTalentConnectedAccountSnapshot`, `findTalentByStripeAccountId`,
  `canRouteTransfersToTalent`. Mirror columns on `talent_profiles`. **Onboarding only —
  no transfer execution (see §3.1).**
- `stripe-talent-subscription.ts` — `handleTalentStripeSubscriptionEvent(event)` mirrors
  talent subscription events to DB.

### Booking transactions / commission
- `web/src/lib/bookings/transactions.ts` — state machine
  draft→payment_requested→(pending→)paid→payout_pending→payout_sent (+cancelled/refunded/
  disputed/failed). `markPaid`/`markPayoutSent` already emit Slice 15.4 notifications.
- `web/src/lib/bookings/commission.ts` — plan-tier fee bps (free 0 / studio 1100 / agency
  1750 / network 1750 "same as agency for now").
- `web/src/lib/billing/commission.ts` — pure 3-lane resolver (platform/workspace/talent),
  22/22 unit tests.
- `web/src/lib/server-actions/client-pipeline.ts` → `startInquiryCheckout` (client-facing
  kickoff: loads booking+txn, decides Connect routing, computes app fee, creates session).
- `web/src/lib/server-actions/bank-link.ts` — Stripe Financial Connections: bank SetupIntent
  (ACH/SEPA), list bank accounts, `createDepositPaymentIntent` for `agency_bookings` deposits.
- `web/src/lib/server-actions/payment-methods.ts` — list / setup / set-default / detach cards.
- `web/src/lib/server-actions/admin-stripe-connect.ts` — server actions that expose the
  agency Connect lifecycle to the Account UI (no standalone API routes for these).

### UI surfaces (wired — degrade to "coming soon" copy only when Stripe unconfigured)
- Workspace: `admin/account/page.tsx`, `stripe-billing-actions.ts`, `BillingActionButtons.tsx`.
- Talent: `talent/settings/TalentSubscriptionShell.tsx` renders real `<UpgradeButton>` when
  `stripeEnabled`; the line 394 "Pro and Portfolio upgrades coming soon." is the
  `!stripeEnabled` fallback, **not** a gated backend.
- Client trust: `client/settings/ClientTrustShell.tsx` renders `<TopupButtons>` when
  `stripeEnabled`; line 408 "Account verification coming soon." is the same fallback.
- Payouts: `admin/payouts/page.tsx` (Connect settings), `talent/trust/page.tsx`.

### Notifications (Slice 15.4 — shipped, dormant until `RESEND_API_KEY`)
Plan upgrade/downgrade/cancel, payment failed (dunning), payment received (client receipt +
workspace alert), talent payout settled. Fire-and-forget; no-op without the key.

### Env contract — `web/.env.example` lines ~62–76
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_{STUDIO,AGENCY,NETWORK}_{MONTHLY,ANNUAL}`,
`STRIPE_PRICE_TALENT_{PRO,PORTFOLIO}_{MONTHLY,ANNUAL}`.
Per memory (verify in Vercel): the 2 config keys + 8 price IDs are already set in Vercel
**production in TEST mode**; the 2 `NETWORK` keys are intentionally blank (sales-assisted).

---

## 2. 🔴 P0 — the duplicate-webhook / duplicate-client landmine (decide + fix FIRST)

There are **two live webhook routes** *and* **two `getStripe` singletons**. This must be
resolved before any live testing or money will be dropped silently.

### 2a. Two Stripe client singletons
| Definition | File | Notes |
|---|---|---|
| #1 | `src/lib/stripe/client.ts` | has `server-only`; paired with `isStripeConfigured()` |
| #2 | `src/lib/payments/stripe-checkout.ts` | no `server-only`; no companion |

Both pin API `2026-04-22.dahlia`. The billing modules + Route A use #1; `stripe-connect.ts`
and Route B use #2. So a single request can spin up two `Stripe` instances. **Consolidate to
#1** (`server-only`) and re-export from `stripe-checkout.ts` for back-compat, or migrate
importers.

### 2b. Two webhook routes, overlapping events, asymmetric idempotency
| | Route A — `src/app/api/stripe/webhook/route.ts` | Route B — `src/app/api/webhooks/stripe/route.ts` |
|---|---|---|
| Client singleton | #1 (`lib/stripe/client`) | #2 (`lib/payments/stripe-checkout`) |
| Idempotency | ✅ `stripe_processed_events` claim (route.ts:91–119) | ❌ none |
| `checkout.session.completed` | subscription / client_verification / client_balance_topup (by `metadata.checkout_type`) | **booking_transactions → `markPaid`** (by `client_reference_id` / `metadata.transaction_id`) |
| `customer.subscription.updated/deleted` | ✅ via `routeSubscriptionEvent` (canonical sync fns) | ⚠️ **duplicate** direct `.update()` + downgrade to free |
| `invoice.payment_failed` | ✅ routes subscription | ⚠️ **duplicate** sets `workspace_subscriptions.status='past_due'` |
| `invoice.payment_succeeded` | — | log-only (dev only) |
| `charge.refunded` | ✅ `syncClientBalanceRefundToDb` | — |
| `charge.dispute.created` | ⚠️ **log-only** (route.ts:277) | — |
| `customer.subscription.trial_will_end` | ⚠️ **log-only** (route.ts:286) | — |
| `account.updated` | ✅ agency + talent snapshot | ⚠️ **duplicate** agency snapshot |
| `capability.updated` | — | ✅ refetch + persist snapshot |
| `payment_intent.succeeded` (booking_deposit) | — | ✅ **agency_bookings deposit columns** |
| `payment_intent.payment_failed` | — | ⚠️ **log-only** (no `markFailed`) |
| `payout.{paid,failed,created,canceled}` | — | ⚠️ **log-only**, no DB write |

**Overlap (handled by BOTH, differently):** `checkout.session.completed`, `account.updated`,
`customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed`.

**The trap:** `scripts/ops/configure-stripe-webhook.sh` registers **only**
`https://app.tulala.digital/api/stripe/webhook` (Route A) but subscribes it to events only
Route B implements (`payout.*`, `capability.updated`, `payment_intent.*`). As written:
- Route A *receives* booking-deposit / booking-transaction `checkout.session.completed`
  events but **ignores** them (no `checkout_type`) → the `booking_transactions` row never
  flips to `paid` and `agency_bookings` deposits never record. **Silent money loss.**
- Route B (deposits + payouts) **receives nothing** — its URL isn't registered.

Also note: Route B imports `loadActiveBookingTransaction` but only does `void
loadActiveBookingTransaction;` (reserved for a future "validate status before markPaid"
enhancement) — a dangling import / unfinished validation.

### 2c. The decision (recommend Option 1)
- **Option 1 — consolidate (recommended).** Merge Route B's unique logic
  (booking_transactions `markPaid`; `agency_bookings` deposit on
  `payment_intent.succeeded`; `payment_intent.payment_failed`; `payout.*`;
  `capability.updated`) **into Route A**, behind Route A's idempotency claim and a single
  checkout-routing switch that detects booking checkouts (`client_reference_id` /
  `metadata.transaction_id` / `metadata.purpose==='booking_deposit'`) alongside the
  subscription/trust types. Delete Route B + Route B's duplicate direct-`.update()`
  subscription logic (Route A's sync functions are canonical). Point everything at singleton
  #1. Update the ops-script comment. **One URL, one client, one idempotency table.**
- **Option 2 — two endpoints, disjoint events.** Keep both routes, register **two** Stripe
  endpoints with **disjoint** event sets, and add idempotency to Route B. More moving parts;
  only if there's a real reason to keep them split. Fix the ops script to register both.

**Acceptance:** after the change, no event type is processed by two handlers; both booking
flows reliably settle; duplicate deliveries are no-ops (idempotent). Add tests (§6) proving
the booking-transaction path, the deposit path, and a subscription path under the chosen
topology, including a re-delivered (duplicate) event.

---

## 3. Pending CODE work (beyond §2)

### 3.1 🟠 Talent payout transfer execution — NOT BUILT (the real feature gap)
Talent Connect onboarding is done; the **money never reaches the talent**. After a Direct
Charge, the talent share sits in the agency's account. There is **no `transfers.create`**
anywhere — `canRouteTransfersToTalent` exists as a guard but nothing calls a transfer.
Two viable designs (pick with the user):
- **Separate Charges + Transfers:** charge on the platform, then `transfers.create` to
  agency and to talent. Cleaner accounting; needs the talent Connect id at checkout time.
- **Agency-initiated transfer:** agency owner clicks "Pay talent" on a booking →
  `transfers.create` from agency → talent Connect account.
Wire `markPayoutSent` (which already emits the "payout settled" notification) to the real
transfer. This is "Phase B PR 5" in the deferred memory.

### 3.2 ✅ "Coming soon" UI strings are NOT a gap (clarification)
`TalentSubscriptionShell.tsx:394` and `ClientTrustShell.tsx:408` only render when
`!stripeEnabled`. Once the env vars land (§4), the real buttons render. **No code change
needed** — listed here so nobody chases a phantom.

### 3.3 🟠 Log-only webhook events to wire (now that the notification engine exists)
- `charge.dispute.created` (Route A:277) → pause trust elevation + notify staff.
- `customer.subscription.trial_will_end` (Route A:286) → remind owner (notification producer).
- `payment_intent.payment_failed` (Route B) → consider a `markFailed` transition, not just a log.
- Use the existing `web/src/lib/notifications/producers/` pattern (fire-and-forget,
  dormant without `RESEND_API_KEY`).

### 3.4 🟡 Connect payout persistence — decision
`payout.{paid,failed,created,canceled}` are log-only (and only in dev). Decide with the user:
keep dashboard-only, or persist payout history for in-app display (needs a small table +
write path + migration). The optional memory follow-ups also mention
`application_fee.created` for reconciliation (no handler today — safe no-op).

### 3.5 🟡 Off-platform cash → Stripe Invoice settlement — confirm scope, then build
`isOffPlatformPaymentMethod` (cash/wire/venue_paid/crypto/other) exists and `markPaid`
advances state on an operator note, but there is **no Stripe Invoice** generated for the
platform's commission on off-platform bookings (the commission model says off-platform
settles the platform fee via a Stripe Invoice to the workspace's customer). Real feature —
confirm scope before building.

### 3.6 🟡 Platform-admin billing dashboards — placeholder → live
`src/app/(workspace)/platform/admin/billing/page.tsx` shows Phase-8 placeholders: invoice
ledger (line 369–370), churn ("Stripe integration pending"), failed payments (hardcoded 0),
MRR (hardcoded `PLAN_PRICE_CENTS` instead of live prices). `admin/settings/page.tsx:250`
shows "Billing — Stripe (Phase 8)". `UsersClient.tsx:161` has a "HasStripe filter — needs
stripe_customer_id on row" TODO. Wire these to live Stripe/DB once billing is live.

### 3.7 🟡 Sales-led / deferred products (not bugs — confirm intent)
- **Client premium subscription** (Standard/Pro/Enterprise) self-serve checkout is
  intentionally deferred per spec §12.1: `client/subscription/page.tsx` shows placeholder
  pricing + "contact sales" (lines 76, 94, 244, 252). Schema exists
  (`20260922160000_client_subscriptions.sql`). Decide whether to wire self-serve checkout
  (the `workspace-billing`/`talent-billing` pattern transfers cleanly) or keep it sales-led.
  **Distinct from client *trust* billing (verification + balance), which IS wired.**
- **Network workspace plan** self-serve: set `STRIPE_PRICE_NETWORK_{MONTHLY,ANNUAL}` to
  enable, or leave blank to keep sales-assisted (current behavior refuses self-serve safely).
  `stripe-billing-actions.ts` returns `noStripe:true` for Network with no special UI handling
  → improve to a "contact sales" affordance.
- **Shortlist paid feature** (`ShortlistsShell.tsx:65,104`) — placeholder, no checkout.

### 3.8 🧹 Cleanups
- Remove `getApplicationFeeForAgency` (`stripe-connect.ts`, @deprecated, returns 0) once no
  callers remain.
- Connect account country is hardcoded `"US"` at create-time (`stripe-connect.ts:~193`) —
  capture the agency's country and pass it.
- `pendingPayouts: 0` hardcoded in `talent-self.ts:46` — query accepted-but-unpaid bookings.
- Mock-mode note: without `STRIPE_SECRET_KEY`, `createCheckoutSessionForTransaction` returns
  a mock URL and the txn stays `payment_requested` (must be marked paid manually). Expected
  in keyless local/dev — don't "fix."

### 3.9 🐛 Known bugs (pinned in skipped characterization tests)
- `commission.characterization.test.ts:386` — a NaN platform-take override is mislabeled
  `lanes_do_not_sum` instead of rejected as out-of-range/invalid.
- `commission.characterization.test.ts:852` — money breakdown rounds `$50.01 → $50`
  (`maximumFractionDigits:0` truncates real cents).
Both are real and were reported; fix and un-skip.

### 3.10 🧼 Env-example hygiene
`RESEND_API_KEY` is commented out in `.env.example` (line 158) though read live in code, and
`RESEND_WEBHOOK_SECRET` is **absent** from `.env.example` though read at
`api/webhooks/resend/route.ts:39`. Add/uncomment for discoverability.

---

## 4. OPS — Stripe Dashboard / Connect / env (TEST first; user-owned, scriptable)

Do these in **TEST mode** first. Several need the user's Stripe Dashboard login — prepare
exact steps and hand off; never guess credentials.

1. **Products & Prices** — create recurring Prices for Studio/Agency (monthly+annual),
   Talent Pro/Portfolio (monthly+annual), and (if §3.7) Network. Capture each `price_…` into
   the 10 `STRIPE_PRICE_*` env vars. (Per memory, the 8 non-Network IDs already exist in
   Vercel TEST — verify and reuse.)
2. **Webhook endpoint** — run `scripts/ops/configure-stripe-webhook.sh test` (later `live`)
   **only after §2 is resolved**, so the registered URL(s) match the chosen topology. The
   script prints the signing secret → set `STRIPE_WEBHOOK_SECRET` in Vercel.
3. **Connect platform profile** (Dashboard → Connect → Settings) — platform name, support
   URL, branding (logo, color), statement descriptor, business profile / MCC. Without this,
   Express onboarding UX is incomplete. Platform-account KYC is required before live Connect.
4. **Customer Portal** — configure which products/prices are switchable, cancellation
   behavior, proration (`createBillingPortalSession` depends on a configured portal).
5. **Env provisioning (Vercel)** — `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, all
   `STRIPE_PRICE_*` for the right environment; also `RESEND_API_KEY` (unblocks notification
   e2e — see `scripts/ops/install-resend-key.sh`). `vercel env add <NAME> production`;
   redeploy so vars are picked up.

---

## 5. LIVE-mode cutover (only on the user's explicit "we're live")

- Swap test secret key → live secret key in Vercel prod.
- Re-create Products/Prices in **LIVE** mode (test/live objects are separate) → update
  `STRIPE_PRICE_*` with live ids.
- `scripts/ops/configure-stripe-webhook.sh live` → set the **live** `STRIPE_WEBHOOK_SECRET`.
- Complete Connect platform activation + KYC in live.
- Run the §6 live-smoke: one real minimal charge end-to-end (webhook → DB → email), then
  refund it. Repeat per product + a Connect booking.

---

## 6. Test & QA playbook

Test framework = Node 22 built-in `node:test` via `tsx` (NOT vitest/jest). Some suites need
the server-only shim. Run from `web/`.

### 6.1 Unit / pure-logic (fast, no network)
```
npm run test:billing          # commission resolver + characterizations + price-ids + owning-party
npm run test:notifications    # catalog + Slice 15.4 billing/payment notification tests
# payments/bookings suites (confirm exact paths by listing the dirs — do NOT assume src/__tests__):
ls src/lib/payments/*.test.ts src/lib/bookings/*.test.ts
NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/bookings/*.test.ts
```

### 6.2 Integration (needs live Supabase / QA env)
```
npm run test:commission-pipeline   # proves a booking_commission_snapshot is written end-to-end
```

### 6.3 Local webhook loop (the most important manual test)
```
stripe listen --forward-to localhost:3000/api/stripe/webhook
# (and/or .../api/webhooks/stripe depending on your §2 topology)
```
Copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET` in `.env.local`, restart dev. Then:
```
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
stripe trigger customer.subscription.deleted
stripe trigger invoice.payment_failed
stripe trigger charge.refunded
stripe trigger account.updated
stripe trigger payment_intent.succeeded
```
For flows that need real metadata (booking `transaction_id`, `checkout_type`, `plan_key`,
`purpose=booking_deposit`), drive them by actually creating the Checkout Session / PaymentIntent
through the app UI in test mode — `stripe trigger` uses synthetic objects without your metadata.
Verify each writes the right rows **and is idempotent on re-delivery** (`stripe events resend
<evt_…>` → second delivery must be a no-op; this is exactly what §2 must guarantee).

### 6.4 Test cards (test mode)
```
4242 4242 4242 4242  → success
4000 0000 0000 9995  → declined (insufficient funds)
4000 0000 0000 0341  → attaches but charge fails (dunning / past_due path)
```
Any future expiry, any CVC, any ZIP. Bank flows: Stripe test ACH/SEPA in Financial Connections.

### 6.5 End-to-end product flows (real UI on a seeded host — raw `*.vercel.app` 404s; use
`tulala.digital` / `app.tulala.digital`, or `vercel alias` a preview onto a seeded host)
- Workspace Free→Studio→Agency via checkout; downgrade + cancel via Portal → confirm
  `agencies.plan_tier` + seat limits + `workspace_subscriptions` + plan-change/cancel emails.
- Talent Basic→Pro→Portfolio; cancel → confirm `talent_profiles.talent_plan_key`.
- Client verification ($5) → `client_trust_state.verified_at` + trust re-eval.
- Client balance top-up ($100) → `client_balance_ledger` + `funded_balance_cents`; then a
  partial + full refund → reconciled ledger, no double-debit.
- Connect onboarding (agency AND talent): create account → onboarding link → finish KYC with
  Stripe test data → `account.updated` flips the `stripe_*` mirror columns;
  `canRouteCheckoutsToAgency` / `canRouteTransfersToTalent` true.
- Booking transaction: `startInquiryCheckout` on a Connect-enabled agency → Direct Charge with
  `application_fee_amount` = summed commission snapshot → `checkout.session.completed` →
  `booking_transactions` flips to `paid` → `payment.received` notification fires (if RESEND set).
- Booking deposit: `createDepositPaymentIntent` (bank-link) → `payment_intent.succeeded`
  (`purpose=booking_deposit`) → `agency_bookings` deposit columns set.
- **Talent payout (once §3.1 built):** `markPayoutSent` → real `transfers.create` → talent
  Connect account balance increases → `payout.*` (and `payment.payout_settled` email).

### 6.6 Deploy smoke (after any deploy)
```
cd web && npm run deploy:smoke
```
10 HTTP signals + Supabase migration-drift. Doesn't charge, but verifies webhook-signature
enforcement and that prod has the secrets wired.

### 6.7 Live smoke (post-cutover only, user-approved)
One real minimal charge per product + a Connect booking → confirm webhook→DB→email → refund.
Verify in the live Stripe Dashboard. (User's three-actor real-bank QA story is in §7.)

---

## 7. Coordination / blockers

- **`RESEND_API_KEY`** is an external credential the user must provision. Billing/payment
  **emails are code-complete but DORMANT** until it's set (`scripts/ops/install-resend-key.sh`).
  Notification e2e (the §6.5 email assertions) is blocked on it; everything else is testable now.
- **Live-mode keys + real-money charges are USER-OWNED and DEFERRED** until the user says
  "we're ready to test money." Build + test in TEST MODE. (Decision 2026-05-13.)
- **DB is GREEN** — `npm run db:check` shows all 382 migrations applied. No payment schema
  work pending; no `db:push` needed for anything currently in the repo.
- **Three-actor real-bank QA story** (user already has the accounts): platform = USA bank
  (receives `application_fee_amount`); agency Connect = Mexican bank #1 (gross − fee via
  Direct Charge); talent Connect = Mexican bank #2 (talent share — **blocked on §3.1**);
  client = credit card. Steps 1/3/4 (agency onboarding → commission snapshot → client
  checkout) validate ~80% of the money engine today; the talent-payout leg (§3.1) is the
  remaining piece.
- **Multiple agents asked for Stripe setup; THIS doc is the consolidation.** New Stripe
  findings → fold into §2–§5 and note back to the user, don't fork a parallel effort.

---

## 8. Reference index

**Webhook routes:** `src/app/api/stripe/webhook/route.ts` (A, idempotent),
`src/app/api/webhooks/stripe/route.ts` (B, not idempotent).
**`getStripe` definitions:** `src/lib/stripe/client.ts` (#1, server-only),
`src/lib/payments/stripe-checkout.ts` (#2).
**Ops scripts:** `scripts/ops/configure-stripe-webhook.sh`, `scripts/ops/install-resend-key.sh`.
**Env vars (code-read):** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, 10× `STRIPE_PRICE_*`
(via `price-ids.ts`), `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `NEXT_PUBLIC_BASE_URL`.
**Key migrations (all applied):** `20260901160000_stripe_billing`,
`20260907150100_stripe_connect_accounts`, `20260906100001_stripe_processed_events`,
`20260901170000_talent_subscriptions`, `20260922160000_client_subscriptions`,
`20260901180000_trust_economics`, `20260901185000_phase_8_trust_billing_hardening`,
`20260522215805_per_participant_commission_snapshot`, `20260513191442_agency_bookings_deposit_paid`,
`20260513204326_talent_profile_stripe_connect`.
**Deferred memory file:** `~/.claude/projects/-Users-oranpersonal-Desktop-impronta-app/memory/pending_stripe_live_money_testing.md`.
**Commission model spec:** `web/docs/commission-model-2026-05-13.md`;
**xtenant ADR:** `web/docs/adr-xtenant-commission-2026-05-22.md`.

---

## Appendix — pasteable one-shot agent prompt

> Paste the block below to a single agent to consolidate the Stripe work. It references
> this doc for the full detail.

```text
You are completing the Stripe billing + payments integration for the Tulala/Impronta
multi-tenant talent-agency SaaS (Next.js 16, TypeScript, Supabase, Stripe + Connect,
Resend). Most of the CODE is already built and live — your job is correctness cleanup,
the few genuinely-missing pieces, and the test/ops to make money flow. The full audit
is web/docs/stripe-completion-brief-2026-05-29.md — READ IT FIRST; it lists what's done
(don't rebuild), file:line for every gap, and the test playbook.

HARD RULES: ~8 agents share /Users/oranpersonal/Desktop/impronta-app — never git switch
in the shared checkout; use an isolated worktree on a per-lane branch off latest main;
never push/rebase/reset others' work; never force-push main. Gate before every commit:
cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit && npm run lint.
db:check is GREEN (no migration needed unless you add one — if you do, db:push before
merge). Don't commit secrets. Build + test in Stripe TEST MODE only; the live-mode key
switch and real-money charges are USER-OWNED and DEFERRED until the user says "we're live."
Never say "buyer"/"buy" in UI copy — say "client".

DO, in order:
1. (P0) Resolve the duplicate-webhook + duplicate-getStripe landmine — §2 of the doc.
   Recommended: consolidate into one route (one idempotency claim, one checkout switch
   handling subscription + client-trust + booking-transaction + booking-deposit) and one
   Stripe client (lib/stripe/client.ts, server-only). Prove with tests that both booking
   flows + a subscription settle and that a re-delivered event is a no-op.
2. Build talent payout transfer execution — §3.1 (the talent share currently never leaves
   the agency/platform account; wire markPayoutSent → transfers.create). Confirm design
   (separate-charges-and-transfers vs agency-initiated) with the user first.
3. Wire the log-only events that now have a notification engine — §3.3 (dispute, trial_will_end,
   payment_intent.payment_failed).
4. Fix the two known commission bugs and un-skip their tests — §3.9.
5. Cleanups — §3.8 (remove deprecated app-fee helper, un-hardcode Connect country + pendingPayouts).
6. Confirm scope with the user before building §3.4 (payout persistence), §3.5 (off-platform
   Stripe Invoice), §3.6 (platform billing dashboards → live), §3.7 (client premium / Network self-serve).
7. Hand the user an exact ordered checklist for the §4/§5 Dashboard/Connect/live steps that
   need their Stripe login.

TEST per §6: npm run test:billing / test:notifications / test:commission-pipeline; local
webhook via `stripe listen` + `stripe trigger` + test cards (4242…, 4000…0341 for dunning);
e2e each product on a seeded host; deploy:smoke after deploy. Report what you changed vs.
what you're handing off.
```

---

## 9. Master execution plan — money lane owned end-to-end (2026-05-29)

> Added after the user assigned **all money/Stripe work to this lane** ("see where things
> stop, learn all work and what's pending related to money & Stripe, audit all, and come
> with a way to run this all to completion"). §0–§8 above describe the *code on `main`*;
> this section reconciles every **in-flight branch** that touches money and sequences the
> whole thing to done. Baseline for all comparisons: `origin/main = e911aca85`.

### 9.1 The real shape of the problem

This is **not** mainly "write new code." ~80% of the money code exists (§1). The bigger
surface is **integration debt**: at least **12 unmerged branches** — built in parallel by
Claude (`feat/*`, `chore/*`, `fix/*`) **and** OpenAI Codex (`codex/*`) agents — all touch
overlapping money files (multi-currency, pricing dashboard, financials, tax, marketing
checkout), and **none are on `main` yet**. Naively merging them collides. So "run it to
completion" = **(A) reconcile + sequence the branches, (B) build the genuine net-new gaps,
(C) the user-gated ops/live cutover** — in that dependency order.

### 9.2 In-flight money branches — what each adds & where it stops

(All "ahead" counts vs `origin/main`. Verified read-only this session.)

| Branch | Ahead | Adds | State / where it stops |
|---|---|---|---|
| `feat/product-pricing-dashboard-phase-5` | 4 (P2→P5) | Platform-admin **Pricing dashboard**: multi-currency price editing, **discount codes + Stripe Coupon sync**, editable Features tab + DB-backed compare table, time-bounded sales; marketing `get-started`/`pricing` read live prices | **Canonical pricing tip.** Base scaffold (phase-1 + migration `20260527213552`) already on `main`; this adds migration `20260528002518_product_features_compare_table`. Ready to integrate. |
| `feat/product-pricing-dashboard` (phase-1) | 1 | Original dashboard scaffold | **SUPERSEDED** — base already on `main`. Discard branch. |
| `feat/product-pricing-dashboard-phase-{2,3,4}` | — | Intermediate links of the same chain | Subsumed by phase-5. Discard. |
| `feat/default-currency-picker` | 1 | Per-actor **default currency** picker (agency + talent settings) + `admin-workspace-default-currency` action | Self-contained except it edits `lib/billing/currencies.ts` → **conflicts** with phase-5. |
| `feat/talent-money-currency-tabs` | 3 | Talent **Money page currency tabs**; `earnings-by-currency` (+ client-safe type split); `snapshot-aggregations` | Display-only (no FX). **Conflicts** on `snapshot-aggregations.ts` with codex follow-on. |
| `chore/owner-user-id-audit-plus-currency-tests` | 1 | `owner_user_id` audit + `agency-financials-by-currency` tests + `agency-financials.ts` | **Conflicts** on `agency-financials.ts` with codex follow-on. |
| `feat/tax-pdf-and-real-rows` | 1 | **Native PDF** `/api/talent/tax-summary` + real monetization drawer rows (adds a PDF dep to package.json) | **Conflicts** — tax-summary is *also* built as **HTML** on the codex follow-on. **DECISION needed.** |
| `codex/talent-my-site-follow-on-qa` | 25 | Mixed lane. Money slices: **GlobalUpgradeModal → Stripe Checkout**, Network plan env-var seam + guard, **admin `/financials` backed by commission snapshots**, multi-currency tabs on admin financials, **HTML** tax-summary route, retire revenue-drawer mocks. Non-money: apply-flow, platform-admin tenant control, taxonomy polish | Biggest, most entangled. Money slices overlap the currency/tax/financials lanes; **non-money slices belong to other lanes — don't absorb them.** Needs slice-level coordination. |
| `codex/browser-pricing-signup-qa-20260528` | 5 | Pricing-signup QA evidence (screenshots/json) + copy alignment + tweaks to `price-ids.ts` / `workspace-billing.ts` / `stripe-billing-actions.ts` / `get-started-form*` | Mostly QA + copy. **Conflicts** on get-started + stripe-lib files with phase-5 and codex follow-on. |
| `fix/marketing-price-alignment` | 1 | 4-line `pricing-teaser-section.tsx` tweak | Likely **subsumed** by phase-5 (same file). Verify, then discard. |
| `fix/network-self-serve-cta` | 1 | Network self-serve CTA flips on when `STRIPE_PRICE_NETWORK_MONTHLY` set | Small; couple to the §3.7 Network decision. |
| `fix/pricing-page-currency-searchparam` | 0 | currency searchparam fix | Empty vs `main` → already merged. Discard. |
| `qa/xtenant-billing` | 6 | Cross-tenant billing QA docs + **RLS recursion-fix migration** + commission QA harness | Verify the migration isn't already on `main`; keep the QA harness. |

**Net-new gaps that live on NO branch** (must be built): P0 webhook/singleton unification
(§2), **talent payout transfer execution** (§3.1 — `transfers.create` confirmed absent from
`main` *and* every branch above), log-only events (§3.3), the two commission bugs (§3.9),
payout persistence (§3.4), off-platform Invoice (§3.5), live billing dashboards (§3.6).

### 9.3 Conflict matrix — files touched by 2+ branches (the merge hazard)

| File | Branches in contention | Resolution lean |
|---|---|---|
| `lib/billing/currencies.ts` | phase-5 · default-currency-picker | phase-5 first (broader), rebase picker on top |
| `lib/billing/snapshot-aggregations.ts` | talent-money-currency-tabs · codex follow-on | Same underlying change — pick one source, drop the dup |
| `lib/billing/agency-financials.ts` | owner-user-id-audit · codex follow-on | codex financials canonical; layer the tests on top |
| `api/talent/tax-summary/route.ts` | tax-pdf (PDF) · codex follow-on (HTML) | **DECISION D-A5** — see 9.6 |
| `(marketing)/get-started/page.tsx`, `get-started-form.tsx`, `…-tier-copy.ts` | phase-5 · browser-pricing-qa | phase-5 functional source; fold QA copy fixes |
| `components/marketing/pricing-teaser-section.tsx` | phase-5 · marketing-price-alignment | phase-5 wins; verify the 4-line fix is included |
| `lib/stripe/price-ids.ts`, `workspace-billing.ts`, `stripe-billing-actions.ts` | browser-pricing-qa · codex follow-on | Reconcile by hand — both small, both real |

### 9.4 Canonical-per-cluster decisions (my recommendation)

1. **Pricing dashboard** → `feat/product-pricing-dashboard-phase-5` is canonical; discard phases 1–4, `fix/marketing-price-alignment`, `fix/pricing-page-currency-searchparam`.
2. **Currency foundation** → phase-5's `currencies.ts`/`currency-resolver`/`country-currency-map` is the base; `feat/default-currency-picker` rebases on top.
3. **Financials** → codex follow-on's commission-snapshot-backed `/admin/financials` is the fuller implementation; `chore/owner-user-id-audit`'s tests layer on.
4. **Talent earnings** → one source for `snapshot-aggregations.ts` (de-dup talent-money-currency-tabs vs codex).
5. **Tax summary** → **needs your call** (HTML vs native PDF) before either route lands — they collide on the same file.
6. **Big codex branch** → harvest *only* the money slices into the money lane; the apply-flow / platform-admin / taxonomy slices stay with their own lanes (coordinate, don't absorb).

### 9.5 The plan — three tracks, dependency-ordered

**TRACK A — Reconcile & land the in-flight branches** (coordination-gated; needs D-A6)
- A0. Confirm migration `20260527213552` is applied to remote Supabase; confirm `qa/xtenant-billing`'s RLS migration isn't already on `main`. *(read-only `db:check` + ls-tree)*
- A1. **Currency foundation** — land phase-5's currency libs first (everything else reads them).
- A2. **Financials + earnings libs** — reconcile `snapshot-aggregations` / `agency-financials` (codex canonical + owner-user-id tests); de-dup the talent-money currency tabs.
- A3. **Pricing dashboard + discount/coupon sync** — phase-5 UI + server actions + compare-table migration.
- A4. **Marketing get-started/pricing reads** — phase-5 functional, fold browser-pricing-qa copy.
- A5. **Per-actor default currency picker** — rebased on A1.
- A6. **Tax summary** — land the canonical route once D-A5 is decided.
- Each lands as its own gated PR to `main` (TS+lint green, `db:push` if it carries a migration). I prepare them in an isolated worktree; **I never merge to `main` myself** — PRs go through the normal merge protocol.

**TRACK B — Build the net-new code gaps** (mine, code-completable now in TEST mode)
- B1. 🔴 **P0 webhook + singleton unification** (§2) — *do first*; it's net-new (no branch conflicts) and it unblocks the ops script (§9.7). Prove with tests: both booking flows + a subscription settle, redelivered event = no-op.
- B2. 🟠 **Talent payout transfer execution** (§3.1) — the last missing piece of the 3-actor money story. **Needs design decision D-B2.**
- B3. **Log-only events → real handlers** (§3.3): dispute, trial_will_end, payment_intent.payment_failed (+ payout.* once B5).
- B4. **Two commission bugs** (§3.9) — fix + un-skip the characterization tests.
- B5. **Payout persistence** (§3.4) and B6. **off-platform Invoice settlement** (§3.5) — scope-confirm first.
- B7. **Platform-admin billing dashboards → live** (§3.6).

**TRACK C — Ops + live cutover** (USER-OWNED, explicitly deferred until "we're live")
- C1. Webhook endpoint config — **and fix the trap**: `scripts/ops/configure-stripe-webhook.sh` registers only `…/api/stripe/webhook` but subscribes Route-B-only events. B1 (single route) dissolves the trap; re-point the script to the surviving route.
- C2. Connect platform profile + branding + statement descriptor.
- C3. Test- then live-mode **price IDs** for all SKUs (workspace ×3 plans, talent ×2, client trust/top-up).
- C4. Live secret key + live webhook signing secret swap in Vercel.
- C5. Live 3-actor e2e (platform USA bank / agency MX bank / talent MX bank / client card) — §6.7.

**Critical path:** B1 → (A1→A2→A3→A4→A5→A6) ∥ (B3, B4) → B2 → B5/B6/B7 → C1…C5.
B1 first (correctness + unblocks ops). Track A is parallelizable once A1 lands. C is last and user-gated.

### 9.6 Ownership / overlap / conflicts (explicit, per the user's ask)

- **Owned by this money lane:** all of Track B and Track C; Track A's *money* clusters
  (currency, pricing dashboard, financials, tax, marketing checkout reads).
- **Shared / coordinate — do NOT unilaterally absorb:** the codex follow-on's non-money
  slices (apply-flow schema+UI, platform-admin tenant control, taxonomy polish). These ride
  the same 25-commit branch as money slices, so landing the money slices means either
  cherry-picking them out or coordinating a whole-branch merge with whoever owns codex.
- **Hard conflicts requiring a human merge call:** the 7 files in §9.3 — most acute is the
  **double-built tax-summary route** (PDF vs HTML on the same path).
- **Discard (stale/superseded):** pricing phases 1–4, `fix/marketing-price-alignment`,
  `fix/pricing-page-currency-searchparam`.

### 9.7 What I need from you (decisions unblock Track A/B; credentials gate Track C)

**Decisions (cheap, unblock code now):**
- **D-A5 — tax-summary:** ship **native PDF** (downloadable, heavier dep) or **HTML** (lighter, print-to-PDF)? They collide; I land one.
- **D-A6 — integration authority:** am I cleared to prepare integration branches + open PRs that touch *other agents'* lanes (esp. the codex branches), or should I produce the merge sequence and hand each lane back to its owner?
- **D-B2 — talent payout shape:** **separate-charges-and-transfers** (platform charges, then transfers to agency + talent — cleaner accounting) vs **agency-initiated transfer** (agency "Pay talent" button)?
- **D-START — green-light Track B now?** I'd start with B1 (P0 webhook) in TEST mode, no live money, no merge to `main`.

**Credentials (Track C only — stay deferred until you say "we're live"):**
test+live Stripe **price IDs** for every SKU · live **secret key** · live **webhook signing
secret** · Connect **platform profile** + KYC. Nothing here is needed to start A/B.

### 9.8 Status of this audit

Branch inventory, conflict matrix, and the three load-bearing facts (P0 duplication still on
`main`; talent payout absent everywhere; pricing base already merged) are **verified
read-only this session** against `origin/main = e911aca85`. No branches were checked out,
merged, or modified. Next action on your go: B1 in an isolated worktree.
