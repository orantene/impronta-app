# Spaces & Seating — plan

Owner: the Spaces & Seating Manager. Reports to the Platform Features Director.
Status page for this area. What shipped, what is next, what is blocked.
Created 2026-09-03. Migration band: `20261229000220` to `…239`.
**S1a and S1b are merged and live** (PRs #1537, #1539; production pointer `eae0548ad`).

Design source: the mockups canvas (artboards `SettingsVenue`, `Main` seating designer,
`SeatingTab`, `HostStand`, `SeatMapDesigner`, `PublicSeatPicker`, `SetupDrawer`).
Architecture source: "Sell the Room" sections 04, 05, 05b, 05d, 05f, 08, 10, 10b.

---

## 0. What I verified against production and `origin/main` before planning

Everything below was checked on 2026-09-03 against the live database
(`pluhdapdnuiulvxmyspd`) and `origin/main` at `a8e70b4d0`, not taken from the audit.

| Claim in the proposal | Verdict | Evidence |
|---|---|---|
| No venue entity | **Confirmed** | No `venues`, `spaces`, `space_groups`, `layouts` table exists in production. |
| `agencies` has no timezone and no address | **Confirmed** | `information_schema.columns` on `agencies` returns nothing matching `%time%`, `%zone%`, `%addr%`. 13 agency rows. |
| `locations` is taken (city gazetteer) | **Confirmed** | The table exists. No new table of mine will be called `locations`. |
| Capacity pools accept a space as a subject | **Confirmed, and better than the contract asked** | `capacity_pools_subject_kind_check` already allows `space` and `space_group`. `parent_pool_id` and a materialised `pool_path` array are shipped. I need no change from the Capacity Engine Manager to bind. |
| Timezone lives in five places, default UTC | **Partly wrong, and the correction matters** | It is not five blind copies. `lib/scheduling/appointment-policy.ts:180-196` already implements a *cascade*: platform `UTC` → tenant `settings.appointments.timezone` → `talent_booking_hours.timezone` → talent. What is missing is a workspace-level fact for that cascade to start from, and the surfaces that never consult the cascade at all: `reservation-propose.ts:133`, `BookingHoursCard.tsx:66/112`, `ClientMessagesShell.tsx:3562`, `admin-3.tsx:370`, `booking-confirmation-pdf.ts:69`. So: one good ladder plus five surfaces that default to UTC on their own. |
| Reminder crons are UTC-global | **Confirmed, and the exit proof costs more than the plan implies** | `api/cron/booking-reminders` is scheduled `0 8 * * *` (UTC) in `vercel.json:129` and selects on a **UTC** `event_date` window. "8am local" is not a read-path change; it needs an hourly schedule and a per-venue local-hour gate. Scoped as its own PR (S1b) so S1a is not held up by it. |

### Contradictions and challenges I am raising

1. **`capacity_pools_depth` caps `pool_path` at 6.** My tree is venue → room → area → section
   → table → seat, which is exactly 6, leaving zero headroom. A room with both an area and a
   section above the tables overflows it. I do not want the cap raised blindly; I want to agree
   which levels get a pool. **My proposal: not every space gets a pool.** Only *bookable*
   spaces do (tables, seats, cabanas, booths) plus the levels that can be held whole (venue,
   room). Areas and sections are organisational and get no pool of their own, which keeps the
   real pool depth at 3 (venue → room → table) or 4 (venue → room → table → seat). This needs
   the Capacity Engine Manager's agreement, because it changes what `parent_pool_id` points at.
2. **Service windows appear on my settings page but are not my model.** The `SettingsVenue`
   artboard shows Lunch / Dinner / Late night with turn times and a midnight crossing, next to
   Rooms and Table groups. Turn time is a *reservation* policy, not a property of a table, and
   a window that crosses midnight is the Schedule engine's problem (section 08). **My proposal:
   I own `venues.hours` (opening hours and closed days, the fact a building has) and the
   surface that renders both; the Reservations Manager owns service windows and turn times and
   points a window at a venue and optionally a layout.** The per-table turn-time *override*
   in the seating designer stays mine as an attribute, read by their engine.
3. **"Bar seat" in the seating designer is a `seat` under a `room`, not under a table.** The
   kind enum handles it; I am recording it because a seat map assumes seats hang off a section,
   and the bar breaks that assumption. The tree must not require a table between a room and a seat.
4. The proposal's Phase ordering puts Spaces last. My slices are ordered so that no consumer
   ever waits on a floor plan: a group with no positions is a complete answer for Reservations.

---

## 1. The slices

| Slice | Delivers | Depends on | Wave |
|---|---|---|---|
| S1a | `agencies.timezone`, `venues`, one default venue per workspace, `resolveTenantTimezone()` | nothing | **SHIPPED #1537** |
| S1b | the day-of reminder fires at 8am venue-local | S1a | **SHIPPED #1539** |
| S1c | the four remaining UTC-deciding surfaces, and a venue editor so a zone can actually be set | S1a | A, next |
| S2 | `spaces` tree, `space_groups`, pool binding, the plain "Venue and spaces" editor | S1a, Capacity 0.2 (on main) | D |
| S3 | `assign` / `move`, combinable tables, out of service, host-stand data | S2, Reservations Phase 3 | D |
| S4 | `layouts`, `layout_spaces`, the floor plan editor | S3 | E |
| S5 | seat maps, seat picker read path | S4, Events | E |
| S6 | minimum spend as prepaid credit, private hire | S4, Menu + Orders | E |

---

## 2. DDL

Money is integer cents. Every table is tenant-scoped and RLS-enabled with the same
`is_staff_of_tenant` shape the rest of the schema uses. `text` + `CHECK` for enums, never a
Postgres enum type, so that adding a kind is an ordinary migration and not an `ALTER TYPE`
that must ship alone.

### S1a — `20261229000220_venues_and_workspace_timezone.sql`

```sql
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

CREATE TABLE IF NOT EXISTS public.venues (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  slug             TEXT,
  address_line1    TEXT,
  address_line2    TEXT,
  city             TEXT,
  region           TEXT,
  postal_code      TEXT,
  country_code     TEXT,
  google_place_id  TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  timezone         TEXT NOT NULL DEFAULT 'UTC',
  hours            JSONB NOT NULL DEFAULT '{}'::jsonb,   -- opening hours + closed days
  is_default       BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','closed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- exactly one default venue per tenant
CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_one_default_per_tenant
  ON public.venues (tenant_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS idx_venues_tenant ON public.venues (tenant_id);
```

Backfill: one default venue per existing agency, named from the agency, timezone taken from
`settings->'appointments'->>'timezone'` when it is a valid IANA zone and `'UTC'` otherwise, and
`agencies.timezone` set from the same source. The verification asserts **`count(*) = 13`
venues and `13` with `is_default`**, not "more than zero" — the recorded department lesson.

### S2 — `20261229000221_spaces_and_groups.sql`

```sql
CREATE TABLE public.spaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  parent_id     UUID REFERENCES public.spaces(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL CHECK (kind IN (
                  'room','area','section','table','seat','chair','booth','cabana',
                  'stage','court','lane','desk','bed','bay','unit')),
  name          TEXT NOT NULL,
  code          TEXT,                       -- "T7", printed on the QR and the host list
  party_min     INTEGER NOT NULL DEFAULT 1 CHECK (party_min >= 1),
  party_max     INTEGER NOT NULL DEFAULT 1 CHECK (party_max >= party_min),
  seat_count    INTEGER,                    -- display only; capacity comes from the pool
  turn_minutes  INTEGER CHECK (turn_minutes IS NULL OR turn_minutes > 0),
  min_spend_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_spend_cents >= 0),
  attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,   -- window, outdoor, accessible, tags
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','out_of_service')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_spaces_code_per_venue
  ON public.spaces (venue_id, lower(code)) WHERE code IS NOT NULL;
CREATE INDEX idx_spaces_tenant ON public.spaces (tenant_id);
CREATE INDEX idx_spaces_parent ON public.spaces (parent_id);

-- symmetric, explicit, and not an array on the row: a table joins with a table
CREATE TABLE public.space_combinations (
  tenant_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  space_id      UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  with_space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  party_min     INTEGER NOT NULL,
  party_max     INTEGER NOT NULL CHECK (party_max >= party_min),
  PRIMARY KEY (space_id, with_space_id),
  CHECK (space_id <> with_space_id)
);

CREATE TABLE public.space_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id    UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('party_band','tier','pool')),
  party_min   INTEGER NOT NULL DEFAULT 1,
  party_max   INTEGER NOT NULL DEFAULT 1 CHECK (party_max >= party_min),
  min_spend_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_spend_cents >= 0),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.space_group_members (
  group_id  UUID NOT NULL REFERENCES public.space_groups(id) ON DELETE CASCADE,
  space_id  UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, space_id)
);
```

### The pool binding, as agreed with the Capacity Engine Manager

**INVARIANT SS-1 — nearest pooled ancestor.** For every pooled space,
`capacity_pools.parent_pool_id` is the pool of the **nearest ancestor that has a pool** — not the
nearest ancestor, and not the root.

This invariant lives here, and its test lives on my side, because **the capacity engine physically
cannot hold it**. `pool_path` is built from whatever `parent_pool_id` I pass and is correct by
construction for every value I could pass, so there is no wrong-looking row for the engine to
refuse. If table A points at its room while sibling table B points at the venue because a level was
skipped, **the room under-counts B forever, silently, and nothing anywhere can detect it.** The test
is a fixture tree with an area and a section in the middle: the skipped-level case is the only one
that breaks, and it only appears once a venue has rooms with areas with tables.

**Which spaces get a pool** (agreed 2026-09-03, in the registry): bookable leaves (table, seat,
chair, booth, cabana, court, lane, desk, bed, bay, unit) and the levels that can be held whole
(venue, room). **`area` and `section` get none.** A pool that nothing is ever allocated against is
still locked and counted on every reserve passing through it, so pooling organisational furniture
buys nothing and costs contention. Real depth becomes 3 or 4 against the cap of 6.

**How a pool is created.** `select public.upsert_capacity_pool(...)`, never an INSERT: there is no
INSERT policy on `capacity_pools` and the table grants are revoked from `anon` and `authenticated`.
The BEFORE trigger maintains `pool_path`, enforces same-tenant parenting, refuses cycles, enforces
the depth cap, and **refuses to re-parent a pool that has live allocations** — so a pool is rebuilt,
never moved, once it has sold anything. Idempotent on
`(tenant_id, subject_kind, subject_id, pool_key)`.

**`pool_key` is how one subject carries two pools.** A table sold as four seats *and* as a
whole-table buy-out is `'default'` and `'buyout'` on one `space_id`. S6 needs this; S2 should not
invent a second table row for it.

**Deleting a space orphans its pool, on purpose.** `subject_id` is polymorphic, so there is no FK
and no cascade, and the surviving allocations are the record of what was sold in that room —
a dispute is settled with them. **My delete path therefore sets `is_active = false` and never
deletes.** An inactive pool refuses every reserve through it with `pool_inactive`, *including for
its children*, which is exactly what a room going out of service should do. `parent_pool_id` is
`ON DELETE RESTRICT` besides. **Deactivate, never delete** is the rule for the whole area.

**Registering the subject kind is part of my S2 migration**, not a later chore:

```sql
INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by)
VALUES ('space', 'spaces', 'spaces-S2') ON CONFLICT (subject_kind) DO NOTHING;
```

and `space` is deleted from the unregistered-kinds list in
`web/src/lib/capacity/subject-registry.static.test.ts` **in the same commit**. Until then a wrong
`subject_id` makes an orphan pool that holds nothing and refuses nothing: untidy, not dangerous.

**What I get for free and must not rebuild.** `capacity_remaining_public(pool_id, starts_at,
ends_at)` is granted to `anon`, returns one integer and never a row, and already gives the tightest
answer across the whole ancestor chain — a table inside a bought-out room reports 0 without the
caller knowing my tree exists. Refusal reasons are stable: `sold_out`, `ancestor_full`,
`pool_not_found`, `pool_inactive`, `invalid_units`, `invalid_window`, `invalid_ttl`, `empty_batch`,
`unavailable`. **`ancestor_full` is the one to design for** — the table is empty and you still
cannot sit at it. Front Door owns the wording; I write no customer strings.

### SETTLED with the Capacity Engine Manager: a table must not be counted twice

My own plan said "every bookable space and every group gets a pool". Working through INVARIANT SS-1
shows that cannot be true as written.

A table's `parent_pool_id` must be its **room** (SS-1). So a group pool is **not** an ancestor of
its members. That means an allocation on a group pool and an allocation on a member table's pool
**do not see each other**, and the same table is sold twice. Nor can the group be the parent
instead: a table belongs to more than one group (the seating designer shows Table 7 in *Four-tops*
**and** *Window*) and a pool has exactly one parent.

The resolution is not "groups never get pools". It is that **a group pool and its members' pools are
two modes and must never be live at the same time for the same tables**:

| Mode | Who uses it | Pools that exist | Why |
|---|---|---|---|
| **Band** | Reservations Phase 1, no floor plan | the group only, **parentless** | "a four-top at 8pm" sells a band; individual tables may not exist as rows yet. Also the only place `overbook_units` can express a no-show buffer, because the band is the unit of overbooking policy, not the table. |
| **Assigned** | Reservations Phase 3, host stand | the tables only, parented to the room | the group becomes a pure **selection**: pick an available member, reserve *its* pool. Overlapping groups are then free, because a selection has no arithmetic. |

**The band pool is PARENTLESS, not parented to the room.** This is the Capacity Engine Manager's
correction and it is the difference between a migration that works and one that jams halfway through
a live service. During a band → assigned migration both pools exist at once; if the group hangs under
the room, reserving each replacement table pool **charges the room a second time** and the migration
refuses itself with `ancestor_full`, on a live venue, mid-way. A parentless group shares no ancestor
with the table pools, so the two sets never contend and the migration is monotonic. Nothing is lost:
in band mode the tables do not exist as rows, so there is no table count for a room pool to enforce,
and the group's own `units_total` **is** the capacity.

Parenting the group to the room was tested and **is not the answer** even outside a migration. It
closes the hole only when the room contains exactly that group's tables. A room of 10 (six four-tops
plus four two-tops) with a band of 6: the band sells 6, the room reads 6/10, Table 7 then sells
directly and the room allows 7/10 — **seven four-tops promised against six.** Parenting narrows the
hole; the two modes close it.

**INVARIANT SS-2 — mode exclusivity.** *A `space_group` pool and its member table pools are never
both active.* Like SS-1, this is mine to hold and cannot be pushed down: the engine has no idea which
tables belong to which group, because membership is my table, so there is no row it could look at and
refuse. It is expressible entirely with `is_active` and it needs a test, because the failure is
silent and surfaces only as a double-booked table on a busy night. **The `capacity_subject_kinds`
registry does not cover it** — that maps a kind to a backing table and has no notion of modes;
registering `space_group` says the subject id must be a real group row, not that the group should
currently be selling.

**The band → assigned migration, four steps, and the order is the point.** No new RPC is needed.

1. Create the table pools, parented to the room.
2. For each live group allocation: `reserve_capacity(table)` → `commit_capacity(that allocation)`.
3. **Only then** `release_capacity(the group allocation)`.
4. When the group pool is drained, `is_active = false`. Never delete it.

**Reserve the replacement before releasing the original, never the reverse.** Release-then-reserve
opens a window in which the guest holds nothing and a walk-in can take their table. If step 2 fails
for one guest, stop: their band allocation is still held, which is the safe failure.

**Selection is any-of in application code, and it does not race.** Each `reserve_capacity` is atomic
under the pool's row lock and either holds units or writes nothing, so trying candidates in sequence
and treating `sold_out` / `ancestor_full` as "next candidate" cannot oversell — the same property the
200-concurrent proof demonstrates. No any-of RPC is being requested; it would buy one round trip and
cost the engine a concept it does not need. **Rotate or randomise the candidate order**: a
deterministic order makes every concurrent booker fight over Table 1, then Table 2, paying lock
contention on every attempt.

**Pool binding.** I create no pools by hand and write no allocation. On insert of a bookable
space or a group, the editor calls the Capacity Engine's create-pool path with
`subject_kind='space'` / `'space_group'`, `subject_id` = my row, `units_total` = 1 for a table
or a seat and the member count for a group, and `parent_pool_id` = the enclosing room's pool.
A pool is created for a venue, a room, and every bookable leaf. **Areas and sections get no pool**
(see challenge 1). A `space_group` gets one **only in band mode, and parentless** (see SS-2 below). Deleting a space is refused while its pool has live
allocations; `capacity_pools.parent_pool_id` is `ON DELETE RESTRICT`, so this is enforced
below me as well as above.

### S4 — `20261229000222_layouts.sql`

```sql
CREATE TABLE public.layouts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id) ON DELETE CASCADE,
  room_space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_layouts_one_default_per_room
  ON public.layouts (room_space_id) WHERE is_default;

CREATE TABLE public.layout_spaces (
  layout_id        UUID NOT NULL REFERENCES public.layouts(id) ON DELETE CASCADE,
  space_id         UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  tenant_id        UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  x                INTEGER NOT NULL DEFAULT 0,
  y                INTEGER NOT NULL DEFAULT 0,
  width            INTEGER,
  height           INTEGER,
  rotation         INTEGER NOT NULL DEFAULT 0 CHECK (rotation >= 0 AND rotation < 360),
  capacity_override INTEGER CHECK (capacity_override IS NULL OR capacity_override >= 0),
  included         BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (layout_id, space_id)
);
```

`included = false` is how the Salsa night layout removes tables 1 to 4 for the dance floor
without deleting them: the room is one tree, the layout is a view over it.

### S5 — `20261229000223_seat_maps.sql`
Seats are `spaces` of kind `seat` under a `section`; a seat map is a layout whose members are
seats. No new table. Seat labels (`row`, `number`) live in `attributes`, and the public picker
reads `layout_spaces` positions.

### S6 — `20261229000224_space_min_spend.sql`
`min_spend_cents` already exists on `spaces` and `space_groups` from S2 as a **policy**. S6
adds nothing to my tables; it adds the reader on the Orders side that turns the policy into a
prepaid credit line. Money does not live here.

---

## 3. Assignment rules (S3), as a decision table

`assign(allocation_id, space_id)` and `move(allocation_id, to_space_id)`.

| # | Condition | Result |
|---|---|---|
| 1 | party size is inside the space's `party_min..party_max` | allowed |
| 2 | party size exceeds `party_max`, and a `space_combinations` row covers the party | allowed, both spaces assigned, both pools allocated |
| 3 | party size exceeds `party_max` with no combination | refused, `party_too_large` |
| 4 | party size below `party_min` | allowed with a warning; a host may seat two people at a four-top |
| 5 | the space is not in the group or layout the allocation was made against | refused, `space_not_in_scope` |
| 6 | the space's window overlaps an existing assignment on the same space | refused, `space_double_booked` |
| 7 | the space is `out_of_service` | refused, `space_out_of_service` |
| 8 | an ancestor of the space has a hold or committed allocation over the window | refused, `blocked_by_parent` (the ancestor rule, enforced by the Capacity Engine, not by me) |
| 9 | the allocation has no space | valid; **unassigned is a state**, the host stand assigns |
| 10 | `move` to a space that passes 1 to 8 | releases the old space's allocation and reserves the new one **in one transaction**, never release-then-reserve in application code |

Walk-ins: the host stand reserves against the pool with no order, then assigns. Rule 9 and the
walk-in path are the same code.

## 3b. How SS-1 and SS-2 are proven, and what that proof is worth

Agreed with the Capacity Engine Manager, who answered the honest version of the question rather
than the flattering one.

**The invariant is a FUNCTION, not a query.** `nearestPooledAncestor(tree, spaceId)` and
`modeIsExclusive(group, members)` are pure functions over a fixture tree. CI unit-tests the
functions on every change, forever. The rolled-back probe then asserts **once** that the real
schema, triggers and constraints agree with the function. So the probe checks the *model* against
reality; CI checks every future change against the model. That split is the same one Capacity used:
`remaining.ts` is a second implementation of the SQL rule, unit-tested in CI, and the concurrency
probe is what proves the two agree.

**The probe is evidence, not a gate, and the PR body must say so.** CI carries no service-role
credentials, so a probe cannot run there. Capacity's 200-concurrent oversell proof — the strongest
evidence produced in the whole engine — **gates nowhere** for exactly this reason, and is
deliberately outside the `ci` aggregate because a lane in the aggregate but absent from `ci.yml`
never runs while `check:ci-lane-parity` still reports green. The sentence that has to appear in the
PR is *"this is proven by a probe that does not run in CI"*, because it is what stops the next
reader assuming coverage that is not there.

**The tool is `npm run sql:dry-run -- <file>`** (`web/scripts/sql-dry-run.mjs`, merged as
`a56b10878`). Verified by reading it rather than taking it on trust: the dry run is the default,
`--commit` must be typed, `--commit` is **refused** for a file with no COMMIT of its own so a bare
probe cannot be persisted by a mistyped flag, and two COMMITs are refused outright because rolling
back the last transaction would leave the earlier one applied while the tool reported a dry run it
never performed.

**The COMMIT rule splits in two, and my first version of it was wrong.** I proposed "a probe file
should never contain the string COMMIT". That is right for a **probe** and wrong for a **migration
dry-run**, whose entire point is that a real migration runs verbatim — so it must contain its
COMMIT, which the tool swaps. The grep belongs on probe files only. And only a COMMIT that is **its
own statement** counts: this repo's plpgsql contains the allocation state `'committed'`, and a naive
match would have rewritten three function bodies (`_capacity_reserve_locked`, `commit_capacity`,
`capacity_remaining_public`). The shipped regex is line-anchored for that reason.

**Nothing in the capacity engine escapes a rollback** — verified by Capacity against the list of
things that actually do: zero identity or serial columns on their three tables, no dblink/http/pg_net
extension installed, no `pg_notify` or advisory locks in any capacity function, and exactly one plain
BEFORE ROW trigger on `capacity_pools`. They then ran the SS-1 broken shape through it and confirmed
zero residue.

**The same caveat checked on my side:** a rolled-back insert still advances a sequence, so a table
with a serial or identity column does not leave *literally* nothing behind. `venues` has **zero**
such columns (checked in production), and every table in the DDL above uses
`UUID PRIMARY KEY DEFAULT gen_random_uuid()`, so this area has no sequence to burn.

## 4. Ancestor-rule test cases (S2 exit proof)

1. Room hold over 20:00 to 23:00 refuses a table reservation at 21:00 inside that room.
2. A table allocation at 21:00 reduces the room pool's remaining by one for that window.
3. A table allocation outside the room hold's window is allowed.
4. Releasing the room hold restores the tables.
5. A cabana on the terrace is unaffected by a hold on the main room (siblings do not block).
6. A party of six on tables 8 and 9 leaves the two-top pool untouched (S3).
7. Deleting a room with a live allocation on a table inside it is refused.

## 5. PR sequence and exit proofs

| PR | Scope | Exit proof |
|---|---|---|
| S1a | migration `…220`, `lib/spaces/venues.ts`, `resolveTenantTimezone`, the booking surface | **DONE.** 13 venues, 13 defaults, 0 invalid zones in production; both live rungs exercised through the real resolver and reverted |
| S1b | hourly reminder cron gated on venue-local hour | **DONE.** The real route handler, against production: one workspace selected at its own 8am, zero when restored to UTC |
| S1c | the four remaining UTC surfaces plus a venue editor | an operator sets a zone in the UI and the reminder moves with it. **Every workspace in production is on UTC and there is no UI to change that**, so until S1c the ladder resolves correctly and nothing can exercise it |
| S2a | `spaces`, `space_groups`, combinations, pool binding (band mode), `capacity_subject_kinds` registration | **DONE, live.** Migration `…221`; SS-1 and SS-2 each have a failing-then-passing test; the probe was red before it was green |
| S2b | the "Venue and spaces" editor | **DONE, live.** Migration `…222`. Clicked: a room, then 4 two-tops, then 6 four-tops — Main room · 10 tables, both bands, under two minutes, no floor plan. DB agreed: 0 parented band pools, 0 member table pools, room pool units 10 |
| S2b | the plain "Venue and spaces" editor under Settings | clicked by me on localhost, screenshot in the PR |
| S3 | assign / move / close, and the band → assigned migration (engine half only) | **PR #1573.** Migration `…223` (`space_assignments`). The decision table, the move ordering asserted as a literal call sequence, and a plan that refuses to start when any allocation is unplaceable. **Host stand HELD by the Director** — it is Reservations' product surface and no Reservations manager exists yet |
| S4 | layouts + floor plan editor | the same room is dinner Friday and theatre Saturday, no double allocation |
| S5 | seat maps | 120 seats in Section A sell to 120 admissions, each with a seat code |
| S6 | minimum spend, private hire | a $400 minimum on a VIP table becomes credit on the tab |

## 5b. What S3 taught, and what is deliberately NOT in it

**`capacity_allocations` has no `space_id`, and it should not.** My first draft assumed one and
typechecked, because the service-role client is not generically typed. The repair — a
`space_assignments` table — is better than the column would have been: **a joined party sits at two
tables**, so the shape is genuinely one-to-many and a column would have forced a second allocation
for the same guests, which is the double-count this area exists to prevent.

**Two rules in the decision table are judgement, not logic**, and a future reader should not
"tidy" them:
- A party **under** a space's minimum is **allowed and flagged**, never refused. A host seats two at
  a four-top on a quiet night. A system that refuses is one the host works around, and a host
  working around the floor plan is how the floor plan stops matching the room.
- Overlap is **half-open**: a table freed at 20:00 is seatable at 20:00. That is what a turn time
  means; treating it as a clash loses a seating every night.

**Rule 8 is deliberately unimplemented.** An ancestor held over the window is the capacity engine's
business; its reserve refuses with `ancestor_full` and that refusal is the answer. A second
implementation of someone else's invariant is free to drift from it.

**The band → assigned migration refuses to start** when even one live allocation has no free member
table. Migrating some guests and stranding others leaves a partly-drained band pool and no way to
tell from outside which state the venue is in.

**Already-seated parties are placed before unseated ones** in that plan. Ordering by window length
alone let an unseated party take the table a guest was already sitting at: seating is a hard
constraint, duration is only a preference, and you cannot move someone mid-meal. A test caught it;
the code was wrong.

**The host stand is NOT mine.** The Director held it, using the argument I used to win the
service-windows ruling: building Reservations' core screen before they exist leaves them inheriting
a UI they did not design. What S3 ships is an API a host stand consumes.

## 5c. CONTRACT: a space id is durable, because printed things depend on it

Asked by the QR & Links Manager, whose `links.context.space_id` puts a table's identity on a
printed table tent that lives for years while the destination changes. Verified against
production and the code, then promoted from "a property that happens to hold" to a rule.

**`spaces.id` is stable across a rename, a layout change, and going out of service.**
- `id` is `uuid NOT NULL DEFAULT gen_random_uuid()`; a rename or a status change is an `UPDATE`.
- **A layout change never touches the space.** The tree owns the space; a layout is a *view* over
  it, and removing a table from one is `layout_spaces.included = false`, never a delete. That is
  what makes the same room dinner on Friday and theatre on Saturday from one set of spaces.
- A space that has ever seated a guest is already undeletable: `space_assignments.space_id` is
  `ON DELETE RESTRICT`.

**THE RULE, which does not yet have a structural guarantee and therefore needs to be written
down: removing a space in this area is `status = 'retired'`, NEVER a `DELETE`.**

QR & Links deliberately put **no foreign key** on `links.context.space_id`, and their reasoning is
the counterpart to this rule: an FK with `ON DELETE CASCADE` would destroy the *link* on a hard
delete, so the guest holding the printed tent gets nothing, whereas a dangling id degrades to "the
menu with no table attached", which is a perfectly good page. **A dangling id is a worse database
and a better restaurant.** Our retire rule means it should never dangle at all; their FK-free
column is the belt to our braces. Neither half is sufficient alone. There is no
delete affordance today, and a space that has never been seated has no `RESTRICT` protecting it,
so the next person to build "remove this table" is the one this rule is for. **A printed code must
outlive every reconfiguration of the room it names.** Changing this comes to QR & Links first.

**`spaces.code` is a HUMAN LABEL, not a scan token.** It is "T7" — what the host says out loud and
what is painted on the table. Unique per venue, not secret, not signed, and **it must never be
resolvable**, nor used to *derive* a link code: either way a venue's eleven tables become
`/q/t1`..`/q/t11` and a stranger walks the floor plan from a phone. Anything durable keys on `id`;
`code` can be reassigned by an operator renumbering a floor.

**Calibration, from the QR & Links Manager and worth keeping honest:** a guessable *table* code is
not a breach the way a guessable door code would be. `/q/t7` resolves to "the menu with Table 7
attached", so a guest who guesses it opens a tab at the wrong table — a floor-service annoyance a
host fixes in ten seconds. **It is a bad default, not a hole**, and defaults are what ship a
thousand times. I overstated this first; the rule stands and the severity does not.

**QR is not this area's.** "QR per space" belongs to QR & Links: a QR is one rendering of a link
whose `context.space_id` is the space. Spaces calls their helper and never writes `links`, never
mints a code and never generates an image — so a table code, a door code and a flyer stay one
object with one analytics story. Verified 2026-09-03: zero occurrences of qr/token/signed in
`lib/spaces/**`.

## 5d. Traps outside this area that will cost S4 and S5 an afternoon

- **`web/src/middleware.ts` DOES NOT EXIST.** CLAUDE.md's QA caveat is stale; Next 16 renamed it and
  the file is `web/src/proxy.ts`. Verified on `origin/main`.
- **There is a second gate the caveat never mentions:** `web/src/lib/saas/surface-allow-list.ts`, a
  per-host-kind path allow-list run inside the proxy. A path not in it is rewritten to
  `/_page-not-found` with a 404 **before Next routing runs**, so a route file that exists and is
  correct still 404s and the HTML 404 reads as a routing bug.
- **A new public ROOT path needs FOUR registrations, not two.** I recorded two here first and was
  wrong; corrected by the QR & Links Manager and verified against `origin/main` and production:
  1. `surface-allow-list.ts` — the gate itself.
  2. `WORKSPACE_SLUG_RESERVED_PREFIXES` in the same file (`PATH_BASED_TENANT_RESERVED_PREFIXES`
     inherits it by spread).
  3. `PLATFORM_RESERVED_SLUGS` in `web/src/lib/site-admin/reserved-routes.ts`.
  4. **A seed row in `public.platform_reserved_slugs`, in a migration.** The table is live with 52
     rows today.

  `reserved-routes.collisions.static.test.ts` walks the real `src/app` tree and fails until 3 and 4
  exist. **Miss 3 or 4 and a tenant can author a CMS page at that slug which publishes, links, and
  silently never opens** — which is worse than a 404, because nothing reports it.
- **`surface-allow-list.ts` is EXACTLY 800 lines on `origin/main`, against a `max-lines` cap of 800.
  It can absorb ZERO new lines.** Verified by counting. So S4 and S5 cannot add a path without first
  making room. **Do not add a suppression — the ratchet only goes down.** The QR & Links Manager
  freed space by reflowing wrapped prose comments in place, guarded by a check comparing the word
  multiset before and after (which caught `textwrap` breaking `guest-chat` into `guest- chat`), for
  a net-zero line cost. Budget time for that, or expect the PR to be blocked by a file it only
  touches in passing.

## 6. Files I own

- `supabase/migrations/20261229000220…239_*.sql`
- `web/src/lib/spaces/**` (new)
- `web/src/lib/scheduling/tz.ts` is **shared**: I add nothing to it, I only call it.
- `web/src/lib/scheduling/appointment-policy.ts` — the tenant timezone read only (S1a)
- `web/src/app/api/cron/booking-reminders/route.ts` (S1b)
- the "Venue and spaces" settings surface and the seating designer (S2b, S4)

Not mine: pools and allocations (Capacity), orders and money (Orders), service windows and
turn-time policy (Reservations), the words a workspace shows for a space (Front Door),
the QR rendering and short links (QR & Links) — I supply the space id they resolve to.
