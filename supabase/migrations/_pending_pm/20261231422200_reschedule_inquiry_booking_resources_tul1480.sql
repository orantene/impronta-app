-- 20261231422200_reschedule_inquiry_booking_resources_tul1480.sql
-- TUL-1480: move an orderless request booking onto an overlapping window
-- without reading it as taken (self-exclusion). HELD in _pending_pm: the PM
-- confirms the version and applies it; never db push from an agent.
--
-- THE DEFECT. A booking that came from a request and has NO order holds its
-- chair, room or station in `capacity_allocations` under the inquiry's key
-- (`inquiry:<id>:resources:<startMs>-<endMs>`, TUL-1375). Its reschedule
-- (web/src/lib/resources/booking-resources.ts `moveInquiryBookingResources`)
-- reserved the SAME pools for the new window first, then moved the calendar,
-- then released the old window. On a one-unit pool a new window that overlaps
-- the old one (11:00-12:00 moved to 11:30-12:30) was refused as taken: the
-- booking's own old allocation was the one in the way. It was also three
-- transactions: a calendar failure was undone by another request.
--
-- WHAT THIS ADDS. One function, one transaction, the same shape as the
-- capacity legs of `reschedule_booking_set` (20261231030700), which already
-- does this for order-backed bookings:
--
--   1. lock the booking row (FOR UPDATE), check the tenant, require an
--      orderless request booking;
--   2. lock THIS booking's live allocations (the inquiry key prefix, no order
--      line, exactly the booking's current window) FOR UPDATE;
--   3. per allocation, lock its pool chain root-first (the order
--      `_capacity_reserve_locked` uses, so racing movers and reservers
--      serialize on the pool) and count every other live allocation that
--      overlaps the NEW window, excluding this allocation (THE SELF-EXCLUSION);
--      over capacity raises sold_out / ancestor_full and nothing moves;
--   4. move the allocation and re-key it to the new window's key, so a later
--      lookup by the old window's key finds nothing live (fail closed);
--   5. call `reschedule_booking_set` in the SAME transaction for the calendar
--      (booking row, talent mirrors, talent guard). When it refuses, this
--      function raises and the block rolls the resource move back too: room
--      and calendar move together or neither moves.
--
-- Two bookings racing into one free window: both lock the pool chain FOR
-- UPDATE; the second re-counts after the first commits and gets sold_out.
--
-- SECURITY. SECURITY DEFINER, search_path fixed to public, EXECUTE revoked
-- from PUBLIC / anon / authenticated and granted to service_role only; every
-- read and write is scoped to p_tenant_id and the booking's tenant is checked.

BEGIN;

CREATE OR REPLACE FUNCTION public.reschedule_inquiry_booking_with_resources(
  p_tenant_id             uuid,
  p_booking_id            uuid,
  p_operation_key         text,
  p_actor_id              uuid,
  p_starts_at             timestamptz,
  p_ends_at               timestamptz,
  p_resources_key         text,
  p_buffer_before_seconds integer     DEFAULT 0,
  p_buffer_after_seconds  integer     DEFAULT 0,
  p_expected_starts_at    timestamptz DEFAULT NULL,
  p_expected_ends_at      timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking     public.agency_bookings%ROWTYPE;
  v_prefix      text;
  v_alloc       record;
  v_anc         public.capacity_pools%ROWTYPE;
  v_chain       public.capacity_pools[];
  v_used        integer;
  v_moved       integer := 0;
  v_reply       jsonb;
  v_reason      text;
  v_detail      text;
BEGIN
  -- ── input, before a single row is touched ────────────────────────────────
  IF p_tenant_id IS NULL OR p_booking_id IS NULL
     OR COALESCE(btrim(p_operation_key), '') = ''
     OR COALESCE(btrim(p_resources_key), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', 'bad_input',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', 'bad_window',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- ── the parent row, locked for the whole transaction ─────────────────────
  SELECT * INTO v_booking
    FROM public.agency_bookings
   WHERE id = p_booking_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF v_booking.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- Order-backed bookings move their resources inside reschedule_booking_set.
  IF v_booking.order_id IS NOT NULL OR v_booking.source_inquiry_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', 'not_orderless_request',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  v_prefix := 'inquiry:' || v_booking.source_inquiry_id::text || ':resources';

  -- The new key must belong to THIS request's resources.
  IF left(p_resources_key, length(v_prefix) + 1) IS DISTINCT FROM v_prefix || ':' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'detail', 'bad_resources_key',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  -- ── resource legs: only when the booking has a window and it changes ──────
  -- (Same window = a retry: reschedule_booking_set answers already=true.)
  IF v_booking.starts_at IS NOT NULL AND v_booking.ends_at IS NOT NULL
     AND NOT (v_booking.starts_at = p_starts_at AND v_booking.ends_at = p_ends_at) THEN
    FOR v_alloc IN
      SELECT a.*
        FROM public.capacity_allocations a
       WHERE a.tenant_id = p_tenant_id
         AND left(a.operation_key, length(v_prefix)) = v_prefix
         AND a.order_line_id IS NULL
         AND (a.state = 'committed'
              OR (a.state = 'hold' AND a.expires_at > now()))
         AND a.starts_at = v_booking.starts_at
         AND a.ends_at = v_booking.ends_at
       ORDER BY a.pool_path::text, a.id
         FOR UPDATE
    LOOP
      -- Root-first, exactly as _capacity_reserve_locked walks it.
      v_chain := '{}';
      FOR v_anc IN
        SELECT p.*
          FROM unnest(v_alloc.pool_path) WITH ORDINALITY AS x(pool_id, ord)
          JOIN public.capacity_pools p ON p.id = x.pool_id
         ORDER BY x.ord
           FOR UPDATE OF p
      LOOP
        v_chain := v_chain || v_anc;
      END LOOP;

      FOREACH v_anc IN ARRAY v_chain LOOP
        IF v_anc.tenant_id IS DISTINCT FROM p_tenant_id THEN
          RAISE EXCEPTION 'wrong_tenant' USING ERRCODE = 'RS007', DETAIL = v_anc.id::text;
        END IF;
        IF NOT v_anc.is_active THEN
          RAISE EXCEPTION 'pool_inactive' USING ERRCODE = 'RS004', DETAIL = v_anc.id::text;
        END IF;

        -- THE SELF-EXCLUSION. This allocation is moving; overlapping the window
        -- it is vacating is not a conflict with anybody. Every OTHER live
        -- allocation (another booking's, another request's) still counts.
        SELECT COALESCE(SUM(al.units), 0) INTO v_used
          FROM public.capacity_allocations al
         WHERE al.pool_path @> ARRAY[v_anc.id]
           AND al.id <> v_alloc.id
           AND (al.state = 'committed'
                OR (al.state = 'hold' AND al.expires_at > now()))
           AND (al.starts_at IS NULL
                OR tstzrange(al.starts_at, al.ends_at, '[)')
                   && tstzrange(p_starts_at, p_ends_at, '[)'));

        IF v_used + v_alloc.units > v_anc.units_total + v_anc.overbook_units THEN
          IF v_anc.id = v_alloc.pool_id THEN
            RAISE EXCEPTION 'sold_out' USING ERRCODE = 'RS005', DETAIL = v_anc.id::text;
          ELSE
            RAISE EXCEPTION 'ancestor_full' USING ERRCODE = 'RS006', DETAIL = v_anc.id::text;
          END IF;
        END IF;
      END LOOP;

      UPDATE public.capacity_allocations
         SET starts_at     = p_starts_at,
             ends_at       = p_ends_at,
             operation_key = p_resources_key
       WHERE id = v_alloc.id
         AND tenant_id = p_tenant_id;

      v_moved := v_moved + 1;
    END LOOP;
  END IF;

  -- ── the calendar, in THIS transaction ─────────────────────────────────────
  v_reply := public.reschedule_booking_set(
    p_tenant_id, p_booking_id, p_operation_key, p_actor_id,
    p_starts_at, p_ends_at,
    p_buffer_before_seconds, p_buffer_after_seconds,
    p_expected_starts_at, p_expected_ends_at);

  IF COALESCE((v_reply ->> 'ok')::boolean, false) IS NOT TRUE THEN
    -- v_reply is a variable, not a row: it survives the rollback below.
    RAISE EXCEPTION 'calendar_refused' USING ERRCODE = 'RS010';
  END IF;

  RETURN v_reply || jsonb_build_object('moved_resource_allocations', v_moved);

EXCEPTION
  -- Custom codes first: WHEN OTHERS would otherwise swallow them.
  WHEN SQLSTATE 'RS010' THEN
    -- The calendar refused: the resource move above is rolled back with it.
    RETURN COALESCE(v_reply, jsonb_build_object('ok', false, 'reason', 'unavailable'))
           || jsonb_build_object('moved_resource_allocations', 0);
  WHEN SQLSTATE 'RS004' OR SQLSTATE 'RS005' OR SQLSTATE 'RS006' OR SQLSTATE 'RS007' THEN
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason,
                              'failed_pool_id', NULLIF(v_detail, ''),
                              'failed_talent_id', NULL,
                              'moved_resource_allocations', 0);
  WHEN deadlock_detected OR serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadlock',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL,
                              'moved_resource_allocations', 0);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL,
                              'moved_resource_allocations', 0,
                              'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_inquiry_booking_with_resources(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text, integer, integer, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_inquiry_booking_with_resources(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text, integer, integer, timestamptz, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.reschedule_inquiry_booking_with_resources(
  uuid, uuid, text, uuid, timestamptz, timestamptz, text, integer, integer, timestamptz, timestamptz
) IS
  'TUL-1480: reschedule an ORDERLESS request booking and its inquiry-keyed resource allocations in ONE transaction. '
  'Locks the booking and its allocations, re-counts each pool chain for the new window excluding the moving allocation '
  '(self-exclusion), moves and re-keys them, then calls reschedule_booking_set; any refusal rolls everything back. '
  'Refuses invalid / not_found / wrong_tenant / sold_out / ancestor_full / pool_inactive / deadlock and every reschedule_booking_set reason.';

DO $check$
BEGIN
  IF has_function_privilege('anon',
       'public.reschedule_inquiry_booking_with_resources(uuid,uuid,text,uuid,timestamptz,timestamptz,text,integer,integer,timestamptz,timestamptz)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reschedule_inquiry_booking_with_resources(uuid,uuid,text,uuid,timestamptz,timestamptz,text,integer,integer,timestamptz,timestamptz)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'reschedule_inquiry_booking_with_resources is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMIT;
