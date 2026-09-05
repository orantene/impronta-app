-- 20261229000219_extend_hold_reports_shortening.sql
-- `extend_capacity_hold` can SHORTEN a hold, and said "extended" when it did.
--
-- Found by the write-proof through the real client, which is the only place it
-- could have been found: the migration's own DO block extended a 10-minute hold
-- to an hour and saw the expiry move forward, so it passed. The client proof
-- happened to pass a 24-HOUR leg and ask for 3600 seconds — the row was updated,
-- the count said `extended: 1`, and the seat's life was cut from a day to an
-- hour. Both statements were true and the caller would have been told the
-- comfortable one.
--
-- 20261229000217 is already applied and recorded, so this is a new file rather
-- than an edit to it. The ledger is append-only in practice: a recorded version
-- cannot be re-applied, and rewriting its file would make the repo disagree with
-- what actually ran.
--
--
-- THE BEHAVIOUR IS RIGHT. THE REPORT WAS NOT.
-- ═══════════════════════════════════════════
-- Setting rather than only lengthening is correct for the caller this exists
-- for: a reschedule can move a night EARLIER, and then the door holds SHOULD
-- shorten to the new session end — a seat held past the show it belongs to is a
-- seat nobody can sell. Refusing to shorten would leave those holds outliving
-- their own event.
--
-- So the function keeps its behaviour and its name (the contract is recorded in
-- #1805 and the name is what Events and Sessions build against). What changes is
-- that it stops describing a shortening as an extension:
--
--   {extended, shortened, unchanged, skipped_committed, requested}
--
-- `shortened` is the one that matters. A reschedule applier that expected to
-- push forty seats out to a later night and instead cut forty seats short has
-- done real damage, and under the old return it read `extended: 40` and moved
-- on. THE POINT IS NOT THE COUNT, IT IS THAT THE SURPRISING CASE HAS A NAME.
-- A single number covering several states is a place for a defect to hide, which
-- this repo has an incident file about.
--
-- `unchanged` closes the last gap: a hold already at exactly that expiry is
-- neither extended nor shortened, and without it the three counts would not sum
-- to the holds touched, which is the arithmetic a caller uses to notice that
-- something it named was not a hold at all.

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
  v_skipped   int;
  v_target    timestamptz;
  v_extended  int := 0;
  v_shortened int := 0;
  v_unchanged int := 0;
BEGIN
  IF p_allocation_ids IS NULL OR v_requested = 0 THEN
    RETURN jsonb_build_object('extended', 0, 'shortened', 0, 'unchanged', 0,
                              'skipped_committed', 0, 'requested', 0);
  END IF;

  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 30 OR p_ttl_seconds > 604800 THEN
    RAISE EXCEPTION 'invalid_ttl' USING ERRCODE = 'CP007';
  END IF;

  PERFORM 1
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids)
   ORDER BY id
     FOR UPDATE;

  SELECT count(*) INTO v_released
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids) AND state = 'released';
  IF v_released > 0 THEN
    RAISE EXCEPTION 'cannot_extend_released' USING ERRCODE = 'CP016', DETAIL = v_released::text;
  END IF;

  SELECT count(*) INTO v_skipped
    FROM public.capacity_allocations
   WHERE id = ANY(p_allocation_ids) AND state = 'committed';

  -- One `now()` for the whole call, so two rows written in the same statement
  -- cannot land on different targets and be classified differently.
  v_target := now() + make_interval(secs => p_ttl_seconds);

  WITH bumped AS (
    UPDATE public.capacity_allocations
       SET expires_at = v_target
     WHERE id = ANY(p_allocation_ids)
       AND state = 'hold'
    RETURNING expires_at AS old_exp
  )
  SELECT
    count(*) FILTER (WHERE v_target > old_exp),
    count(*) FILTER (WHERE v_target < old_exp),
    count(*) FILTER (WHERE v_target = old_exp)
    INTO v_extended, v_shortened, v_unchanged
  FROM (
    SELECT expires_at AS old_exp
      FROM public.capacity_allocations
     WHERE id = ANY(p_allocation_ids) AND state = 'hold'
  ) AS pre;

  RETURN jsonb_build_object(
    'extended', v_extended,
    'shortened', v_shortened,
    'unchanged', v_unchanged,
    'skipped_committed', v_skipped,
    'requested', v_requested);
END;
$$;

COMMENT ON FUNCTION public.extend_capacity_hold(uuid[], int) IS
  'SET the expiry of HELD allocations to now()+ttl — it can shorten as well as lengthen, which a reschedule to an EARLIER night needs. Reports {extended, shortened, unchanged, skipped_committed, requested} so a caller that cut forty seats short is not told it extended them. Committed are skipped; a released id RAISES CP016. Run inside the same transaction as the ends_at move.';

REVOKE ALL ON FUNCTION public.extend_capacity_hold(uuid[], int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.extend_capacity_hold(uuid[], int) TO service_role;

-- ── executable proof ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant uuid; v_pool uuid; v_long uuid; v_short uuid; v_commit uuid; v_res jsonb;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to test against — refusing to apply an unproven change';
  END IF;

  v_pool := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 10, 'default', NULL, 0, 900, 'seat', true);

  -- One hold far in the future, one close: the same call does both things.
  INSERT INTO public.capacity_allocations (tenant_id, pool_id, pool_path, units, state, expires_at)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'hold', now() + interval '24 hours')
  RETURNING id INTO v_long;

  INSERT INTO public.capacity_allocations (tenant_id, pool_id, pool_path, units, state, expires_at)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'hold', now() + interval '5 minutes')
  RETURNING id INTO v_short;

  INSERT INTO public.capacity_allocations (tenant_id, pool_id, pool_path, units, state)
  VALUES (v_tenant, v_pool, ARRAY[v_pool], 1, 'committed')
  RETURNING id INTO v_commit;

  -- Target one hour: LENGTHENS the 5-minute hold and SHORTENS the 24-hour one.
  v_res := public.extend_capacity_hold(ARRAY[v_long, v_short, v_commit], 3600);

  IF (v_res->>'extended')::int <> 1 THEN
    RAISE EXCEPTION 'expected exactly one lengthened: %', v_res;
  END IF;
  IF (v_res->>'shortened')::int <> 1 THEN
    RAISE EXCEPTION 'A SHORTENING WAS NOT REPORTED — this is the whole bug: %', v_res;
  END IF;
  IF (v_res->>'skipped_committed')::int <> 1 OR (v_res->>'requested')::int <> 3 THEN
    RAISE EXCEPTION 'mixed-state counts wrong: %', v_res;
  END IF;

  -- The counts must account for every hold touched.
  IF (v_res->>'extended')::int + (v_res->>'shortened')::int + (v_res->>'unchanged')::int <> 2 THEN
    RAISE EXCEPTION 'the three counts do not sum to the holds touched: %', v_res;
  END IF;

  -- Re-running with the same target changes nothing, and says so.
  v_res := public.extend_capacity_hold(ARRAY[v_long, v_short], 3600);
  IF (v_res->>'unchanged')::int <> 2 THEN
    RAISE EXCEPTION 'a no-op call did not report unchanged: %', v_res;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id = v_pool;
  DELETE FROM public.capacity_pools       WHERE id = v_pool;

  RAISE NOTICE 'extend_capacity_hold: shortening is now named (1 extended, 1 shortened, committed skipped, re-run reports unchanged)';
END $$;

COMMIT;
