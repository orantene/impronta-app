-- 20261231010200_reschedule_booking_set.sql — T1-02, moving a booking moves all of it.
--
-- THE DEFECT THIS CLOSES. `reschedule-booking.ts` issued four separate
-- PostgREST requests: place holds, update `agency_bookings`, update each
-- `talent_bookings` mirror, drop the holds. Four requests are four
-- transactions. A failure on the third left the agency row moved and the
-- talent mirror where it was, and the compensating "roll the agency row back"
-- write is itself a request that can fail. The same code defaulted a missing
-- end to start + 1h when it placed the hold and when it moved the mirror, but
-- wrote `input.newEndsAt ?? null` onto the parent — so the parent row and its
-- own mirror disagreed about when the job ends, by design. And nothing moved
-- the capacity allocations at all: a booking moved to Tuesday still held
-- Monday's room and Monday's slot.
--
-- One transaction fixes all three. The window arrives ALREADY RESOLVED from
-- the caller — this function never defaults an end — so the parent, the
-- mirrors and the allocations are written from one value that cannot drift.
--
--
-- WHY THE GUARD HOLD, WHEN talent_bookings ALREADY HAS AN EXCLUSION
-- ════════════════════════════════════════════════════════════════
-- `talent_bookings_no_overlap` fires only WHERE status IN ('confirmed',
-- 'completed'). A firm hold on `talent_holds` — somebody mid-way through
-- booking that person — is invisible to it. So the move takes the destination
-- on `talent_holds` FIRST, over the BUFFERED window (travel, setup, the table
-- turn), and only then rewrites the mirror. The exclusion index IS the lock:
-- a concurrent inserter of an overlapping firm hold blocks on our uncommitted
-- row and then fails, rather than racing us to the same minute.
--
-- The guard is deleted before this function returns, inside the same
-- transaction, so it never exists for any reader. It is a lock with a row
-- shape, not a hold anybody has to reap.
--
-- The inquiry's OWN firm hold is deleted first. Without that, the booking
-- would collide with the hold it converted from and refuse to move itself.
--
--
-- WHY THE CAPACITY MOVE RE-COUNTS WITH ITSELF EXCLUDED
-- ═══════════════════════════════════════════════════
-- Moving an allocation forward by twenty minutes overlaps its own old window.
-- Counting it against the pool would make every small move sold_out against
-- units the mover already holds. `al.id <> v_alloc.id` is the whole fix, and
-- it is safe precisely because the row is being rewritten in this same
-- transaction: nobody else can see the old window once we commit.
--
-- LOCK ORDER IS COPIED, NOT INVENTED. `_capacity_reserve_locked`
-- (20261229000200) walks `unnest(pool_path) WITH ORDINALITY … ORDER BY ord
-- FOR UPDATE OF p`, which is root-first. A reschedule that locked leaf-first
-- would deadlock against every concurrent reserve on the same room. The loop
-- below is that loop.
--
--
-- WHY THE ALLOCATION KEEPS ITS OWN DURATION
-- ═════════════════════════════════════════
-- An allocation's window is not always the booking's window: a table's window
-- is the turn time, a class seat's is the session's. So an allocation whose
-- window matched the booking's old window exactly takes the booking's new
-- window; every other allocation SHIFTS by the same delta and keeps its own
-- length. Rewriting a table's turnaround because a job got an hour longer
-- would be this function silently editing Reservations' rules.
--
-- Timeless allocations (`starts_at IS NULL`) are stock, not slots. They have
-- no window to move and are left alone.
--
--
-- WHAT p_operation_key IS AND IS NOT
-- ══════════════════════════════════
-- It is NOT stored. Idempotency here is structural: a retry of the same intent
-- finds the booking already at the requested window and gets `ok` with
-- `already` true, which is the correct answer whether or not anybody
-- remembers the key. The key is required (blank is a caller bug) and echoed,
-- so the caller's audit line and this write carry one id. It is deliberately
-- NOT written to `talent_holds.operation_key`: that column belongs to another
-- migration on this candidate branch, and a function that writes a column its
-- own migration does not create fails wherever the two land out of order.
--
-- TIMESTAMP. The filenames here are a future-dated local sequence, not wall
-- clock. The isolated `qa-journeys` ledger head at authoring time was
-- 20261230231539 (another agent's `command_lease_and_fencing`), so a calendar
-- stamp would sort under half the branch. 20261231010200 sorts above it and
-- is keyed to this task (T1-02) so no sibling agent picks it.
--
-- Apply to the isolated branch with `npm run journeys:repair -- <this file>`.
-- Never `db push`.

BEGIN;

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

REVOKE ALL ON FUNCTION public.reschedule_booking_set(
  uuid, uuid, text, uuid, timestamptz, timestamptz, integer, integer, timestamptz, timestamptz
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.reschedule_booking_set(
  uuid, uuid, text, uuid, timestamptz, timestamptz, integer, integer, timestamptz, timestamptz
) TO service_role;

COMMENT ON FUNCTION public.reschedule_booking_set(
  uuid, uuid, text, uuid, timestamptz, timestamptz, integer, integer, timestamptz, timestamptz
) IS
  'T1-02: move an agency booking, its talent mirrors and its capacity allocations in ONE transaction, '
  'or move none of them. Guard hold over the buffered window takes the destination before a mirror moves; '
  'the capacity re-count excludes the moving allocation from its own total. '
  'Refuses not_found / wrong_tenant / not_reschedulable / conflict / invalid / slot_taken / sold_out / '
  'ancestor_full / deadlock; returns already=true when the booking is at the requested window.';

DO $check$
BEGIN
  IF has_function_privilege('anon',
       'public.reschedule_booking_set(uuid,uuid,text,uuid,timestamptz,timestamptz,integer,integer,timestamptz,timestamptz)',
       'EXECUTE')
     OR has_function_privilege('authenticated',
       'public.reschedule_booking_set(uuid,uuid,text,uuid,timestamptz,timestamptz,integer,integer,timestamptz,timestamptz)',
       'EXECUTE') THEN
    RAISE EXCEPTION 'reschedule_booking_set is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMIT;
