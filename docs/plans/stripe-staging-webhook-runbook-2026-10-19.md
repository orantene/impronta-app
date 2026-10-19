# Stripe TEST webhook for staging: runbook (TUL-830, 829, 831, 835)

Workflow: `.github/workflows/stripe-staging-webhook.yml`. Script: `web/scripts/stripe-staging-webhook.mjs`. Guards: `web/scripts/lib/stripe-staging-webhook.mjs` (tests run as the workflow's first step).

## What staging needs, and why this lane
- Vercel Preview has `STRIPE_FORCE_TEST_MODE=1` (checked 2026-10-19, names/scopes only). With the flag on, `lib/stripe/env-keys.ts` reads the `_TEST` sibling of every Stripe name. Preview has `STRIPE_SECRET_KEY_TEST`, `STRIPE_MX_SECRET_KEY_TEST`, `STRIPE_MX_WEBHOOK_SECRET_CONNECT_TEST`, but **no `STRIPE_WEBHOOK_SECRET_TEST` and no `STRIPE_MX_WEBHOOK_SECRET_TEST`**, so every staging webhook answers 503 today.
- Plan billing (talent + workspace checkout, plan change, dunning) calls `getStripe()`, the **US lane**. Its events must arrive on `/api/webhooks/stripe`, verified with `STRIPE_WEBHOOK_SECRET_TEST`. The 01:25 card note named `/api/webhooks/stripe-mx`; that route processes with the MX client and claims under `platform_mx`, so subscription syncs would read the wrong account whenever the two TEST keys differ. The workflow defaults to `us`.
- Never register both URLs on one account: every event would settle twice under two idempotency lanes. The script refuses when the other lane's URL is already registered.

## Run
1. Actions > Stripe staging webhook > Run workflow, `lane=us`, `dry_run=yes`. Read the plan line: `create`, `reuse` or a REFUSED reason. It prints the Stripe account id (not secret) so it can be compared with the account the Preview `STRIPE_SECRET_KEY_TEST` belongs to.
2. Run again with `dry_run=no`. It creates the endpoint (28 account-level events, metadata `managed_by=tulala-staging-webhook-workflow`) and writes `STRIPE_WEBHOOK_SECRET_TEST` as a **sensitive, Preview-only, all-branches** Vercel var. Production entries with the same name are never read or written.
3. Re-runs are safe: endpoint + var present = only the event list is synced.
4. If the endpoint exists but the var was lost, Stripe cannot show the secret again: run with `recreate=yes`. It deletes only an endpoint this workflow made.

## Refusals (exit 2, nothing written)
Key not `sk_test_`/`rk_test_`; `/v1/balance` not `livemode:false`; URL not an https staging host; an endpoint already on the other lane; two endpoints on the same URL; a Vercel entry for the var shared by preview and production; two preview-wide entries.

## After it runs
- Nothing changes on staging until the next staging build (Oran's GO). No build is fired here.
- Proof after that build: a TEST checkout with 4242 on `pay.staging.tulala.digital`; Stripe shows a 200 delivery for `checkout.session.completed`; the plan row is active.
- Assumption to confirm in step 1: the GitHub secret `STRIPE_TEST_SECRET_KEY` and Vercel Preview `STRIPE_SECRET_KEY_TEST` are the same sandbox (the seeded `product_prices` already assume it). If the account ids differ, stop: the endpoint must live on the account that charges.

## Not covered
Connect events (`account.updated`, `capability.updated`) need a separate Connect endpoint; plan billing does not use them.
