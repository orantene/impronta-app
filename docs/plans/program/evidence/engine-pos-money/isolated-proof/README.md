# Package 1 (PR #1954) — isolated-branch proof

Target: Supabase branch `fxlankepwnvelxjrahwk` (qa-journeys), tenant
`33333333-3333-4333-8333-333333333333`. NOT production (`pluhdapdnuiulvxmyspd`).
No `db:push`, no `reset_branch`, no dev server, no typecheck run for this proof.

Migrations proven applied: `20261231201000`..`20261231209000` (9 files,
`pos_custom_amount_approvals` through `reserve_pay_slug`), applied earlier in
this branch's history (2 of them after a pgcrypto schema-qualification fix,
already committed).

All commands below were run with:
```
cd web && set -a; . ./.env.capacity-isolated.local; set +a
```
which loads `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`SUPABASE_PROJECT_REF=fxlankepwnvelxjrahwk` against the isolated branch only.

## Task 1 — object + privilege check

Script: `objects-and-fixtures.mjs` (task-1 section), run via `pg` against
`DATABASE_URL`. Full output: [`01-objects-and-fixtures.txt`](./01-objects-and-fixtures.txt).

Checked with `to_regclass` / `information_schema.columns` / `to_regprocedure`
plus `has_function_privilege('anon'|'authenticated'|'service_role', <sig>, 'execute')`:

- Tables: `pos_approvals`, `pos_device_sessions`, `payment_links`,
  `waitlist_offers`, `pos_shift_movements` — all **EXIST**.
- Columns: `orders.tip_cents` (bigint), `order_lines.kind` (text),
  `order_lines.operator_user_id` (uuid), `order_lines.booking_id` (uuid),
  `order_lines.booking_kind` (text) — all **EXIST**.
- Functions checked: `pos_approve_custom_amount`, `pos_link_booking`,
  `pos_set_tip`, `visit_transfer`, `visit_split_check`, `visit_merge_checks`,
  `visit_change_server`, `waitlist_offer_place`, `waitlist_accept_offer`,
  `waitlist_decline_offer`, `pos_set_staff_pin`, `pos_reserve_collection` —
  all **EXIST**, and for every one: `anon.execute=false`,
  `authenticated.execute=false`, `service_role.execute=true`. No anon/authenticated
  execute grant found on any of the 12 functions checked.

(`pos_mutate_draft_line`, `pos_apply_draft_totals`, `pos_lock_till`,
`pos_unlock_till`, `pos_switch_operator`, `reap_payment_links`,
`reap_waitlist_offers`, `pos_record_shift_movement` also exist per the
migration files' own `DO $check$` blocks, which raise if anon/authenticated
can execute them — those blocks ran clean when the migrations applied.)

## Task 3 — manager PIN path

Fixture: fixture-tenant manager `33330001-0000-4000-8000-000000000001`
(role `owner`, status `active` — satisfies `pos_membership_is_manager`).

1. `pos_set_staff_pin(tenant, actor=owner, target=owner, '4321')` → `{"ok":true}`
2. Created a draft order + one `kind:'custom'` line via `pos_mutate_draft_line`.
3. `pos_approve_custom_amount(..., pin='0000', method='pin')` (wrong PIN) →
   `{"ok":false,"reason":"pin_invalid"}` — refused, no `pos_approvals` row written.
4. `pos_approve_custom_amount(..., pin='4321', method='pin')` (right PIN) →
   `{"ok":true,"already":false,"approval_id":"2a138349-..."}`.
5. Ground truth: `select * from pos_approvals where line_id=...` returned exactly
   one row, `kind='custom_amount'`, `method='pin'`, `approver_user_id` = the
   fixture manager.
6. Fixture order/line/approval deleted by id immediately after.

Full transcript: [`01-objects-and-fixtures.txt`](./01-objects-and-fixtures.txt) (Task 3 section).

## Task 2 — the three race scripts

All three were run for real against the isolated branch with
`JOURNEYS_ISOLATED=1` (the flag `isolated-target-guard.mjs` requires), using
fixture rows created through the engine's own RPCs where the task asked for
that (draft order + `pos_mutate_draft_line` for the payment-link fixture;
`waitlist_offer_place` for the waitlist fixture) and direct inserts only where
the task explicitly allowed a "tables path" (the open visit).

### `verify-payment-link-reserve.mjs`

Fixture: draft order `6ab1a63c-ad3c-45fb-920e-aa1613489e14` on the fixture
tenant, one catalog line (`owner_tenant_id`=fixture tenant, required by the
`order_lines_payee_xor` check) totalling 5000 cents via `pos_mutate_draft_line`.

First attempt used `PAYMENT_LINK_RACE_AMOUNT_CENTS=1000` against a 5000-cent
order — both concurrent reservations fit under the outstanding balance and
both legitimately won (`wins=2`, exit 1). That is not a race defect, it's an
under-specified fixture: `pos_reserve_collection`'s exclusivity guard is
"amount vs. outstanding", so two reservations that together fit under the
total will correctly both succeed. Re-ran with the amount set to the full
outstanding balance (5000) so a genuine race exists:

```
EXIT_CODE=0
[payment-link-reserve] wins=1
  a={"ok":true,"state":"reserved","amount_cents":5000,"outstanding_cents":0,...}
  b={"ok":false,"reason":"exceeds_outstanding","outstanding_cents":0}
```

**PASS.** Exit 0, exactly one reservation won, the other correctly refused
with `exceeds_outstanding`. Ground truth: `order_collection_reservations` held
exactly one row for this order (amount 5000, method `link`, state `reserved`)
before cleanup. Log: [`02-payment-link-reserve.txt`](./02-payment-link-reserve.txt)
(both attempts, first 1000/1000 run kept for the record, second 5000/5000 run
is the one that counts).

### `verify-visit-transfer-race.mjs`

Fixture: open visit `daf59080-542d-4a79-b2a1-e5ad91fd6c30`, tenant fixture,
service_kind `table`, opened at space "Table 5"
(`33330011-0000-4000-8000-000000000015`, not a race target so it can't
collide with `space_occupied`). Race targets: space A = "Table 1"
(`...0001`), space B = "Room A" (`...0002`) — both `active`, neither occupied
by another open visit beforehand (verified: 0 open visits on the tenant
before the fixture).

```
EXIT_CODE=1
[visit-transfer-race] wins=2
  a={"ok":true,"space_id":"...0001","visit_id":"daf59080-..."}
  b={"ok":true,"space_id":"...0002","visit_id":"daf59080-..."}
```

**FAIL — genuine, not a fixture problem.** Ground truth read after the race:
`visits` row for this id has `space_id='...0002'` (space B), `version=3`
(started at 1, so both writes landed). `visit_transfer`'s `SELECT ... FOR
UPDATE` pessimistic lock serializes the two calls correctly, but it does not
make them mutually exclusive: the second call, once it acquires the lock,
re-reads the row (now already moved to space A by the first), sees its own
target (space B) differs from the *current* `space_id`, checks only whether
some *other* visit occupies space B (none does), and writes through. The
`version` compare-and-set always matches because `v_visit` was read fresh
under the lock, so it never trips. There is no mechanism in
`visit_transfer` (migration `20261231206000_visit_check_ops.sql`) that makes
"two concurrent transfers of the same visit to two different spaces" mutually
exclusive — both commit, last-writer-wins, silently. This is a real
race-safety gap in the shipped function, not a test setup error: the script
and its exit-code contract ("Exit 1 = both wrote") worked exactly as
designed and caught it.
Log: [`03-visit-transfer-race.txt`](./03-visit-transfer-race.txt).

### `verify-waitlist-offer-race.mjs`

Fixture: `session_waitlist_entries` row (tenant, session
`eb9d8244-bdca-43b0-b6e2-25f84c871bfa`, party_size 1 — the pool had only 1
free unit at the time), then a real offer minted through
`waitlist_offer_place`, which called `reserve_resource_set_v2` and produced
offer `d3ffec71-9bff-4571-8155-85bdb3d57b5a` with `allocation_id
05f3c778-1315-4f1d-a2da-41d60d675441`.

```
EXIT_CODE=0
[waitlist-offer-race] fresh=1 already=1
  a={"ok":true,"offer_id":"d3ffec71-...","allocation_id":"05f3c778-..."}
  b={"ok":true,"already":true,"offer_id":"d3ffec71-...","allocation_id":"05f3c778-..."}
```

**PASS.** Exit 0. Exactly one fresh accept (which called `commit_capacity` and
set `accepted_at`), the other correctly resolved as `already:true` off the
same row (its `SELECT ... FOR UPDATE` blocked, then re-read the now-accepted
row and returned the idempotent branch — this is the design
`pos_reserve_collection`'s idempotency-key branch uses too, and here it holds
because `waitlist_accept_offer` checks `v_offer.accepted_at IS NOT NULL`
*before* doing any exclusive work, unlike `visit_transfer` which never
re-checks its own prior write against the new target).
Ground truth: `waitlist_offers` row has `accepted_at` set (non-null),
`declined_at` null, `allocation_id` unchanged; `session_waitlist_entries`
row has `status='accepted'`, `accepted_allocation_id` = the same allocation.
Log: [`04-waitlist-offer-race.txt`](./04-waitlist-offer-race.txt).

## Cleanup

Every fixture row created for this proof was deleted by its own id (no
wildcard deletes) after ground truth was read:
- `order_collection_reservations` (1 row), `order_lines` (1 row), `orders`
  (2 rows: payment-link fixture + PIN fixture).
- `visits` (1 row) and any `orders` referencing it (none existed by the time
  of transfer since the visit had no order — the visit row itself was
  deleted).
- `waitlist_offers` (1 row), `session_waitlist_entries` (1 row); the
  `capacity_allocations` row the accepted offer had committed was released
  via `release_capacity` before deleting the allocation row, so it does not
  leak held/committed units on the shared fixture tenant's pools.
- `pos_approvals` (1 row) from the PIN proof.

Verified clean by re-querying every id above (all empty) before this commit.

## Summary

| Check | Result |
|---|---|
| Task 1 — objects/columns/functions exist | PASS — 5 tables, 5 columns, 12 functions checked, all present |
| Task 1 — anon/authenticated cannot execute | PASS — 0/12 functions executable by anon or authenticated; all service_role-only |
| Task 3 — PIN accepts right, refuses wrong | PASS — `pin_invalid` on wrong PIN (no row written), success + row written on right PIN |
| `verify-payment-link-reserve.mjs` | PASS — exit 0, wins=1 (after correcting the fixture amount to match outstanding) |
| `verify-visit-transfer-race.mjs` | **FAIL** — exit 1, wins=2, both concurrent transfers wrote; real gap in `visit_transfer`, not a fixture defect |
| `verify-waitlist-offer-race.mjs` | PASS — exit 0, fresh=1 already=1 |
