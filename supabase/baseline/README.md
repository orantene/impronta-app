# Baseline schema (card 272 / TUL-272)

Replaying `supabase/migrations/*.sql` on an empty database fails (later files
create objects earlier files use; see `docs/plans/baseline-schema-design.md`).
The fix is option A of that doc: a `pg_dump --schema-only` baseline at a
version V, with only migrations newer than V replayed on top.

## Files (the expected dump path)

| File | Meaning |
|---|---|
| `supabase/baseline/baseline.schema.sql` | The post-processed schema-only dump. |
| `supabase/baseline/BASELINE_VERSION` | One line: V, the NEWEST migration version the dump contains (e.g. `20261231348000`). Must be a version that exists in `supabase/migrations`. |
| `supabase/baseline/README.md` | This file. |

The dump and `BASELINE_VERSION` are NOT in the repo until the Release Manager
adds them (TUL-283). Until then `.github/workflows/baseline-schema-check.yml`
is a no-op that passes with a notice.

## How the dump is produced (human, with credentials)

> **ISOLATED PROJECT ONLY, NEVER PRODUCTION.**
> Project ref `fxlankepwnvelxjrahwk`. Never use a `DATABASE_URL` from
> `web/.env*`. Agents do not run this step.

```
cd web
npx supabase link --project-ref fxlankepwnvelxjrahwk      # confirm the ref twice
npx supabase db dump --linked --schema-only -f ../supabase/baseline/baseline.schema.sql
```

Then, in the same change:

1. Record V. Read the isolated project's newest ledger version
   (`supabase migration list --linked`, last row of the Remote column) and write
   it as the single line of `supabase/baseline/BASELINE_VERSION`. V must equal
   the newest migration whose effects the isolated project already has.
2. Post-process the dump (keep the edit list in the commit message):
   - Delete `ALTER ... OWNER TO "supabase_admin"` lines (and other platform
     owners such as `supabase_auth_admin`, `supabase_storage_admin`). A fresh
     Supabase image already owns its own objects.
   - Delete `GRANT`/`REVOKE`/`ALTER DEFAULT PRIVILEGES` lines whose target is a
     `supabase_admin`-owned platform object. Keep grants on our own `public`
     objects to `anon`, `authenticated`, `service_role`.
   - Delete `CREATE SCHEMA` for platform schemas (`auth`, `storage`, `vault`,
     `realtime`, `extensions`, `graphql*`, `pgsodium*`) and any object defined
     inside them, except our own triggers/policies ON those tables (for example
     the trigger on `auth.users`, policies on `storage.objects`).
   - Keep `CREATE EXTENSION` lines (btree_gist, citext, pg_trgm, vector,
     pgcrypto, uuid-ossp, pg_net, supabase_vault); the CI image provides them.
   - Remove `\restrict` / `\unrestrict` psql meta lines if pg_dump emits them.
3. Check the file is non-empty and loads on a Supabase Postgres 17 image
   (the CI job does exactly that).

## How CI uses it

`.github/workflows/baseline-schema-check.yml` runs on PRs touching
`supabase/migrations/**` or `supabase/baseline/**`:

1. Plan: `node web/scripts/baseline/baseline-plan.mjs` validates the files and
   lists migrations > V.
2. Start a `supabase/postgres` 17 container, load the baseline, apply the
   migrations > V in order with `psql -v ON_ERROR_STOP=1`.
3. Smoke check: tables in `public` must be > 0; totals are printed.

Not checkable offline: whether a migration > V was already folded into the dump
(it would then fail or double-apply on replay). The replay run is the only
detector; a failure there usually means V is too low.

The image tag in the workflow (`supabase/postgres:17.6.1.054`) was chosen
offline and has not been pulled; if the first real run cannot pull it, pick a
17.x tag from the supabase/postgres Docker Hub page.

## How to refresh

Pick a newer V when the replay list grows long. Re-run the dump above against
the isolated project AFTER the isolated project has received the new
migrations, update `BASELINE_VERSION`, re-apply the post-processing, and open a
PR. The CI job proves it loads and replays.

## Human step, not automated here: mark migrations <= V as applied

A fresh database built from the baseline has no ledger rows for the migrations
the baseline already contains. A human with access to that fresh database
marks them so `supabase db push` does not try to replay them:

```
supabase migration repair --status applied <each version <= V> --db-url <FRESH db url>
```

Never run this against production or the isolated project (both already have
their ledger). This change does not run it and nothing in CI does.
