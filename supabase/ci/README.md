# supabase/ci — hermetic database for CI

CI-only scaffolding used by `.github/workflows/talent-website-e2e.yml` to build
the app schema inside a throwaway local Supabase (no secrets, no shared
project). Nothing here runs against production. Files in `supabase/migrations/`
are never edited: they are already applied in production.

| File | Purpose |
|---|---|
| `apply-migrations.sh` | Applies migrations with `psql`, one atomic transaction per file, recording each in `supabase_migrations.schema_migrations`. `--after <version>` applies only newer files (post-baseline delta, strict order). `--defer` replays the full history, parking files that fail and retrying them after later files apply. |
| `migration-shims/<version>.pre.sql` / `.post.sql` | Runs before / after one migration. Each shim's header states why it is needed. |

## Status (2026-09-23): the full history cannot be replayed

Confirmed on a real local Supabase in GitHub Actions
(run https://github.com/orantene/impronta-app/actions/runs/35818716802):
`--defer` applies **825 of 859** migrations (348 public tables); **34 cannot
apply**. Root causes:

1. **One migration can never apply as written.**
   `20260409093000_locations_taxonomy_sync.sql` creates
   `public.sync_location_taxonomy_terms()` as `RETURNS VOID`, then uses it in
   `CREATE TRIGGER ... EXECUTE FUNCTION public.sync_location_taxonomy_terms()`.
   Postgres rejects that on every version ("function ... must return type
   trigger"), and the file wraps everything in one transaction, so no pre- or
   post-shim can make it pass. Production records it as applied, so production
   history was repaired by hand at that point (the function exists there as
   `RETURNS void`; later migrations redefine it the same way).
2. **Production holds objects that no migration creates**, which later
   migrations alter: `public.find_taxonomy_assignment_drift()`
   (`20260906031100`), `public._backfill_is_primary_20260805`
   (`20261113000000`), `public._impronta_pages_backup_20260817`
   (`20261124000000`).
3. **Some migrations assert on production data**: `20260906030257` (Spanish
   labels on existing comparison rows), `20260907160000` (the role slug
   `singer` must exist), `20261230001900` and `20261230010100` (a talent
   profile must exist).
4. **History was pushed out of timestamp order**: files stamped May 2026
   depend on tables created by files stamped June 2026, and some files expect
   state that another file already replaced, e.g. `20260602100100` and
   `20260615200005` create policies that `20260515184622` / others already
   created, and `20260918000000` then asserts that 53 policies were rewritten.
   `--defer` resolves the missing-object cases (228 deferrals) but cannot
   recover the true production order.
5. The remaining failures cascade from the above (for example
   `20260615211200` fails, so every later view that reads
   `taxonomy_terms.name_i18n` fails too).

The exact list of failing files is printed in each run's job summary.

## Fallback: a schema baseline from production (founder action)

The workflow switches to baseline mode automatically as soon as
`supabase/e2e-baseline.sql` exists. It is a **schema-only** dump plus the
migration history table (no customer data). Produce it once with the linked
production project:

```bash
# from the repo root, with the Supabase CLI logged in and linked to prod
supabase db dump --linked -f /tmp/schema.sql   # schema-only is the default
supabase db dump --linked --data-only --schema supabase_migrations -f /tmp/history.sql
cat /tmp/schema.sql /tmp/history.sql > supabase/e2e-baseline.sql
```

Review it (it must contain no row data outside `supabase_migrations`), commit
it, and CI then loads it and applies only migrations newer than the latest
version it records, strictly in order. Refresh the baseline when the delta
grows long. Nobody should hand-write or synthesize this file: it must come from
the real production schema.
