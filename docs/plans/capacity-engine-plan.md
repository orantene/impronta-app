# Capacity Engine — plan (Phase 0.2, 0.3, and the 0.9 slice)

Owner: Capacity Engine Manager · Reports to: Platform Features Director
Source architecture: "Sell the Room", §04 (the engines), §05b (one object, three lenses), §10b (Phase 0 plan)
Verified against `origin/main` @ `2e2868ef3` on 2026-09-02.

---

## 0. Fact re-verification, and where the brief is wrong

Every audit fact was re-read on current `origin/main`. Seven items differ from the brief. Three of them
change the exit proof for 0.3.

| # | Brief says | Current `origin/main` says | Impact |
|---|---|---|---|
| 1 | "the release path is gated on `kind='product'` so the 12-spot course never returns its seats" | The **reserve** path is gated the same way — [`instant-book-engine.ts:317`](../../web/src/lib/inquiry/instant-book-engine.ts#L317) `if (offering && offering.kind === "product" && offering.inventoryQty != null)`. The course is `kind='package'`, so it **never decrements at all**. | Worse than described. The course can sell 13, 30, 300 spots. It is not a stuck-seat bug, it is an **unbounded oversell**. Exit proof for 0.3 must prove refusal of the 13th, which today does not happen. |
| 2 | "the offerings editor (TalentOfferingsManager) exposes stock" | `TalentOfferingsManager.tsx` contains **zero** references to `inventoryQty` or stock. `inventoryQty` is read in 4 places and written by **no editor anywhere**. The live `12` was set by seed/hand. | 0.3 is net-new UI, not "expose an existing field". Budget accordingly. |
| 3 | "the public menu board shows sold out" | [`menu-board-island.tsx`](../../web/src/lib/site-admin/builder-node/menu-board-island.tsx) has no `inventory` and no `sold` anywhere. Sold-out exists **only** on the talent storefront, [`StorefrontBody.tsx:43,113`](../../web/src/app/t/[profileCode]/_shared/StorefrontBody.tsx#L43), and there it is *also* `kind === "product"`-gated. | Menu sold-out is net-new for the Menu Workspace Manager. I ship the data contract; they ship the island. |
| 4 | "the talent calendar holds are serialised by a btree_gist exclusion constraint" | True, but it lives in [`20261215000000_appointments_v1.sql:551`](../../supabase/migrations/20261215000000_appointments_v1.sql#L551) (not `talent_calendar_v1`), and it is `WHERE (hold_strength = 'firm')`. | **Soft holds already overlap freely.** "One person, one slot" is true only for firm holds. Worth knowing before Phase 5. |
| 5 | CLAUDE.md: "use `date -u +%Y%m%d%H%M%S` at the start of work" | Migration filenames in this repo are a **local sequence, not wall clock** — documented at length in [`20261124000000_lock_leftovers…sql:8-18`](../../supabase/migrations/20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql#L8). Current head is `20261226000010`. A `date -u` stamp (`20260902…`) sorts **before** head and applies out of order. | The department needs **timestamp bands**, not per-agent date stamps. Proposal in §5. |
| 6 | — | `20261226000010_email_suppressions_guest.sql` is **untracked** in the working tree, not on `origin/main`. | The true head of the sequence is ambiguous while 8 managers work in parallel. Bands solve this. |
| 7 | "the hardcoded 48h in reservation-hold.ts" | Confirmed — `RESERVATION_HOLD_TTL_MS = 48 * 60 * 60 * 1000` at [`reservation-hold.ts:13`](../../web/src/lib/scheduling/reservation-hold.ts#L13), applied at :82. | No change. |

Live data check (read-only `SELECT` against production, no writes):

```
select id, kind, title, inventory_qty, price_type, status, reserve_mode
  from talent_offerings where inventory_qty is not null;
→ exactly 1 row: "Posing course — September (12 spots)", kind=package,
  price_type=flat_package, status=published, reserve_mode=full, inventory_qty=12
```

One row on the whole platform carries a capacity number, and no code path can enforce it.

---

## 1. Schema DDL

Two tables. Money never appears; a pool knows units, never prices.

```sql
-- ─── capacity_pools ─────────────────────────────────────────────────────────
CREATE TABLE public.capacity_pools (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  subject_kind      text NOT NULL CHECK (subject_kind IN
                      ('offering','space','space_group','session_tier','person')),
  subject_id        uuid NOT NULL,
  -- A subject may carry more than one pool (a table sold as seats AND as a
  -- buy-out; an offering with a per-session tier). 'default' for the common case.
  pool_key          text NOT NULL DEFAULT 'default'
                      CHECK (pool_key ~ '^[a-z0-9][a-z0-9_-]{0,48}$'),
  parent_pool_id    uuid REFERENCES public.capacity_pools(id) ON DELETE RESTRICT,
  -- Materialised ancestor chain, root-first, INCLUDING self. Maintained by
  -- trigger. Depth is capped at 6 so the reserve walk is bounded.
  pool_path         uuid[] NOT NULL,
  units_total       int  NOT NULL CHECK (units_total >= 0),
  overbook_units    int  NOT NULL DEFAULT 0 CHECK (overbook_units >= 0),
  hold_ttl_seconds  int  NOT NULL DEFAULT 900
                      CHECK (hold_ttl_seconds BETWEEN 30 AND 604800),
  unit_label        text,
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_pools_depth CHECK (array_length(pool_path, 1) BETWEEN 1 AND 6)
);

CREATE UNIQUE INDEX capacity_pools_subject_uniq
  ON public.capacity_pools (tenant_id, subject_kind, subject_id, pool_key);
CREATE INDEX capacity_pools_tenant_idx ON public.capacity_pools (tenant_id);
CREATE INDEX capacity_pools_parent_idx ON public.capacity_pools (parent_pool_id)
  WHERE parent_pool_id IS NOT NULL;

-- ─── capacity_allocations ───────────────────────────────────────────────────
CREATE TABLE public.capacity_allocations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  pool_id        uuid NOT NULL REFERENCES public.capacity_pools(id) ON DELETE CASCADE,
  -- Copy of the pool's pool_path at insert time. This is what makes a child's
  -- allocation count against every ancestor in ONE indexed scan per ancestor.
  pool_path      uuid[] NOT NULL,
  order_line_id  uuid,                       -- FK added by Orders in PR 0.5
  starts_at      timestamptz,                -- NULL/NULL = timeless stock
  ends_at        timestamptz,
  units          int  NOT NULL CHECK (units > 0),
  state          text NOT NULL DEFAULT 'hold'
                   CHECK (state IN ('hold','committed','released')),
  expires_at     timestamptz,                -- required for state='hold'
  released_at    timestamptz,
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT capacity_allocations_range_check
    CHECK ((starts_at IS NULL) = (ends_at IS NULL)
           AND (ends_at IS NULL OR ends_at > starts_at)),
  CONSTRAINT capacity_allocations_hold_expires
    CHECK (state <> 'hold' OR expires_at IS NOT NULL),
  CONSTRAINT capacity_allocations_released_stamp
    CHECK ((state = 'released') = (released_at IS NOT NULL))
);

-- The hot path: "live allocations touching pool X in window W".
CREATE INDEX capacity_allocations_path_gin
  ON public.capacity_allocations USING gin (pool_path)
  WHERE state <> 'released';
CREATE INDEX capacity_allocations_pool_window_idx
  ON public.capacity_allocations (pool_id, starts_at, ends_at)
  WHERE state <> 'released';
CREATE INDEX capacity_allocations_reap_idx
  ON public.capacity_allocations (expires_at)
  WHERE state = 'hold';
CREATE INDEX capacity_allocations_order_line_idx
  ON public.capacity_allocations (order_line_id)
  WHERE order_line_id IS NOT NULL;
```

### Why `released` is a third state, not a DELETE — deviation from the brief

The brief specifies `state IN ('hold','committed')` and a release "clamp so a double release can never
inflate". I am proposing a soft `released` state instead, because **that is the clamp**: remaining
capacity is *derived* from rows, never stored as a counter, so releasing twice is structurally a no-op —
the second call finds a row already in `released` and returns 0. A DELETE would clamp equally well but
throws away the trail of *which order line released how many units and when*, which refunds-by-line
(PR 0.8) and the no-show roll-up (§05b, "Everything to Customers") will both want. Director: flag if you
want the row deleted instead; it is a one-line change either way.

### The hierarchy rule (designed with the Spaces & Seating Manager)

A pool may declare `parent_pool_id`. Two guarantees:

1. **A child's allocations count against every ancestor.** Because every allocation copies its pool's
   `pool_path`, "allocations charged to pool X" is exactly `pool_path @> ARRAY[X]`. Booking a seat
   consumes a unit of the seat's pool, of its table, of its room and of its venue, in one write.
2. **A reserve is refused when any ancestor is full for the window.** `reserve_capacity` walks the
   chain and checks each level, so a room buy-out (an allocation on the *room* pool that consumes all
   its units) leaves every table beneath it with zero remaining — the room's own check fails first.

`pool_path` is maintained by a `BEFORE INSERT OR UPDATE OF parent_pool_id` trigger that resolves the
parent's path and appends self, enforcing: same tenant, no cycle, depth ≤ 6. Re-parenting a pool that
already has allocations is **refused** (the allocations' paths would be stale); the Spaces Manager
rebuilds instead. Deleting a parent with children is `ON DELETE RESTRICT`.

`subject_kind` includes `'space_group'` for the Spaces Manager's table groups, and `'person'` is
reserved but **unused in Phase 0** — the `talent_holds` gist exclusion stays the sole authority for
people until Phase 5, per the contract.

### Why a row lock and not a second exclusion constraint

Recorded verbatim in the migration header. An `EXCLUDE` constraint compares a row against other rows;
it cannot compare an incoming row against a *total* that lives on a different table's row. Denormalising
`units_total` onto every allocation to make an EXCLUDE possible is fragile (a capacity edit would have to
rewrite every live allocation). Per-pool `SELECT … FOR UPDATE` is exactly the serialisation
`reserve_offering_stock` already uses today, and a pool is one venue-thing, so contention is bounded by
how many people are buying the same table at the same instant. Ancestor rows are locked **root-first**
(ascending `pool_path` position) so two concurrent reserves on sibling tables can never deadlock on
their shared room.

### RLS

Following the `talent_offerings` / `talent_holds` pattern:

```sql
ALTER TABLE public.capacity_pools       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_allocations ENABLE ROW LEVEL SECURITY;

CREATE POLICY capacity_pools_select_staff ON public.capacity_pools
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));
CREATE POLICY capacity_allocations_select_staff ON public.capacity_allocations
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));
-- No INSERT/UPDATE/DELETE policy at all: writes are service-role only, and
-- service_role bypasses RLS. Every write goes through an RPC.
```

Public availability ("12 spots left") is **not** served by a policy on these tables — it is served by
a narrow `SECURITY DEFINER` reader, `capacity_remaining_public(pool_id, starts_at, ends_at)`, which
returns a single integer and nothing else. Anon never sees who holds what.

---

## 2. RPC signatures

All four are `SECURITY DEFINER`, `SET search_path TO 'public'`, and every one re-checks that
`p_pool_id`'s `tenant_id` matches the pool it was handed (a caller cannot reserve across tenants).
All are `REVOKE ALL … FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE … TO service_role`, per
[`20261124000000`](../../supabase/migrations/20261124000000_lock_leftovers_and_revoke_anon_definer_rpcs.sql)
— `REVOKE FROM anon` alone is a no-op; `FROM PUBLIC` is the operative statement.

```sql
-- Internal, raises on refusal so batch is all-or-nothing in one transaction.
_capacity_reserve_locked(p_pool_id uuid, p_starts_at timestamptz, p_ends_at timestamptz,
                         p_units int, p_ttl_seconds int, p_order_line_id uuid,
                         p_created_by uuid) RETURNS capacity_allocations

-- Public single-pool wrapper. Catches the refusal and returns it as data.
reserve_capacity(p_pool_id uuid, p_starts_at timestamptz DEFAULT NULL,
                 p_ends_at timestamptz DEFAULT NULL, p_units int DEFAULT 1,
                 p_ttl_seconds int DEFAULT NULL,      -- NULL ⇒ pool.hold_ttl_seconds
                 p_order_line_id uuid DEFAULT NULL,
                 p_created_by uuid DEFAULT NULL) RETURNS jsonb
-- → {"ok":true,"allocation_id":uuid,"expires_at":ts,"remaining":int}
-- → {"ok":false,"reason":"sold_out"|"pool_inactive"|"pool_not_found"|"ancestor_full"|
--                        "invalid_units"|"invalid_window", "blocking_pool_id":uuid|null,
--    "remaining":int}

-- All-or-nothing across pools (dinner + show; table + two seats).
-- Requests are sorted by pool_path before locking so the lock order is global.
reserve_capacity_batch(p_requests jsonb,               -- [{pool_id,starts_at,ends_at,units}]
                       p_ttl_seconds int DEFAULT NULL,
                       p_order_line_id uuid DEFAULT NULL,
                       p_created_by uuid DEFAULT NULL) RETURNS jsonb
-- → {"ok":true,"allocation_ids":[uuid,…],"expires_at":ts}
-- → {"ok":false,"reason":…,"failed_pool_id":uuid}   (nothing is written)

-- hold → committed. Idempotent on rows already committed. Refuses (returns ok:false)
-- if any id is missing, released, or an EXPIRED hold — an expired hold's units are
-- already promised to someone else, so committing it would oversell.
commit_capacity(p_allocation_ids uuid[],
                p_order_line_id uuid DEFAULT NULL) RETURNS jsonb
-- → {"ok":true,"committed":int}  |  {"ok":false,"reason":"expired"|"missing"|"released",
--                                    "allocation_id":uuid}

-- The clamp. Sets state='released', released_at=now(). Rows already released are
-- skipped, so N calls release exactly once. Returns how many actually flipped.
release_capacity(p_allocation_ids uuid[]) RETURNS jsonb
-- → {"ok":true,"released":int,"already_released":int}

-- Reaper. Marks lapsed holds released. Correctness does NOT depend on it (the
-- remaining-math already ignores expired holds) — it is hygiene, and it is why
-- this engine is safer than talent_holds, whose gist constraint CANNOT see
-- expires_at and therefore deadlocks a slot when the reaper is late.
reap_capacity_allocations(p_limit int DEFAULT 500) RETURNS int

-- Narrow public reader: one integer, no rows.
capacity_remaining_public(p_pool_id uuid, p_starts_at timestamptz DEFAULT NULL,
                          p_ends_at timestamptz DEFAULT NULL) RETURNS int
```

**Remaining-units definition (the one rule everything derives from).**
For pool `P` over window `W`:

```
remaining(P, W) = P.units_total + P.overbook_units
                - Σ units of allocations A where
                      A.pool_path @> ARRAY[P.id]          -- P or any descendant
                  AND (A.state = 'committed'
                       OR (A.state = 'hold' AND A.expires_at > now()))
                  AND overlaps(A, W)
```

where `overlaps(A, W)` is `true` when either side is timeless (`starts_at IS NULL`), and otherwise
`tstzrange(A.starts_at, A.ends_at, '[)') && tstzrange(W.starts_at, W.ends_at, '[)')`. A timeless
allocation counting against every windowed reserve is deliberate: that is what makes stock work.

A reserve of `k` units on `P` succeeds iff `remaining(A, W) >= k` for **every** `A` in `P.pool_path`.

---

## 3. The pure library — `web/src/lib/capacity/`

No Supabase import in the pure half, so it runs in every test lane (see
`reference_server_only_import_breaks_test_lanes`).

| File | Exports |
|---|---|
| `types.ts` | `CapacityPool`, `CapacityAllocation`, `CapacityWindow`, `ReserveRefusalReason` |
| `remaining.ts` | `remainingUnits(pool, allocations, window, now?)`, `overlapsWindow(alloc, window)`, `isAllocationLive(alloc, now?)`, `chargesAgainst(alloc, poolId)` |
| `reserve.ts` | server wrappers over the RPCs (`reserveCapacity`, `reserveCapacityBatch`, `commitCapacity`, `releaseCapacity`) returning discriminated unions, not `any` |
| `index.ts` | barrel |

`remaining.ts` is the **same rule as the SQL**, in TypeScript, so the UI can compute "3 left" from rows
it already loaded without a round trip. The concurrency test proves the two agree.

Tests:
- `remaining.test.ts` — pure. Timeless vs windowed, expired holds ignored, released ignored,
  overbook, descendant units charged to ancestors, half-open boundary (`[)`: a 19:00–20:00 and a
  20:00–21:00 allocation do **not** overlap).
- `capacity-concurrency.test.ts` — 200 concurrent `reserve_capacity` calls against a 12-unit pool;
  asserts exactly 12 `ok:true` and `remaining = 0`. Needs a real Postgres, so it is gated on
  `CAPACITY_TEST_DATABASE_URL` and **skips** when unset.

**Honest note on the exit proof.** Per `reference_ci_lane_parity`, CI runs a curated `test:*` list and
e2e is not in it. The concurrency test therefore cannot be a CI gate on day one — I will run it against
a Supabase **dev branch** (never production; see `incident_probed_invariants_against_production`) and
paste the raw output as evidence. Adding `CAPACITY_TEST_DATABASE_URL` to CI secrets turns it into a real
gate; that is a one-line workflow change I will propose separately rather than smuggle into this PR.

---

## 4. PR sequence and exit proof

| PR | Branch | Delivers | Exit proof |
|---|---|---|---|
| **0.2** | `feat/capacity-engine` | Migration `20261229000200`: both tables, RLS, indexes, `pool_path` trigger, all RPCs + revokes, reaper. `web/src/lib/capacity/*` + unit tests. Reaper wired into `/api/cron/expire-calendar-holds` (schedule `*/5` → `*/1`). Regenerated `database.types.ts`. **No caller changes.** | 200 concurrent reserves against a 12-unit pool → exactly 12 commit, `remaining=0`, zero rows over. `has_function_privilege('anon', <each rpc>, 'EXECUTE')` = false for all. `get_advisors` clean. Room-buy-out refuses every table beneath it. |
| **0.3a** | `feat/offering-stock-pools` | Migration `20261229000210`: `capacity_pool_id` + `consumes_units` on `talent_offerings` and `talent_offering_variants`; backfill one timeless pool per offering with `inventory_qty IS NOT NULL` (1 live row); `reserve_offering_stock` / `release_offering_stock` **rewritten as thin wrappers** over the new RPCs, signatures unchanged so no caller breaks. | The live course has a pool with `units_total=12`, `remaining=12`. Old RPC names still return the same booleans. Nothing in the app changed behaviour yet. |
| **0.3b** | `feat/offering-stock-app` | `instant-book-engine.ts` reserve gate becomes "the offering has a pool" (the `kind === 'product'` test **deleted**). `offering-stock.ts` `shouldReleaseStock` drops its `kind` test and releases by `allocation_id` instead of qty. `offerings-types.ts` gains `capacityPoolId` / `remainingUnits`. `TalentOfferingsManager` gains a **new** Stock field (none exists today). `StorefrontBody` sold-out drops its `kind` test. | **The live 12-spot course refuses the 13th order and returns a seat on cancel** — proven by clicking it in the real workspace, screenshot, not by a test (`feedback_never_assert_unclicked_ui_paths`). |
| **0.9-cap** | `fix/hold-ttl-per-pool` | `RESERVATION_HOLD_TTL_MS` becomes a default, not a hardcode: `createReservationHold` takes an optional TTL. Callers pass the pool's `hold_ttl_seconds` when a pool exists. | A pool set to 600s produces a 10-minute hold; a pool-less reservation still gets 48h. |

Sequencing: **0.2 blocks everything.** 0.3a waits on 0.2; 0.3b waits on 0.3a. 0.9-cap waits on 0.2 and
is independent of 0.3. Per CLAUDE.md, `npm run db:push` happens **before** each merge, and — per
`incident_db_check_false_green_on_timestamp_collision` — I verify the *objects exist* in the remote,
never the green line from `db:check`.

Not mine, reviewed only: the `talent_bookings` overlap constraint in 0.9 belongs to the Appointments
Manager. I will review their exclusion predicate against the soft/firm split noted in §0 item 4.

---

## 5. Migration timestamps — a department-wide request

Filenames here are a local sequence. Head on `origin/main` is `20261226000009`; `…000010` exists
untracked on one branch. Eight managers using `date -u` will each produce a `20260902…` stamp that sorts
*before* head. I have taken the band **`202612270002xx`** for Capacity and will use:

- `20261227000200_capacity_engine.sql`
- `20261227000210_offering_stock_pools.sql`

Director: please allocate the other seven bands (`…0000xx` Orders, `…0001xx` Spaces, `…0003xx`
Sessions, and so on) and publish the map, or we will hit the park-restore dance repeatedly.

---

## 6. Contracts I publish to the other managers

| Manager | Contract | Available after |
|---|---|---|
| **Spaces & Seating** | Full DDL above (sent same day). Pool per space; `parent_pool_id` chain venue → room → area → table → seat; `subject_kind` `'space'` and `'space_group'`. They create the spaces and call `create_capacity_pool`; I never create a venue, space or layout. | 0.2 |
| **Orders & Checkout** | `order_lines.capacity_allocation_ids uuid[]`. Reserve at cart (`reserve_capacity_batch`), `commit_capacity` on paid, `release_capacity` on cancel/refund/expiry. Refusal reasons are stable strings. | 0.2 |
| **Sessions & Classes** | One pool per `(session, tier)` with `subject_kind='session_tier'`, allocations windowed to the session range. | 0.2 |
| **Menu Workspace** | Read model: `offering.capacityPoolId`, `offering.remainingUnits` (`null` = unlimited), `offering.soldOut`. `remainingUnits()` from `@/lib/capacity` computes it client-side from loaded rows. | 0.3a |
| **Reservations / Events** | Reach capacity only through Spaces & Seating. No direct contract. | — |

**Invariants I hold, and will refuse to break:** a pool is per tenant and every RPC re-checks it;
money never enters these tables; `talent_holds`' gist exclusion remains the sole authority for people
until Phase 5; writes are service-role only.

---

## 7. Open questions for the Director

1. `released` as a third state vs hard DELETE (§1). I recommend `released`.
2. `capacity_pool_id` and `consumes_units` on `talent_offerings` is a **Catalog** column per §04, but
   0.3 assigns me `offerings-types.ts`. Confirm I add them, or hand it to whoever owns Catalog.
3. Given §0 item 1 — the live course is *oversellable today*, not merely stuck — do you want a
   one-line hotfix (widen the reserve gate to any offering with `inventory_qty`) ahead of 0.2, or is the
   platform's zero real usage enough that we wait for the engine? I recommend waiting; there are no
   business tenants in production and a hotfix would be thrown away in 0.3b.
4. The concurrency exit proof is evidence, not a CI gate, until `CAPACITY_TEST_DATABASE_URL` is a CI
   secret (§3). Approve adding it?
5. Migration band allocation (§5).

---

## 8. Status — 0.2 shipped

**Branch** `feat/capacity-engine`. **Migration** `20261229000200_capacity_engine.sql`, applied to
production via `web/scripts/apply-migration.mjs` and verified by object existence, not by a green line.

### Evidence

**Dry run first.** The whole migration was run against the production schema inside
`BEGIN … ROLLBACK` before anything was applied. `to_regclass` confirmed zero residue afterwards.

**Grants, read back from `information_schema.role_table_grants` and `has_function_privilege`:**

| Principal | reserve / batch / commit / release / reap / upsert | `capacity_remaining_public` | tables |
|---|---|---|---|
| `anon` | EXECUTE denied | EXECUTE granted (deliberate, §1) | no grant |
| `authenticated` | EXECUTE denied | EXECUTE granted | SELECT only |
| `service_role` | EXECUTE granted | EXECUTE granted | full |

Two rounds of tightening were needed and both are in the file. Supabase's default privileges grant
`ALL` on a new public table to `anon` *and* `authenticated`; RLS with no write policy already made
those writes dead, but a table whose only sanctioned writer is an RPC should not advertise
`INSERT` to a role at all.

**Behaviour, 25 assertions in one transaction against production, rolled back, zero residue:**
timeless stock sells 12 and refuses the 13th; release returns exactly one seat and a double release
returns zero without inflating; a room buy-out drives a 10-seat table to `ancestor_full` while a
different service window stays open; a child's units charge the ancestor; `19:00–21:00` and
`21:00–23:00` do not collide; commit is idempotent and refuses an expired hold; a refused batch
leaves zero rows; cross-tenant parenting and re-parenting a pool with live allocations are both
refused.

Two of those assertions failed on the first run and both were the *fixture's* fault, not the
engine's — a room given one unit whose child was asked for two, and a batch leg pointed at a pool
the test had already exhausted. Recorded because "the test was wrong" is only credible when it is
written down.

**The exit proof**, `npm run verify:capacity-concurrency`, twice:

```
[capacity-proof] pool 21c4ef23-…: 12 units, firing 200 concurrent reserves
[capacity-proof] 200 calls in 28986ms
[capacity-proof] replies: {"ok":12,"sold_out":172,"client-error (fetch failed)":16}
[capacity-proof] ground truth: 12 live allocations, 12 units held, 0 remaining
[capacity-proof] PASS — exactly 12 of 200 won, zero oversell
[capacity-proof] cleaned up; rows left for this pool: 0
```

The client-side socket failures are the reason the script reads ground truth from
`capacity_allocations` rather than tallying replies: under 200 parallel sockets a handful of requests
die before they are sent, and a reply-only tally cannot tell that apart from a refusal. The row count
can, and it says 12.

**Lanes**, real exit codes: `test:capacity` 15/15 exit 0 · `test:scheduling` 107/107 exit 0 ·
`test:size-ratchet` 82/82 exit 0 · `check:ci-lane-parity` exit 0 (39 lanes gated).

### One thing deliberately left out of this PR

`database.types.ts` was regenerated from production, which also contains `customers` and
`recompute_customer_rollups` — Orders & Checkout's 0.4, applied to production but still on their
branch. Shipping the whole regenerated file would have claimed their contract and guaranteed a
conflict. Only the capacity entries were spliced in; the two Orders blocks were removed by hand.
Whoever merges second regenerates cleanly.
