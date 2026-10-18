# Stripe TEST price seed: runbook (staging fxlank only)

Runner: `web/scripts/seed-product-prices-from-stripe-test.mjs` (guards and planning in `web/scripts/lib/stripe-test-seed.mjs`, tests in `stripe-test-seed.test.mjs`, enrolled in `npm run test:alias-guard`). It does what `supabase/seed-staging-notes/stripe_test_product_prices.sql` describes, with one change: `unit_amount` comes from the Stripe TEST price itself (the SQL's amounts were placeholders). Nothing here runs until PM calls it.

Two scripts, two jobs: the existing `web/scripts/seed-stripe-test-prices.mjs` (TUL-830) CREATES the plan catalog's prices in the Stripe TEST sandboxes by lookup key and prints their ids (it never writes `product_prices`). This runner takes those ids (or any TEST price ids) and WRITES them into `product_prices` on staging. Typical order: run the creator, copy its ids, dry-run this one.

## Run order (no Stripe key on the Mac)
The Stripe TEST key lives only in the GitHub secret `STRIPE_TEST_SECRET_KEY`. Nothing writes `~/.tulala-stripe-test.env`.
1. Trigger the workflow `.github/workflows/stripe-test-seed.yml` (Actions > Stripe test seed > Run workflow; `gh workflow run stripe-test-seed.yml` works only once the file is on `main`). It refuses an empty or non-test key, checks `/v1/account` says `livemode: false`, creates or finds the 8 plan prices by lookup key (`tulala_<plan>_<interval>_usd`), and uploads artifact `stripe-test-price-ids` (3 days). It touches no database.
2. Download the artifact (`gh run download <run-id> -n stripe-test-price-ids`) into the scratchpad, not the repo. It holds only id, lookup_key, livemode, interval, currency.
3. Dry run on the Mac (default, writes nothing), from `web/`:
   `DATABASE_URL=... node scripts/seed-product-prices-from-stripe-test.mjs --ids-file <path>/stripe-test-price-ids.json`
4. Post the dry-run output on TUL-817.
5. Wait for PM's shared-row note for fxlank (rule: note the PM before any shared fxlank row change).
6. Apply with a backup: same command plus `--apply --backup-file ~/stripe-test-seed-backup.json`.
7. Read-back (ids only) is printed by the apply; paste it on TUL-817.
8. Then trigger the `Billing E2E` workflow manually (Actions > Billing E2E > Run workflow) against `https://pay.staging.tulala.digital` (its default `BILLING_BASE_URL`), and post pass/fail on TUL-817.
Undo (needs no Stripe key either): `... --ids-file <json> --cleanup --backup-file ~/stripe-test-seed-backup.json` (the file is only parsed, cleanup ignores the ids).

`--ids-file` rules: every entry must have `livemode === false` (a `true`, missing or non-boolean value rejects the whole file); with the flag no Stripe key is required or read and Stripe is not called. Because the file carries no amount, rows get the catalog amounts (talent_pro 900/9000, talent_portfolio 1500/15000, studio 2900/29000, agency 7900/79000 cents, asserted equal to `plan-catalog.ts` by a test). It cannot be combined with the `--<row>` price flags. All other guards stay: fxlank-only login, no production mention in env, dry run by default, `--apply` needs `--backup-file`.

## What it refuses (exit 2, nothing written)
1. A DB login other than `postgres.fxlankepwnvelxjrahwk`.
2. Any env value that mentions `pluhdapdnuiulvxmyspd` (production); it names the variable, never the value.
3. A Stripe key that is not `sk_test_...` (`sk_live_`, `rk_live_`, `rk_test_`, empty, junk).
4. `GET /v1/account` not `livemode: false`, or any supplied price not `livemode: false`.
5. A price id that is not `price_...`, a missing required row, a one-sided website pair, duplicates, or a price that is archived, not USD, not recurring, wrong interval or `interval_count` other than 1.
6. `--apply` without `--backup-file`; `--cleanup` without the backup file of the apply.
7. A tier missing from the database (apply rolls back).

## Inputs
- `DATABASE_URL`: the staging pooler URL (user part `postgres.fxlankepwnvelxjrahwk`). Pull it the usual way (`vercel env pull <file> --environment=preview --git-branch=main` into the scratchpad, never into the repo, never printed).
- Stripe TEST key: `STRIPE_SECRET_KEY=sk_test_...` or `--stripe-key-file <path>` (a file with only the key, `chmod 600`). The Preview `STRIPE_SECRET_KEY` is empty today, so someone must supply one.
- Price ids, from the Stripe TEST dashboard (create recurring USD prices, yearly = 10 x monthly, lookup keys optional), as flags or env:

| Row | Flag | Env |
|---|---|---|
| talent_pro month / year | `--talent-pro-month` / `--talent-pro-year` | `STRIPE_TEST_PRICE_TALENT_PRO_MONTH` / `_YEAR` |
| talent_portfolio (tier `max`) | `--talent-max-month` / `--talent-max-year` | `STRIPE_TEST_PRICE_TALENT_MAX_MONTH` / `_YEAR` |
| studio | `--workspace-studio-month` / `-year` | `STRIPE_TEST_PRICE_WORKSPACE_STUDIO_MONTH` / `_YEAR` |
| agency | `--workspace-agency-month` / `-year` | `STRIPE_TEST_PRICE_WORKSPACE_AGENCY_MONTH` / `_YEAR` |
| website (optional, both or neither) | `--workspace-website-month` / `-year` | `STRIPE_TEST_PRICE_WORKSPACE_WEBSITE_MONTH` / `_YEAR` |

## Commands (from `web/`)
```
# 1. dry run (default): reads Stripe + the DB read-only, prints the plan
DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... node scripts/seed-product-prices-from-stripe-test.mjs \
  --talent-pro-month price_... --talent-pro-year price_... \
  --talent-max-month price_... --talent-max-year price_... \
  --workspace-studio-month price_... --workspace-studio-year price_... \
  --workspace-agency-month price_... --workspace-agency-year price_...

# 2. apply: one transaction, writes a backup of what it replaces, prints the read-back
... same flags ... --apply --backup-file ~/stripe-test-seed-backup.json

# 3. undo only this runner's rows (created rows deleted, replaced rows restored)
DATABASE_URL=... STRIPE_SECRET_KEY=sk_test_... node scripts/seed-product-prices-from-stripe-test.mjs \
  --cleanup --backup-file ~/stripe-test-seed-backup.json
```
The dry run prints one line per row: plan, `package.tier interval`, the Stripe price id, the amount in cents, `[insert|update|unchanged]` and the row it would replace. `--apply` prints the read-back (row ids and price ids only) and the plan to price id mapping. Rows it creates carry `notes = 'stripe-test-seed-runner'`; cleanup deletes only those and restores only updated rows whose price id is still the one it wrote.

## After it runs
- Open a talent upgrade on staging: the "No Stripe price configured" message is gone and checkout reaches Stripe TEST.
- The cards that waited on this: TUL-829, 830, 831, 832, 833, 835, 837, 1051 (prep).
- Do not run against production. This runner has no production mode.
