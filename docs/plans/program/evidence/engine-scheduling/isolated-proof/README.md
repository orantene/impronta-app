# Package 2 — isolated Supabase proof

PR #1955, branch `cursor/engine-sched-projects-3d1a`, head `5b203569b`. Applied
from a worktree on `engine/sched-projects-proofs` (tracking the PR branch)
against the **isolated** `qa-journeys` Supabase branch `fxlankepwnvelxjrahwk`
only. Production (`pluhdapdnuiulvxmyspd`) was never touched: no `db:push`, no
`reset_branch`, every script here refuses anything but the isolated target
(`assertIsolatedJourneysTarget` in `web/scripts/isolated-target-guard.mjs`).

All commands below were run for real on 2026-09-11 against `fxlankepwnvelxjrahwk`.
Every exit code quoted is the real shell exit code (`echo $?` after each
command, or the script's own printed line), not a re-derivation.

## 1. Migration collision check

```
cd web
node --env-file=.env.capacity-isolated.local scripts/check-migration-version-collisions.mjs --remote
```

```
[migration-collisions] remote ledger read: 814 recorded migrations
[migration-collisions] OK — 820 local migrations, local + remote checks clean
```

Exit code: **0**. Full output: [`task1-collision-check.txt`](./task1-collision-check.txt).

## 2. Apply the six Package 2 migrations, in order

```
cd web
npm run journeys:repair -- ../supabase/migrations/20261231216000_session_series_editor.sql
npm run journeys:repair -- ../supabase/migrations/20261231217000_session_ops.sql
npm run journeys:repair -- ../supabase/migrations/20261231218000_cancel_booking_set.sql
npm run journeys:repair -- ../supabase/migrations/20261231219000_project_ops.sql
npm run journeys:repair -- ../supabase/migrations/20261231220000_offering_packages_phases.sql
npm run journeys:repair -- ../supabase/migrations/20261231221000_booking_policy_approvals.sql
```

| File | Result | Exit |
|---|---|---|
| `20261231216000_session_series_editor.sql` | `OK` | 0 |
| `20261231217000_session_ops.sql` | `OK` | 0 |
| `20261231218000_cancel_booking_set.sql` | `OK` | 0 |
| `20261231219000_project_ops.sql` | `OK` | 0 |
| `20261231220000_offering_packages_phases.sql` | `OK` | 0 |
| `20261231221000_booking_policy_approvals.sql` | `OK` | 0 |

**No migration needed a fix.** Before applying, every function body and
`ALTER`/`CREATE TABLE` in all six files was checked by hand against the live
isolated schema (columns, tables, enum values, FK targets, and every
`gen_random_uuid()` call — Postgres 15's core builtin, not pgcrypto, so no
`extensions.` qualification is needed for it; there is no `crypt`/`gen_salt`
call anywhere in these six files). Specific things verified before running:

- `sessions.status` / `agency_bookings.status` are `text`, not enums — the
  string literals compared against them (`'scheduled'`, `'cancelled'`,
  `'confirmed'`, `'archived'`, …) needed no enum-cast.
- `sessions.venue_id`, `.series_id`, `.offering_id`, `.event_id`,
  `.instructor_user_id` (the last one is what `20261231216000` itself adds)
  all exist with the expected types.
- `public.reserve_resource_set_v2`, `public.release_capacity`,
  `public.capacity_pools`, `public.capacity_allocations`,
  `public.ticket_refund_intents` (incl. its `order_line_id` UNIQUE constraint
  the `ON CONFLICT` in `session_cancel` relies on), `public.order_lines`,
  `public.orders` all exist with the columns the functions reference.
- `public.agencies`, `public.talent_offerings`, `public.is_staff_of_tenant`,
  `public.is_platform_admin`, `public.agency_memberships` (role/status/
  profile_id/tenant_id) all exist as `20261231220000` and `20261231221000`
  assume.
- `seat_pools` and `booking_policy_overrides` do not exist yet on this
  branch — the former is never referenced by any of these six files (a
  false lead from the task brief); the latter is *created by* `20261231221000`
  itself, not read by an earlier one.

Because every reference checked out, all six applied clean on the first try —
no retry, no statement-level fallback in `repair-journeys-isolated.mjs` was
needed.

## 3. Object + privilege verification

Script (ad hoc, not committed): connected with `pg` using `DATABASE_URL` from
`.env.capacity-isolated.local`, checked `to_regclass`/`to_regprocedure` for
every table/column/function the six migrations create, then
`has_function_privilege('anon' | 'authenticated' | 'service_role', <sig>,
'EXECUTE')` for every function.

Full output: [`object-verification.txt`](./object-verification.txt). Summary:

- Tables: `offering_components`, `offering_price_phases`,
  `booking_policy_overrides`, `role_limits`, `approval_requests` — all EXIST.
- Columns: `session_series.instructor_user_id`, `sessions.instructor_user_id`,
  `booking_deliverables.amount_cents`, `booking_deliverables.file_path`,
  `order_lines.price_phase_id` — all EXIST.
- Functions (11 total: `session_venue_overlaps`, `session_set_instructor`,
  `session_move_participant`, `session_cancel`, `cancel_booking_set`,
  `project_replace_talent`, `amendment_discard`, `project_archive`,
  `project_reopen`, `request_approval`, `decide_approval`) — all EXIST.
- Privileges, every function: `anon` = **false**, `authenticated` = **false**,
  `service_role` = **true**. No exceptions.

## 4. `verify-session-move-race.mjs` against the isolated fixture tenant

Fixture built through the engine's own RPCs (`public.set_session_seats`,
`public.reserve_resource_set_v2`) under tenant
`33333333-3333-4333-8333-333333333333`: a 5-seat source session pool holding
two committed 1-unit allocations (mirroring two paid seats), each backing one
`admissions` row on the source session, and a 1-seat target session pool.

```
JOURNEYS_ISOLATED=1 \
SESSION_MOVE_RACE_ADMISSION_A=<admission A> \
SESSION_MOVE_RACE_ADMISSION_B=<admission B> \
SESSION_MOVE_RACE_TO_SESSION=<target session, 1-seat pool> \
node --env-file=web/.env.capacity-isolated.local web/scripts/verify-session-move-race.mjs
```

```
[session-move-race] wins=1 a={"ok":false,"reason":"sold_out"} b={"ok":true,"admission_id":"...","allocation_id":"..."}
```

Exit code: **0**. PASS line: `wins=1`. Full output, ground-truth read, and the
exact fixture recipe: [`task4-session-move-race.txt`](./task4-session-move-race.txt).

**No fix was needed.** The race resolved correctly on the first run: one call
got `sold_out`, the other moved and holds the pool's only unit. Ground truth
(direct `select` on `admissions` and `capacity_allocations` after the race)
confirms exactly one new allocation exists on the 1-seat target pool and the
loser's admission kept its original session/allocation untouched — no
oversell, no double-write, no leaked seat. `session_move_participant`'s
`SELECT … FOR UPDATE` on the admission row plus `reserve_resource_set_v2` →
`reserve_capacity_batch` → `_capacity_reserve_locked`'s row lock on the pool
already serialise this correctly (same lock-based pattern as the
`visit_transfer` expected-version fix in `20261231210000`, just via the pool
row lock rather than an explicit expected-version argument — appropriate here
because the two racers are different admissions competing for the same seat,
not two writers of the same row).

All fixture rows (2 admissions, 2 sessions, 2 capacity_pools, 3
capacity_allocations) were deleted by id after the ground-truth read. A final
sweep query confirmed zero rows remain under the fixture tenant matching any
`RACE FIXTURE` marker.

## 5. One path of each other task, exercised by SQL

Each proof below built its own tiny fixture, ran the real engine path once,
recorded the query + the actual rows, then deleted the fixture. Full
transcripts are the linked files; every fixture is confirmed gone by a final
sweep query (see the bottom of this README).

| Task | What was exercised | Result | Evidence |
|---|---|---|---|
| Series generate idempotency | The exact write pattern `materialise.ts` documents itself as using: `INSERT … ON CONFLICT (series_id, starts_at) DO NOTHING`, run twice for the same 3 occurrences against a real `session_series` row (unique index `sessions_series_occurrence_uniq` confirmed present first) | Pass 1: 3 rows inserted. Pass 2: 0 rows inserted (all conflicts). Session count for the series: 3 both times. | [`task5-series-idempotent.txt`](./task5-series-idempotent.txt) |
| `cancel_booking_set` | Built an order + committed capacity_allocation + `agency_bookings` row (status `confirmed`), called `public.cancel_booking_set(tenant, booking_id, operation_key, reason, 'staff')` | `{"ok":true,...}`; booking status → `cancelled`; the allocation's `state` went `committed` → `released` with `released_at` stamped | [`task5-cancel-booking-set.txt`](./task5-cancel-booking-set.txt) |
| Amendment send / discard | `public.engine_send_offer(...)` on a draft offer (pre-existing RPC, not part of Package 2) → offer `status` → `sent`, inquiry → `offer_pending`; separately, `public.amendment_discard(...)` (Package 2, `20261231219000`) on a different draft-only fixture → offer `status` → `superseded`, inquiry `version` incremented | Both paths correct. A second draft offer on the same inquiry while one is `sent` correctly hit `inquiry_offers_one_active_offer` — send and discard could not be chained on the *same* offer in one pass, so each got its own fixture | [`task5-amendment-send-discard.txt`](./task5-amendment-send-discard.txt), [`task5-amendment-discard.txt`](./task5-amendment-discard.txt) |
| Price-phase stamping | Created an `offering_price_phases` row, stamped an `order_lines` row with its `price_phase_id` at insert time, then ran the reprice-guard shape (`UPDATE … WHERE price_phase_id IS NULL`) against that line | 0 rows affected by the guarded update — a line that already carries a `price_phase_id` cannot be silently repriced, matching the migration's own comment: "a phase never rewrites a line that already carries price_phase_id" | [`task5-price-phase-stamping.txt`](./task5-price-phase-stamping.txt) |
| Policy override read | Inserted a `booking_policy_overrides` row, read it back by `(tenant_id, offering_id)`, and checked `information_schema.role_table_grants` on the table | Row read back correctly; grants: `authenticated` = SELECT only, `service_role` = full — matches the migration's RLS policy (`is_staff_of_tenant` / `is_platform_admin`) and REVOKE/GRANT block | [`task5-policy-override-read.txt`](./task5-policy-override-read.txt) |

## Cleanup confirmation

After every fixture (task 4 and all five task-5 checks) a sweep query counted
rows under tenant `33333333-3333-4333-8333-333333333333` matching each
fixture's title/label markers (`'T5 %'`, `'RACE FIXTURE%'`) plus the specific
ids created. Two orphan `orders` rows were found from two earlier failed
attempts at building the `cancel_booking_set` fixture (constraint violations
on `orders_currency_shape` / `orders_identified_before_payment` /
`order_lines_payee_xor` before the fixture shape was corrected — no
`order_lines` were ever created under them, so nothing else was orphaned) and
were deleted. Final sweep: **0 rows** across `sessions`, `session_series`,
`admissions`, `inquiries`, `inquiry_offers`, `orders`,
`booking_policy_overrides`, `offering_price_phases`, `capacity_pools`,
`agency_bookings`.

## What this proof does not cover

- No app-layer / UI QA — this is a database-only proof, as scoped.
- `db:push` was never run; this branch's migration state is local to
  `fxlankepwnvelxjrahwk` only, applied via `journeys:repair`, not the normal
  `supabase_migrations.schema_migrations` ledger path (see that script's own
  header comment for why).
- No PR was opened and nothing was merged, per instructions.
