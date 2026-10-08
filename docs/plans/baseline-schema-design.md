# Baseline schema design (card 272 / TUL-272)

Status: feasibility + design + prototype. This is NOT the baseline and does not claim a full replay.

## Problem

Replaying `supabase/migrations/*.sql` (928 files in the tree at 2026-10-08) on an empty database
fails: about 414 references in 47 files use an object created by a later-numbered file (examples in
the card: `inquiry_participants`, `profile_field_definitions`, `talent_sites`, `capacity_allocations`).
The isolated qa-journeys project was brought up by hand. We need one command that builds a fresh
database (QA branches, local dev, CI) while production keeps its existing chain and ledger.

## Measured inventory (isolated project, 2026-10-08)

Fingerprint taken first: 930 ledger rows, max version 20261231348000.
Read-only catalog SELECTs through the Supabase MCP. Counts, schema `public` unless noted:

| Kind | Count | | Kind | Count |
|---|---|---|---|---|
| tables | 376 | | indexes | 1222 |
| columns | 5015 | | RLS-enabled tables | 362 |
| enums | 46 | | policies | 640 |
| views | 5 | | triggers (non-internal) | 200 |
| materialized views | 1 | | functions (public, incl. extension-owned) | 846 (840 plain `f`) |
| sequences | 5 | | functions, all non-system schemas | 962 |
| identity columns | 2 | | table grants (information_schema rows) | 8297 |
| stored generated columns | 4 | | public FKs into `auth` | 72 |
| constraints: PK / FK / UNIQUE / CHECK / EXCLUDE / trigger | 370 / 858 / 99 / 779 / 2 / 1 | | public FKs into `storage` | 0 |

Platform objects we depend on: triggers on `auth` tables: 1; `storage` buckets: 5; policies on
`storage.objects` and friends: 22; functions in storage 19, auth 4, realtime 18, net 12, vault 5,
extensions 55 (these are Supabase-managed, not ours).

Extensions: btree_gist 1.7 (public), citext 1.6 (public), pg_net 0.20.4 (extensions),
pg_stat_statements 1.11 (extensions), pg_trgm 1.6 (public), pgcrypto 1.3 (extensions),
plpgsql, supabase_vault 0.3.1 (vault), uuid-ossp 1.1 (extensions), vector 0.8.2 (public).

Takeaway: 840 public functions, 640 policies and 200 triggers dominate the object count. Tables and
columns are the easy part; most replay risk is in function bodies and grants.

SQL used (all `SELECT`): `select count(*)` over `pg_class` (relkind r/p, v, m, S) joined to
`pg_namespace` where `nspname='public'`; `pg_indexes`; `information_schema.columns` (also
`is_identity`, `is_generated`); `pg_constraint` grouped by `contype`; `pg_proc` joined to
`pg_namespace` (public, and grouped by schema); `pg_trigger` where `not tgisinternal`;
`pg_policies`; `pg_class.relrowsecurity`; `pg_type` where `typtype='e'`;
`information_schema.role_table_grants`; `storage.buckets`; `pg_policies` for `storage`;
`pg_extension`. FK-into-auth uses `pg_constraint` (contype 'f') joined to `pg_class` and
`pg_namespace` on both `conrelid` and `confrelid`.

## Options

### A. `pg_dump --schema-only` baseline at a known version (human with credentials)

Dump the isolated (or production) schema at version V, commit it as the baseline, mark every
migration <= V as applied on fresh databases, replay only migrations > V. CI builds an empty
Postgres (Supabase image, so `auth`/`storage`/`vault` exist) from baseline + later migrations.

- Pros: exact fidelity for all object kinds including functions, grants, policies, ownership.
  Least code. Industry standard.
- Cons: needs a DB password and `pg_dump`, which agents do not have. A dump of this size
  (roughly 840 functions) is a very large single file; reviewing it is not realistic. Needs the
  tooling to mark old versions applied.
- Effort: about 1 day for the human step plus CI job; 1 to 2 days to harden (Supabase image,
  role/extension quirks, `--no-owner --no-privileges` decisions).

### B. Generate the baseline from catalogs through the MCP

Query `pg_catalog` (SELECT only) and emit DDL: tables, columns, defaults, identity, constraints,
indexes, views, matviews, functions (`pg_get_functiondef`), triggers (`pg_get_triggerdef`),
policies (`pg_policies`), enums, extensions, sequences, grants.

- Pros: needs no password; reproducible; reviewable by section; can run against the isolated DB
  that already holds the full chain.
- Cons: re-implements part of pg_dump. Hard parts: dependency ordering across functions, views
  and defaults (functions referencing tables, defaults calling functions, SQL-language functions
  validated at create time), overloaded functions, ownership and grants for 8297 rows, partitioned
  tables, sequences owned by columns, the `auth` trigger. Large result sets must be paged through
  the MCP, which is slow and token heavy; sets this size should be fetched by a script with a
  service connection, not by hand.
- Effort: 3 to 5 days for full object coverage plus a verification harness (see below).

### C. Reorder the existing migrations by dependency

Topologically sort the 928 files on created-before-used objects and replay in that order.

- Pros: no new artifact; keeps history.
- Cons: dependencies are inferred from regexes over SQL text (the 414 count already contains
  false positives); later migrations alter, drop and recreate objects, so the "created" object
  differs by point in time; moving files breaks the ledger and the rule that versions are
  immutable; plpgsql bodies are late-bound so they hide dependencies. A reordered chain would
  fork from production's order and could produce a schema that differs from production.
- Effort: unbounded; risk of silent divergence. Not recommended.

## Recommendation

Use A as the target, with B as a stepping stone only where it saves the credentialed human time.

1. A human with DB credentials runs `pg_dump --schema-only --no-owner` (plus a separate grants
   dump) against a database at a chosen version V. Best source: the isolated project, because it
   is disposable. Compare against production with a schema diff before trusting it as the
   baseline of record.
2. Commit it as `supabase/baseline/<V>.sql` (outside `migrations/` so `db push` ignores it) with
   the version V recorded.
3. Add a `scripts/baseline/build-fresh.mjs`: create DB, load baseline, insert ledger rows for all
   versions <= V, apply migrations > V.
4. CI job on a Supabase Postgres image: build fresh, then run `db:check` and a schema diff
   against the isolated project. This is the verification harness that also makes B or any hand
   work trustworthy. Without it, no baseline can be called correct.

Do B (full) only if nobody can supply credentials; then the same CI schema diff is mandatory.

What only a human with DB access can do: provide the connection/password (not the MCP), run
`pg_dump`, decide V, confirm role/ownership choices, and approve marking history as applied on
any database that matters. Agents must not write to any project to prove replay.

Known risks regardless of option: migrations that insert seed data or touch `auth`/`storage`; the
future-dated timestamp rule (`docs/migrations-and-remote-history.md`); the one out-of-order file
used to bring up the isolated project must be identified and covered by V; the baseline will drift
unless CI regenerates and diffs it.

## Prototype (this PR)

`web/scripts/baseline/catalog-snapshot.sql` (one read-only query returning a JSON snapshot) and
`web/scripts/baseline/gen-baseline.mjs` (snapshot file in, SQL out, no live connection), with
`gen-baseline.test.mjs` (node:test, in the `test:alias-guard` lane).

Covered exactly: extensions; enums; tables and columns (type via `format_type`, NOT NULL, default,
identity, stored generated); PRIMARY KEY and UNIQUE; indexes that do not back a constraint;
FOREIGN KEYS (emitted last, so table order and cycles are safe). Tables are also topologically
ordered by FK for readability. FKs to a `public` table absent from the snapshot are skipped and
reported; FKs to `auth.*` are kept.

NOT covered: functions, triggers, RLS enablement and policies, views, matviews, sequence
ownership, grants, CHECK and EXCLUDE constraints, comments, storage buckets, auth/storage objects,
partitioning. Column defaults that call a non-built-in function, and indexes using custom
operator classes, will fail on replay until those objects exist. The generator was not run
against a full snapshot and was never replayed against any Postgres. Only a sample of two tables
(`talent_sites`, `capacity_allocations`) was pulled from the isolated project to validate the
query shape; the full snapshot (376 tables, 5015 columns) is too large to move through the MCP
by hand and should be produced by a script with a connection.

Note found while sampling: `pg_get_constraintdef` prints unqualified table names for FKs, so the
generated file sets `search_path = public, extensions`.
