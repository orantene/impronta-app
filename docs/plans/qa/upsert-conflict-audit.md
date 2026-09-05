# `onConflict` targets Postgres cannot infer — fleet-wide audit

**Run it:** `cd web && npx tsx scripts/upsert-conflict-audit.mjs`
(`--json`, `--markdown`, `--baseline`). **Use `tsx`, not `node`** — it imports a TypeScript
module, and if you pipe the output the exit code you read is the pipe's, not the script's.

## The defect

`supabase.from("t").upsert(row, { onConflict: "a,b" })` becomes `INSERT … ON CONFLICT (a, b) …`.
Postgres infers which unique index that names, and it **cannot infer a PARTIAL index unless the
statement repeats the predicate**. PostgREST emits the bare form and offers no way to attach one.

The result is `42P10: there is no unique or exclusion constraint matching the ON CONFLICT
specification`, raised **while planning** — so it fails for every row, regardless of data.

Two writers shipped this and could never insert anything: `session-writer.ts` (fixed, #1813) and
`mint-on-paid.ts`. Both passed every gate, because **nothing in `tsx --test` reaches a database**
and both tables were empty.

> **An empty table is not evidence of a working writer.** It is exactly what a broken one produces,
> and it is indistinguishable from a feature nobody has used yet.

## Counts

| | |
|---|---|
| `.upsert(` calls in `web/src` (excl. tests) | **121** |
| …naming an `onConflict` target | **111** (the other 10 conflict on the primary key — always inferable, never flagged) |
| unique indexes/constraints parsed at HEAD | **470** |
| **ok** | **96** |
| **partial** — 42P10 at planning | **2** |
| **missing** — 42P10 at planning | **1** |
| **unknown** — not statically decidable | **14** |

## Breaking findings, routed to owners

| file:line | table | onConflict | verdict | index | owner |
|---|---|---|---|---|---|
| `src/lib/server-actions/roster-import.ts:328` | `agency_talent_roster` | `tenant_id,talent_profile_id` | **partial** | `agency_talent_roster_tenant_talent_live_uniq` | **Directory & Profile** |
| `src/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions.ts:96` | `talent_profile_taxonomy` | `talent_profile_id,taxonomy_term_id,relationship_type` | **missing** | — (PK covers only the first two) | **Directory & Profile** |
| `src/lib/events/mint-on-paid.ts:174` | `admissions` | `order_line_id,line_seq` | **partial** | `admissions_line_seq_uniq` | **Events & Ticketing** |

### `roster-import.ts:328` — new, and the only one nobody knew about

`agency_talent_roster_tenant_talent_live_uniq` is partial. **Confirmed against the live database,
not only the migrations.** Every roster import that relies on that upsert raises 42P10 at planning.
This one has real data behind it, unlike the two empty tables — worth checking whether roster
import has been failing in a way somebody has been working around.

### `extended-actions.ts:96` — three columns against a two-column key

`talent_profile_taxonomy_pkey` is `(talent_profile_id, taxonomy_term_id)`. The call names those two
**plus `relationship_type`**. Nothing unique covers three. Confirmed against the live database.
Fixing it is a decision, not a rename: either the target drops to the two-column key (and a profile
may hold one row per term, whatever the relationship), or a unique index over all three is added
(and a profile may hold the same term under several relationships). **That is a product question
about the taxonomy model, which is why this is routed rather than fixed.**

### `mint-on-paid.ts:174` — the repo and the database disagree

**The database has `admissions_line_seq_uniq` as TOTAL. Every migration in this repo creates it
PARTIAL** (`20261229000366`, `WHERE order_line_id IS NOT NULL AND line_seq IS NOT NULL`), and no
later migration alters it. So it was fixed **directly in the database with no migration**.

Production works today. **A rebuilt environment — a new project, a branch database, a restore —
recreates the broken partial index and mint-on-paid fails again.** The fix is a migration that
makes it total, so the repo and the database agree.

## Two more defects found AFTER the first version — both were gaps in this audit

Sessions & Classes handed over two traps. Both were real, and both meant the first version of this
audit reported safety it had not checked.

### Trap one: a conflict target chosen at RUNTIME was silently dropped

`recipient-safety.ts:364` does `onConflict: conflictTarget` where the value is a ternary. The
scanner matched only string literals, so the call fell through to *"no `onConflict`"* and was
treated as conflicting on the primary key — **reported as safe.** That is how this audit missed
`user_blocks`, the fourth confirmed instance, where both candidate indexes were partial and
blocking a user had never worked.

Fixed: `onConflict` present but not a literal is now **`unknown`**, never skipped. **It surfaced a
second such site nobody had flagged** — `resend-webhook.ts:244` on `email_suppressions`, where one
candidate index (`email_suppressions_guest_uq`) is **partial** and is also an expression index.
Whether the runtime branch reaches it needs a human. → **Support / Notifications.**

`user_blocks` now reads **total** in production — Support fixed it after Sessions measured it.

### Trap two: `NULLS NOT DISTINCT` hid a partial index from the partial detector

Postgres allows `NULLS [NOT] DISTINCT`, `INCLUDE (…)`, `WITH (…)` and `TABLESPACE` between the
column list and `WHERE`. The detector tested for `where` *immediately* after the closing
parenthesis, so an index like #1814's

```sql
CREATE UNIQUE INDEX sessions_event_night_uniq
  ON public.sessions (event_id, starts_at, venue_id) NULLS NOT DISTINCT
  WHERE event_id IS NOT NULL;
```

would have been read as **total**. A guard reporting green on the exact defect it exists to catch.
Fixed and self-tested.

## What this audit does NOT prove — printed in its own output

1. **An `ok` means the statement can PLAN. It does not mean the writer works.** Four empty tables
   today looked identical to working ones.
2. **A total unique index is necessary, not sufficient.** Indexes are `NULLS DISTINCT` by default,
   so a unique index on `(a, b)` does not constrain rows where either is NULL: `ON CONFLICT` plans
   fine and never fires. **That is how a doubled event night survived the fix that made
   `sessions_series_occurrence_uniq` total** — event sessions have a null `series_id` and still
   never collided. **This audit does not check nullability.** Proving a column `NOT NULL` needs
   every `ALTER TABLE` replayed, and a half-reliable check would emit advisories nobody can act on,
   which is worse than a stated gap.

## The `unknown`s — reported, never failed on

Ten are *"could not resolve the table from a preceding `.from()`"*: the table is a variable or the
chain is built dynamically, so a static scan cannot say which table it is. **These are not clean
bills of health** — they are calls the audit could not read, and any of them could be a fourth
defect. Worth a human eye, cheapest at the file:line given by `--json`.

Two are `agency_taxonomy_settings` (`admin-taxonomy.ts:502`, `:630`): **no migration in this repo
creates that table.** Its DDL predates the migration history. The database has a perfectly good
total `(tenant_id, taxonomy_term_id)` constraint, so these two are **fine** — the audit simply
cannot prove it from the repo. That distinction is deliberate: the first version of this audit
called them `missing`, and a guard that makes confident false accusations gets switched off by the
third person who has to disprove one.

## The CI guard

`src/lib/quality/upsert-conflict-audit.static.test.ts`, in the existing `test:size-ratchet` lane
(no new lane — a new lane name risks the parity guard and has silently lost coverage here before).
It fails on any **new** `partial` or `missing`; the three above are baselined in
`upsert-conflict-audit.baseline.json`. A fix must lower the baseline in the same commit, or the
slack becomes headroom for the next one.

**It measures the MIGRATIONS, not the database** — deliberately, since CI has no database. That
means it measures what a *rebuilt* environment would get, which is the conservative direction and
is exactly why the `mint-on-paid` drift shows up at all.

**The detector is self-tested to bite**: a partial index is caught, a non-matching column set is
caught, a total index in any column order passes, an upsert with no `onConflict` is not flagged, a
table no migration creates is `unknown` rather than `missing`, and the extractor ignores both its
own prose and unrelated earlier `.from()` calls.

## Three bugs this audit had before it was believed

Recorded because each produced a confident, wrong number, and each was caught by checking the
output against the live database rather than by reading the code again.

1. **49 false `missing`s** — column-level `slug TEXT PRIMARY KEY` has no parentheses, so the
   parser never saw it. 44% of the app looked broken.
2. **It counted its own documentation.** The module header uses
   `.upsert(…, { onConflict: "a,b" })` as an example, and the audit reported it as a finding
   against a table `t`. Now scanned comment-free.
3. **Within one file, all CREATEs were applied before all DROPs.** `20261229000712` drops
   `sessions_series_occurrence_uniq` and immediately recreates it total — so the audit deleted the
   index it had just added and reported Sessions' *fixed* writer as still broken. Events now apply
   in positional order. The module header had claimed "replayed in order"; only the file loop was.
