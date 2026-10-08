-- 20260926185353_reschedule_booking_set_manual_mirror.sql
-- GAP-JOR-5: Accept on manual (no-inquiry) bookings must move talent_bookings.
-- Prior reschedule_booking_set only mirrored rows keyed by source_inquiry_id.

CREATE OR REPLACE FUNCTION public.reschedule_booking_set(
  p_tenant_id             uuid,
  p_booking_id            uuid,
  p_operation_key         text,
  p_actor_id              uuid,
  p_starts_at             timestamptz,
  p_ends_at               timestamptz,
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
  v_booking       public.agency_bookings%ROWTYPE;
  v_prev_starts   timestamptz;
  v_prev_ends     timestamptz;
  v_before        integer;
  v_after         integer;
  v_talent        record;
  v_guard_talents uuid[] := '{}';
  v_guard_ids     uuid[] := '{}';
  v_guard_id      uuid;
  v_failed_talent uuid;
  v_alloc         record;
  v_anc           public.capacity_pools%ROWTYPE;
  v_chain         public.capacity_pools[];
  v_used          integer;
  v_shift         interval;
  v_alloc_start   timestamptz;
  v_alloc_end     timestamptz;
  v_moved_talent  integer := 0;
  v_moved_alloc   integer := 0;
  v_hold          public.talent_holds%ROWTYPE;
  v_hold_start    timestamptz;
  v_hold_end      timestamptz;
  v_moved_holds   integer := 0;
  v_reason        text;
  v_detail        text;
BEGIN
  -- ── input, before a single row is touched ────────────────────────────────
  IF p_tenant_id IS NULL OR p_booking_id IS NULL
     OR COALESCE(btrim(p_operation_key), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid',
                              'detail', 'bad_input',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  v_before := COALESCE(p_buffer_before_seconds, 0);
  v_after  := COALESCE(p_buffer_after_seconds, 0);
  IF v_before < 0 OR v_after < 0 OR v_before > 86400 OR v_after > 86400 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid',
                              'detail', 'bad_buffer',
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid',
                              'detail', 'bad_window',
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

  IF v_booking.status::text NOT IN ('tentative', 'confirmed', 'draft', 'in_progress') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reschedulable',
                              'status', v_booking.status::text,
                              'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  v_prev_starts := v_booking.starts_at;
  v_prev_ends   := v_booking.ends_at;

  -- A stale screen. The operator moved a window that is no longer the stored
  -- one, so the move they intended is not the move this would make.
  IF p_expected_starts_at IS NOT NULL OR p_expected_ends_at IS NOT NULL THEN
    IF v_prev_starts IS DISTINCT FROM p_expected_starts_at
       OR v_prev_ends IS DISTINCT FROM p_expected_ends_at THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict',
                                'current_starts_at', v_prev_starts,
                                'current_ends_at', v_prev_ends,
                                'failed_pool_id', NULL, 'failed_talent_id', NULL);
    END IF;
  END IF;

  -- Already there. A retry of the same intent, not a second move.
  IF v_prev_starts IS NOT DISTINCT FROM p_starts_at
     AND v_prev_ends IS NOT DISTINCT FROM p_ends_at THEN
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'operation_key', p_operation_key,
      'previous_starts_at', v_prev_starts,
      'previous_ends_at', v_prev_ends,
      'starts_at', p_starts_at,
      'ends_at', p_ends_at,
      'moved_talent_bookings', 0,
      'moved_holds', 0,
      'moved_allocations', 0);
  END IF;

  -- ── talent legs ──────────────────────────────────────────────────────────
  IF v_booking.source_inquiry_id IS NOT NULL THEN
    -- This booking's own firm hold goes first, or the guard below collides
    -- with the hold this booking was converted from.
    --
    -- SCOPED TO THE TALENTS BEING MOVED. Deleting every firm hold on the
    -- inquiry would silently free a performer who has a hold but no mirror
    -- yet — a second act still being confirmed — and nothing would ever say
    -- so. The guard is per person, so only the people we are moving can be in
    -- its way.
    DELETE FROM public.talent_holds th
     WHERE th.tenant_id = p_tenant_id
       AND th.inquiry_id = v_booking.source_inquiry_id
       AND th.hold_strength = 'firm'
       AND th.talent_profile_id IN (
             SELECT tb.talent_profile_id
               FROM public.talent_bookings tb
              WHERE tb.tenant_id = p_tenant_id
                AND tb.inquiry_id = v_booking.source_inquiry_id
                AND tb.status <> 'cancelled');

    FOR v_talent IN
      SELECT *
        FROM public.talent_bookings
       WHERE tenant_id = p_tenant_id
         AND inquiry_id = v_booking.source_inquiry_id
         AND status <> 'cancelled'
       ORDER BY talent_profile_id, id
       FOR UPDATE
    LOOP
      v_failed_talent := v_talent.talent_profile_id;

      -- Take the destination BEFORE the mirror moves. One guard per person:
      -- a second guard for the same talent would collide with our own first.
      IF NOT (v_talent.talent_profile_id = ANY (v_guard_talents)) THEN
        INSERT INTO public.talent_holds (
          talent_profile_id, tenant_id, inquiry_id, title,
          starts_at, ends_at, all_day, hold_strength, expires_at,
          created_by_user_id
        ) VALUES (
          v_talent.talent_profile_id,
          p_tenant_id,
          v_booking.source_inquiry_id,
          left('Reschedule guard ' || btrim(p_operation_key), 200),
          p_starts_at - make_interval(secs => v_before),
          p_ends_at   + make_interval(secs => v_after),
          false,
          'firm',
          now() + interval '15 minutes',
          p_actor_id
        )
        RETURNING id INTO v_guard_id;

        v_guard_talents := v_guard_talents || v_talent.talent_profile_id;
        v_guard_ids     := v_guard_ids || v_guard_id;
      END IF;

      UPDATE public.talent_bookings
         SET starts_at = p_starts_at,
             ends_at   = p_ends_at,
             updated_at = now()
       WHERE id = v_talent.id
         AND tenant_id = p_tenant_id;

      v_moved_talent := v_moved_talent + 1;
    END LOOP;

    -- The mirrors own the window now; the guard has nothing left to guard.
    IF array_length(v_guard_ids, 1) IS NOT NULL THEN
      DELETE FROM public.talent_holds WHERE id = ANY (v_guard_ids);
    END IF;
    v_failed_talent := NULL;
  ELSE
    -- Manual / no-inquiry bookings: talent_bookings shares agency_bookings.id
    -- (createManualBooking / convert-hold). Agenda V2 reads talent_bookings for
    -- startsAt; without this branch Accept moves the parent only and the
    -- calendar stays on the old slot (GAP-JOR-5).
    UPDATE public.talent_bookings
       SET starts_at = p_starts_at,
           ends_at   = p_ends_at,
           updated_at = now()
     WHERE id = p_booking_id
       AND tenant_id = p_tenant_id
       AND status <> 'cancelled';
    GET DIAGNOSTICS v_moved_talent = ROW_COUNT;
  END IF;

  -- ── capacity legs ────────────────────────────────────────────────────────
  IF v_booking.order_id IS NOT NULL THEN
    FOR v_alloc IN
      SELECT a.*
        FROM public.capacity_allocations a
        JOIN public.order_lines ol ON ol.id = a.order_line_id
       WHERE ol.order_id = v_booking.order_id
         AND a.tenant_id = p_tenant_id
         AND a.state <> 'released'
         AND a.starts_at IS NOT NULL
       ORDER BY a.pool_path::text, a.id
    LOOP
      IF v_prev_starts IS NULL
         OR (v_alloc.starts_at = v_prev_starts AND v_alloc.ends_at IS NOT DISTINCT FROM v_prev_ends)
      THEN
        v_alloc_start := p_starts_at;
        v_alloc_end   := p_ends_at;
      ELSE
        v_shift       := p_starts_at - v_prev_starts;
        v_alloc_start := v_alloc.starts_at + v_shift;
        v_alloc_end   := v_alloc.ends_at + v_shift;
      END IF;

      -- Root-first, exactly as _capacity_reserve_locked walks it.
      v_chain := '{}';
      FOR v_anc IN
        SELECT p.*
          FROM unnest(v_alloc.pool_path) WITH ORDINALITY AS a(pool_id, ord)
          JOIN public.capacity_pools p ON p.id = a.pool_id
         ORDER BY a.ord
           FOR UPDATE OF p
      LOOP
        v_chain := v_chain || v_anc;
      END LOOP;

      FOREACH v_anc IN ARRAY v_chain LOOP
        IF NOT v_anc.is_active THEN
          RAISE EXCEPTION 'pool_inactive' USING ERRCODE = 'RS004', DETAIL = v_anc.id::text;
        END IF;

        -- THE SELF-EXCLUSION. This allocation is moving; overlapping the window
        -- it is vacating is not a conflict with anybody.
        SELECT COALESCE(SUM(al.units), 0) INTO v_used
          FROM public.capacity_allocations al
         WHERE al.pool_path @> ARRAY[v_anc.id]
           AND al.id <> v_alloc.id
           AND (al.state = 'committed'
                OR (al.state = 'hold' AND al.expires_at > now()))
           AND (al.starts_at IS NULL
                OR tstzrange(al.starts_at, al.ends_at, '[)')
                   && tstzrange(v_alloc_start, v_alloc_end, '[)'));

        IF v_used + v_alloc.units > v_anc.units_total + v_anc.overbook_units THEN
          IF v_anc.id = v_alloc.pool_id THEN
            RAISE EXCEPTION 'sold_out' USING ERRCODE = 'RS005', DETAIL = v_anc.id::text;
          ELSE
            RAISE EXCEPTION 'ancestor_full' USING ERRCODE = 'RS006', DETAIL = v_anc.id::text;
          END IF;
        END IF;
      END LOOP;

      UPDATE public.capacity_allocations
         SET starts_at = v_alloc_start,
             ends_at   = v_alloc_end
       WHERE id = v_alloc.id
         AND tenant_id = p_tenant_id;

      v_moved_alloc := v_moved_alloc + 1;
    END LOOP;
  END IF;

  -- ── person legs of an INSTANT booking ────────────────────────────────────
  -- A booking made on the public page has no inquiry and no `talent_bookings`
  -- mirror. The person it took is a `talent_holds` row written by
  -- `reserve_resource_set_v2` under the order's own key, and the branch above
  -- never saw it: the booking moved to Saturday while the person stayed held
  -- on Thursday, and the screen had just promised the opposite.
  --
  -- Moving the hold IS the busy check. `talent_holds_firm_no_overlap` is an
  -- exclusion constraint, so an UPDATE into a window another firm hold of the
  -- same person already covers raises exclusion_violation, which the handler
  -- below turns into `slot_taken` with `v_failed_talent` set, and the desk
  -- names who is busy. The row's own old window is not in its way: the
  -- constraint checks the new tuple against the live ones, and the old tuple
  -- dies in this same statement.
  --
  -- AFTER THE CAPACITY LEGS ON PURPOSE. When both the room and the person are
  -- taken at the destination, the refusal names the ROOM: it is the shared,
  -- scarcer thing, and "Room A is full at that time" is the sentence the
  -- operator can act on by picking another room or time. A booking that takes
  -- no room (a plain massage) still names the person, because there is no
  -- room leg to refuse first. The order changes only which true refusal is
  -- reported; nothing is written before all legs pass, and the block rolls
  -- back on any raise.
  --
  -- WINDOW RULE COPIED FROM THE CAPACITY LEGS ABOVE. A hold whose window was
  -- the booking's own window takes the new one; a hold that was wider (a
  -- buffered one, travel and setup either side) SHIFTS by the same delta and
  -- keeps its own length, so a move never silently edits somebody's buffer.
  IF v_booking.order_id IS NOT NULL THEN
    FOR v_hold IN
      SELECT th.*
        FROM public.talent_holds th
       WHERE th.tenant_id = p_tenant_id
         AND th.operation_key = 'order:' || v_booking.order_id::text || ':reserve'
         AND th.hold_strength = 'firm'
       ORDER BY th.talent_profile_id, th.id
         FOR UPDATE
    LOOP
      v_failed_talent := v_hold.talent_profile_id;

      IF v_prev_starts IS NULL
         OR (v_hold.starts_at = v_prev_starts AND v_hold.ends_at IS NOT DISTINCT FROM v_prev_ends)
      THEN
        v_hold_start := p_starts_at;
        v_hold_end   := p_ends_at;
      ELSE
        v_shift      := p_starts_at - v_prev_starts;
        v_hold_start := v_hold.starts_at + v_shift;
        v_hold_end   := v_hold.ends_at + v_shift;
      END IF;

      UPDATE public.talent_holds
         SET starts_at = v_hold_start,
             ends_at   = v_hold_end
       WHERE id = v_hold.id
         AND tenant_id = p_tenant_id;

      v_moved_holds := v_moved_holds + 1;
    END LOOP;
    v_failed_talent := NULL;
  END IF;

  -- ── the parent, with the EXPLICIT end ────────────────────────────────────
  -- Written LAST and from the same p_ends_at the mirrors took, so the parent
  -- row and its mirrors cannot disagree about when the job ends.
  UPDATE public.agency_bookings
     SET starts_at = p_starts_at,
         ends_at   = p_ends_at,
         updated_at = now()
   WHERE id = p_booking_id
     AND tenant_id = p_tenant_id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'operation_key', p_operation_key,
    'previous_starts_at', v_prev_starts,
    'previous_ends_at', v_prev_ends,
    'starts_at', p_starts_at,
    'ends_at', p_ends_at,
    'moved_talent_bookings', v_moved_talent,
    'moved_holds', v_moved_holds,
    'moved_allocations', v_moved_alloc);

EXCEPTION
  -- Custom codes first: WHEN OTHERS would otherwise swallow them.
  WHEN SQLSTATE 'RS004' OR SQLSTATE 'RS005' OR SQLSTATE 'RS006' THEN
    GET STACKED DIAGNOSTICS v_reason = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
    RETURN jsonb_build_object('ok', false, 'reason', v_reason,
                              'failed_pool_id', NULLIF(v_detail, ''),
                              'failed_talent_id', NULL);
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken',
                              'failed_pool_id', NULL,
                              'failed_talent_id', v_failed_talent);
  WHEN deadlock_detected OR serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadlock',
                              'failed_pool_id', NULL,
                              'failed_talent_id', v_failed_talent);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable',
                              'failed_pool_id', NULL,
                              'failed_talent_id', v_failed_talent,
                              'error', SQLERRM);
END;
$$;

