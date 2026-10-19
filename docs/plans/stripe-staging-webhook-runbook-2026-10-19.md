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

## Full staging TEST config: local script (2026-10-19, feat/stripe-staging-test-config)

The workflow above stays as it is on main (us/mx account webhook only). Everything else runs from Oran's Mac with a local script; no GitHub secret or workflow change is needed:

```
node web/scripts/stripe/provision-staging-test.mjs --lane <us|connect|mx|portal|client-pro-price|all> \
     [--apply] [--recreate] [--client-pro-amount-cents N] [--keys-file PATH]
```

**Dry run by default.** Only `--apply` writes. Planning lives in `web/scripts/lib/stripe-staging-config.mjs` (tests in `stripe-staging-config.test.mjs`, money lane).

| Lane | Stripe object (TEST) | Account | Vercel Preview var (sensitive) |
|---|---|---|---|
| `us` | platform webhook endpoint, `/api/webhooks/stripe`, 36 events | US | `STRIPE_WEBHOOK_SECRET_TEST` |
| `connect` | CONNECT webhook endpoint (`connect=true`), same `/api/webhooks/stripe` route, 6 events | US | `STRIPE_WEBHOOK_SECRET_CONNECT_TEST` |
| `mx` | platform + CONNECT endpoints on `/api/webhooks/stripe-mx` | MX | `STRIPE_MX_WEBHOOK_SECRET_TEST`, `STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST` |
| `portal` | billing portal configuration per account, tagged `metadata.tulala_seed=portal-config-v1` | US + MX | `STRIPE_PORTAL_CONFIGURATION_ID_TEST`, `STRIPE_MX_PORTAL_CONFIGURATION_ID_TEST` |
| `client-pro-price` | recurring price `lookup_key=tulala_client_pro_month_usd`, monthly USD | US | `STRIPE_CLIENT_PRO_PRICE_ID_TEST` |
| `all` | every row above, in that order | | |

### Safety checks (all run before any write; any failure exits 2)
1. **Key source.** Default file: the MAIN checkout's `web/.env.local`, which also holds the PRODUCTION database settings. The script reads ONLY `STRIPE_SECRET_KEY` and `STRIPE_MX_SECRET_KEY` from it with its own line parser (`readNamedVars`). It never loads the file into `process.env` and never reads `process.env` at all. There is no database client and no database call. A static test pins all of this. The flag is `--keys-file`, NOT `--env-file`: Node 20 consumes `--env-file` itself, even after the script name, and would load the whole file into the environment.
2. **Test keys only.** Each key must start with `sk_test_` or `rk_test_`, and `/v1/balance` must say `livemode: false`.
3. **Account pinning.** The account fingerprint in each secret key (the 15 characters after `_test_51`, which is the account id minus `acct_1`) must equal the one in the Preview publishable key (US `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST`, MX `STRIPE_MX_PUBLISHABLE_KEY_TEST`), and the `/v1/account` id must end with it. The publishable key is read into memory by env id through `vercel api` and is never written to disk. US and MX must be different accounts. On 2026-10-19 the fingerprints ended `...mH6Mbu` (US) and `...Z8nV66` (MX).
4. **Vercel writes.** Type `sensitive`, target exactly `["preview"]` (`vercelWriteBody`, test-pinned), all branches. Each write upserts the one preview-wide entry by id, so nothing is duplicated, and any entry shared with production refuses. Writes go through the logged-in Vercel CLI (`vercel api`) with the body on stdin, never in argv.
5. **No value is ever printed or logged.** The plan shows names, URLs, event counts, amounts and fingerprint labels only.

### Plan output
- **Plan before write.** Every run first PLANS read-only: Stripe lists plus Vercel env names and scopes. For each step it prints the account fingerprint, the object (endpoint URL + event count; portal feature summary; price amount and interval, or "needs --client-pro-amount-cents") and the var name with whether it exists / will be created / will be REPLACED. Then it lists every var `--apply` would write. If ANY step plans `refuse`, it exits 2 before writing anything.
- **Missing MX key.** If `STRIPE_MX_SECRET_KEY` is missing from the file, `--lane mx` refuses, while `--lane all` and `--lane portal` print `skipped:` for each MX step and run the rest.
- **Connect lanes.** One route serves both endpoint kinds: `handleStripeWebhook` (`lib/stripe/webhook-http.ts`) tries the account secret and the `_CONNECT` secret. Connect events = `account.updated`, `capability.updated` and the `payout.*` events whose handler reads `event.account` (a connected account's own payouts); a test derives this from `webhook-routing.ts`. An endpoint counts as Connect when Stripe sets its `application` or our metadata `lane` ends in `-connect`; account and Connect endpoints are planned separately, so one of each on the same URL is expected.
- **Existing vars.** `STRIPE_WEBHOOK_SECRET_TEST` and `STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST` already exist in Preview. If the dry run plans `create` for their lane with `will be REPLACED`, no matching endpoint targets the staging URL today; confirm the old value is not in use before `--apply`.
- **Portal features** (mirrors `scripts/seed-stripe-portal-config.mjs`, body shared via `scripts/lib/stripe-portal-config.mjs`): invoice history on; payment method update on; cancel at period end, no proration; plan switching on (price changes, `create_prorations`) across the products behind the 10 plan lookup keys `tulala_<plan>_<month|year>_usd`; pause off; customer name/address/tax updates off. An existing tagged configuration is reused unchanged. With no plan prices on the account, `lane=portal` refuses and `lane=all` skips that account's portal.
- **Client Pro price.** `lib/stripe/client-billing.ts` reads `STRIPE_CLIENT_PRO_PRICE_ID` through `stripeEnv`; no other `STRIPE_PRICE_*` name is read through `stripeEnv` (plan prices resolve from `product_prices`). The amount is not authoritative in code (the `/client/subscription` page shows a `$49 / mo` placeholder; `CLIENT_PRO_PRICING_LIVE=false`), so CREATING the price needs `--client-pro-amount-cents`. An existing price with the lookup key is reused (and refused if its amount differs from the input, or it is not monthly USD). With no price and no amount, `--lane client-pro-price` refuses and `--lane all` skips.
- **Publishable keys.** `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY_TEST` and `STRIPE_MX_PUBLISHABLE_KEY_TEST` are already in Preview and pin the accounts. `NEXT_PUBLIC_STRIPE_MX_PUBLISHABLE_KEY_TEST` is not: the Stripe API cannot return a publishable key, so copy the MX `pk_test_` from the dashboard (Developers > API keys) into Vercel Preview. The plan prints this list.

### Run order
1. `node web/scripts/stripe/provision-staging-test.mjs --lane all`: a dry run. Read every plan line.
2. Same with `--apply` (add `--client-pro-amount-cents N` once the amount is decided). This needs the consultant's review first.
3. Re-runs are safe: existing endpoints only get their event list synced, and the portal and price are reused, with their ids rewritten to the same value.

## Not covered
`STRIPE_CLIENT_SUBSCRIPTION_WEBHOOK_SECRET_TEST` (`/api/discover/subscriptions/webhook` needs its own endpoint; Client Pro is not sold yet), `STRIPE_V2_*_TEST`, `STRIPE_TERMINAL_READER_ID_TEST`. `TEST_SIBLING_COVERAGE` in `stripe-staging-config.mjs` lists every mode-bound name and its source; a test fails when `env-keys.ts` gains one.
