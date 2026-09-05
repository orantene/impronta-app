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
| …naming an `onConflict` target | **113** (the rest conflict on the primary key — always inferable, never flagged) |
| unique indexes/constraints parsed at HEAD | **470** |
| **ok** | **108** |
| **partial** — 42P10 at planning | **1** |
| **missing** — 42P10 at planning | **1** |
| **unknown** — not statically decidable | **3** |

## Breaking findings, routed to owners

| file:line | table | onConflict | verdict | index | owner |
|---|---|---|---|---|---|
| `src/lib/server-actions/roster-import.ts:328` | `agency_talent_roster` | `tenant_id,talent_profile_id` | **partial** | `agency_talent_roster_tenant_talent_live_uniq` | **Directory & Profile** |
| `src/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions.ts:96` | `talent_profile_taxonomy` | `talent_profile_id,taxonomy_term_id,relationship_type` | **missing** | — (PK covers only the first two) | **Directory & Profile** |

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

### `mint-on-paid.ts:174` — FIXED (#1818, `…803`), and it was never drift

Reported here first as *"fixed directly in the database with no migration"*. **That was wrong.**
Events runs a **schema-first protocol**: the migration is applied and recorded on production
*before* the push, so production reading total while `origin/main` still said partial was the
protocol working, not a hand-edit. The exposure I described was real — a fresh environment built
from main during that window gets the partial index back — but it is a **window between apply and
merge**, not unrecorded drift. One `gh pr list` would have told me.

**Worth keeping, because it will recur:** this guard measures the migrations *on the branch*, so
during any schema-first window it reports a finding production has already fixed. That is the
conservative direction and the reason it caught this at all — but read a finding against an open
PR before calling it drift.

### `resend-webhook.ts:244` — FIXED (#1831), and the fix is better than anything proposed

Found only after the extractor learned to read non-literal targets. The guest branch named
`email_address` while the only index was on `lower(email_address) WHERE user_id IS NULL` — an
expression index *and* a partial one, two independent reasons `ON CONFLICT` could not infer it.
**Probed: `42P10` on the guest branch, `23503` on the user branch** (which proves the user branch
planned). No guest bounce had ever been suppressed, so hard bounces for guests and invitees
suppressed nothing and dead addresses kept being mailed — the **third** time this path has died on
a null `user_id`.

Three fixes were discussed: make the index total, catch `23505` around a select-then-insert, or an
RPC naming the expression target. **Support chose a fourth and better one** — stored generated
columns (`user_key = coalesce(user_id, <zero uuid>)`, `email_key = lower(email_address)`), so the
uniqueness is expressible as **plain columns, inferrable, and identical for both kinds of
recipient**. One conflict target, no runtime branch, no expression, no race. *A conflict target
that depends on the data is a branch only half of production ever exercises.*

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

## The four remaining `unknown`s — and why there were fourteen

**Ten of the fourteen were not undecidable at all.** They name the table as an argument to a
wrapper helper rather than through `.from()`:

```ts
supportFrom(admin, "support_message_reads").upsert(…)
tenantScopedQuery(supabase, "agency_branding", tenantId).upsert(…)
```

The extractor only understood `.from("x")`. Routing those to eight owners as *"check this by hand
against the database"* would have spent the one thing an `unknown` is for — a human's attention on a
call nobody can read — on eight calls a scanner can resolve in a line of regex. **All ten now
resolve, and all of them are `ok`.** An unrecognised wrapper still falls back to `unknown`, never
to silence, and there is a test for that.

**The four that genuinely remain, all baselined so a new one cannot join them silently:**

| file:line | table | why | owner |
|---|---|---|---|
| `src/lib/inquiry/recipient-safety.ts:364` | `user_blocks` | target chosen at runtime | **Support** (fixing) |
| `src/lib/notifications/resend-webhook.ts:244` | `email_suppressions` | target chosen at runtime; one candidate index is **partial** *and* an expression index | **Support / Notifications** |
| `src/lib/server-actions/admin-taxonomy.ts:502` | `agency_taxonomy_settings` | no migration creates this table | **Directory & Profile** (database says it is fine) |
| `src/lib/server-actions/admin-taxonomy.ts:630` | `agency_taxonomy_settings` | same | **Directory & Profile** (database says it is fine) |

**`recipient-safety.ts:364` is the one to understand before trusting this guard.** Sessions proved
42P10 through the real client, so it is a **confirmed defect that this audit reports as `unknown`,
not as broken** — its target is a ternary and no static scan can read it. In the first version of
#1820 it was worse: the extractor matched only string literals, so the call fell through to *"no
`onConflict`"* and was classified **`ok`**. A proven defect, reported green.

That is why **`unknown` now enters the baseline alongside `partial` and `missing`.** It does not
claim a new call is wrong; it claims **nobody has checked it**, and it makes the guard go red until
someone does. The single unreadable target anyone has actually probed turned out to be broken, so
treating unreadable as safe is not a defensible default.

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
