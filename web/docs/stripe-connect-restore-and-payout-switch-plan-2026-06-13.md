# Restore Stripe Connect Sandbox + Express, and Add a Platform Payout-System Switch

> Plan dated 2026-06-13. Branch: `feat/payout-system-switch`. Status: **planned, not yet implemented.**
> Two parts, sequenced: **Part A** = bring the Connect Express sandbox fully back and working
> (the user's priority); **Part B** = add a reversible Platform Admin switch (Connect ⇄ Global
> Payouts), default Connect, keeping all Global Payouts code.

## 1. Context

The app pivoted from **Stripe Connect** (the original payout rail — Express connected accounts +
platform charges + `transfers.create`) to **Global Payouts (GP)** (v2 preview API, `OutboundPayment`,
USDC/stablecoin, ~90 countries) to solve a real EUR/MX currency-mismatch blocker for cross-border
talent. The pivot was **additive**: GP code was layered *on top of* Connect, and Connect remains the
structural default in the money rail. But several UX/config artifacts now bias the app toward GP, and
locally the Connect sandbox is not even configured (no `STRIPE_*` keys in `web/.env.local`, so Stripe
runs in mock mode).

This plan does two things, in order:

- **Part A (user priority): bring the Connect Express sandbox back to fully working, end-to-end** —
  talent Express onboarding (embedded + hosted), agency Express onboarding, charge → Connect transfer
  → payout settlement, held-payout release, and webhooks. This is mostly an **env/keys +
  Stripe-Dashboard + sandbox-account** exercise, *not* a code-restoration exercise — Connect is
  already the default rail.
- **Part B: add a reversible Platform Admin switch** (`active_payout_system` on the `platform_settings`
  singleton, default `'connect'`) that the super-admin flips between Connect and Global Payouts in one
  click. It force-pins the money rail to Connect when set, and hides all GP UI in the talent payouts
  surface — **without deleting any GP code**. Flipping back to `'global_payouts'` restores today's
  behavior exactly.

The guiding principle: **Connect is the restored default; GP is preserved, gated behind the switch.**

## 2. Current state map

**Two independent Stripe clients / keys:**

| Rail | Client | File | Key | API version |
|---|---|---|---|---|
| **Connect (v1)** | `Stripe` SDK singleton `getStripe()` | `web/src/lib/stripe/client.ts` | `STRIPE_SECRET_KEY` (only) | `2026-04-22.dahlia` (line 31) |
| **Global Payouts (v2)** | fetch-based client | `web/src/lib/payments/stripe-v2.ts` | `stripeV2Key()` = `STRIPE_V2_SECRET_KEY \|\| STRIPE_SECRET_KEY` | `2026-05-27.preview` (line 27) |

`isStripeConfigured()` keys off `STRIPE_SECRET_KEY` only. With no key set, `getStripe()` returns
`null` → checkout returns mock URLs, `disburse` returns `'mock'`. **This is why Connect appears
"broken" locally today — it is unconfigured, not disabled.**

**Talent Express flow** (`web/src/lib/payments/stripe-connect-talent.ts` +
`.../talent/settings/payouts/actions.ts` + `PayoutsShell.tsx`): live path is **embedded** —
`ensureTalentPayoutAccount` pre-creates an Express account (`accounts.create({type:'express',
capabilities:{transfers:{requested:true}}})`, immutable residence country), then
`createTalentAccountSession` mints an AccountSession for `<ConnectEmbeddedOnboarding>` (needs
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`). A **hosted-link** flow (`startTalentOnboarding` →
`accountLinks.create`, return route `.../payouts/return`) still exists but is not wired to the shell's
button. Status mirrors onto `talent_profiles.stripe_account_*`.

**Agency flow** (`web/src/lib/payments/stripe-connect.ts` +
`web/src/lib/server-actions/admin-stripe-connect.ts` + `/[tenantSlug]/admin/payouts/*`):
`createOrGetConnectedAccount` (Express, `{card_payments, transfers}`, immutable country, default
`PLATFORM_DEFAULT_COUNTRY='MX'`), embedded onboarding via `getConnectAccountSessionAction`. Status
mirrors onto `public.agencies.stripe_account_*` (migration `20260907150100_stripe_connect_accounts.sql`).
The **agency leg of a booking is hardcoded to Connect** — never touches the GP switch.

**Money path** (`web/src/lib/bookings/transactions.ts` → `markPaid` line 571 →
`web/src/lib/payments/transfers.ts` `executeBookingTransfers` → `web/src/lib/payments/disburse.ts`):
`markPaid` is the single fan-out trigger for **both** the webhook and the admin "Mark received" path.
Per talent leg, `resolveTalentPayoutRail` decides the rail; workspace/agency leg is hardcoded
`connect_transfer` (transfers.ts ~254-266). Idempotency key
`transfer_<booking>_<participant>_<party>` is shared by fan-out, held-release, and cron — no
double-pay.

**Webhooks:** v1 — two identical routes (`/api/webhooks/stripe`, `/api/stripe/webhook`) →
`handleStripeWebhook` (verifies `STRIPE_WEBHOOK_SECRET`, uses v1 `getStripe`). `booking_payment` →
`markPaid` (which itself calls `executeBookingTransfers`); `account.updated` → `releaseHeldPayouts`.
v2 — separate `/api/webhooks/stripe-v2` route verifying `STRIPE_V2_WEBHOOK_SECRET` (GP only).

**What the GP pivot changed that currently biases toward GP:**
1. **`PayoutsShell.tsx` `gpPrimary`** (lines 119, 124-134): set TRUE when the talent has any GP
   recipient/method **OR** their country is not in `CONNECT_PAYOUT_COUNTRIES` (US/GB/CA/CH + EEA —
   **excludes MX and all LatAm**). When true, the entire Connect block is replaced by
   `<GlobalPayoutsBankCard/>` (lines 242-244).
2. **The "More ways to get paid" block** (lines 324-334) renders a *second* `<GlobalPayoutsBankCard/>`
   on the non-`gpPrimary` branch too — so GP UI shows even when Connect is shown.
3. **`resolveTalentPayoutRail`** (`payout-rail-policy.ts`): already returns `connect_transfer` on the
   common path (line 72, `!crypto_payouts_enabled`), but a leftover per-talent
   `crypto_payouts_enabled=true` opt-in + GP-active + stablecoin country routes money via GP. No
   platform-level override exists.

Net: the **money rail** is already Connect for everyone (nothing writes `crypto_payouts_enabled`
today), so the divergence is **almost entirely a frontend/onboarding concern** plus the latent
per-talent opt-in.

## 3. Part A — Restore the Connect sandbox + Express, end-to-end

This is the user's priority and is mostly configuration. **No Connect code is currently disabled** —
Connect is the default rail; it's just unconfigured locally. The one thing to know: a US Connect
platform **cannot open Express accounts in Mexico/most LatAm**, so QA Express with a **US-residence
test talent and a US agency**, not the existing Orlando/MXN `orantenemx` talent.

### A.1 Env vars to set — `web/.env.local` (local sandbox) and Vercel (preview/prod)

Names only; the user supplies values. All from the Connect-enabled **test-mode** Stripe account.

| Var | Where | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | both | `sk_test_…` — drives the **entire** v1 Connect rail (`getStripe`). Setting this flips `isStripeConfigured()` true → no more mock URLs/`'mock'` transfers. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | both | `pk_test_…` — **required client-side** or `<ConnectEmbeddedOnboarding>` cannot mount (both talent and agency embedded onboarding fail silently without it). |
| `STRIPE_WEBHOOK_SECRET` | both | `whsec_…` for the v1 endpoint. Locally use the secret printed by `stripe listen`. |
| `STRIPE_V2_SECRET_KEY` | optional | Only if running GP co-active in the sandbox; on a test key `stripeV2Key()` falls back to `STRIPE_SECRET_KEY`, so leave **unset** for Connect-only QA. |
| `STRIPE_V2_WEBHOOK_SECRET` | optional | Only for the GP v2 webhook route. Leave unset for Connect-only. |
| `STRIPE_ALLOW_LIVE_PAYOUTS` | **do NOT set** on a `sk_test_` key | This is a **live-key** kill switch only. `isLiveStripeKey()` checks `sk_live_` prefix; on `sk_test_` `assertLivePayoutSafe()` always returns `ok:true`, so the flag is irrelevant in the sandbox. Set it (`true`) **only** if you ever point Connect at a `sk_live_` key — otherwise every transfer holds as `skipped_live_disabled`. |
| `NEXT_PUBLIC_APP_URL` / `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_BASE_URL` | both | Used to build onboarding return/refresh URLs; should already be set. |
| `CRON_SECRET` | both | Bearer for the reconcile-held-payouts cron (already used). |

The **API version pin** is in code, not env: v1 Connect = `2026-04-22.dahlia` (`client.ts` line 31).
Leave it — only change if the test account rejects that version.

**Env drift to fix while here** (`.env.example` omits these even though code reads them): add
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_V2_SECRET_KEY`, `STRIPE_V2_WEBHOOK_SECRET`,
`STRIPE_ALLOW_LIVE_PAYOUTS` to `web/.env.example` with comments, so a fresh sandbox provisioning
doesn't miss the publishable key and silently break embedded onboarding.

### A.2 Stripe Dashboard setup (test mode)

1. **Enable Connect** on the test account; platform profile set up.
2. **Express** enabled as a connected-account type; transfers capability available.
3. Confirm the **platform country** supports the connected-account countries you'll QA (US platform →
   US connected accounts). The existing US sandbox account from prior proofs (`acct_1TdcQn95hTmH6Mbu`,
   USD; seeded talent destination `acct_1TdecR5oVqehJgOx`) is the known-good environment.
4. **Webhook endpoint** → point at `https://<host>/api/webhooks/stripe` (or use `stripe listen`
   locally). Subscribe to at minimum: `account.updated` (Connect status mirror + held-payout release),
   `payment_intent.succeeded` and/or `charge.succeeded` (booking_payment → `markPaid`),
   `charge.refunded`, `charge.dispute.*` (reversals). Copy the endpoint's signing secret into
   `STRIPE_WEBHOOK_SECRET`. (Either v1 route works — they share one idempotency ledger and the same
   secret. Register one.)
5. Fund the platform **test available balance** before running a transfer (a `tok_bypassPending`
   charge, e.g. $1050) so transfers are fundable.

### A.3 Code currently gating Connect off

**None for the money rail** — `resolveTalentPayoutRail` already defaults to `connect_transfer`. The
only thing biasing the *UI* away from Connect is `gpPrimary` in `PayoutsShell.tsx` (and the second GP
card). For a **US-residence** talent, `isConnectPayoutCountry('US')` is true and `gpPrimary` stays
false, so the Connect card already shows — no code change needed to QA Connect on the sandbox. The
`gpPrimary` UI is addressed properly by the switch in Part B.

### A.4 Confirm talent Express onboarding

- **Embedded** (live path): as a US test talent open `/[tenantSlug]/talent/payouts` → click "Set up
  payouts" → `ensureTalentPayoutAccount` creates the Express account → `<ConnectEmbeddedOnboarding>`
  (`data-testid="connect-embedded-onboarding"`) mounts → complete KYC + test bank → `onExit` →
  `refreshTalentPayoutStatus`. Assert `talent_profiles.stripe_account_id` written,
  `stripe_account_status='enabled'`, `stripe_payouts_enabled=true`; card flips to green
  `data-testid="talent-payout-status"`.
- **Hosted link** (fallback): drive `startTalentOnboarding` → `accountLinks` URL → complete → return
  route `.../talent/settings/payouts/return` calls `refreshTalentAccountStatus` → redirect `?ok=1`.
  Confirm the same mirror columns update.

### A.5 Confirm agency Express onboarding

As a workspace owner at `/[tenantSlug]/admin/payouts`: click **Connect**, **pick country US** (avoid
the MX default cross-border ceiling) → `ensureWorkspacePayoutAccount` → `getConnectAccountSessionAction`
→ embedded onboarding → complete. Assert `public.agencies` row: `stripe_account_id`,
`stripe_account_status='enabled'`, `stripe_charges_enabled`/`stripe_payouts_enabled` true; StatusPill
reads **Active**.

### A.6 Confirm charge → Connect transfer → payout settles

Reproduce the prior US-sandbox proof (booking `d1269f18` / `tr_1Tdlye…`):
1. Seed a **USD** booking + `booking_transaction` in `payment_requested` for the Connect-onboarded US
   talent, with a commission snapshot whose lanes sum to gross and `talent_net_cents>0`.
2. Fund platform USD available balance (`tok_bypassPending` charge).
3. Drive `markPaid(txnId)` (the exact fn the webhook calls) via `npx tsx --env-file=.env.local` (no
   Stripe CLI needed for this leg).
4. Assert: `booking_transactions.status='paid'`; `agency_bookings.payment_status='paid'` +
   `client_revenue_lifecycle='fully_paid'`; `resolveTalentPayoutRail` returned `connect_transfer`
   (crypto opt-in false); a real `tr_…` in `stripe.transfers.list({transfer_group:'booking_<id>'})`;
   `booking_payouts` talent leg `status='transferred'` with that `tr_` id;
   `agency_bookings.payout_lifecycle='paid'`.

### A.7 Held-payout / reconcile path

- Seed a talent with **no enabled Connect account**, run `markPaid` → leg recorded `'held'`
  (`skipped_no_account`, no `tr_`), `getHeldPayoutTotals` returns it, `HeldPayoutsBanner` renders.
- Onboard/enable the account → fire `stripe trigger account.updated` (or finish onboarding) →
  `webhook-handler.persistAccountFromObject` → `releaseHeldPayouts` flips the leg to `'transferred'`
  reusing the **same** `transfer_<…>` idempotency key (no double-pay).
- Backstop: `GET /api/cron/reconcile-held-payouts` with `Authorization: Bearer $CRON_SECRET`
  re-attempts held legs. Note: `releaseHeldPayouts` is **Connect-only** (never consults the rail
  resolver) — correct when Connect is the default.

### A.8 End-to-end smoke checklist (numbered)

1. Add `STRIPE_SECRET_KEY=sk_test_…`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_…`,
   `STRIPE_WEBHOOK_SECRET=whsec_…` to `web/.env.local`; restart `npm run dev`.
2. Confirm `isStripeConfigured()` true (checkout no longer mock; a quick payouts-page load mounts
   embedded onboarding).
3. Talent **embedded** Express onboarding to `enabled` (US talent) → `talent_profiles.stripe_*`
   verified.
4. Talent **hosted-link** onboarding via return route → mirror updates.
5. Agency Express onboarding (US) to **Active** → `agencies.stripe_*` verified.
6. `stripe listen --forward-to localhost:3000/api/webhooks/stripe`; `stripe trigger account.updated`
   → no signature 400; mirror + held-release fire.
7. Seed USD booking → fund balance → `markPaid` → real `tr_…` settles to the connected account; ledger
   `transferred`; `payout_lifecycle='paid'`.
8. Held path: no-account talent → `'held'` → onboard → `account.updated` → released (same idempotency
   key).
9. Cron backstop: curl reconcile endpoint with `CRON_SECRET` → held legs release; re-run creates no
   duplicate transfer.
10. Negative live-gate check: on `sk_test_`, `assertLivePayoutSafe().ok===true` and
    `isLiveStripeKey()===false` → transfers are NOT held by `STRIPE_ALLOW_LIVE_PAYOUTS`.

## 4. Part B — The Platform Admin switch

Mirror the `operating_currency` toggle precedent exactly: a column on the `platform_settings`
singleton, a server-only lib (loader + raw writer), a thin super-admin action, an HQ settings card,
and a single gate inside `resolveTalentPayoutRail`. Default `'connect'`. Plus: hide all GP UI in
`PayoutsShell` when the switch is `'connect'`.

### B.1 DB migration (new file)

`supabase/migrations/<UTC-timestamp>_platform_settings_active_payout_system.sql` (timestamp via
`date -u +%Y%m%d%H%M%S` at start of work, to avoid multi-agent collision). **ADD COLUMN to the
existing singleton — do not CREATE TABLE.** Copy the ALTER form from
`20260603202858_commercial_terms_config.sql`:

```sql
alter table public.platform_settings
  add column if not exists active_payout_system text not null default 'connect';

alter table public.platform_settings
  add constraint platform_settings_active_payout_system_check
  check (active_payout_system in ('connect', 'global_payouts'));
```

(Guard the constraint add with a `do $$ … $$` block if `add constraint if not exists` isn't supported
in the pinned PG version.) Default `'connect'` makes a missing/failed read yield Connect.

### B.2 Server-only lib (new file) — `web/src/lib/payments/active-payout-system.ts`

Mirror `web/src/lib/platform/operating-currency.ts` + the typed-read idiom from
`commercial-defaults.ts`. Co-locate loader and writer (the raw `.from()` must live here, not in the
action, per the `no-untenanted-from` ratchet):

```ts
import "server-only";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type ActivePayoutSystem = "connect" | "global_payouts";
export const DEFAULT_PAYOUT_SYSTEM: ActivePayoutSystem = "connect";

export const loadActivePayoutSystem = cache(async (): Promise<ActivePayoutSystem> => {
  const sb = createServiceRoleClient();
  if (!sb) return DEFAULT_PAYOUT_SYSTEM;
  const { data, error } = await sb
    .from("platform_settings")
    .select("active_payout_system")
    .eq("id", true)
    .maybeSingle()
    .returns<{ active_payout_system: string | null }>(); // database.types.ts not regenerated this wave
  if (error || data?.active_payout_system !== "global_payouts") return DEFAULT_PAYOUT_SYSTEM;
  return "global_payouts";
});

export async function writeActivePayoutSystem(system: ActivePayoutSystem): Promise<void> {
  const sb = createServiceRoleClient();
  if (!sb) throw new Error("no service-role client");
  const { error } = await sb
    .from("platform_settings")
    .update({ active_payout_system: system })
    .eq("id", true); // singleton key — unqualified update would no-op / hit RLS
  if (error) throw error;
}
```

### B.3 Super-admin server action (new file) — `web/src/lib/server-actions/admin-platform-payout-system.ts`

Mirror `admin-platform-currency.ts` verbatim:

```ts
"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";   // same import as currency action
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { writeActivePayoutSystem } from "@/lib/payments/active-payout-system";

const Schema = z.object({ system: z.enum(["connect", "global_payouts"]) }).strict();

export async function updateActivePayoutSystem(input: unknown) {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false as const, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) return { ok: false as const, error: "Not authorized" };
  const parsed = Schema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "Invalid payout system" };
  await writeActivePayoutSystem(parsed.data.system);
  revalidatePath("/platform/admin/settings");
  revalidatePath("/talent", "layout"); // bust talent payouts UI so the card re-reads
  return { ok: true as const };
}
```

### B.4 Admin settings card + page wiring

- **New** `web/src/app/(workspace)/platform/admin/settings/PlatformPayoutSystemCard.tsx` — mirror
  `PlatformCurrencyCard.tsx`: `"use client"`, `useState(current)` + `useTransition` + dirty check +
  Save + status line; a radio/select between **Connect** and **Global Payouts**, calling
  `updateActivePayoutSystem`.
- **Edit** `web/src/app/(workspace)/platform/admin/settings/page.tsx`: add
  `const payoutSystem = await loadActivePayoutSystem();` next to `operatingCurrency`, render
  `<PlatformPayoutSystemCard current={payoutSystem} />` inside a new `HqCard` in the 2-col grid.

### B.5 Money-rail gate — `resolveTalentPayoutRail`

**Edit** `web/src/lib/payments/payout-rail-policy.ts`. Add an `activePayoutSystem` param to the pure
`decidePayoutRail` (single source of truth + unit-testable), and gate `resolveTalentPayoutRail` on
`loadActivePayoutSystem()` FIRST:

- `decidePayoutRail(input: { activePayoutSystem; gpActive; countryEligible; talentCryptoOptIn })` →
  return `{ rail:'connect_transfer', reason:'platform switch=connect' }` at the **top**, before the
  opt-in check.
- `resolveTalentPayoutRail` — call
  `const system = await (deps.activePayoutSystem ?? loadActivePayoutSystem)();` immediately after
  obtaining `sb`; `if (system === 'connect') return 'connect_transfer';` **before** the
  `talent_profiles` read (line 65) and before any Stripe call. Add an injectable
  `activePayoutSystem?: () => Promise<ActivePayoutSystem>` to `RailResolverDeps` for tests. This is
  the load-bearing gate: it force-pins Connect platform-wide even for a talent with a stale
  `crypto_payouts_enabled=true`, so the per-talent opt-in can never override the platform setting.

No edit to `transfers.ts` needed — `executeBookingTransfers` delegates to `resolveTalentPayoutRail`
and inherits the gate. The agency leg is already hardcoded Connect. The reconcile cron +
`account.updated` release path are already Connect-only.

### B.6 Hide all GP UI in `PayoutsShell` when switch = `'connect'`

The switch must reach `PayoutsShell.tsx`. Cleanest: thread the active system through the existing
client-load already happening in the `gpPrimary` effect. **Extend `loadTalentGpMethods`** (in
`.../payouts/actions.ts`) to also return `activePayoutSystem` (it calls `loadActivePayoutSystem()`
server-side and includes it in the result), so no new round-trip and no prop-plumbing through the
render sites.

Then in `PayoutsShell.tsx`:
1. **Effect (lines 124-134):** when `r.activePayoutSystem === 'connect'`, `setGpPrimary(false)`
   unconditionally — do NOT base it on `isConnectPayoutCountry` or GP-recipient existence. Store the
   system in state.
2. **"More ways to get paid" block (lines 324-334):** wrap in `{system !== 'connect' && (…)}` so the
   second `<GlobalPayoutsBankCard/>` is hidden in connect-mode.
3. **Unsupported-country copy:** the engine error from `createOrGetTalentConnectedAccount`
   (`stripe-connect-talent.ts` ~line 210) says "Use Get paid to your local bank below" — a lie when GP
   is hidden. In connect-mode, surface a clean "Payouts aren't available in your country yet" state
   instead. To avoid a dead end, also **filter the country `<select>`** (lines 274-280) to
   Connect-supported countries when `system === 'connect'` (intersect `PAYOUT_COUNTRIES` with
   `CONNECT_PAYOUT_COUNTRIES`) so a talent can't pick MX/AR/BR and immediately fail `accounts.create`.

When `system === 'global_payouts'` (the flipped-back state), all of the above is bypassed and today's
`gpPrimary` behavior is restored exactly — the switch is fully reversible.

### B.7 Optional display consumers

Any talent-facing "payout method" badge that reads `isGlobalPayoutsActive()` should also consult
`loadActivePayoutSystem()` so the UI doesn't advertise GP while the switch is `'connect'`. Low
priority; the core hide is B.6.

## 5. File-by-file change list

| File | New/Edit | What changes |
|---|---|---|
| `supabase/migrations/<ts>_platform_settings_active_payout_system.sql` | **new** | `alter table platform_settings add column active_payout_system text not null default 'connect'` + check constraint `in ('connect','global_payouts')`. |
| `web/src/lib/payments/active-payout-system.ts` | **new** | `loadActivePayoutSystem()` (cache-wrapped, `.returns<…>()`, default `'connect'`) + `writeActivePayoutSystem()` (raw `.update().eq('id',true)`). |
| `web/src/lib/server-actions/admin-platform-payout-system.ts` | **new** | `updateActivePayoutSystem` — `isPlatformAdmin` gate + zod `.enum(['connect','global_payouts']).strict()` → delegate to lib writer → `revalidatePath`. No raw `.from()`. |
| `web/src/app/(workspace)/platform/admin/settings/PlatformPayoutSystemCard.tsx` | **new** | Client card: connect/global_payouts selector, dirty + Save + status. Mirror of `PlatformCurrencyCard`. |
| `web/src/app/(workspace)/platform/admin/settings/page.tsx` | edit | `await loadActivePayoutSystem()` + render the new card in an `HqCard`. |
| `web/src/lib/payments/payout-rail-policy.ts` | edit | Add `activePayoutSystem` to `decidePayoutRail` (force connect at top); gate `resolveTalentPayoutRail` on `loadActivePayoutSystem()` first, before `talent_profiles` read; add injectable dep. |
| `web/src/lib/payments/payout-rail-policy.test.ts` | edit | Add `decidePayoutRail` case (`activePayoutSystem:'connect'` → connect even with optIn+gpActive+eligible) and a `resolveTalentPayoutRail` case (injected `activePayoutSystem:()=>'connect'` → connect, no GP check fired). |
| `web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts` | edit | `loadTalentGpMethods` also returns `activePayoutSystem` (calls `loadActivePayoutSystem`). |
| `web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/PayoutsShell.tsx` | edit | In connect-mode: force `gpPrimary=false`; hide the "More ways to get paid" GP block; filter country `<select>` to Connect-supported; swap the "use GP below" error copy for a country-not-supported state. |
| `web/.env.example` | edit | Add `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_V2_SECRET_KEY`, `STRIPE_V2_WEBHOOK_SECRET`, `STRIPE_ALLOW_LIVE_PAYOUTS` with comments. |
| `web/.env.local` | edit (local only, not committed) | Add `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` to run the Connect sandbox. |

No GP file is deleted. `disburse.ts`, `transfers.ts`, `global-payouts.ts`, `stripe-v2.ts`, the v2
webhook route, and `GlobalPayoutsBankCard.tsx` are untouched.

## 6. Risks & caveats

- **Connect can't open accounts in Mexico / most LatAm** (`CONNECT_PAYOUT_COUNTRIES` = US/GB/CA/CH +
  EEA). With the switch on `'connect'` and GP UI hidden, a MX/AR talent must hit a clean "not
  available in your country yet" state, NOT the now-broken "use Global Payouts below" copy. **This is
  the single biggest restore-Connect risk** — B.6 must land the copy change + country-`<select>`
  filter, or those talents hit a dead end. (The existing Orlando/MXN test talent will not see
  Connect — QA with a US talent.)
- **The switch makes flipping back one click** — set `active_payout_system='global_payouts'` on
  `/platform/admin/settings` and today's GP behavior returns exactly. Nothing is destroyed.
- **Live-key safety gate** — `STRIPE_ALLOW_LIVE_PAYOUTS` governs **both** rails inside `disburse`.
  Irrelevant on `sk_test_` (never "live"). But if Connect is ever pointed at `sk_live_`, transfers
  hold as `skipped_live_disabled` until the flag is `true`. Don't set it on the sandbox; do set it for
  any live Connect run.
- **`tsc` OOM false-green** — run typecheck with raised heap:
  `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit`, so a real type error on the new
  `active_payout_system` column read isn't masked.
- **Migration-drift prebuild gate** — `scripts/check-migrations-applied.mjs` runs as `prebuild`. The
  new ADD-COLUMN migration must be `npm run db:push`'d to remote Supabase **before** the PR merges to
  main, or the production build fails / 500s on the column the loader selects. `database.types.ts` is
  not regenerated this wave — hence the `.returns<…>()` typed read.
- **Two GP card render sites** — hiding GP in connect-mode must remove BOTH the `gpPrimary` branch
  card AND the "More ways to get paid" card; missing the second leaves GP visible.

## 7. Verification (localhost-first)

1. `npm run db:push` (apply the migration to remote Supabase) → `npm run db:check` must report
   **0 drift**.
2. `cd web && NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` → clean.
3. `cd web && npm run lint` → clean; confirm the new **action** file triggers **no**
   `no-untenanted-from` error (proves the raw `.from()` write lives in the lib, not the action).
4. `cd web && npm run test:billing` → existing `payout-rail-policy.test.ts` + the two new cases pass.
5. **Full Connect sandbox smoke (Part A.8, items 1-10)**: env set; embedded + hosted talent
   onboarding; agency onboarding; webhook signature OK; charge → real `tr_…` settles; held → release
   (same idempotency key); cron backstop; live-gate negative check.
6. **Switch smoke**: as super-admin set `active_payout_system='global_payouts'`, drive a payout for a
   crypto-opted-in MX talent → `resolveTalentPayoutRail` returns `global_payouts`. Flip to `'connect'`,
   re-run `executeBookingTransfers` on a fresh txn for the SAME talent → now `connect_transfer`. In the
   talent payouts UI in connect-mode confirm: no `GlobalPayoutsBankCard` anywhere, Connect card shows
   for everyone, country `<select>` offers only Connect-supported countries.
7. **Deploy per protocol**: branch off latest `main`; commit (migration + code together); push; PR to
   `main`; merge → Vercel production deploy.
8. After deploy: `cd web && npm run deploy:smoke` (alias + migration-drift health probe); re-alias
   `tulala.digital` + `app.tulala.digital` if the production pointer drifted (per CLAUDE.md).

## 8. Rollout / sequencing

**Do Part A first so the user can test Connect immediately**, then land Part B.

1. **Restore + verify the Connect sandbox (Part A)** — set `web/.env.local` keys, configure the
   Stripe Dashboard test-mode Connect + Express + webhook, run the A.8 smoke checklist to green. This
   is config-only and unblocks the user's stated priority. Commit the `.env.example` drift fix and
   (optionally) Vercel preview/prod env keys here.
2. **Land the switch (Part B)** — on the same feature branch: write the migration, `db:push`, build
   the lib + action + card + page wiring, the `resolveTalentPayoutRail` gate, the `PayoutsShell`
   GP-hide, and the test extension. Gate (`tsc` raised-heap + `lint` + `test:billing`), open the PR,
   merge → deploy → `deploy:smoke`. Default `'connect'` means the moment it ships, Connect is the
   platform default with no manual flip; GP is one super-admin click away and all GP code is
   preserved.

### Key files (absolute paths) for the implementer
- Rail gate: `web/src/lib/payments/payout-rail-policy.ts` (resolveTalentPayoutRail line 58,
  short-circuit before line 65; decidePayoutRail line 29)
- Talent UI: `web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/PayoutsShell.tsx`
  (gpPrimary effect 124-134; GP branch 242-244; "More ways" block 324-334; country select 274-280)
- Talent actions: `web/src/app/(workspace)/[tenantSlug]/talent/settings/payouts/actions.ts`
- Money fan-out: `web/src/lib/payments/transfers.ts` (152-155, 254-266) and
  `web/src/lib/bookings/transactions.ts` (markPaid line 571)
- v1 client: `web/src/lib/stripe/client.ts` (line 31 API pin)
- Precedents to mirror: `web/src/lib/platform/operating-currency.ts`,
  `web/src/lib/platform/commercial-defaults.ts`,
  `web/src/lib/server-actions/admin-platform-currency.ts`,
  `web/src/app/(workspace)/platform/admin/settings/PlatformCurrencyCard.tsx`,
  `supabase/migrations/20260603202858_commercial_terms_config.sql`
