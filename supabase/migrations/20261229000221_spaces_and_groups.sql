-- Spaces & Seating S2 — the tree, the groups, and the two ways to sell them.
--
-- WHAT THIS IS
-- A space is a node in a venue's tree: a room, an area inside it, a table in
-- the area, a seat at the table. One model covers restaurant tables, nightclub
-- cabanas, theatre seats, padel courts, spa rooms and bowling lanes, because
-- what varies between them is a WORD and a party-size range, not a structure.
-- The word a workspace shows ("court", "lane", "sunbed") comes from the Front
-- Door words table and never from the `kind` enum here: `kind` is structural.
--
-- WHICH SPACES GET A CAPACITY POOL, AND WHY NOT ALL OF THEM
-- A pool is a thing that can be HELD. Bookable leaves can be held, and so can
-- the levels that can be taken whole (a venue buy-out, a room buy-out). An
-- `area` or a `section` is organisational furniture: it groups and it renders,
-- it is never allocated against. Giving it a pool would buy nothing and cost
-- contention, because every reserve passing through a pool LOCKS and counts it.
-- It also keeps the real pool depth at 3 or 4 against `capacity_pools_depth`'s
-- cap of 6, instead of the 6 an all-levels tree would need with no headroom.
--
-- INVARIANT SS-1 — NEAREST POOLED ANCESTOR
-- A pooled space's `parent_pool_id` is the pool of the nearest ancestor THAT
-- HAS A POOL, skipping any area or section between. This cannot be enforced by
-- the capacity engine: `pool_path` is built from whatever parent it is handed
-- and is correct by construction for every value, so there is no wrong-looking
-- row for it to refuse. If one table points at its room and its sibling points
-- at the venue because a level was skipped, the room under-counts that sibling
-- forever and nothing anywhere can detect it. It is held in `lib/spaces/tree.ts`
-- and tested there.
--
-- INVARIANT SS-2 — MODE EXCLUSIVITY
-- A `space_group` pool and its member spaces' pools are NEVER both active.
--   band mode     the group has a pool, PARENTLESS, and the members have none.
--                 This is Reservations phase one: "a four-top at 8pm" sells a
--                 band, the tables may not exist as rows yet, and it is the only
--                 place `overbook_units` can express a no-show buffer, because a
--                 buffer is a property of the band and not of a table.
--   assigned mode the members have pools parented to their room, and the group
--                 is a pure SELECTION: pick a free member, reserve ITS pool.
--                 Overlapping groups become harmless, because a selection has
--                 no arithmetic.
-- Both at once double-sells: a group pool is not an ancestor of its members
-- (SS-1 puts a table under its room), so the two never see each other's
-- allocations. The group cannot be the parent instead, because a table belongs
-- to several groups at once and a pool has exactly one parent.
--
-- WHY THE BAND POOL IS PARENTLESS RATHER THAN UNDER THE ROOM
-- During a band-to-assigned migration both pools exist briefly. A group hanging
-- under the room makes every replacement table reservation charge the room a
-- second time, so the migration refuses itself with `ancestor_full` halfway
-- through, on a live venue, with guests holding allocations. Parentless shares
-- no ancestor with the table pools, so the two sets never contend.
--
-- NAMING
-- Not `locations` (a city gazetteer owns that). No table here is called
-- reservations, bookings or holds; those names already mean other things.
--
-- Rollback: drop the four tables and delete the two capacity_subject_kinds rows.
-- No other table references them.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.

BEGIN;

-- ─── 1. spaces ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.spaces (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id      UUID NOT NULL REFERENCES public.venues(id)   ON DELETE CASCADE,
  parent_id     UUID REFERENCES public.spaces(id) ON DELETE CASCADE,

  -- Structural, never displayed. The shown word is the workspace's.
  kind          TEXT NOT NULL CHECK (kind IN (
                  'room','area','section','table','seat','chair','booth','cabana',
                  'stage','court','lane','desk','bed','bay','unit')),
  name          TEXT NOT NULL,
  code          TEXT,   -- "T7": printed on the QR, shown on the host list

  party_min     INTEGER NOT NULL DEFAULT 1 CHECK (party_min >= 1),
  party_max     INTEGER NOT NULL DEFAULT 1 CHECK (party_max >= party_min),
  -- Display only. How many can actually be seated is the pool's units_total;
  -- storing it twice would give two answers to one question.
  seat_count    INTEGER CHECK (seat_count IS NULL OR seat_count >= 0),

  -- A per-space override of the service window's turn time. The WINDOW and its
  -- default turn time belong to Reservations; this is the exception a table
  -- carries, which they read.
  turn_minutes  INTEGER CHECK (turn_minutes IS NULL OR turn_minutes > 0),

  -- A POLICY, not a charge. S6 turns it into prepaid credit on the tab; no
  -- money is ever settled from this table.
  min_spend_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_spend_cents >= 0),

  attributes    JSONB NOT NULL DEFAULT '{}'::jsonb,  -- window, outdoor, accessible
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','out_of_service')),
  sort_order    INTEGER NOT NULL DEFAULT 0,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A space belongs to the venue's tenant. Cross-tenant parenting is refused by
  -- a trigger below, which can see the parent's tenant; a CHECK cannot.
  CONSTRAINT spaces_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id)
);

COMMENT ON TABLE public.spaces IS
  'Spaces & Seating S2: a node in a venue tree (room > area/section > table > seat). kind is structural; the displayed word comes from the workspace words table. Bookable leaves and holdable levels get a capacity pool; area and section never do (SS-1).';

CREATE UNIQUE INDEX IF NOT EXISTS idx_spaces_code_per_venue
  ON public.spaces (venue_id, lower(code)) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_tenant ON public.spaces (tenant_id);
CREATE INDEX IF NOT EXISTS idx_spaces_venue  ON public.spaces (venue_id);
CREATE INDEX IF NOT EXISTS idx_spaces_parent ON public.spaces (parent_id);

-- ─── 2. combinable spaces ───────────────────────────────────────────────────
-- "T7 and T8 join for a party of 5 to 8." A join is a relationship between two
-- tables, so it is a row and not an array on either of them: an array cannot be
-- foreign-keyed, cannot be indexed usefully in both directions, and gives two
-- places to disagree about one fact.

CREATE TABLE IF NOT EXISTS public.space_combinations (
  tenant_id     UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  space_id      UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  with_space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  party_min     INTEGER NOT NULL CHECK (party_min >= 1),
  party_max     INTEGER NOT NULL CHECK (party_max >= party_min),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, with_space_id),
  CONSTRAINT space_combinations_distinct CHECK (space_id <> with_space_id)
);

COMMENT ON TABLE public.space_combinations IS
  'Two spaces that can be joined for a larger party. Written in both directions by the editor so a lookup from either side finds it.';

CREATE INDEX IF NOT EXISTS idx_space_combinations_with
  ON public.space_combinations (with_space_id);

-- ─── 3. groups ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.space_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  venue_id    UUID NOT NULL REFERENCES public.venues(id)   ON DELETE CASCADE,
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('party_band','tier','pool')),
  party_min   INTEGER NOT NULL DEFAULT 1 CHECK (party_min >= 1),
  party_max   INTEGER NOT NULL DEFAULT 1 CHECK (party_max >= party_min),
  min_spend_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_spend_cents >= 0),

  -- SS-2 made explicit in the schema, so the mode is a fact a reader can see
  -- rather than something inferred from which pools happen to exist.
  --   'band'     the group carries the pool; members carry none
  --   'assigned' the members carry pools; the group is a pure selection
  sell_mode   TEXT NOT NULL DEFAULT 'band'
                CHECK (sell_mode IN ('band','assigned')),

  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.space_groups IS
  'A named set of spaces sold together: a party-size band, a ticket tier, a pool. sell_mode records SS-2: band = the group has the pool (parentless), assigned = the members do and the group is only a selection.';

CREATE INDEX IF NOT EXISTS idx_space_groups_tenant ON public.space_groups (tenant_id);
CREATE INDEX IF NOT EXISTS idx_space_groups_venue  ON public.space_groups (venue_id);

CREATE TABLE IF NOT EXISTS public.space_group_members (
  group_id   UUID NOT NULL REFERENCES public.space_groups(id) ON DELETE CASCADE,
  space_id   UUID NOT NULL REFERENCES public.spaces(id)       ON DELETE CASCADE,
  tenant_id  UUID NOT NULL REFERENCES public.agencies(id)     ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, space_id)
);

COMMENT ON TABLE public.space_group_members IS
  'Membership is many-to-many ON PURPOSE: a table is in "four-tops" AND "window tables". That is why a group pool can never be a member pool''s parent, and why SS-2 exists.';

CREATE INDEX IF NOT EXISTS idx_space_group_members_space
  ON public.space_group_members (space_id);

-- ─── 4. same-tenant integrity ───────────────────────────────────────────────
-- A CHECK cannot read another row, so the cross-row tenant rules are a trigger.
-- Without it a space could hang off another tenant's venue or parent, which is
-- the one bug in this area that would leak a floor plan between workspaces.

CREATE OR REPLACE FUNCTION public.spaces_verify_tenant()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_tenant UUID;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.venues WHERE id = NEW.venue_id;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'spaces: venue % not found', NEW.venue_id USING ERRCODE = 'SP010';
  END IF;
  IF v_tenant <> NEW.tenant_id THEN
    RAISE EXCEPTION 'spaces: venue belongs to another tenant' USING ERRCODE = 'SP011';
  END IF;

  IF NEW.parent_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM public.spaces WHERE id = NEW.parent_id;
    IF v_tenant IS NULL THEN
      RAISE EXCEPTION 'spaces: parent % not found', NEW.parent_id USING ERRCODE = 'SP012';
    END IF;
    IF v_tenant <> NEW.tenant_id THEN
      RAISE EXCEPTION 'spaces: parent belongs to another tenant' USING ERRCODE = 'SP013';
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS spaces_verify_tenant_biu ON public.spaces;
CREATE TRIGGER spaces_verify_tenant_biu
  BEFORE INSERT OR UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.spaces_verify_tenant();

CREATE OR REPLACE FUNCTION public.space_groups_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS space_groups_touch_bu ON public.space_groups;
CREATE TRIGGER space_groups_touch_bu
  BEFORE UPDATE ON public.space_groups
  FOR EACH ROW EXECUTE FUNCTION public.space_groups_touch();

-- ─── 5. register with the capacity engine ───────────────────────────────────
-- `capacity_subject_kinds` maps a subject_kind to its backing table so
-- `upsert_capacity_pool` can refuse a pool pointing at a row that does not
-- exist. Until a kind is registered the check is simply absent for it, which
-- the Capacity Engine Manager made VISIBLE rather than silent by naming the
-- unregistered kinds in a test. Registering here deletes 'space' and
-- 'space_group' from that list, in this same commit.
--
-- This INSERT depends on `capacity_subject_kinds` (migration ...212), which
-- sorts BELOW this file, so a rebuild from scratch in filename order runs 212
-- first and finds the table. With a band scheme that ordering question matters
-- more than whether the version is above the remote head.

INSERT INTO public.capacity_subject_kinds (subject_kind, table_name, registered_by)
VALUES ('space', 'spaces', 'spaces-S2'),
       ('space_group', 'space_groups', 'spaces-S2')
ON CONFLICT (subject_kind) DO NOTHING;

-- ─── 6. RLS ─────────────────────────────────────────────────────────────────
-- Staff read their own workspace's spaces. Every write goes through the server
-- with the service role, as with the rest of the operational schema. No anon
-- policy: a public seat picker renders through a server component that already
-- holds the rows, never by querying them from a browser.

ALTER TABLE public.spaces              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_combinations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_groups        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spaces_select_staff ON public.spaces;
CREATE POLICY spaces_select_staff ON public.spaces
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS space_combinations_select_staff ON public.space_combinations;
CREATE POLICY space_combinations_select_staff ON public.space_combinations
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS space_groups_select_staff ON public.space_groups;
CREATE POLICY space_groups_select_staff ON public.space_groups
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS space_group_members_select_staff ON public.space_group_members;
CREATE POLICY space_group_members_select_staff ON public.space_group_members
  FOR SELECT TO authenticated USING (public.is_staff_of_tenant(tenant_id));

GRANT SELECT ON TABLE public.spaces              TO authenticated;
GRANT SELECT ON TABLE public.space_combinations  TO authenticated;
GRANT SELECT ON TABLE public.space_groups        TO authenticated;
GRANT SELECT ON TABLE public.space_group_members TO authenticated;

GRANT ALL ON TABLE public.spaces              TO service_role;
GRANT ALL ON TABLE public.space_combinations  TO service_role;
GRANT ALL ON TABLE public.space_groups        TO service_role;
GRANT ALL ON TABLE public.space_group_members TO service_role;

-- CREATE FUNCTION grants EXECUTE to PUBLIC, and PUBLIC is a SEPARATE grant from
-- any role grant: `REVOKE ... FROM anon` alone leaves it reachable. `FROM PUBLIC`
-- is the operative statement.
REVOKE ALL ON FUNCTION public.spaces_verify_tenant()  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.space_groups_touch()    FROM PUBLIC, anon, authenticated;

COMMIT;
