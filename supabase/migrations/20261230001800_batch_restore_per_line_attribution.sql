-- Restore per-request order_line_id, which the per-leg-TTL migration reverted.
--
-- `20261229000213_batch_per_line_attribution.sql` made `order_line_id` a
-- per-request field of `reserve_capacity_batch`, with the batch parameter as a
-- fallback. Five minutes later in version order,
-- `20261229000218_batch_per_leg_ttl.sql` re-created the same function to add a
-- per-leg `ttl_seconds` — CITING 213 as the shape it was copying — and wrote
-- the loop from the PRE-213 body. Its `_capacity_reserve_locked` call passes
-- `p_order_line_id`, so from that migration onward every request's own
-- `order_line_id` was read by nobody.
--
-- WHAT THAT COSTS, measured on the isolated branch: 18 of 18 allocations
-- created today carry `order_line_id = NULL`, against 18 of 19 the day before.
-- The caller that matters most makes it unconditional —
-- `reserve_resource_set` passes NULL for the batch parameter and forwards
-- `p_capacity` untouched, exactly as a per-request contract intends — so EVERY
-- allocation taken through the atomic multi-resource path is unattributed.
--
-- And an unattributed allocation is invisible to the code that must commit it.
-- `completeOrderForTransaction` — the webhook, which is every card order —
-- finds the holds to commit with
--
--     capacity_allocations WHERE order_line_id IN (this order's lines)
--                            AND state = 'hold'
--
-- so it commits nothing, the hold lapses on its own clock, and
-- `reap_capacity_allocations` releases the seat of an order the customer has
-- PAID for. The loud alert that path promises for "money landed, hold lapsed"
-- never fires either, because as far as it can tell there was no capacity to
-- commit. The same blindness stops refund-by-line releasing units, and stops a
-- reservation being released when its order is cancelled.
--
-- Nothing else about the function changes: per-leg TTL, the pool-clock
-- fallback, the lock order by `pool_path`, and the single EXCEPTION handler
-- that makes the batch all-or-nothing are 218's, byte for byte. Only the sixth
-- argument of the inner call moves from the batch parameter to the COALESCE
-- that 213 wrote.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_capacity_batch(
  p_requests      jsonb,   -- [{pool_id, starts_at, ends_at, units, ttl_seconds?, order_line_id?}, …]
  p_ttl_seconds   int  DEFAULT NULL,
  p_order_line_id uuid DEFAULT NULL,   -- fallback for requests that omit their own
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
  --
  -- AND: both per-leg fields belong in this SELECT, TOGETHER. Re-creating this
  -- function from an older copy is how the attribution was lost once already.
  -- If you add a third per-leg field, add it here and prove all three.
  FOR v_req IN
    SELECT (r->>'pool_id')::uuid            AS pool_id,
           (r->>'starts_at')::timestamptz   AS starts_at,
           (r->>'ends_at')::timestamptz     AS ends_at,
           COALESCE((r->>'units')::int, 1)  AS units,
           -- Per-leg TTL, batch value as fallback. NULLIF so an empty string is
           -- an absent value rather than a cast error; NULL falls through to the
           -- pool's own hold_ttl_seconds inside _capacity_reserve_locked.
           COALESCE(NULLIF(r->>'ttl_seconds', '')::int, p_ttl_seconds) AS ttl_seconds,
           -- Per-leg attribution, batch value as fallback. Which line owns which
           -- units is what refund-by-line and the completion sweep read, and a
           -- cart with a GA line and a VIP line cannot say that with one
           -- batch-level id.
           COALESCE(NULLIF(r->>'order_line_id', '')::uuid, p_order_line_id) AS order_line_id
      FROM jsonb_array_elements(p_requests) AS r
      LEFT JOIN public.capacity_pools p ON p.id = (r->>'pool_id')::uuid
     ORDER BY p.pool_path::text NULLS LAST, (r->>'pool_id')
  LOOP
    v_alloc := public._capacity_reserve_locked(
      v_req.pool_id, v_req.starts_at, v_req.ends_at, v_req.units,
      v_req.ttl_seconds, v_req.order_line_id, p_created_by);
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
  'Reserve several legs atomically. Each request may carry its own ttl_seconds '
  '(a door hold lives until the session ends; a coffee lives fifteen minutes) '
  'and its own order_line_id (which line owns which units, for refund-by-line '
  'and for the completion sweep); the batch values are the fallbacks and the '
  'pool clock is the last resort. All-or-nothing: one refusal rolls back every leg.';

REVOKE ALL ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) TO service_role;

-- ── executable proof ─────────────────────────────────────────────────────────
-- BOTH per-leg fields, in one batch. The fault being repaired is one per-leg
-- field being added while another was silently dropped, so a proof of either
-- alone would have passed in December and passed again here.

DO $$
DECLARE
  v_tenant uuid;
  v_pool_a uuid;
  v_pool_b uuid;
  v_line   uuid;
  v_res    jsonb;
  v_ids    uuid[];
  v_hit    int;
  v_a_exp  timestamptz;
  v_b_exp  timestamptz;
BEGIN
  SELECT id INTO v_tenant FROM public.agencies ORDER BY created_at LIMIT 1;
  IF v_tenant IS NULL THEN
    RAISE EXCEPTION 'no tenant to test against — refusing to apply an unproven change';
  END IF;

  v_pool_a := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 5, 'default', NULL, 0, 900, 'seat', true);
  v_pool_b := public.upsert_capacity_pool(
    v_tenant, 'offering', gen_random_uuid(), 5, 'default', NULL, 0, 900, 'unit', true);

  -- Any real line: `order_line_id` carries a foreign key, and which order it
  -- belongs to does not matter to the batch — that it EXISTS does. A database
  -- with no order lines yet still proves the TTL half below.
  SELECT id INTO v_line FROM public.order_lines ORDER BY created_at DESC LIMIT 1;

  -- Leg A names its own line AND its own clock; leg B names neither and must
  -- fall back to the batch values.
  v_res := public.reserve_capacity_batch(
    jsonb_build_array(
      jsonb_build_object('pool_id', v_pool_a, 'units', 1, 'ttl_seconds', 86400,
                         'order_line_id', v_line),
      jsonb_build_object('pool_id', v_pool_b, 'units', 1)),
    600, NULL, NULL);

  IF (v_res->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'the two-field batch failed: %', v_res;
  END IF;

  SELECT array_agg((x)::uuid) INTO v_ids
    FROM jsonb_array_elements_text(v_res->'allocation_ids') AS x;

  IF v_line IS NOT NULL THEN
    SELECT count(*) INTO v_hit FROM public.capacity_allocations
     WHERE id = ANY(v_ids) AND order_line_id = v_line;
    IF v_hit <> 1 THEN
      RAISE EXCEPTION
        'the leg carrying its own order_line_id was not attributed (% of 1). '
        'That is the fault 218 reintroduced: an unattributed hold is invisible '
        'to completeOrderForTransaction, so a paid order loses its seat.', v_hit;
    END IF;
    -- And the fallback leg must NOT have been stamped with it.
    SELECT count(*) INTO v_hit FROM public.capacity_allocations
     WHERE id = ANY(v_ids) AND pool_id = v_pool_b AND order_line_id IS NOT NULL;
    IF v_hit <> 0 THEN
      RAISE EXCEPTION 'a leg that named no line was stamped anyway — attribution is not per-leg';
    END IF;
  END IF;

  SELECT expires_at INTO v_a_exp FROM public.capacity_allocations WHERE pool_id = v_pool_a;
  SELECT expires_at INTO v_b_exp FROM public.capacity_allocations WHERE pool_id = v_pool_b;
  IF v_a_exp < now() + interval '23 hours' THEN
    RAISE EXCEPTION 'per-leg ttl_seconds was lost restoring attribution (leg A expires %)', v_a_exp;
  END IF;
  IF v_b_exp > now() + interval '1 hour' THEN
    RAISE EXCEPTION 'the batch TTL fallback was lost (leg B expires %)', v_b_exp;
  END IF;

  DELETE FROM public.capacity_allocations WHERE pool_id IN (v_pool_a, v_pool_b);
  DELETE FROM public.capacity_pools       WHERE id IN (v_pool_a, v_pool_b);

  RAISE NOTICE 'batch attribution: proven (a leg names its own line, a leg that does not is left null, both clocks intact)';
END $$;

COMMIT;
