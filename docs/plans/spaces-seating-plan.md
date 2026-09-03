# Spaces & Seating — plan

Owner: the Spaces & Seating Manager. Reports to the Platform Features Director.
Status page for this area. What shipped, what is next, what is blocked.
Created 2026-09-03. Migration band: `20261229000220` to `…239`.

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
| S1a | `agencies.timezone`, `venues`, one default venue per workspace, `resolveTenantTimezone()`, the five UTC surfaces converted | nothing | A (go given) |
| S1b | the day-of reminder fires at 8am venue-local | S1a | A |
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

**Pool binding.** I create no pools by hand and write no allocation. On insert of a bookable
space or a group, the editor calls the Capacity Engine's create-pool path with
`subject_kind='space'` / `'space_group'`, `subject_id` = my row, `units_total` = 1 for a table
or a seat and the member count for a group, and `parent_pool_id` = the enclosing room's pool.
A pool is created for a venue, a room, every bookable leaf, and every group. **Areas and
sections get no pool** (see challenge 1). Deleting a space is refused while its pool has live
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
| S1a | migration `…220`, `lib/spaces/venues.ts`, `resolveTenantTimezone`, the five UTC surfaces | 13 venues, 13 defaults, queried in production; a unit lane covers the resolution ladder; the appointment policy for a Cancun workspace reports `America/Cancun` |
| S1b | hourly reminder cron gated on venue-local hour | a workspace on `America/Cancun` gets the day-of reminder at 8am local, shown from the dispatch log |
| S2a | `spaces`, `space_groups`, combinations, pool binding | four two-tops and six four-tops defined in under two minutes; the ancestor tests above green |
| S2b | the plain "Venue and spaces" editor under Settings | clicked by me on localhost, screenshot in the PR |
| S3 | assign / move / combine | a party of six seated on T8+T9, the two-top pool unchanged |
| S4 | layouts + floor plan editor | the same room is dinner Friday and theatre Saturday, no double allocation |
| S5 | seat maps | 120 seats in Section A sell to 120 admissions, each with a seat code |
| S6 | minimum spend, private hire | a $400 minimum on a VIP table becomes credit on the tab |

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
