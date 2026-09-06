-- 20261229000217_extend_capacity_hold.sql
-- A reschedule must not free the seats it was meant to protect.
--
-- `expires_at` is a fixed instant computed once, at reserve time, as
-- `now() + ttl`. It is NOT a reference to the session. So when a night moves,
-- every live hold still expires at the OLD session end: the reaper frees them,
-- they are resold, and the ticket-holder arrives on the new night to find
-- somebody in their chair. Nothing in the engine notices, because from its side
-- an expired hold is just an expired hold.
--
-- There was no primitive for this. `release_capacity` and `commit_capacity`
-- cannot change a TTL, and re-holding means releasing FIRST — which drops the
-- seat into the pool where anyone can take it before the re-reserve lands. On a
-- sold-out night that is a guaranteed loss, not a race you might win.
--
-- Called by Sessions' reschedule applier when `sessions.ends_at` moves. That
-- applier does not exist yet (nothing in web/src writes `ends_at` — the only
-- writer upserts with `ignoreDuplicates`, so it can only ever INSERT), which is
-- why this is a precondition rather than a retrofit.
--
--
-- THE MIXED-STATE CONTRACT — the whole design, and my first spec got it wrong
-- ══════════════════════════════════════════════════════════════════════════
-- I first specified "refuses any non-`hold` state". That is too blunt, and the
-- caller is what proves it: by the time a night moves, some seats are `hold`
-- (pay-at-the-door, unpaid) and some are `committed` (already paid by card).
-- Sessions' applier walks EVERY live allocation on the session, so the array it
-- passes contains both. Under that spec a single committed seat would raise and
-- the whole extension would fail — on exactly the reschedule where the venue is
-- already apologising.
--
--   hold      -> EXTENDED. The point of the call.
--   committed -> SKIPPED, not an error. A committed seat has no TTL and is
--                already immune to the reschedule. Failing on it would punish a
--                caller for passing the complete set, which is the safe thing
--                to pass.
--   released  -> RAISES (CP016). The one genuinely dangerous input: extending a
--                released allocation resurrects a seat that has gone back to the
--                pool and may already be resold. This one must stay hard.
--
-- RETURNS COUNTS, NOT void: `{extended, skipped_committed, requested}`. A caller
-- that expected to extend forty holds and extended two FINDS OUT. A return type
-- with no room for "I did not answer" is the rule this engine keeps relearning.
-- It is `jsonb` rather than a composite because the client reads it through
-- PostgREST, and today's six broken writers were all defects at that boundary.
--
-- BOUNDS: the same 30…604800 as `_capacity_reserve_locked`, raising CP007. A
-- reschedule that pushes a night beyond seven days cannot be absorbed by
-- extending — the door hold has to be converted honestly (the guest is told and
-- offered card) rather than left holding a TTL nobody can renew.
--
-- LOCKING: allocations are locked `FOR UPDATE` in `id` order, so two concurrent
-- extends over overlapping sets cannot deadlock. It does NOT touch pool rows:
-- extending changes no pool's occupancy — the same units stay held by the same
-- allocation, only for longer — so there is nothing for a `reserve` to race
-- against and no reason to take the pool lock the reserve path holds.
--
-- CALLER'S OBLIGATION, which the engine cannot enforce: run this IN THE SAME
-- TRANSACTION as the `ends_at` move. A reaper pass between the two frees the
-- very holds the move was meant to protect, and the reaper runs on a timer.

BEGIN;

CREATE OR REPLACE FUNCTION public.extend_capacity_hold(
  p_allocation_ids uuid[],
  p_ttl_seconds    int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requested int := COALESCE(array_length(p_allocation_ids, 1), 0);
  v_released  int;
  v_extended  int;
  v_skipped   int;
BEGIN
  IF p_allocation_ids IS NULL OR v_requested = 0 THEN
    RETURN jsonb_build_object('extended', 0, 'skipped_committed', 0, 'requested', 0);
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'invalid_ttl' USING ERRCODE = 'CP007';
  END IF;

  -- Lock in id order so two overlapping extends cannot deadlock.
  PERFORM 1
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids)
   ORDER BY id
     FOR UPDATE;

  -- Refuse the whole call if ANY id names a released allocation. Not a skip:
  -- the caller believes it is protecting a seat that is already gone, and
  -- extending it would resurrect a row the pool has re-sold.
  SELECT count(*) INTO v_released
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids) AND state = 'released';

  IF v_released > 0 THEN
    RAISE EXCEPTION 'cannot_extend_released' USING ERRCODE = 'CP016', DETAIL = v_released::text;
  END IF;

  SELECT count(*) INTO v_skipped
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids) AND state = 'committed';

  WITH bumped AS (
    UPDATE public.capacity_allocations
       SET expires_at = now() + make_interval(secs => p_ttl_seconds)
     WHERE id = ANY(p_allocation_ids)
       AND state = 'hold'
    RETURNING 1
  )
  SELECT count(*) INTO v_extended FROM bumped;

  RETURN jsonb_build_object(
    'extended', v_extended,
    'skipped_committed', v_skipped,
    'requested', v_requested);
END;
$$;

COMMENT ON FUNCTION public.extend_capacity_hold(uuid[], int) IS
  'Push the expiry of HELD allocations to now()+ttl. Committed ones are skipped (no TTL to extend); a released one RAISES CP016 rather than resurrecting a resold seat. Returns {extended, skipped_committed, requested} so a caller that extended fewer than it asked for finds out. Run inside the same transaction as the ends_at move.';

REVOKE ALL ON FUNCTION public.extend_capacity_hold(uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_capacity_hold(uuid[], int) TO service_role;

-- ── executable proof ─────────────────────────────────────────────────────────
-- Aborts the migration if the contract does not hold. Fixtures are created and
-- deleted inside this transaction on a random subject id.

DO $$
DECLARE
  v_tenant uuid;
  v_pool   uuid;
  v_hold   uuid;
  v_commit uuid;
  v_rel    uuid;
  v_res    jsonb;
  v_before timestamptz;
  v_after  timestamptz;
  v_ok     boolean;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to test against — refusing to apply an unproven primitive';
  END IF;

  v_pool := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 10, 'default', NULL, 0, 900, 'seat', true);

  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, units, state, expires_at)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'hold', now() + interval '10 minutes')
  RETURNING id INTO v_hold;

  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, units, state)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'committed')
  RETURNING id INTO v_commit;

  INSERT INTO public.capacity_allocations
    (tenant_id, pool_id, pool_path, units, state, released_at)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'released', now())
  RETURNING id INTO v_rel;

  SELECT expires_at INTO v_before FROM public.capacity_allocations WHERE id = v_hold;

  -- MIXED SET: a hold and a committed together must succeed, not raise.
  v_res := public.extend_capacity_hold(ARRAY[v_hold, v_commit], 3600);
  IF (v_res->>'extended')::int <> 1 OR (v_res->>'skipped_committed')::int <> 1
     OR (v_res->>'requested')::int <> 2 THEN
    RAISE EXCEPTION 'mixed-state counts wrong: %', v_res;
  END IF;

  SELECT expires_at INTO v_after FROM public.capacity_allocations WHERE id = v_hold;
  IF v_after <= v_before THEN
    RAISE EXCEPTION 'the hold was not actually extended: % -> %', v_before, v_after;
  END IF;

  -- A COMMITTED allocation must not gain an expiry.
  IF (SELECT expires_at FROM public.capacity_allocations WHERE id = v_commit) IS NOT NULL THEN
    RAISE EXCEPTION 'a committed allocation was given a TTL';
  END IF;

  -- A RELEASED id must refuse the WHOLE call, and extend nothing.
  SELECT expires_at INTO v_before FROM public.capacity_allocations WHERE id = v_hold;
  v_ok := true;
  BEGIN
    PERFORM public.extend_capacity_hold(ARRAY[v_hold, v_rel], 3600);
  EXCEPTION WHEN SQLSTATE 'CP016' THEN
    v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'a released allocation was accepted for extension';
  END IF;
  IF (SELECT expires_at FROM public.capacity_allocations WHERE id = v_hold) <> v_before THEN
    RAISE EXCEPTION 'the refused call still extended the hold — it is not all-or-nothing';
  END IF;

  -- Out-of-bounds TTL: beyond the seven-day ceiling.
  v_ok := true;
  BEGIN
    PERFORM public.extend_capacity_hold(ARRAY[v_hold], 604801);
  EXCEPTION WHEN SQLSTATE 'CP007' THEN
    v_ok := false;
  END;
  IF v_ok THEN
    RAISE EXCEPTION 'a TTL beyond the 7-day ceiling was accepted';
  END IF;

  -- An empty set is a no-op that answers, not an error.
  v_res := public.extend_capacity_hold(ARRAY[]::uuid[], 3600);
  IF (v_res->>'requested')::int <> 0 THEN
    RAISE EXCEPTION 'the empty set did not answer: %', v_res;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id = v_pool;
  DELETE FROM public.capacity_pools       WHERE id = v_pool;

  RAISE NOTICE 'extend_capacity_hold: proven (mixed set, committed untouched, released refuses all-or-nothing, CP007 ceiling, empty answers)';
END $$;

COMMIT;
