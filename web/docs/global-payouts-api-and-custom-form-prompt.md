All signatures confirmed against the real source. The maps are accurate. I have everything I need to write both deliverables.

# PART A — GLOBAL PAYOUTS API WIRING (REFERENCE)

This is how the Tulala app talks to Stripe **Global Payouts** (the v2 Money Movement preview API). It supplements the existing Stripe Connect (v1 Express) payout rail; `disburse.ts` routes each booking payout leg to whichever rail the talent is set up on.

## 1. The two-key model (this is the #1 thing to get right)

Every v2 call pins the header `Stripe-Version: 2026-05-27.preview` (constant `STRIPE_V2_PREVIEW_VERSION` in `web/src/lib/payments/stripe-v2.ts`) and sends/receives **JSON** (not v1 form-encoding). But the two endpoint families require **different keys**, and using the wrong one returns **HTTP 403**:

| Endpoint family | Key used | Env var | If you use the wrong key |
|---|---|---|---|
| `/v2/money_management/*` and `/v2/core/accounts*` (recipient create/update, bank payout methods, default destination, status, outbound payments, financial accounts) | **Restricted** `rk_live_…` | `STRIPE_V2_SECRET_KEY` (falls back to `STRIPE_SECRET_KEY` in test mode) | A standard `sk_live_` key → **403** |
| `/v2/core/account_links` (the Stripe-hosted onboarding/update form) | **Standard** `sk_live_…` | `STRIPE_SECRET_KEY` (passed explicitly) | A restricted `rk_live_` key → **403** |

- `stripeV2Key()` / `isStripeV2Configured()` in `stripe-v2.ts` resolve the active v2 key (prefers the restricted key in LIVE).
- `createRecipientAccountLink()` in `global-payouts-onboarding.ts` is the **only** call that deliberately overrides to the standard `STRIPE_SECRET_KEY` — because the restricted money-management key is rejected by `account_links`.

All v2 traffic goes through one low-level client in `stripe-v2.ts`:
- `stripeV2Request<T>(method, path, opts)` — fetch-based, **never throws**, returns `{ ok: true, data }` or `{ ok: false, status, error: { code?, type?, message?, request_log_url? } }`. Supports `Idempotency-Key` and `Stripe-Context` headers.
- Thin wrappers `stripeV2.get<T>()` / `stripeV2.post<T>()`.

## 2. Endpoint catalogue (with the function that calls it)

All recipient-lifecycle functions live in `web/src/lib/payments/global-payouts-onboarding.ts`; money-movement in `web/src/lib/payments/global-payouts.ts`.

| # | Stripe endpoint | Key | Extra header | Function | Purpose |
|---|---|---|---|---|---|
| 1 | `POST /v2/core/accounts` | rk | — | `createGlobalPayoutsRecipient()` | Create recipient (v2 core account). Sends `contact_email`, `display_name`, `identity.country` (ISO-2 lowercase), `identity.entity_type` (`individual`), `identity.individual.{given_name,surname}`, `configuration.recipient.capabilities.bank_accounts.local.requested=true`, `metadata`, `include`. |
| 2 | `POST /v2/core/accounts/{id}` | rk | — | `updateRecipientIdentity()` | Update legal name + metadata. **Email and country are immutable** — omit them. |
| 3 | `POST /v2/money_management/outbound_setup_intents` | rk | `Stripe-Context: {recipientAccountId}` | `createRecipientBankPayoutMethod()` | Attach a bank payout method. Body `payout_method_data.bank_account.{country,currency,account_number,routing_number?}`. Returns an `OutboundSetupIntent` whose nested `payout_method.id` is the new method. |
| 4 | `GET /v2/money_management/payout_methods` | rk | `Stripe-Context: {recipientAccountId}` | `listRecipientPayoutMethods()` | List the recipient's (non-archived) bank methods. |
| 5 | `POST /v2/core/accounts/{id}` | rk | — | `setRecipientDefaultPayoutMethod()` | Set `configuration.recipient.default_outbound_destination` = the payout-method id (a **bare string**, not an object). |
| 6 | `GET /v2/core/accounts/{id}?include=configuration.recipient` | rk | — | `getRecipientDefaultPayoutMethodId()` | Read current default (`...default_outbound_destination?.id`, may be null). |
| 7 | `POST /v2/money_management/payout_methods/{id}/archive` | rk | `Stripe-Context: {recipientAccountId}` | `archiveRecipientPayoutMethod()` | Archive (remove) a method so it can no longer be paid. |
| 8 | `GET /v2/core/accounts/{id}?include=configuration.recipient,requirements` | rk | — | `getRecipientOnboardingState()` | Read `bank_accounts.local.status` + `requirements.entries[]` → `{ bankActive, needsUserAction }`. |
| 9 | `POST /v2/core/account_links` | **sk** | — | `createRecipientAccountLink()` | Mint the Stripe-hosted onboarding/update URL. `use_case.type` = `account_onboarding` or `account_update`, `configurations: ["recipient"]`, `return_url`, `refresh_url`. |
| 10 | `GET /v2/money_management/financial_accounts` | rk | — | `getPrimaryFinancialAccountId()` / `isGlobalPayoutsActive()` | Platform FinancialAccount (source of all OutboundPayments). GP is "active" iff this list is non-empty. Cached 60s. |
| 11 | `POST /v2/money_management/outbound_payments` | rk | `Idempotency-Key` (recommended) | `createOutboundPayment()` | Execute a payout: `from.{financial_account,currency}`, `to.{recipient,payout_method?}`, `amount.{value,currency}`, `description`, `metadata`. |
| 12 | `GET /v2/money_management/outbound_payments/{id}` | rk | — | `getOutboundPayment()` | Poll payout status for reconciliation. |
| 13 | `GET`/`POST /v2/money_management/financial_addresses` | rk | — | `getOrCreateFinancialAddress()` | Get/create a `us_bank_account` FinancialAddress to fund the FA (infra; not in talent flow). |
| 14 | `POST /v1/payouts` (form-encoded, `payout_method=<fa_id>`) | **sk (v1)** | — | `fundFinancialAccountFromBalance()` | Fund the FA from the platform's v1 balance. v1 endpoint, not v2. |

## 3. Recipient lifecycle (the happy path)

1. **Create recipient** → `createGlobalPayoutsRecipient()` (`POST /v2/core/accounts`). Country (ISO-2 lowercase) and `contact_email` are set here and are **immutable** thereafter. Passing the legal name (`identity.individual.given_name/surname`) up front avoids the recipient landing in "Information needed".
2. **Identity / name** → `updateRecipientIdentity()` (`POST /v2/core/accounts/{id}`) pushes the current profile name + metadata later (the "Sync from profile" action). Email + country stay immutable.
3. **Bank payout method** → `createRecipientBankPayoutMethod()` (`POST /v2/money_management/outbound_setup_intents`, with `Stripe-Context`). The returned `outbound_setup_intent.payout_method.id` is the method id.
4. **Default destination** → `setRecipientDefaultPayoutMethod()` (`POST /v2/core/accounts/{id}`). The first method added is automatically made default by the talent layer.
5. **Status active** → `getRecipientOnboardingState()` reads the capability + requirements so the UI can show whether the recipient is ready.

The talent-scoped orchestration over the above lives in `web/src/lib/payments/talent-global-payouts.ts`:
- `getOrCreateTalentGpRecipient()` — creates/returns the recipient, persists the id to `talent_profiles.gp_recipient_account_id`, syncs identity + metadata, and **self-heals** a stale recipient (403/404/permission error → clear the stored id + recreate).
- `syncTalentGpRecipient()` — manual "Sync from profile".
- `setupTalentGpBank()` — create recipient if needed + attach bank + auto-default if first.
- `listTalentGpPayoutMethods()` — flatten methods for the UI + return default + real status.
- `getTalentGpAccountLink()` — ensure recipient (with metadata) + return the hosted URL (auto-retries as `update` if already onboarded).
- `setTalentGpDefault()` / `removeTalentGpPayoutMethod()` (refuses to remove the current default) / `getTalentGpStatus()`.

Server actions (`web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts`, all `"use server"`, auth via `getCachedActorSession()` → `talent_profiles.id` → `user.email`): `loadTalentGpStatus`, `setupTalentGpBankAction`, `syncTalentGpProfileAction`, `loadTalentGpMethods`, `startTalentGpHostedSetupAction`, `setTalentGpDefaultAction`, `removeTalentGpMethodAction`. UI: `GlobalPayoutsBankCard.tsx` inside `PayoutsShell.tsx`.

## 4. Country-specific bank fields (`payout_method_data.bank_account`)

| Country | `country` | `account_number` | `routing_number` | `currency` |
|---|---|---|---|---|
| Mexico (MX) | `MX` (uppercase) | 18-digit **CLABE** | **OMIT** (rejected if present) | `mxn` (required) |
| Argentina (AR) | `AR` | 22-digit **CBU** | **OMIT** | `ars` (required) |
| US / CA / others | `US`, `CA`, … | account number | **REQUIRED** (US ABA / CA institution) | `usd`, `cad`, … |

`currency` is always **required** — omitting it returns HTTP 400. `country` is uppercase here (the recipient's `identity.country` is lowercase); `currency` is lowercase.

## 5. Metadata set (`recipientMetadata()` in `talent-global-payouts.ts`, ~L45–66)

Sent on recipient **create**, **sync/update**, and **hosted-link** ensure. Empty values are stripped before sending.

| Key | Source | Set when |
|---|---|---|
| `talent_profile_id` | profile UUID | always |
| `talent_id` | `profile_code` (TAL-xxxxx) | if non-empty |
| `profile_code` | `profile_code` | if non-empty |
| `talent_name` | `display_name` | always |
| `talent_email` | session email | always |
| `whatsapp_number` | `phone_e164` | if present |
| `user_id` | `session.user.id` | if passed in opts |
| `workspace_id` | `opts.workspaceId` | **accepted but currently NOT passed by any call site** |
| `source` | hardcoded `tulala_payout_setup` | always |
| `environment` | `live`/`sandbox` from `STRIPE_SECRET_KEY` prefix | always |

**Gap to close:** `workspace_id` and `agency_id` are not wired. The new form should populate them — `agency_id` from `talent_profiles.created_by_agency_id` (immutable creator) or the active row in `agency_talent_roster` (`talent_profile_id`, `tenant_id`, `status='active'`); `workspace_id` likewise.

## 6. Status mapping (capability + requirements → UI pill)

`getRecipientOnboardingState()` returns `{ bankActive, needsUserAction }` from `configuration.recipient.capabilities.bank_accounts.local.status` and `requirements.entries[].awaiting_action_from === "user"`. The talent layer maps to `TalentGpStatusKind`:

| Condition | `TalentGpStatusKind` | UI pill |
|---|---|---|
| no recipient yet | `not_started` | "Set up payouts" |
| `needsUserAction` (requirements pending) | `info_needed` | "Information needed" |
| recipient + method, not yet active | `pending` | "Pending verification" |
| `bankActive && !needsUserAction` | `ready` | "Ready" |

OutboundPayment status (`processing` / `posted` / `failed` / `returned` / `canceled`) maps to ledger state via `outboundPaymentLedgerStatus()` → `transferred | failed | held`.

## 7. Live-money safety gate

`assertLivePayoutSafe()` blocks real money on a LIVE key unless `STRIPE_ALLOW_LIVE_PAYOUTS=true`. Enforced in `createOutboundPayment()`, `fundFinancialAccountFromBalance()`, and `disburse()` (both rails). On a blocked LIVE key, money moves return `{ ok: false, status: 0, error: { code: "live_payouts_disabled" } }` / outcome `skipped_live_disabled` — funds **hold**, never fail. Idempotency keys: GP `op_{bookingId}_{participantId}_{party}`, Connect `transfer_{bookingId}_{participantId}_{party}` (`outboundIdempotencyKey()` / `connectIdempotencyKey()` in `disburse.ts`).

---

# PART B — EXECUTION PROMPT FOR THE NEW AGENT

Copy everything below verbatim into a fresh agent chat.

---

**ROLE:** You are building a custom, in-app multi-step Global Payouts form for Tulala (Next.js + Supabase + Stripe v2 Money Movement preview API). This is real production work. Read the whole brief before touching code.

## 0. Environment & branch

- **Worktree:** `/Users/oranpersonal/Desktop/impronta-globalpay` — work ONLY here. Do not `git switch`/`git checkout -b` in the shared `/Users/oranpersonal/Desktop/impronta-app` checkout (~20 agents share it).
- **Branch:** `feat/talent-global-payouts` is already checked out in that worktree. Commit onto it. Do not create a new branch.
- **Dev server:** from the worktree, `cd web && npm run dev` (use a free port, e.g. `PORT=4600 npm run dev`). If dev wedges, `rm -rf web/.next` and restart first.
- **Stripe keys:** This app uses a TWO-KEY model (see §3). Confirm `STRIPE_V2_SECRET_KEY` (restricted `rk_…`) and `STRIPE_SECRET_KEY` (standard `sk_…`) are present in `web/.env.local`. Run in **sandbox/test**; the live-money guard `STRIPE_ALLOW_LIVE_PAYOUTS` must stay **unset/false**. Do NOT move real money.

## 1. What you are building (and what already exists — REUSE, do not rebuild)

The Stripe-**HOSTED** AccountLink flow already works end-to-end (co-branded "Tulala Digital": Review your information → Recipient details (type, legal first/last) → Edit bank account (CLABE)). You are adding a **custom in-app form** that mirrors those steps but renders in Tulala's own UI, layered **alongside** the existing hosted flow — talent can use either. It must add / edit / remove / set-default of **multiple** bank accounts through the REAL custom v2 API.

**These already exist — call them, do not reimplement (all in `web/src/lib/payments/`):**

- `global-payouts-onboarding.ts`: `createGlobalPayoutsRecipient`, `updateRecipientIdentity`, `createRecipientBankPayoutMethod`, `listRecipientPayoutMethods`, `setRecipientDefaultPayoutMethod`, `getRecipientDefaultPayoutMethodId`, `archiveRecipientPayoutMethod`, `getRecipientOnboardingState`, `createRecipientAccountLink`.
- `talent-global-payouts.ts`: `getOrCreateTalentGpRecipient`, `syncTalentGpRecipient`, `setupTalentGpBank`, `listTalentGpPayoutMethods`, `getTalentGpAccountLink`, `setTalentGpDefault`, `removeTalentGpPayoutMethod`, `getTalentGpStatus`, plus the private `recipientMetadata()` helper.
- `global-payouts.ts`: `createOutboundPayment`, `getPrimaryFinancialAccountId`, `isGlobalPayoutsActive`, `assertLivePayoutSafe`.
- Server actions in `web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts`: `loadTalentGpStatus`, `setupTalentGpBankAction`, `syncTalentGpProfileAction`, `loadTalentGpMethods`, `startTalentGpHostedSetupAction`, `setTalentGpDefaultAction`, `removeTalentGpMethodAction`.
- UI: `GlobalPayoutsBankCard.tsx` and `PayoutsShell.tsx` in that same folder.

**Your job:** build the custom multi-step *entry/edit* form (Steps 1–4 below) as a new component that sits in/above `GlobalPayoutsBankCard.tsx` inside `PayoutsShell.tsx`, reusing the helpers/actions above. Extend the helpers ONLY where a gap exists (recipient-type field, metadata wiring); do not duplicate logic.

## 2. Exact UI flow (helper strings VERBATIM)

Render as a stepper. **Prefill every field from the talent profile, then let the user review/edit before continuing.** Do NOT start with CLABE — recipient confirmation comes first.

**STEP 1 — Confirm recipient (collect first):** Email, Country, Recipient type (radio: **Individual** selectable now; **Company** shown but disabled/"coming soon"), Display name, Phone, Legal first name, Legal last name.
- Helper near Email/Country (verbatim): `The email address and country for a recipient cannot be changed. To use a different email address or country, create a new recipient.`
- Helper near Legal name (verbatim): `Must match the name associated with the bank account that you'll provide next.`
- Helper near Phone (verbatim): `This phone number will only be used when needed to verify your recipient's identity.`
- Prefill: Email ← `session.user.email`; Country ← profile `residence_country_id`→`countries.iso2`, else `home_country_text` matched against `countries`, else show the country picker; Display name / Legal first+last ← `display_name` (split on first space); Phone ← `phone_e164`.

**STEP 2 — Add payout method (Mexico now):** Country = **Mexico** (locked, the only supported option for now), Currency = **MXN** (locked), Payout method = **Local bank account**, CLABE input (18-digit, validate length/numeric client-side).
- Helper (verbatim): `You'll be paid in MXN. The account holder name must match your legal name. Your bank details are sent securely to Stripe.`

**STEP 3 — Save with Stripe (NOT local-only):** On submit, the server action must: (a) create/update the recipient with full metadata, (b) attach the bank payout method to the correct Stripe v2 Global Payouts endpoint, (c) set it as default if it's the first method, (d) **refresh status from Stripe** (`getRecipientOnboardingState` / `getTalentGpStatus`) and return the fresh status. Never persist bank credentials locally.

**STEP 4 — Show account card(s):** For each saved method: Name, `Mexico · MXN`, `Bank account ····{last4}`, Status (Information needed / Pending verification / Ready / Failed), a "Default account" badge. Controls: **Continue setup** (when info_needed), **Refresh status**, **Set default**, **Remove** (non-default only), **Add another**.

## 3. Exact backend wiring (endpoint + KEY per call — DO NOT GET THIS WRONG)

`Stripe-Version: 2026-05-27.preview` on every v2 call. The existing helpers already send the right key/headers — route through them.

| Operation | Stripe endpoint | KEY | Header | Helper to call |
|---|---|---|---|---|
| Create recipient | `POST /v2/core/accounts` | **rk** (`STRIPE_V2_SECRET_KEY`) | — | `createGlobalPayoutsRecipient` / `getOrCreateTalentGpRecipient` |
| Update recipient (name/metadata) | `POST /v2/core/accounts/{id}` | **rk** | — | `updateRecipientIdentity` / `syncTalentGpRecipient` |
| Add bank method | `POST /v2/money_management/outbound_setup_intents` | **rk** | `Stripe-Context: {recipientAccountId}` | `createRecipientBankPayoutMethod` / `setupTalentGpBank` |
| Set default | `POST /v2/core/accounts/{id}` | **rk** | — | `setRecipientDefaultPayoutMethod` / `setTalentGpDefault` |
| Remove (archive) | `POST /v2/money_management/payout_methods/{id}/archive` | **rk** | `Stripe-Context` | `archiveRecipientPayoutMethod` / `removeTalentGpPayoutMethod` |
| List methods | `GET /v2/money_management/payout_methods` | **rk** | `Stripe-Context` | `listRecipientPayoutMethods` / `listTalentGpPayoutMethods` |
| Status/requirements | `GET /v2/core/accounts/{id}?include=configuration.recipient,requirements` | **rk** | — | `getRecipientOnboardingState` / `getTalentGpStatus` |
| Hosted form (the existing flow) | `POST /v2/core/account_links` | **sk** (`STRIPE_SECRET_KEY`) | — | `createRecipientAccountLink` / `getTalentGpAccountLink` |

**403 facts to respect:** a standard `sk_` key on `/v2/money_management/*` or `/v2/core/accounts` → 403; a restricted `rk_` key on `/v2/core/account_links` → 403. `createRecipientAccountLink` already overrides to `STRIPE_SECRET_KEY` — leave that.

**Country-specific bank rules (only Mexico active now):** `bank_account.country="MX"` (uppercase), `currency="mxn"` (lowercase, REQUIRED — omitting → 400), `account_number=`18-digit CLABE, **omit `routing_number`** for MX (it is rejected if present). (For reference only — US/CA require routing, AR uses 22-digit CBU; do not surface them yet.)

**Metadata (backend, NOT form fields) — send the FULL set on create AND update:** `talent_profile_id`, `talent_id` (TAL-xxxxx), `profile_code`, `talent_name`, `talent_email`, `whatsapp_number` (if present), `user_id`, `source=tulala_payout_setup`, `environment=sandbox|live`, **plus the two currently-missing keys: `workspace_id` and `agency_id`.** Wire those:
- Extend `recipientMetadata()` in `talent-global-payouts.ts` to accept `agencyId` + `workspaceId` and emit them when present.
- Resolve `agency_id` from `talent_profiles.created_by_agency_id` (immutable creator), or the active `agency_talent_roster` row (`talent_profile_id`, `tenant_id`, `status='active'`) if you want current-workspace semantics. Resolve `workspace_id` the same way. Pass them down from `getOrCreateTalentGpRecipient`, `setupTalentGpBank`, and `getTalentGpAccountLink`, and from the calling server actions (e.g. `startTalentGpHostedSetupAction` currently omits `workspaceId`).

**After every save/default/remove: re-fetch from Stripe** (`listTalentGpPayoutMethods` + `getTalentGpStatus`) and return the fresh result so the UI reflects reality, never an optimistic guess.

## 4. Multi-account management (reuse existing helpers)

- **Add another** → re-open Step 2 (recipient already exists; skip Step 1) → `setupTalentGpBank`.
- **Set default** → `setTalentGpDefaultAction(payoutMethodId)` → `setRecipientDefaultPayoutMethod`.
- **Remove** (non-default only) → `removeTalentGpMethodAction(payoutMethodId)` → `archiveRecipientPayoutMethod`. The helper already refuses to remove the current default — surface a clear inline error ("Set another account as default first") rather than letting payouts lose their destination.
- **Continue setup** → `startTalentGpHostedSetupAction` (the existing hosted AccountLink; opens the popup synchronously to dodge popup-blockers, falls back to same-tab redirect).
- **Refresh status** → `loadTalentGpMethods` + `loadTalentGpStatus`.

## 5. Guardrails (hard rules)

1. **Only Stripe-supported Global Payouts countries.** Mexico-only for now. Do NOT hand-write a country list; if only Mexico is supported, render only Mexico (Step 2 country/currency locked).
2. **Honour immutability:** email + country are fixed at recipient creation. Display them read-only in Step 1 once a recipient exists, with the verbatim helper text. To change them, the user creates a new recipient.
3. **Never store bank credentials locally.** CLABE/account numbers go straight to Stripe via the helpers; persist only the returned `last4`/method id (Stripe-side) and `gp_recipient_account_id`.
4. **Live-money guard:** `STRIPE_ALLOW_LIVE_PAYOUTS` stays false. This form creates recipients + payout methods only — it does NOT create OutboundPayments. Do not call `createOutboundPayment` from this form.
5. **No new DB columns** unless strictly required (status is computed on-demand from Stripe; the only persisted field is `talent_profiles.gp_recipient_account_id`). If you must, write a migration with a unique `date -u +%Y%m%d%H%M%S` timestamp and run `npm run db:push` before committing.
6. **Gate before every commit (from `web/`):** `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` (must be 0 errors — an OOM-crashed run is NOT clean), `npm run lint` (0), and `npm run test:billing` (which already includes `global-payouts.test.ts`, `global-payouts-onboarding.test.ts`, `talent-global-payouts`-adjacent tests). All green or do not commit.

## 6. Verification checklist (prove each step actually hit Stripe)

Run the dev server, sign in as a talent (see QA credentials), open Talent → Settings → Payouts. For each, watch the Network tab AND confirm in the Stripe **test-mode** Dashboard (Logs / the recipient account):

- [ ] **Recipient create:** Submit Step 1 → a `POST /v2/core/accounts` with the **rk** key fires; response has `acct_…`; `talent_profiles.gp_recipient_account_id` is now set (check Supabase). Re-submitting does NOT create a duplicate (idempotent get-or-create).
- [ ] **Immutability honoured:** after a recipient exists, email + country render read-only with the verbatim helper text; no attempt to send a changed email/country.
- [ ] **Metadata present:** in the Stripe Dashboard recipient → Metadata, confirm ALL keys incl. the newly wired `workspace_id` and `agency_id` (values match the talent's roster/creator agency), plus `talent_id=TAL-…`, `source=tulala_payout_setup`, `environment=sandbox`.
- [ ] **Bank add:** Step 2 CLABE submit → `POST /v2/money_management/outbound_setup_intents` with `Stripe-Context: acct_…`, body `country=MX`, `currency=mxn`, **no `routing_number`**. Response `outbound_setup_intent.payout_method.id`. An 18-char non-numeric CLABE is rejected client-side; a bad CLABE returns a Stripe 4xx surfaced as a readable inline error (not a crash).
- [ ] **First method = default:** after the first add, `getRecipientDefaultPayoutMethodId` returns that method; the card shows the "Default account" badge.
- [ ] **Status reflects reality:** card status pill matches `getRecipientOnboardingState` — `info_needed` shows "Continue setup"; after completing requirements via the hosted link, **Refresh status** flips the pill to "Ready" (`bank_accounts.local.status==="active" && no user requirements`).
- [ ] **Add another:** a second CLABE adds a second method (both listed); it is NOT auto-default.
- [ ] **Set default:** switching default fires `POST /v2/core/accounts/{id}` with `default_outbound_destination` = the bare method-id string; the badge moves.
- [ ] **Remove guard:** removing the **default** is blocked with the inline "set another default first" message; removing a **non-default** fires `POST /v2/money_management/payout_methods/{id}/archive` and the row disappears (Stripe shows `archived:true`).
- [ ] **Hosted flow still works:** "Continue setup"/"Add or update account" still opens the co-branded Stripe AccountLink (via the **sk** key) — unbroken.
- [ ] **No local money move:** confirm no `POST /v2/money_management/outbound_payments` is ever fired by this form.
- [ ] **Gates green:** tsc 0, lint 0, `test:billing` all passing.

## 7. Definition of done

A talent can, entirely in Tulala's own UI: confirm/edit a prefilled recipient (Step 1), add a Mexican CLABE bank account (Step 2), have it saved to Stripe with the full metadata set including `workspace_id` + `agency_id` (Step 3), and manage multiple accounts — add another, set default, remove a non-default, continue setup, refresh status — all reading real status back from Stripe (Step 4). The existing hosted AccountLink flow remains intact alongside it. No bank data is stored locally, no real money moves, and `tsc`/`lint`/`test:billing` are all green. Then report the verification results (do not push or open a PR unless the owner asks).