# supabase/ci — hermetic database for CI

CI-only scaffolding used by `.github/workflows/talent-website-e2e.yml` to build
the app schema from nothing but files in this repo: no production credentials,
no dump, no human step. Nothing here runs against production. Files in
`supabase/migrations/` are never edited — they are already applied in
production — so everything needed to replay them lives in this directory.

| File | Purpose |
|---|---|
| `local-postgres.sh` | Stands up a throwaway PostgreSQL cluster and creates the Supabase-managed pieces the migrations reference but never create (schemas `auth` / `storage` / `realtime` / `extensions`, the Supabase roles, `auth.users`, `auth.uid()`, `storage.objects`, `realtime.messages`, …). Use it when `supabase start` is unavailable or too slow to iterate against; it reproduces the CI result exactly. `up` / `reset` / `down` / `env` / `psql`. |
| `apply-migrations.sh` | Applies migrations with `psql`, one atomic transaction per file, recording each in `supabase_migrations.schema_migrations`. `--after <version>` applies only newer files (post-baseline delta, strict order). `--defer` replays the full history, parking files that fail and retrying them after later files apply. `FAILURE_REPORT=<file>` writes the full error text of anything that never applied. |
| `migration-shims/<version>.pre.sql` / `.post.sql` | Runs before / after one migration. Each shim's header states which migration, why it cannot apply from scratch, and what production state it reproduces. |
| `migration-shims/<version>.replace.sql` | Applied **instead of** the migration, for a file that holds a statement PostgreSQL rejects on every version, or that production recorded but never actually ran. Every use is printed as a `::warning`. Prefer a pre/post shim. |

## Status (2026-09-23): the full history replays

`--defer` against an empty database applies **859 of 859** migrations, exit 0,
349 public tables. Three are applied from a `.replace.sql` and say so in the
job summary; nothing is skipped and nothing fails.

Measured locally with `local-postgres.sh` on PostgreSQL 16 (2026-09-23:
751 applied in the first pass, the remaining 108 through 212 deferrals and the
looping final sweep). The same runner in GitHub Actions against a real local
Supabase reported **825/859 with 34 failures** before the shims below existed
(run https://github.com/orantene/impronta-app/actions/runs/35818716802) — that
run is the baseline these shims were written against, and its 34 failures are
now 0.

Spot checks that the result is production's schema and not merely a green run:
`analytics_events` is the only `analytics_*` table (the five companions from
`20260413120000` do not exist in production either);
`coordinator_join_requests` and `release_offering_stock` are absent, having
been created and dropped again exactly as the history does;
`_impronta_pages_backup_20260817` is present and locked down, which is what
`20261124000000` asserts; `supabase_migrations.schema_migrations` holds all
859 versions, the same ledger `supabase db push` would see.

### Why a from-scratch replay needs shims at all

The file order on disk is NOT the order production received them. Several
migrations were pushed after files with later timestamps, a few were applied
only because production had been hand-repaired first, and two are recorded in
production's ledger although they never actually ran. Five shapes recur, and
every shim in `migration-shims/` is one of them:

1. **A statement PostgreSQL rejects everywhere.**
   `20260409093000_locations_taxonomy_sync.sql` declares
   `sync_location_taxonomy_terms()` as `RETURNS VOID` and then uses it in
   `CREATE TRIGGER`. That fails on every version, in production too; production
   holds the function and no trigger. → `.replace.sql` minus the two impossible
   statements.

2. **Production holds objects no migration creates.**
   `public.find_taxonomy_assignment_drift()`, `_backfill_is_primary_20260805`,
   `_impronta_pages_backup_20260817` — later migrations only ALTER them.
   Reconstructed from the evidence in the migrations that alter them and from
   `web/src/lib/supabase/database.types.ts`, which is generated FROM
   production. Rows are never invented: the tables are created empty.

3. **Migrations that assert on production data.**
   `20260907160000` needs the role slug `singer` (the repo's own
   `20261230001700` documents that `singer` / `presenter` / `content-creator`
   are legacy rows no migration creates); `20260906030257` needs every pricing
   value tier to have a Spanish string; `20261230001900` / `20261230010100`
   refuse to apply without a tenant and a talent profile to prove against.
   → the minimal rows, seeded in a `.pre.sql` that no-ops when they exist.

4. **History pushed out of timestamp order.** The largest class. A file is
   deferred until the object it needs exists, and by then a LATER-stamped file
   has already changed the thing it was written against:
   `20260615211200` meets an `agency_taxonomy_settings` that a later
   create-if-missing file already built in post-fold shape;
   `20260602100100` / `20260615200005` meet policies a later file already
   created; `20260615200003` and `20261124000000` meet objects a later file
   already DROPPED; `20260923090000` and `20260930000000` are written against
   columns an earlier-stamped fold has already removed.
   → `.pre.sql` restores the shape production had at that moment, `.post.sql`
   puts the later state back, so the END state is production's.

5. **Recorded but never applied.** `20260413120000_analytics_internal_tables`
   ("WAS NEVER APPLIED ON THIS PROJECT", per `20260625140000`'s header;
   confirmed by `database.types.ts`, which has `analytics_events` and none of
   its five companion tables) and `20260913010000_media_v2_foundations` (it
   references `public.tenants`, which has never existed here; two later
   "corrected re-run" migrations say so and carry the real schema).
   Replaying them creates tables production does not have. → `.replace.sql`
   that is a documented no-op, so the ledger entry exists and the effect does
   not, which is both halves of the production state.

### The rule for writing a shim

A shim must never silently paper over a real schema difference. Every file
starts with a header naming the migration, the exact error, why it cannot apply
from scratch, and what production state it reproduces — with the evidence
(another migration's header, `database.types.ts`, a privilege query recorded in
a migration's comments). If you cannot justify it, do not write it.

## Iterating locally

`supabase start` needs Docker; a full replay takes ~20 minutes either way, so
iterate against a plain cluster instead:

```bash
bash supabase/ci/local-postgres.sh up          # initdb + start + Supabase scaffolding
eval "$(bash supabase/ci/local-postgres.sh env)"
FAILURE_REPORT=/tmp/failures.txt \
  bash supabase/ci/apply-migrations.sh --defer
cat /tmp/failures.txt                          # full error text per failing file
bash supabase/ci/local-postgres.sh reset       # empty database, same cluster
```

`local-postgres.sh` documents its own divergences from a real Supabase project
(PostgreSQL 16 vs `major_version = 17`; no auth/storage/realtime services, only
the schema objects the migrations touch). Treat it as the fast loop, and the
workflow's real local Supabase as the check.

## Fallback: a schema baseline from production (founder action)

Still supported, and no longer needed for CI to go green. The workflow switches
to baseline mode automatically as soon as `supabase/e2e-baseline.sql` exists. It
is a **schema-only** dump plus the migration history table (no customer data):

```bash
# from the repo root, with the Supabase CLI logged in and linked to prod
supabase db dump --linked -f /tmp/schema.sql   # schema-only is the default
supabase db dump --linked --data-only --schema supabase_migrations -f /tmp/history.sql
cat /tmp/schema.sql /tmp/history.sql > supabase/e2e-baseline.sql
```

Review it (it must contain no row data outside `supabase_migrations`), commit
it, and CI then loads it and applies only migrations newer than the latest
version it records, strictly in order. Nobody should hand-write or synthesize
this file: it must come from the real production schema. The one thing a
baseline still buys is a check that the replayed schema matches production —
worth doing once, as a diff, rather than as a permanent dependency.
