# Isolated branch schema drift — found, repaired, verified

**When:** 2026-09-09T04:10Z
**Target:** `qa-journeys` (`fxlankepwnvelxjrahwk`) only. Never production (`pluhdapdnuiulvxmyspd`).
**Commands:** `npm run journeys:probe`, `npm run journeys:repair`, `npm run journeys:smoke`

## The finding that matters most

`supabase_migrations.schema_migrations` on `qa-journeys` holds **763 rows up to
version `20261230000700`**, and objects belonging to versions *inside* that
range did not exist. The historical replay recorded versions whose bodies never
ran.

This is not a small bookkeeping problem. It means:

- **The ledger is not evidence on this branch.** Any check that diffs local
  migration files against `schema_migrations` reports "in sync" over a schema
  that is missing functions the journeys call.
- **`npm run check:migrations-applied` is blind here** for a second, independent
  reason: it calls `list_applied_migrations`, and that RPC
  (`20260708120000`) was itself never replayed. The one drift detector the repo
  owns returns an *error*, not a state, so it had never reported on this branch
  at all.

START-HERE had said the fixture was seeded and listed a paragraph of
hand-repaired functions. Both claims were partly true and neither was checkable.

## What was missing (probe, before)

16 expected objects absent:

| Kind | Missing |
|---|---|
| Functions | `extend_capacity_hold`, `refund_admission`, `cancel_event_cascade`, `claim_outbox_messages` |
| Tables | `ticket_refund_intents`, `calendar_feed_tokens`, `command_idempotency`, `outbox_messages` |
| Columns | `orders.age_gate_min_age`, `orders.age_gate_confirmed_age`, `orders.age_gate_confirmed_at` |
| Indexes / constraints | `agency_bookings_order_uniq`, `talent_bookings_no_overlap`, `command_idempotency_key_unique`, `outbox_messages_dedupe_unique`, `calendar_feed_tokens_live_per_user` |

Six of those belong to versions the ledger already claimed
(`20261229000217`, `000219`, `000246`, `000320`, `000807`, `000809`) — the
hollow records. The other six migrations (`20261230000800`–`001300`) were
genuinely pending: they landed on the branch during the blueprint parity work
and had never been applied anywhere.

Consequence while it lasted: the isolated app could not exercise event
cancel-cascade, ticket refunds, server-side age gates, one-booking-shell-per-order,
calendar subscriptions, or the command envelope and outbox. Those are the M0
money and event-day paths.

## What was replayed

Twelve migration files, in version order, from the real files in
`supabase/migrations/` — not by hand-written DDL:

```
20261229000217_extend_capacity_hold.sql
20261229000219_extend_hold_reports_shortening.sql
20261229000246_refund_admission.sql
20261229000320_talent_bookings_no_overlap.sql
20261229000807_ticket_refund_intents.sql
20261229000809_ticket_refund_intents_authenticated_select_only.sql
20261230000800_cancel_event_cascade.sql
20261230000900_refund_admission_from_void.sql
20261230001000_one_booking_shell_per_order.sql
20261230001100_orders_age_gate_attestation.sql
20261230001200_calendar_feed_tokens.sql
20261230001300_command_envelope_and_outbox.sql
```

All twelve reported OK. `20261230001000` carries a backfill that raises rather
than guessing when an order still has more than one booking shell; it did not
raise, so no order on the branch needed a human.

## Verification, three independent ways

**1. Presence — `journeys:probe` exit 0.** Every function, table, column, index
and fixture row now present. Read-only session
(`SET default_transaction_read_only = on`).

**2. Real bodies, not stubs.** The exact defect was recorded-but-empty
functions, so body length is the check:

```
cancel_event_cascade(p_tenant_id uuid, p_event_id uuid, p_actor uuid) -> jsonb   [body 4061 chars]
claim_outbox_messages(p_limit integer, p_topics text[], p_visibility_seconds integer) -> SETOF outbox_messages   [body 626 chars]
extend_capacity_hold(p_allocation_ids uuid[], p_ttl_seconds integer) -> jsonb   [body 2040 chars]
refund_admission(p_admission_id uuid) -> jsonb   [body 2345 chars]
reserve_resource_set(p_tenant_id uuid, p_actor_id uuid, p_ttl_seconds integer, p_capacity jsonb, p_holds jsonb) -> jsonb   [body 5543 chars]
```

**3. Behaviour — `journeys:smoke` exit 0, 10 assertions.** One transaction,
always rolled back:

```
REFUSALS ON UNKNOWN IDS (proves the body executes)
  PASS  refund_admission(unknown)  {"ok":false,"reason":"unknown_admission"}
  PASS  cancel_event_cascade(unknown)  {"ok":false,"reason":"unknown_event"}
  PASS  extend_capacity_hold(unknown)  {"extended":0,"requested":1,...}
OUTBOX
  PASS  claim_outbox_messages runs  claimed 0
INVARIANTS (each must refuse)
  PASS  command_idempotency_key_unique refuses a replayed key  (23505)
  PASS  outbox_messages_dedupe_unique refuses a duplicate dedupe key  (23505)
  PASS  orders_age_gate_paired refuses a half-filled attestation  (23514)
  PASS  orders_age_gate_paired accepts a complete attestation
MULTI-RESOURCE COMMITMENT (real pool, then rolled back)
  PASS  reserve_resource_set commits one unit  {"ok":true,...,"allocation_ids":["aeb8..."]}
  PASS  transaction rolled back clean  leftover=0
```

The refusals are the point: a structured `{"ok":false,"reason":...}` is the
contract the TypeScript callers are written against, so this checks the
behaviour the app depends on rather than merely that some SQL executed.

**Regression, capacity engine unchanged after the replay.** The replay
re-created capacity-adjacent functions, so P1-01 was re-run:

```
[capacity-proof] 200 calls in 1134ms
[capacity-proof] replies: {"sold_out":188,"ok":12}
[capacity-proof] ground truth: 12 live allocations, 12 units held, 0 remaining
[capacity-proof] PASS — exactly 12 of 200 won, zero oversell
```

## Fixture: workspace A is seeded, workspace B is an identity shell

The probe counts per workspace on purpose, because a total would hide this:

| Table | Workspace A | Workspace B |
|---|---|---|
| `spaces` | 2 | 0 |
| `talent_offerings` | 7 | 0 |
| `sessions` | 3 | 0 |
| `capacity_pools` | 6 | 0 |
| `customers` | 42 | 0 |
| `orders` | 49 | 0 |

Both workspaces exist in `agencies` (`qa-journeys`, `qa-journeys-b`) with an
active `agency_domains` host each (`qa-journeys.local`,
`qa-journeys-b.local`), and B has an owner membership. But B carries **no
catalog, no spaces, no sessions, no pools**: `seed_journeys_program.sql`
creates B's identity and nothing else.

That is sufficient for the negative isolation direction — A's operator must see
none of B — and insufficient for any case where B must *transact*. Recorded as
D-011 rather than described as seeded.

## Second pass: the probe was not enough

Everything above went green, and the branch was still badly broken. Restarting
the isolated Next app surfaced six objects nobody had curated:
`tenant_registration_settings`, `agency_business_identity`,
`tenant_guest_chat_settings`, `cms_public_pages_for_tenant`,
`cms_public_navigation_for_tenant`, `cms_pages.blocks`. The storefront logged
one of those on **every request**.

That is the lesson worth keeping: **a curated probe proves what its author
remembered.** So `journeys:audit` derives the expectation set from the two
independent descriptions of the schema this repo owns.

### Axis 1 — what the migrations promise

Parsed all 770 migration files for tables, views, functions and added columns,
minus whatever a later migration drops.

| Stage | Missing objects | Migrations affected |
|---|---|---|
| Before any replay | **588** | 248 |
| After replay pass 1 | 136 | 45 |
| After pass 2 | **99** | 26 |
| After pass 3 | 99 | 26 (fixed point) |

The replay is iterated because a failed early migration cascades: dependents
fail for a base table that a later pass creates. Passes 2 and 3 are identical,
so 99 is the fixed point, and what remains is **not** absent DDL — it is data
and guards:

- duplicate `taxonomy_terms` rows block `taxonomy_terms_term_type_slug_uniq`,
  taking 11 columns with it
- `field_architecture_v1` raises `expected ≥100 parent_category mappings, got 0`,
  blocking `profile_field_groups`
- `20260527063534` references `field_definitions`, which no migration creates —
  which is axis 2

Filed as D-017. Affects taxonomy, profile fields,
`agency_bookings.balance_due_at` and the publicly-listed triggers.

Replaying 770 files is done in full version order rather than only the failing
subset, deliberately: replaying just the missing-object owners would reinstall
an OLD `CREATE OR REPLACE FUNCTION` body over a newer one. Full ordered replay
ends at the last definer, which is the same state a fresh database reaches.

**No regression from the mass replay** — re-verified after: probe exit 0, smoke
10/10, capacity proof 12 of 200 with zero oversell.

### Axis 2 — what production has and no migration creates

`database.types.ts` is generated from the live project, so it says what
production actually has. Comparing it against the same database finds the class
axis 1 structurally cannot: **58 objects applied by hand, with nothing to
replay.**

Excluding the deliberate `_archive_*`, `_backfill_*` and
`_impronta_pages_backup_*` scratch tables, the real ones include
`cms_pages.blocks` and `is_freeform`, `cms_navigation_items.pin_in_menu` and
`show_in_sticky_top_nav`, six `engine_audit_log` columns, five
`platform_settings` theme columns, the `agency_taxonomy_settings`,
`agency_taxonomy_terms` and `talent_type_field_groups` tables,
`talent_profiles.subscription_template`, two `talent_discover_index` view
columns, and `saas_marketing_signups.recovery_email_sent_at`.

**This repo cannot rebuild its own production schema.** Filed as D-014.
Absence of a migration is not evidence a column is unused.

### The product bug this found

`cms_pages.blocks` is selected by seven call sites, including `loadVerbSlug`.
On any database built from this repo that read fails, the function logs a
warning and returns `null`, and **every reserve button falls back to the chat
cue instead of linking to the published page that answers it.** Not a QA-env
problem — a silent feature outage anywhere the column was not hand-applied.

Closed by `20261230001400`, written `IF NOT EXISTS` so it is an exact no-op on
production, whose only job is letting a fresh database reach the same shape.
After applying it:

```
storefront HTTP 200
=== schema errors after fix ===        (none)
=== verb-destination warnings ===     0 warnings
```

Filed as D-015.

### And the bug the constraints made reachable

Replaying `20261230001100` put `orders_age_gate_paired` on a database the
purchase path actually runs against, for the first time. `createPurchase`
assembled its three age columns from three separate expressions — two read the
verdict, the third was conditional on the minimum — so an ungated basket
carrying an attestation produced `min = NULL, confirmed_age = 21,
confirmed_at = NULL`.

That CHECK requires all three or none. So the triple was not a slightly-wrong
record, it was a refused INSERT: a buyer who had just confirmed their age got
"Could not start the order", on the one path where money and capacity are about
to move. `ageGateStamp` now derives all three from one branch. Filed as D-016.

## Standing rules

- Isolated branch only. **Do not** re-apply any of this to production; it
  already has the gist constraint, `events`, `check_in`, `engine_send_offer`
  and `engine_submit_approval`.
- **Do not reset or rebase** the branch — that replays from zero.
- `journeys:repair` takes an explicit file list. It refuses to guess a pending
  set, because on this branch "pending" is not computable from the ledger.
- The ledger is not evidence. Neither is a green probe on its own —
  `journeys:audit` is the completeness check.
- Replay the corpus in **full version order**, not just the failing subset, or
  a `CREATE OR REPLACE FUNCTION` will regress to an older body.
- Iterate the replay until two consecutive passes agree. One pass is not a
  fixed point.
