-- 20261229000213_batch_per_line_attribution.sql — Phase 0.11.
--
-- `reserve_capacity_batch` took ONE `p_order_line_id` and stamped it on every
-- allocation in the batch. So a cart whose lines each need capacity had to
-- choose between two things it should never have to trade:
--
--   * one batch, cross-line atomic, but every allocation attributed to the same
--     order line — the attribution is then a lie on every line but one; or
--   * one batch per line, attribution correct, but cross-line atomicity gone —
--     line 2 can be refused after line 1 is already held, and the caller has to
--     unwind by hand.
--
-- Orders & Checkout hit this writing 0.6 and took the second option with a
-- compensating unwind, correctly, and left the contract question in a comment
-- rather than working around it silently. This is the fix.
--
-- `order_line_id` becomes a per-request field, falling back to the batch-level
-- parameter when absent. Both existing shapes keep working: a caller passing
-- only `p_order_line_id` gets exactly the old behaviour, and a caller passing
-- neither gets NULL as before.
--
-- WHY IT MATTERS BEFORE IT BITES. Today every real cart has at most one
-- capacity-bearing line, so this is not a live gap. It becomes one the first
-- time a customer buys GA and VIP in one transaction — Events, Phase 2 — and at
-- that point the choice is between an incorrect ledger and a hand-rolled unwind
-- in the hottest path in the product. Neither is a thing to discover under
-- load; the fix is eleven lines now.
--
-- Attribution is not cosmetic. `capacity_allocations.order_line_id` is what
-- refund-by-line reads to decide which units to release when ONE line of a
-- multi-line order is refunded. Stamped wrong, a refund of the GA line frees
-- the VIP seats.
--
-- TIMESTAMP: band 202612290002xx (Capacity). Sorts after 20261229000212.
-- APPLY WITH `node web/scripts/apply-migration.mjs`, never `db push`.
-- DRY-RUN FIRST with `npm run sql:dry-run -- <this file>`.

BEGIN;

CREATE OR REPLACE FUNCTION public.reserve_capacity_batch(
  p_requests      jsonb,   -- [{pool_id, starts_at, ends_at, units, order_line_id?}, …]
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

  FOR v_req IN
    SELECT (r->>'pool_id')::uuid            AS pool_id,
           (r->>'starts_at')::timestamptz   AS starts_at,
           (r->>'ends_at')::timestamptz     AS ends_at,
           COALESCE((r->>'units')::int, 1)  AS units,
           -- Per-request attribution, falling back to the batch-level id.
           -- NULLIF guards a caller that sends "" rather than omitting the key.
           COALESCE(NULLIF(r->>'order_line_id', '')::uuid, p_order_line_id) AS order_line_id
      FROM jsonb_array_elements(p_requests) AS r
      LEFT JOIN public.capacity_pools p ON p.id = (r->>'pool_id')::uuid
     -- Global lock order, unchanged: two concurrent batches over the same pools
     -- take them in the same sequence and cannot deadlock against each other.
     ORDER BY p.pool_path::text NULLS LAST, (r->>'pool_id')
  LOOP
    v_alloc := public._capacity_reserve_locked(
      v_req.pool_id, v_req.starts_at, v_req.ends_at, v_req.units,
      p_ttl_seconds, v_req.order_line_id, p_created_by);
    v_ids := v_ids || v_alloc.id;
    v_min_exp := LEAST(v_min_exp, v_alloc.expires_at);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'allocation_ids', to_jsonb(v_ids),
                            'expires_at', v_min_exp);
EXCEPTION
  WHEN SQLSTATE 'CP001' OR SQLSTATE 'CP002' OR SQLSTATE 'CP003'
    OR SQLSTATE 'CP004' OR SQLSTATE 'CP005' OR SQLSTATE 'CP006'
    OR SQLSTATE 'CP007' THEN
    -- The whole block rolls back: nothing is written. That is the property the
    -- caller is buying, and it is why per-line batching was a real loss.
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason,
                              'failed_pool_id', NULLIF(v_detail, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.reserve_capacity_batch(jsonb, int, uuid, uuid) IS
  'All-or-nothing reserve across pools. Each request may carry its own order_line_id; p_order_line_id is the fallback.';

COMMIT;
