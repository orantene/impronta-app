# TUL-514 — fxlank grant hygiene (ops)

**Project:** `fxlankepwnvelxjrahwk` only. Never production.

Production already applied EXECUTE hygiene in ledger migrations
`20260906031100_integration_grants_and_definer_rpc_hygiene.sql`,
`20261120000000_media_predicates_revoke_public.sql`, and
`20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql`. fxlank
drifted: 44 SECURITY DEFINER names still allow `anon` EXECUTE. Replaying those
full migrations on fxlank is unsafe (leftover tables may be missing), so the
extracted script lives outside the migration ledger.

## Script

`supabase/manual_fxlank_grant_hygiene.sql`

For each of the 44 names: if a `public` function exists, `REVOKE EXECUTE FROM
PUBLIC, anon, authenticated` and `GRANT EXECUTE TO service_role`. Missing names
are skipped. The trailing `SELECT` lists any of the 44 that still have anon
EXECUTE (empty = pass).

## Who applies

PM (or an operator with fxlank SQL access). Cursor agents do **not**
`npm run db:push` this file and must not add it under `supabase/migrations/`.

## How to apply

1. Confirm the Supabase SQL Editor (or `psql`) session is project
   `fxlankepwnvelxjrahwk`, not production.
2. Paste and run `supabase/manual_fxlank_grant_hygiene.sql`.
3. Confirm the verification query returns zero rows.

Isolated repair (`cd web && npm run journeys:repair -- <migration.sql>…`) is
for **versioned ledger files** on fxlank. This script is `manual_*.sql` — use
the SQL Editor (or an equivalent isolated `DATABASE_URL` session), not
`db:push`.
