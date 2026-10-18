# Stripe TEST run order (2026-10-18)

Nothing here has been run: the preview env `STRIPE_SECRET_KEY` is empty. Everything below is staging (`fxlankepwnvelxjrahwk`) and Stripe TEST only; no step has a production mode.
The staging deployment also needs its own `STRIPE_SECRET_KEY=sk_test_...` for checkout to open (env list: `docs/plans/staging-env-vars-needed-2026-10-18.md`).

## Review of the Group-6 `--stripe` path (read end to end, before and after this change)

| Finding | Before | Now |
|---|---|---|
| Re-run safety | Idempotency keys only (Stripe forgets them after 24h): a re-run next day could create a second customer / PaymentIntent | Look up first: customers and PaymentIntents by `metadata` search (`seed=qa-fixture-g6`, `fixture_key`, `transaction_id`), subscriptions by customer, prices by lookup key; the idempotency key is only a second guard inside one run |
| Default payment method | Passed `pm_card_visa` as `invoice_settings.default_payment_method` (the attached card has its own id, so this would fail) | Attach `pm_card_visa` on customer create, then set the attached method's id as default |
| Price | Inline `price_data` (not a catalog price, so plan change and proration could not work) | Subscription on the catalog TEST price by lookup key `tulala_<plan>_<interval>_usd` (made by `seed-stripe-test-prices.mjs`); refuses with the exact command if it is missing |
| Refundable PaymentIntent | Created before the DB rows, stored only on first insert, so a Stripe run after a plain `--apply` never attached it | `attachRefundablePaymentIntent` finds or creates the PI and merges its id into OUR existing money row (`payment_intent_id`, same shape as the TUL-690 seed) |
| TEST-only guard | `sk_test_` prefix only | prefix (refuses `sk_live_`, `rk_live_`, `rk_test_`, junk) AND the API must report `livemode=false` (`GET /v1/balance`, plus `GET /v1/account` if it carries the field) before any write |
| Key handling | Env only | env `STRIPE_SECRET_KEY` or `--stripe-key-file <path>`: refused unless mode is 600-like (no group/world bits); parsed, never printed |
| Cleanup | cancelled one subscription | cancels and deletes both fixture customers; PaymentIntents cannot be deleted |

What `--apply --stripe` creates: (a) TEST customer + subscription for T1 (Max, monthly) and for the owner talent TAL-96003 (Pro, monthly, so a plan change can be exercised), with `talent_subscriptions` rows; billing portal, invoices, cancel/resume and proration all hang on these; (b) one succeeded PaymentIntent (800.00 MXN, `pm_card_visa`) on the refundable booking so a real TEST refund works; (c) nothing for the pay-later booking on purpose: the client's "Pagar ahora" mints its own payment link and Checkout session at click time (links expire), so that path needs only the app's own `sk_test_` and the TEST prices.

## Order of operations

0. Put the key in a local file, never in chat: `~/.tulala-stripe-test.env` containing `STRIPE_SECRET_KEY=sk_test_...`, then `chmod 600`.
1. Preflight, read-only (writes nothing): `npx tsx scripts/seed-group6-staging-fixtures.mts --stripe --preflight --stripe-key-file ~/.tulala-stripe-test.env`. It proves `sk_test_` + `livemode=false`, lists which of the 10 plan lookup keys and 2 coupons exist, which fixture customers/PI exist, and prints what step 6 would create (BLOCKED lines name what is missing).
2. TEST prices: `node scripts/seed-stripe-test-prices.mjs --dry-run`, then without `--dry-run` (needs `STRIPE_SECRET_KEY_TEST_US` set from the same key, plus the staging `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to read the catalog amounts; it never writes `product_prices`). It prints `lookup_key -> price id`.
   Optional, for promo cards (TUL-833): `node scripts/seed-stripe-test-coupons.mjs --apply`.
3. Runner dry run (PR #4010, `seed-product-prices-from-stripe-test.mjs`): pass the price ids from step 2; read-only, prints one line per row (`insert|update|unchanged`).
4. Runner apply: same flags plus `--apply --backup-file ~/stripe-test-seed-backup.json` (needed; one transaction; prints a read-back). Undo: `--cleanup --backup-file ...`. This is what makes the app's checkout find a TEST price (writes `product_prices`).
5. Group-6 selftest: `npx tsx scripts/seed-group6-staging-fixtures.mts --env-file <staging env pull> --selftest` (rolls back; confirms the DB side is healthy).
6. Group-6 Stripe apply: `... --apply --stripe --stripe-key-file ~/.tulala-stripe-test.env`. Re-run it once: it must create 0 new Stripe or DB rows (look-up-first). Preflight (step 1) afterwards should show everything as `reuse`.
7. Sign-in and read-back: `node scripts/check-group6-fixture-login.mjs --env-file <staging env pull>`; the read-back lines of step 6 (counts only).

## What each step unblocks

| Step | Cards |
|---|---|
| 2 (TEST prices in Stripe) | prerequisite for 3-4 and for step 6 subscriptions |
| 3-4 (runner, `product_prices`) | TUL-829, 830, 831, 832, 833 (with coupons), 835, 837, 817 (price ids), 1051 prep: the "No Stripe price configured" message disappears and upgrade checkout reaches Stripe TEST. The paid half of TUL-1059 (price/currency display on a paid plan) |
| 6 (a) subscriptions | TUL-834 billing portal + invoices in Settings > Billing; cancel/resume; upgrade/downgrade with proration (needs 3-4 as well, because the in-app plan change reads `product_prices`) |
| 6 (b) PaymentIntent | the real TEST refund click on the refundable booking (refund CTA already shows without it) |
| pay-later checkout | TUL-1252 end to end: needs steps 2-4 plus the app's own `sk_test_` on the staging deployment; no seed object |
