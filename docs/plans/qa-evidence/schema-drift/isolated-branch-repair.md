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

## Standing rules

- Isolated branch only. **Do not** re-apply any of this to production; it
  already has the gist constraint, `events`, `check_in`, `engine_send_offer`
  and `engine_submit_approval`.
- **Do not reset or rebase** the branch — that replays from zero.
- `journeys:repair` takes an explicit file list. It refuses to guess a pending
  set, because on this branch "pending" is not computable from the ledger.
- The probe and smoke are the evidence. The ledger is not.
