# Stripe TEST webhook for staging: runbook (TUL-830, 829, 831, 835)

Workflow: `.github/workflows/stripe-staging-webhook.yml`. Script: `web/scripts/stripe-staging-webhook.mjs`. Guards: `web/scripts/lib/stripe-staging-webhook.mjs` (tests run as the workflow's first step).

## What staging needs, and why this lane
- Vercel Preview has `STRIPE_FORCE_TEST_MODE=1` (checked 2026-10-19, names/scopes only). With the flag on, `lib/stripe/env-keys.ts` reads the `_TEST` sibling of every Stripe name. Preview has `STRIPE_SECRET_KEY_TEST`, `STRIPE_MX_SECRET_KEY_TEST`, `STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST`, but **no `STRIPE_WEBHOOK_SECRET_TEST` and no `STRIPE_MX_WEBHOOK_SECRET_TEST`**, so every staging webhook answers 503 today.
- Plan billing (talent + workspace checkout, plan change, dunning) calls `getStripe()`, the **US lane**. Its events must arrive on `/api/webhooks/stripe`, verified with `STRIPE_WEBHOOK_SECRET_TEST`. The 01:25 card note named `/api/webhooks/stripe-mx`; that route processes with the MX client and claims under `platform_mx`, so subscription syncs would read the wrong account whenever the two TEST keys differ. The workflow defaults to `us`.
- Never register both URLs on one account: every event would settle twice under two idempotency lanes. The script refuses when the other lane's URL is already registered.

## Run
1. Actions > Stripe staging webhook > Run workflow, `lane=us`, `dry_run=yes`. Read the plan line: `create`, `reuse` or a REFUSED reason. It prints the Stripe account id (not secret) so it can be compared with the account the Preview `STRIPE_SECRET_KEY_TEST` belongs to.
2. Run again with `dry_run=no`. It creates the endpoint (36 account-level events: every non-Connect event `webhook-routing.ts` routes, including the 6 `subscription_schedule.*` that prove period-end plan changes and `refund.updated`/`refund.failed`; a test fails if the router gains one that is not listed. `api_version` is pinned to the app client's `2026-04-22.dahlia`, also test-pinned. Metadata `managed_by=tulala-staging-webhook-workflow`) and writes `STRIPE_WEBHOOK_SECRET_TEST` as a **sensitive, Preview-only, all-branches** Vercel var. Production entries with the same name are never read or written.
3. Re-runs are safe: endpoint + var present = only the event list is synced.
4. A disabled endpoint on the same URL is ignored (never reused or deleted).
5. If the endpoint exists but the var was lost, Stripe cannot show the secret again: run with `recreate=yes`. It deletes only an endpoint this workflow made.

## Refusals (exit 2, nothing written)
Key not `sk_test_`/`rk_test_`; `/v1/balance` not `livemode:false`; URL not an https staging host; an endpoint already on the other lane; two endpoints on the same URL; a Vercel entry for the var shared by preview and production; two preview-wide entries.

## After it runs
- Nothing changes on staging until the next staging build (Oran's GO). No build is fired here.
- Proof after that build: a TEST checkout with 4242 on `pay.staging.tulala.digital`; Stripe shows a 200 delivery for `checkout.session.completed`; the plan row is active.
- Assumption to confirm in step 1: the GitHub secret `STRIPE_TEST_SECRET_KEY` and Vercel Preview `STRIPE_SECRET_KEY_TEST` are the same sandbox (the seeded `product_prices` already assume it). If the account ids differ, stop: the endpoint must live on the account that charges.

## Extended lanes (2026-10-19, feat/stripe-staging-test-config)

The workflow now takes `lane = us | connect | mx | portal | client-pro-price | all`, `dry_run` (default `yes`), `recreate` (default `no`) and `client_pro_amount_cents` (blank unless creating the Client Pro price). Planning is in `web/scripts/lib/stripe-staging-config.mjs` (tests: `stripe-staging-config.test.mjs`, run as the workflow's first step and in the money lane).

| Lane | Stripe object (TEST) | Key | Vercel Preview var |
|---|---|---|---|
| `us` | account webhook endpoint, `/api/webhooks/stripe`, 36 events | `STRIPE_TEST_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET_TEST` (sensitive) |
| `connect` | CONNECT webhook endpoint (`connect=true`), same `/api/webhooks/stripe` route, 6 events | `STRIPE_TEST_SECRET_KEY` | `STRIPE_WEBHOOK_SECRET_CONNECT_TEST` (sensitive) |
| `mx` | account + CONNECT endpoints on `/api/webhooks/stripe-mx` | `STRIPE_MX_TEST_SECRET_KEY` | `STRIPE_MX_WEBHOOK_SECRET_TEST`, `STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST` (sensitive) |
| `portal` | billing portal configuration per account, tagged `metadata.tulala_seed=portal-config-v1` | both | `STRIPE_PORTAL_CONFIGURATION_ID_TEST`, `STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST` (encrypted) |
| `client-pro-price` | recurring price `lookup_key=tulala_client_pro_month_usd`, monthly USD | `STRIPE_TEST_SECRET_KEY` | `STRIPE_CLIENT_PRO_PRICE_ID_TEST` (encrypted) |
| `all` | every row above, in that order | | |

- **Two phases.** Every run first PLANS read-only (Stripe lists, Vercel names/scopes) and prints one line per step: action, target, var name and whether it exists / will be created / replaced. No value is ever printed. If ANY step plans `refuse`, the run exits 2 before writing anything. `dry_run=yes` stops after the plan.
- **Connect lanes.** One route serves both endpoint kinds: `handleStripeWebhook` (`lib/stripe/webhook-http.ts`) tries the account secret and the `_CONNECT` secret. Connect events = `account.updated`, `capability.updated` and the `payout.*` events whose handler reads `event.account` (a connected account's own payouts); a test derives this from `webhook-routing.ts`. An endpoint counts as Connect when Stripe sets its `application` or our metadata `lane` ends in `-connect`; account and Connect endpoints are planned separately, so one of each on the same URL is expected.
- **MX key.** GitHub had no MX TEST key on 2026-10-19. The workflow reads secret `STRIPE_MX_TEST_SECRET_KEY` (must be `sk_test_`/`rk_test_`). Missing: `lane=mx` fails with a clear error; `lane=all` and `lane=portal` print `skipped: STRIPE_MX_TEST_SECRET_KEY not set` for the MX steps and run the rest (exit 0). The MX key must belong to a DIFFERENT Stripe account than the US key (compared by `/v1/account` id); the same account refuses, since one account must not deliver to both URLs.
- **`STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST` already exists in Preview.** If the MX dry run plans `create` for `webhook:mx-connect` with that var `exists, will be replaced`, no MX Connect endpoint targets the staging URL today; confirm the old value is not in use before applying.
- **Portal features** (mirrors `scripts/seed-stripe-portal-config.mjs`, body shared via `scripts/lib/stripe-portal-config.mjs`): invoice history on; payment method update on; cancel at period end, no proration; plan switching on (price changes, `create_prorations`) across the products behind the 10 plan lookup keys `tulala_<plan>_<month|year>_usd`; pause off; customer name/address/tax updates off. An existing tagged configuration is reused unchanged. With no plan prices on the account, `lane=portal` refuses and `lane=all` skips that account's portal.
- **Client Pro price.** `lib/stripe/client-billing.ts` reads `STRIPE_CLIENT_PRO_PRICE_ID` through `stripeEnv`; no other `STRIPE_PRICE_*` name is read through `stripeEnv` (plan prices resolve from `product_prices`). The amount is not authoritative in code (the `/client/subscription` page shows a `$49 / mo` placeholder; `CLIENT_PRO_PRICING_LIVE=false`), so CREATING the price needs `client_pro_amount_cents`. An existing price with the lookup key is reused (and refused if its amount differs from the input, or it is not monthly USD). With no price and no amount, `lane=client-pro-price` refuses and `lane=all` skips.
- **Publishable keys are manual.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, `STRIPE_MX_PUBLISHABLE_KEY_TEST`, `NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY_TEST`: the Stripe API cannot return a publishable key. Copy the `pk_test_` values from each sandbox's dashboard (Developers > API keys) into Vercel Preview. The plan prints this list.

### Run order
1. `lane=all`, `dry_run=yes`. Read every plan line and the account ids (US must match Preview `STRIPE_SECRET_KEY_TEST`, MX must match `STRIPE_MX_SECRET_KEY_TEST`).
2. Same with `dry_run=no` (add `client_pro_amount_cents` once the amount is decided).
3. Re-runs are safe: existing endpoints only get their event list synced; portal/price are reused and their ids rewritten to the same value.

## Not covered
`STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET_TEST` (`/api/discover/subscriptions/webhook` needs its own endpoint; Client Pro is not sold yet), `STRIPE_V2_*_TEST`, `STRIPE_TERMINAL_READER_ID_TEST`. `TEST_SIBLING_COVERAGE` in `stripe-staging-config.mjs` lists every mode-bound name and its source; a test fails when `env-keys.ts` gains one.
