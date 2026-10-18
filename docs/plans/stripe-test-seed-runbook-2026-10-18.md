# Stripe TEST price seed: runbook (staging fxlank only)

Runner: `web/scripts/seed-product-prices-from-stripe-test.mjs` (guards and planning in `web/scripts/lib/stripe-test-seed.mjs`, tests in `stripe-test-seed.test.mjs`, enrolled in `npm run test:alias-guard`). It does what `supabase/seed-staging-notes/stripe_test_product_prices.sql` describes, with one change: `unit_amount` comes from the Stripe TEST price itself (the SQL's amounts were placeholders). Nothing here runs until PM calls it.

Two scripts, two jobs: the existing `web/scripts/seed-stripe-test-prices.mjs` (TUL-830) CREATES the plan catalog's prices in the Stripe TEST sandboxes by lookup key and prints their ids (it never writes `product_prices`). This runner takes those ids (or any TEST price ids) and WRITES them into `product_prices` on staging. Typical order: run the creator, copy its ids, dry-run this one.

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
