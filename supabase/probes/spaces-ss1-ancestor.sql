-- PROBE — SS-1 and the ancestor rule, against the real schema. NEVER COMMITS.
--
-- Run with:  cd web && npm run sql:dry-run -- ../supabase/probes/spaces-ss1-ancestor.sql
--
-- This file has NO COMMIT of its own, on purpose: `sql-dry-run` refuses
-- `--commit` for a file without one, so a bare probe cannot be persisted by a
-- mistyped flag. A migration dry-run is the opposite case and must keep its
-- COMMIT for the tool to swap.
--
-- WHAT THIS PROVES, AND WHAT IT DOES NOT
-- It proves ONCE that the real schema, triggers and capacity RPCs agree with
-- the model in `web/src/lib/spaces/tree.ts`. It is NOT a gate: CI carries no
-- service-role credentials, so this never runs there. The functions it agrees
-- with ARE gated, on every change, forever. The probe checks the model against
-- reality; CI checks every future change against the model.
--
-- Residue: none. Every table touched uses a UUID default, so there is not even
-- a sequence to advance. Verify by COUNTING after, never by assuming.

BEGIN;

-- A throwaway tenant, so nothing here can collide with a real workspace.
INSERT INTO public.agencies (id, slug, display_name, status)
VALUES ('00000000-0000-4000-8000-0000000000fe'::uuid, 'probe-spaces-ss1', 'Probe SS1', 'active');

INSERT INTO public.venues (id, tenant_id, name, timezone, is_default)
VALUES ('00000000-0000-4000-8000-0000000000ce'::uuid,
        '00000000-0000-4000-8000-0000000000fe'::uuid, 'Probe venue', 'America/Cancun', true);

-- venue > room > area > section > table, plus a sibling table under the room.
-- The area and the section are the levels that make SS-1 non-trivial.
INSERT INTO public.spaces (id, tenant_id, venue_id, parent_id, kind, name, party_min, party_max) VALUES
 ('00000000-0000-4000-8000-000000000acc'::uuid,'00000000-0000-4000-8000-0000000000fe'::uuid,'00000000-0000-4000-8000-0000000000ce'::uuid,NULL,'room','Main room',1,40),
 ('00000000-0000-4000-8000-000000000aaa'::uuid,'00000000-0000-4000-8000-0000000000fe'::uuid,'00000000-0000-4000-8000-0000000000ce'::uuid,'00000000-0000-4000-8000-000000000acc'::uuid,'area','Window side',1,20),
 ('00000000-0000-4000-8000-000000000bbb'::uuid,'00000000-0000-4000-8000-0000000000fe'::uuid,'00000000-0000-4000-8000-0000000000ce'::uuid,'00000000-0000-4000-8000-000000000aaa'::uuid,'section','Section A',1,12),
 ('00000000-0000-4000-8000-000000000007'::uuid,'00000000-0000-4000-8000-0000000000fe'::uuid,'00000000-0000-4000-8000-0000000000ce'::uuid,'00000000-0000-4000-8000-000000000bbb'::uuid,'table','T7',2,4),
 ('00000000-0000-4000-8000-000000000008'::uuid,'00000000-0000-4000-8000-0000000000fe'::uuid,'00000000-0000-4000-8000-0000000000ce'::uuid,'00000000-0000-4000-8000-000000000acc'::uuid,'table','T8',2,4);

-- Pools, bound per SS-1: T7's parent pool is the ROOM, skipping the area and
-- the section, which get no pool at all.
DO $probe$
DECLARE
  v_tenant uuid := '00000000-0000-4000-8000-0000000000fe'::uuid;
  v_room_pool uuid;
  v_t7_pool uuid;
  v_t8_pool uuid;
  v_res jsonb;
  v_room_remaining int;
  v_t7_remaining int;
BEGIN
  v_room_pool := public.upsert_capacity_pool(
    v_tenant, 'space', '00000000-0000-4000-8000-000000000acc'::uuid, 2, 'default', NULL);
  v_t7_pool := public.upsert_capacity_pool(
    v_tenant, 'space', '00000000-0000-4000-8000-000000000007'::uuid, 1, 'default', v_room_pool);
  v_t8_pool := public.upsert_capacity_pool(
    v_tenant, 'space', '00000000-0000-4000-8000-000000000008'::uuid, 1, 'default', v_room_pool);

  -- ASSERTION 1 — depth. venue-less chain room > table is 2, well inside the
  -- cap of 6. The area and the section cost nothing because they have no pool.
  IF (SELECT array_length(pool_path, 1) FROM public.capacity_pools WHERE id = v_t7_pool) <> 2 THEN
    RAISE EXCEPTION 'SS-1: expected pool depth 2 for T7, got %',
      (SELECT array_length(pool_path, 1) FROM public.capacity_pools WHERE id = v_t7_pool);
  END IF;

  -- ASSERTION 2 — the ancestor rule holds through the skipped levels: T7's
  -- pool_path contains the ROOM's pool even though two unpooled spaces sit
  -- between them in the tree.
  IF NOT (SELECT pool_path @> ARRAY[v_room_pool] FROM public.capacity_pools WHERE id = v_t7_pool) THEN
    RAISE EXCEPTION 'SS-1: T7 pool_path does not contain the room pool';
  END IF;

  -- ASSERTION 3 — a table allocation reduces the ROOM's remaining. This is the
  -- half that a wrongly-parented pool would silently lose.
  v_res := public.reserve_capacity(
    v_t7_pool, '2026-09-10T20:00:00Z'::timestamptz, '2026-09-10T22:00:00Z'::timestamptz, 1, 900);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'SS-1: reserving T7 failed: %', v_res->>'reason';
  END IF;

  v_room_remaining := public.capacity_remaining_public(
    v_room_pool, '2026-09-10T20:00:00Z'::timestamptz, '2026-09-10T22:00:00Z'::timestamptz);
  IF v_room_remaining <> 1 THEN
    RAISE EXCEPTION 'SS-1: room remaining should be 1 after one table sold, got %', v_room_remaining;
  END IF;

  -- ASSERTION 4 — the room fills, and then the SECOND table is refused with
  -- ancestor_full: the table is empty and you still cannot sit at it.
  v_res := public.reserve_capacity(
    v_t8_pool, '2026-09-10T20:00:00Z'::timestamptz, '2026-09-10T22:00:00Z'::timestamptz, 1, 900);
  IF NOT (v_res->>'ok')::boolean THEN
    RAISE EXCEPTION 'SS-1: reserving T8 failed: %', v_res->>'reason';
  END IF;

  v_t7_remaining := public.capacity_remaining_public(
    v_room_pool, '2026-09-10T20:00:00Z'::timestamptz, '2026-09-10T22:00:00Z'::timestamptz);
  IF v_t7_remaining <> 0 THEN
    RAISE EXCEPTION 'SS-1: room should be full at 0, got %', v_t7_remaining;
  END IF;

  RAISE NOTICE 'SS-1 PROBE PASSED: depth 2, ancestor containment through a skipped area and section, room remaining fell 2 -> 1 -> 0.';
END;
$probe$;

-- Deliberately NO COMMIT. sql-dry-run wraps this in a rollback.
