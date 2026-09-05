-- 20261229000216_capacity_shrink_floor.sql
-- A pool cannot be shrunk below what is already sold.
--
-- `upsert_capacity_pool` did `SET units_total = EXCLUDED.units_total` with no
-- check. An operator editing a tier down from 100 to 40 with 60 seats sold was
-- accepted silently, and the next 20 arrivals discovered it at the door.
--
-- This is the oversell refusal from `_capacity_reserve_locked` moved to the
-- WRITE side. Reserve already refuses to take the 13th seat of 12; nothing
-- refused to make 12 into 8 after 12 were taken. Same failure, opposite door.
--
-- Called by Events' tier editor (E3b) and Sessions' `createSessionWithPools()`,
-- both of which call this rather than re-implementing the arithmetic — which is
-- the point of putting it here: one refusal, not three that drift.
--
--
-- THE FLOOR IS A PEAK, NOT A SUM — the only subtle thing in this file
-- ═══════════════════════════════════════════════════════════════════
-- An allocation carries a WINDOW. Two allocations in non-overlapping windows
-- never compete for the same unit, so the floor is NOT `SUM(units)` over live
-- allocations. A room booked 9-10 by two people and 14-15 by three has a floor
-- of THREE, not five. Summing would refuse a legitimate shrink from 5 to 3 and
-- an operator would be told, wrongly, that seats are sold that are not.
--
-- So the floor is the PEAK CONCURRENT load: sweep the start/end events and take
-- the running maximum. `capacity_pool_committed_peak` below.
--
-- Three semantics are copied EXACTLY from `_capacity_reserve_locked`, because a
-- floor that disagrees with the reserve path is worse than no floor — it would
-- refuse writes the engine would have allowed, or allow ones it refuses:
--   1. HALF-OPEN ranges, `[)`. 9-10 and 10-11 do not overlap. The sweep orders
--      ends before starts at the same instant to match (every end is a negative
--      delta and every start positive, so `ORDER BY t, d` does it).
--   2. LIVE means `committed`, or `hold` whose `expires_at` is still in future.
--      An expired hold is a seat nobody holds.
--   3. A WINDOWLESS allocation (stock, no dates) overlaps EVERYTHING, exactly as
--      reserve treats it, so it is added to every point of the sweep as a base.
--
-- ANCESTORS: the sweep matches on `pool_path @> ARRAY[pool_id]`, so allocations
-- on DESCENDANT pools count against an ancestor. Shrinking a venue below the sum
-- of what its rooms have sold refuses too. That is the same containment the
-- reserve path walks, and it is why the path is materialised.
--
-- THE CEILING IS `units_total + overbook_units`, not `units_total`. This RPC can
-- lower BOTH in one call, so the check is against the ceiling the pool will have
-- AFTER the write, not the one it has now. Lowering overbook alone can breach the
-- floor and is refused identically.
--
-- COST: the sweep runs ONLY when the ceiling drops. An ordinary upsert — create,
-- rename, raise capacity, flip active — pays nothing.
--
-- LOCKING: the existing row is taken `FOR UPDATE` before the peak is computed, so
-- a concurrent `reserve_capacity` cannot commit a seat between the count and the
-- write. Reserve locks ancestors root-first; this locks exactly one row, so the
-- two cannot deadlock against each other.
--
-- ERRCODE `CP015` (CP001-007 and CP010-014 are taken), DETAIL = the floor, so a
-- caller can say "40 is below the 60 already sold" instead of "that failed".
--
--
-- WHAT THIS DELIBERATELY DOES NOT DO
-- ══════════════════════════════════
-- It does not stop `is_active => false` on a pool with live allocations.
-- Suspending is how you stop the bleeding during an incident, and a suspended
-- pool already refuses new reserves with CP004 while honouring what is sold. That
-- is a different decision from shrinking and should not be smuggled in here.
--
-- It does not touch already-oversold pools. If a pool is somehow ABOVE its
-- ceiling today, this refuses to make it worse and permits any change that
-- improves it, rather than blocking every edit on a pool that needs editing most.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs`. Additive and safe to apply
-- before merge: the new refusal only rejects writes that were already wrong.

BEGIN;

-- ── the floor ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.capacity_pool_committed_peak(p_pool_id uuid)
RETURNS int
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH live AS (
    SELECT al.units, al.starts_at, al.ends_at
      FROM public.capacity_allocations al
     WHERE al.pool_path @> ARRAY[p_pool_id]
       AND (al.state = 'committed'
            OR (al.state = 'hold' AND al.expires_at > now()))
  ),
  -- No window means it competes with every window, as reserve treats it.
  base AS (
    SELECT COALESCE(SUM(units), 0)::int AS u
      FROM live WHERE starts_at IS NULL
  ),
  ev AS (
    SELECT starts_at AS t,  units AS d FROM live WHERE starts_at IS NOT NULL
    UNION ALL
    SELECT ends_at   AS t, -units AS d FROM live WHERE starts_at IS NOT NULL
  ),
  -- Ends are negative and starts positive, so ordering by (t, d) settles a tie
  -- at the same instant in favour of the end — which is what `[)` means.
  running AS (
    SELECT SUM(d) OVER (ORDER BY t, d) AS concurrent FROM ev
  )
  SELECT (SELECT u FROM base) + COALESCE((SELECT MAX(concurrent) FROM running), 0)::int;
$$;

COMMENT ON FUNCTION public.capacity_pool_committed_peak(uuid) IS
  'Peak concurrent live units on a pool and its descendants. The floor below which units_total + overbook_units must not be set. A PEAK, not a sum: allocations in non-overlapping windows do not compete.';

-- ── the refusal ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_capacity_pool(
  p_tenant_id        uuid,
  p_subject_kind     text,
  p_subject_id       uuid,
  p_units_total      int,
  p_pool_key         text    DEFAULT 'default',
  p_parent_pool_id   uuid    DEFAULT NULL,
  p_overbook_units   int     DEFAULT NULL,
  p_hold_ttl_seconds int     DEFAULT NULL,
  p_unit_label       text    DEFAULT NULL,
  p_is_active        boolean DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id       uuid;
  v_key      text := COALESCE(p_pool_key, 'default');
  v_existing public.capacity_pools;
  v_new_ceiling int;
  v_old_ceiling int;
  v_floor    int;
BEGIN
  -- Lock the row we may be shrinking BEFORE counting, so a reserve cannot commit
  -- a seat between the count and the write.
  SELECT * INTO v_existing
    FROM public.capacity_pools
   WHERE tenant_id    = p_tenant_id
     AND subject_kind = p_subject_kind
     AND subject_id   = p_subject_id
     AND pool_key     = v_key
   FOR UPDATE;

  IF FOUND THEN
    v_new_ceiling := p_units_total + COALESCE(p_overbook_units, v_existing.overbook_units);
    v_old_ceiling := v_existing.units_total + v_existing.overbook_units;

    -- Only pay for the sweep when the ceiling is actually coming down. Raising
    -- capacity, renaming, or flipping active costs nothing.
    IF v_new_ceiling < v_old_ceiling THEN
      v_floor := public.capacity_pool_committed_peak(v_existing.id);
      IF v_new_ceiling < v_floor THEN
        RAISE EXCEPTION 'capacity_floor_violated'
          USING ERRCODE = 'CP015', DETAIL = v_floor::text;
      END IF;
    END IF;
  END IF;

  INSERT INTO public.capacity_pools AS cp
    (tenant_id, subject_kind, subject_id, pool_key, parent_pool_id,
     units_total, overbook_units, hold_ttl_seconds, unit_label, is_active, pool_path)
  VALUES
    (p_tenant_id, p_subject_kind, p_subject_id, v_key,
     p_parent_pool_id, p_units_total, COALESCE(p_overbook_units, 0),
     COALESCE(p_hold_ttl_seconds, 900), p_unit_label, COALESCE(p_is_active, true),
     '{}')  -- overwritten by the BEFORE trigger; never trusted from the caller
  ON CONFLICT (tenant_id, subject_kind, subject_id, pool_key) DO UPDATE
    SET units_total      = EXCLUDED.units_total,
        parent_pool_id   = EXCLUDED.parent_pool_id,
        overbook_units   = COALESCE(p_overbook_units, cp.overbook_units),
        hold_ttl_seconds = COALESCE(p_hold_ttl_seconds, cp.hold_ttl_seconds),
        unit_label       = COALESCE(p_unit_label, cp.unit_label),
        is_active        = COALESCE(p_is_active, cp.is_active)
  RETURNING cp.id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capacity_pool_committed_peak(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capacity_pool_committed_peak(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_capacity_pool(uuid, text, uuid, int, text, uuid, int, int, text, boolean)
  TO service_role;

-- ── executable proof, not a claim ────────────────────────────────────────────
-- Runs at apply time and ABORTS the migration if the refusal does not work. A
-- comment saying "this refuses the shrink" is satisfied by writing the comment;
-- this is satisfied only by the refusal actually firing.
--
-- Fixtures are created and deleted inside this transaction, on a random
-- subject_id no real row can collide with. If any assertion fails the whole
-- migration rolls back and nothing is left behind either way.

DO $$
DECLARE
  v_tenant  uuid;
  v_subject uuid := gen_random_uuid();
  v_pool    uuid;
  v_ok      boolean;
  v_peak    int;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to test against — refusing to apply an unproven guard';
  END IF;

  -- A pool of 10, with 6 sold in one window and 4 in a LATER, non-overlapping one.
  v_pool := public.upsert_capacity_pool(
    v_tenant, 'offering', v_subject, 10, 'default', NULL, 0, 900, 'seat', true);

  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, starts_at, ends_at, units, state)
  VALUES
    (v_tenant, v_pool, ARRAY[v_pool], '2030-01-01T09:00Z', '2030-01-01T10:00Z', 6, 'committed'),
    (v_tenant, v_pool, ARRAY[v_pool], '2030-01-01T14:00Z', '2030-01-01T15:00Z', 4, 'committed');

  -- THE PEAK IS 6, NOT 10. If this reads 10 the sweep is summing, and every
  -- legitimate shrink would be refused with a number an operator cannot act on.
  v_peak := public.capacity_pool_committed_peak(v_pool);
  IF v_peak <> 6 THEN
    RAISE EXCEPTION 'floor is a SUM not a PEAK: got %, expected 6', v_peak;
  END IF;

  -- Shrinking to 5 is below the 6 concurrent — must refuse.
  v_ok := true;
  BEGIN
    PERFORM public.upsert_capacity_pool(
      v_tenant, 'offering', v_subject, 5, 'default', NULL, 0, 900, 'seat', true);
  EXCEPTION WHEN SQLSTATE 'CP015' THEN
    v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'THE SHRINK WAS ACCEPTED — a pool of 10 with 6 sold went to 5';
  END IF;

  -- Shrinking to exactly 6 is legal: the sold seats still fit.
  PERFORM public.upsert_capacity_pool(
    v_tenant, 'offering', v_subject, 6, 'default', NULL, 0, 900, 'seat', true);

  -- And lowering OVERBOOK alone can breach the floor too.
  PERFORM public.upsert_capacity_pool(
    v_tenant, 'offering', v_subject, 4, 'default', NULL, 2, 900, 'seat', true);  -- ceiling 6, legal
  v_ok := true;
  BEGIN
    PERFORM public.upsert_capacity_pool(
      v_tenant, 'offering', v_subject, 4, 'default', NULL, 0, 900, 'seat', true);  -- ceiling 4
  EXCEPTION WHEN SQLSTATE 'CP015' THEN
    v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'lowering overbook under the floor was accepted';
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id = v_pool;
  DELETE FROM public.capacity_pools       WHERE id = v_pool;

  RAISE NOTICE 'capacity shrink floor: proven (peak=6, shrink refused, equal-to-floor allowed, overbook drop refused)';
END $$;

COMMIT;
