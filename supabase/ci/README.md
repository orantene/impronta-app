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
| `production-only-objects.sql` | The objects production holds that **no migration creates** (D-014). Applied once, last, on a full replay only. |
| `verify-schema.ts` | Diffs the built database against `web/src/lib/supabase/database.types.ts` — the one production-derived artefact in this repo — and fails on anything missing or mismatched. |

## Status: the history replays, and the result is checked

Both halves are green as of 2026-09-23, from an empty cluster:

```
Final: 859 applied, 0 could not apply, 3 replaced, of 859 on disk
```

```
=== schema fidelity: built database vs database.types.ts (generated from production) ===
checked 291 tables, 5 views, 46 enums, 164 functions
--- 0 failures: every table, view, enum and function in the types file is present and matches ---
PASS: schema matches production
```

Measured with `local-postgres.sh` on PostgreSQL 16. The same runner in GitHub
Actions against a real local Supabase reported **825/859 with 34 failures**
before any of this existed (run
https://github.com/orantene/impronta-app/actions/runs/35818716802) — that run
is the baseline the substitutes were written against, and its 34 failures are
now 0.

Three files are applied from a `.replace.sql` and say so in the job summary;
nothing is skipped and nothing fails.

## The recipe

Nothing below needs a credential, a dump, or a person.

```bash
# 1. a cluster with the Supabase-managed scaffolding the migrations assume
bash supabase/ci/local-postgres.sh up
eval "$(bash supabase/ci/local-postgres.sh env)"

# 2. the whole history, from empty
FAILURE_REPORT=/tmp/failures.txt bash supabase/ci/apply-migrations.sh --defer

# 3. prove the result IS production's schema, not merely a green run
node supabase/ci/verify-schema.ts     # or web/node_modules/.bin/tsx supabase/ci/verify-schema.ts
```

Step 2 exits non-zero if any migration could not apply, and `/tmp/failures.txt`
then holds the full error text per file. Step 3 exits non-zero on any missing
or mismatched object. `bash supabase/ci/local-postgres.sh reset` empties the
database without rebuilding the cluster — that is the loop to iterate in. A
full replay takes roughly 20 minutes either way.

In CI the same three steps are the `Build schema` and `Verify schema fidelity
against database.types.ts` steps of
`.github/workflows/talent-website-e2e.yml`, against a real `supabase start`.

**Prerequisites** for the local loop: the `postgresql-16` server binaries and
`postgresql-16-pgvector` (`talent_embeddings.embedding` is a `vector` column;
a real Supabase project ships pgvector, a stock PostgreSQL does not).
`local-postgres.sh` names the missing package rather than failing obscurely.

`local-postgres.sh` documents its own divergences from a real Supabase project
(PostgreSQL 16 vs `major_version = 17`; no auth/storage/realtime services, only
the schema objects the migrations touch). Treat it as the fast loop and the
workflow's real local Supabase as the check.

## Why a from-scratch replay needs substitutes at all

The file order on disk is NOT the order production received them. Several
migrations were pushed after files with later timestamps, a few applied only
because production had been hand-repaired first, two are recorded in
production's ledger although they never ran — and a whole set of objects was
applied to production by hand, with no migration to replay at all. Six shapes
recur, and every file in `migration-shims/`, plus
`production-only-objects.sql`, is one of them:

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

   The ones **no migration touches at all** go in `production-only-objects.sql`
   instead, because there is no migration to hang a shim on: the
   `talent_type_field_groups` table, five `platform_settings` theme columns,
   `cms_navigation_items.pin_in_menu` / `show_in_sticky_top_nav`,
   `talent_profiles.subscription_template`,
   `saas_marketing_signups.recovery_email_sent_at`, and
   `_clamp_workspace_to_plan_limit()`. This is D-014, already on the record in
   `docs/plans/qa-evidence/schema-drift/isolated-branch-repair.md` — *"58
   objects applied by hand, with nothing to replay … **This repo cannot rebuild
   its own production schema.**"* That file is the CI half of closing it.

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

5. **A snapshot taken at the wrong moment** — a special case of (4) with its
   own fix. `20260615200001` builds its three archive tables with
   `CREATE TABLE … (LIKE <parent> INCLUDING DEFAULTS)`, so their columns are a
   photograph of the parent, and in a version-ordered replay the photograph is
   taken before five later-stamped files have added columns to those parents —
   files production had already applied. → `.post.sql` appends exactly the
   columns production's archives carry, each copied from the migration that
   adds it to the parent.

6. **Enum values added in a different order.** `ALTER TYPE … ADD VALUE` appends,
   so value order — which is what `ORDER BY` and `<` on an enum column mean —
   records the order production received the files, not their timestamps.
   `inquiry_source_channel` has `pitch` eighth (20260514153544's own header
   says so: *"Probe revealed it's actually an 8-value Postgres enum (`pitch`
   was added previously)"*), and `media_variant_kind` has `reel` before
   `polaroid`, the order of 20261111020000, whose header shows it reached
   production first. → a `.pre.sql` adds the values in production's order, one
   statement ahead of the file that would otherwise add them last; the
   migrations' own `IF NOT EXISTS` / `duplicate_object` guards then make them
   no-ops.

## The rule for writing a substitute

A substitute must never silently paper over a real schema difference. Every
file starts with a header naming the migration, the exact error, why it cannot
apply from scratch, and what production state it reproduces — with the evidence
(another migration's header, `database.types.ts`, a finding under
`docs/plans/qa-evidence/`, a privilege query recorded in a migration's
comments). If you cannot justify it, do not write it.

Two things a substitute may never do:

- **Invent schema.** When a migration asserts on production DATA, seed the
  minimal rows it needs and say so. When production holds an object no
  migration creates, reconstruct it from evidence — and where a fact genuinely
  is not recoverable, say so at the site instead of guessing quietly. Three
  things `database.types.ts` cannot tell you: the VALUE of a default (only that
  one exists), a column's ordinal position (the generator sorts alphabetically),
  and a function's body. `production-only-objects.sql` marks every inferred
  default `-- inferred default`, states that column order is not claimed, and
  gives `_clamp_workspace_to_plan_limit()` a body that RAISES rather than
  return a plausible number — so a caller that ever appears fails loudly and by
  name instead of silently computing the wrong limit.
- **Touch `supabase/migrations/`.** Those files are applied in production.

## Checking the result: `verify-schema.ts`

A green replay proves the 859 files *apply*. It does not prove the result is
production's schema — a substitute that quietly papered over a real difference
would be just as green. `verify-schema.ts` closes that gap without credentials,
by diffing the built database (`information_schema` + `pg_catalog`) against
`web/src/lib/supabase/database.types.ts`, which `supabase gen types` generated
FROM production.

It compares:

- every **table** in the types file exists, with the same columns, the same
  nullability, and a compatible type;
- every **view** exists with the same columns (the generator emits view columns
  all-nullable, so view nullability carries no information and is not compared);
- every **enum** has the same values, **in the same order**;
- every **function** named in the types file exists with a compatible signature
  — an overload whose named arguments match.

Missing or mismatched is a failure and exits 1. **Extra** objects in the
database are listed separately and are not failures: the CI bootstrap adds
Supabase-managed stand-ins, extensions bring hundreds of functions, and the
types file only covers what PostgREST exposes. Six columns are reported as
unverifiable because the generator types them `unknown` (`inet`, `tsvector`,
`vector`): TypeScript collapses `unknown | null` to `unknown`, so for those the
snapshot records neither the type nor the nullability.

```bash
node supabase/ci/verify-schema.ts          # PG* env vars, or DATABASE_URL
node supabase/ci/verify-schema.ts --json   # machine-readable
```

It has been checked against a planted defect, so PASS means something. On a
`TEMPLATE` copy of the built database (2026-09-23), one sabotage of each kind —
drop a column, drop a table, drop a function, drop a NOT NULL, retype a column
`text` → `jsonb` — produced exactly five failures, one per kind, and exit 1:

```
nullability  cms_navigation_items.pin_in_menu             types says NOT NULL, database has NULLABLE
type         platform_settings.default_theme_preset_slug  types says string, database has json (jsonb)
column       talent_profiles.subscription_template        MISSING column "subscription_template" (string)
table        talent_type_field_groups                     MISSING — present in database.types.ts, absent
function     _clamp_workspace_to_plan_limit               MISSING — named in database.types.ts, absent
```

### The allow-list

The types file is a snapshot (last regenerated 2026-09-17, `cb3a89e9`), and a
migration merged after that moment legitimately moves the database away from
it. `ALLOWLIST` in the script carries those cases, and an entry is admissible
only **with the migration that proves it**. There is exactly one today:

| Object | Difference | Proof |
|---|---|---|
| `profiles.app_role` | types says NOT NULL; the replay makes it NULLABLE | `20260911022138`'s own header: *"production never ran 20260408113000 / 20260408150000 although its ledger records them. There `profiles.app_role` is still NOT NULL DEFAULT 'client' … the column is brought to that shape here"* — and it then runs `DROP NOT NULL`. Two migrations in the history drop it and none adds it back, so no replay of this repo can produce NOT NULL. |

Anything else is a failure, not an allow-list entry.

## What is still unproven

`database.types.ts` is the best production-derived evidence in the repo, but it
is a generated *type* file, not a dump, so three classes of schema sit outside
what any check here can reach:

- **Anything PostgREST does not expose**: RLS policies, grants, indexes,
  constraints, triggers, and the non-`public` schemas. The replay applies every
  migration that creates them, so they are as right as the migrations are, but
  nothing cross-checks them against production.
- **Default values, column order, function bodies.** The generator records that
  a default exists, not what it is. Every inferred value is marked at its site
  in `production-only-objects.sql`.
- **The snapshot's own age.** A difference introduced by a migration merged
  after 2026-09-17 reads as a mismatch until someone regenerates the types file
  or allow-lists it with proof.

One optional, one-off schema-only diff against production would close all
three. `.github/workflows/talent-website-e2e.yml` still switches to "baseline
mode" if `supabase/e2e-baseline.sql` ever appears, and that path is kept for
exactly that one-off check. **It is not needed, it is not a dependency, and
nobody has to produce one: CI does not want a dump and the founder is not
asked for one.**
