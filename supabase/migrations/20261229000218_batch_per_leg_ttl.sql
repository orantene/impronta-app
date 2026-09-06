-- 20261229000218_batch_per_leg_ttl.sql
-- One cart, two clocks: a door ticket and a coffee cannot share a TTL.
--
-- `reserve_capacity_batch` took ONE `p_ttl_seconds` for every leg and passed it
-- to each `_capacity_reserve_locked`. The request elements carried only
-- `{pool_id, starts_at, ends_at, units}`. So a cart holding a pay-at-the-door
-- ticket (whose hold must live until the session ENDS) alongside an ordinary
-- product (fifteen minutes) could not express both, and `createPurchase` takes
-- the SHORTEST across the cart — correct for an ordinary checkout, and wrong
-- here: add a coffee to a door-ticket order and the ticket hold drops to the
-- coffee's fifteen minutes, then the reaper frees a seat somebody is coming for.
--
-- This adds an optional `ttl_seconds` to each request element, with the
-- batch-level value as the fallback. Exactly the shape `20261229000213` used for
-- `order_line_id`:
--
--   COALESCE(NULLIF(r->>'ttl_seconds','')::int, p_ttl_seconds)
--
-- and then `_capacity_reserve_locked` applies its own
-- `COALESCE(p_ttl_seconds, pool.hold_ttl_seconds)`, so a leg with no TTL and a
-- batch with no TTL still falls through to the pool's own clock. Three levels,
-- most specific first, and every existing caller is byte-identical because an
-- absent key is NULL.
--
-- THE CEILING IS UNCHANGED AND DELIBERATE. `_capacity_reserve_locked` still
-- raises CP007 outside 30…604800 — seven days. Events' pay-at-the-door design
-- uses that as a PRODUCT rule rather than routing around it: the door option is
-- offered only when the session ends inside the ceiling, and beyond that it is
-- card-only. A hold is a promise that must expire; raising the ceiling to cover
-- a season of ticket sales would make the hold state do the commit state's job.
--
-- WHY TTL = SESSION END, not door time (Events', and better than what I
-- proposed): the hold then outlives the moment of payment, so `markPaid` commits
-- comfortably inside it. A TTL expiring at DOOR time frees the seat at the
-- moment the person walks in — best case a race, worst case resold while they
-- queue — and the sweep would land during the night rather than after it, when
-- releasing costs nothing.
--
-- Validation stays where it was: per-leg values are bounds-checked by
-- `_capacity_reserve_locked` itself, so one invalid leg raises CP007 and the
-- exception handler rolls the whole batch back. A batch is all-or-nothing, and
-- that atomicity is a side effect of the block HAVING an exception handler — if
-- anyone ever "improves" it into per-leg handlers for better attribution, the
-- batch silently stops being atomic and a sold-out show starts selling three of
-- four. Left as a comment in the function for the next reader.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_capacity_batch(
  p_requests      jsonb,   -- [{pool_id, starts_at, ends_at, units, ttl_seconds?}, …]
  p_ttl_seconds   int  DEFAULT NULL,
  p_order_line_id uuid DEFAULT NULL,
  p_created_by    uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_req    record;
  v_alloc  public.capacity_allocations;
  v_ids    uuid[] := '{}';
  v_min_exp timestamptz;
  v_reason text;
  v_detail text;
BEGIN
  IF p_requests IS NULL OR jsonb_typeof(p_requests) <> 'array'
     OR jsonb_array_length(p_requests) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_batch');
  END IF;

  -- NOTE FOR THE NEXT READER: the EXCEPTION handler at the bottom is what makes
  -- this batch all-or-nothing. A plpgsql block with a handler is a
  -- subtransaction, so a CP005 on the fourth leg rolls back the three rows
  -- already inserted. Moving to per-leg handlers to get better error attribution
  -- would silently end that, and a sold-out show would start selling three of
  -- four. Verified: 4 single-unit requests against 3 seats returns sold_out and
  -- writes ZERO rows.
  FOR v_req IN
    SELECT (r->>'pool_id')::uuid            AS pool_id,
           (r->>'starts_at')::timestamptz   AS starts_at,
           (r->>'ends_at')::timestamptz     AS ends_at,
           COALESCE((r->>'units')::int, 1)  AS units,
           -- Per-leg TTL, batch value as fallback. NULLIF so an empty string is
           -- an absent value rather than a cast error; NULL falls through to the
           -- pool's own hold_ttl_seconds inside _capacity_reserve_locked.
           COALESCE(NULLIF(r->>'ttl_seconds', '')::int, p_ttl_seconds) AS ttl_seconds
      FROM jsonb_array_elements(p_requests) AS r
      LEFT JOIN public.capacity_pools p ON p.id = (r->>'pool_id')::uuid
     ORDER BY p.pool_path::text NULLS LAST, (r->>'pool_id')
  LOOP
    v_alloc := public._capacity_reserve_locked(
      v_req.pool_id, v_req.starts_at, v_req.ends_at, v_req.units,
      v_req.ttl_seconds, p_order_line_id, p_created_by);
    v_ids := v_ids || v_alloc.id;
    v_min_exp := LEAST(v_min_exp, v_alloc.expires_at);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'allocation_ids', to_jsonb(v_ids),
                            'expires_at', v_min_exp);
EXCEPTION
  WHEN SQLSTATE 'CP001' OR SQLSTATE 'CP002' OR SQLSTATE 'CP003'
    OR SQLSTATE 'CP004' OR SQLSTATE 'CP005' OR SQLSTATE 'CP006'
    OR SQLSTATE 'CP007' THEN
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason,
                              'failed_pool_id', NULLIF(v_detail, ''));
END;
$$;

COMMENT ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) IS
  'Reserve several legs atomically. Each request may carry its own ttl_seconds (a door hold lives until the session ends; a coffee lives fifteen minutes); the batch value is the fallback and the pool clock is the last resort. All-or-nothing: one refusal rolls back every leg.';

REVOKE ALL ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) TO service_role;

-- ── executable proof ─────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tenant uuid;
  v_pool_a uuid;
  v_pool_b uuid;
  v_res    jsonb;
  v_ids    uuid[];
  v_a_exp  timestamptz;
  v_b_exp  timestamptz;
  v_rows   int;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to test against — refusing to apply an unproven change';
  END IF;

  v_pool_a := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 5, 'default', NULL, 0, 900, 'seat', true);
  v_pool_b := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 5, 'default', NULL, 0, 900, 'unit', true);

  -- TWO LEGS, TWO CLOCKS: the door leg holds for a day, the coffee for 60s.
  v_res := public.reserve_capacity_batch(
    jsonb_build_array(
      jsonb_build_object('pool_id', v_pool_a, 'units', 1, 'ttl_seconds', 86400),
      jsonb_build_object('pool_id', v_pool_b, 'units', 1, 'ttl_seconds', 60)),
    NULL, NULL, NULL);

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'the two-clock batch failed: %', v_res;
  END IF;

  SELECT expires_at INTO v_a_exp FROM public.capacity_allocations WHERE pool_id = v_pool_a;
  SELECT expires_at INTO v_b_exp FROM public.capacity_allocations WHERE pool_id = v_pool_b;

  -- THE WHOLE POINT: the legs must NOT share a clock.
  IF v_a_exp <= v_b_exp THEN
    RAISE EXCEPTION 'both legs took the same TTL — per-leg value ignored (a=% b=%)', v_a_exp, v_b_exp;
  END IF;
  IF v_a_exp < now() + interval '23 hours' THEN
    RAISE EXCEPTION 'the door leg did not get its day: %', v_a_exp;
  END IF;
  IF v_b_exp > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'the short leg took the long TTL: %', v_b_exp;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id IN (v_pool_a, v_pool_b);

  -- A leg with NO ttl_seconds still falls through to the batch value.
  v_res := public.reserve_capacity_batch(
    jsonb_build_array(jsonb_build_object('pool_id', v_pool_a, 'units', 1)),
    120, NULL, NULL);
  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'the fallback batch failed: %', v_res;
  END IF;
  SELECT expires_at INTO v_a_exp FROM public.capacity_allocations WHERE pool_id = v_pool_a;
  IF v_a_exp > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'the batch fallback TTL was not applied: %', v_a_exp;
  END IF;
  DELETE FROM public.capacity_allocations WHERE pool_id = v_pool_a;

  -- An out-of-bounds leg refuses the WHOLE batch and writes nothing.
  v_res := public.reserve_capacity_batch(
    jsonb_build_array(
      jsonb_build_object('pool_id', v_pool_a, 'units', 1, 'ttl_seconds', 3600),
      jsonb_build_object('pool_id', v_pool_b, 'units', 1, 'ttl_seconds', 604801)),
    NULL, NULL, NULL);
  IF (v_res->>'ok')::boolean IS NOT FALSE THEN
    RAISE EXCEPTION 'a TTL beyond the ceiling was accepted in a batch: %', v_res;
  END IF;
  SELECT count(*) INTO v_rows FROM public.capacity_allocations
   WHERE pool_id IN (v_pool_a, v_pool_b);
  IF v_rows <> 0 THEN
    RAISE EXCEPTION 'the refused batch left % row(s) behind — it is not atomic', v_rows;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id IN (v_pool_a, v_pool_b);
  DELETE FROM public.capacity_pools       WHERE id IN (v_pool_a, v_pool_b);

  RAISE NOTICE 'batch per-leg TTL: proven (two clocks in one batch, batch fallback, ceiling refuses the whole batch with zero rows)';
END $$;

COMMIT;
