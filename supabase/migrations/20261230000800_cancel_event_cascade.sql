-- Cancel an event, and mean it: `cancel_event_cascade`.
--
-- THE DEFECT THIS CLOSES. `setEventStatusRow` wrote `events.status =
-- 'cancelled'` and stopped. Everything downstream kept working, because
-- nothing downstream reads that column:
--
--   * `sessions.status` stayed 'scheduled', so the cancelled night stayed in
--     the public listing (its anon RLS policy is `USING (status =
--     'scheduled')`) and in every "what's on" read.
--   * The `session_tier` capacity pools stayed `is_active`, so the purchase
--     path went on selling tickets to a show that is not happening.
--   * `admissions.status` stayed 'valid', so the door went on admitting.
--   * Nobody was refunded, and no record existed saying anybody should be.
--
-- A cancellation that only a status badge can see is not a cancellation. The
-- four writes above are the cancellation; the flag is a label on it.
--
--
-- WHY ONE FUNCTION AND NOT FIVE STATEMENTS IN THE CALLER
-- ═════════════════════════════════════════════════════
-- These steps are not independent. Deactivating pools without cancelling
-- sessions leaves a listed night nobody can buy into; voiding admissions
-- without recording refund intents takes people's entry away while keeping
-- their money. A caller doing five awaits can fail after the third, and the
-- resulting state has no name and no repair path. Here they share a
-- transaction and a row lock: all of it, or none of it.
--
-- IDEMPOTENT BY CONSTRUCTION, not by a flag. Every write is predicated on the
-- state it changes (`status = 'scheduled'`, `is_active`, `status = 'valid'`,
-- `ON CONFLICT DO NOTHING`), so a second call moves zero rows and returns
-- zeroes rather than double-voiding or double-refunding. This matters because
-- the caller is a button a worried person will press twice.
--
--
-- WHY REFUNDS ARE INTENTS AND NOT REFUNDS
-- ═══════════════════════════════════════
-- `ticket_refund_intents` already exists for precisely this shape and its
-- header argues the case: a refund's worst outcome is `partial_failure` with
-- money moved, and that must land somewhere inspectable and retryable rather
-- than inside a request that returns `ok`. Moving money inside a transaction
-- that also cancels an event would be worse still — Postgres can roll back the
-- row, Stripe cannot roll back the charge. So this records WHO IS OWED, the
-- existing cron pays them, and the existing claim-before-execute guard stops
-- the double refund. The only change the table needs is a second `reason`.
--
-- The refund is deliberately NOT conditioned on the event's refund cutoff.
-- `refundDecision` already rules on this: a cancelled show refunds regardless,
-- because the cutoff protects a venue against a late change of mind by the
-- BUYER and was never meant to let a venue keep the money for a night it
-- decided not to hold.
--
--
-- WHAT THIS DOES NOT TOUCH
-- ════════════════════════
-- `capacity_allocations`. Releasing them here would double-handle: the refund
-- executor releases by line, and a release recorded twice loses which line
-- freed which units — the attribution `capacity_allocations.order_line_id`
-- exists to keep. Deactivating the pool already stops new sales, which is the
-- only thing the cancellation itself has to guarantee.

BEGIN;

-- ─── 1. A second reason for an intent ───────────────────────────────────────
--
-- The CHECK is replaced rather than dropped: an unconstrained `reason` would
-- let a typo'd string sit in the table and never be executed by a cron that
-- filters on nothing, which is a refund that silently never happens.

ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_reason_check;

ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_reason_check
  CHECK (reason IN ('seat_lost_after_payment', 'event_cancelled'));

COMMENT ON COLUMN public.ticket_refund_intents.reason IS
  'seat_lost_after_payment: the hold lapsed between payment and settlement. '
  'event_cancelled: the venue cancelled the show, so every paid line is owed its money back '
  'regardless of the refund cutoff (the cutoff binds the buyer, not the venue).';

-- ─── 2. The cascade ─────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.cancel_event_cascade(
  p_tenant_id uuid,
  p_event_id  uuid,
  p_actor     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event      public.events%ROWTYPE;
  v_sessions   uuid[];
  v_cancelled  int := 0;
  v_pools      int := 0;
  v_voided     int := 0;
  v_intents    int := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_event_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- The lock is what makes "cancel" and "sell one more ticket" serialise. The
  -- tenant predicate is on the lock itself, not checked afterwards: a row from
  -- another workspace is never locked and never seen.
  SELECT * INTO v_event
    FROM public.events
   WHERE id = p_event_id AND tenant_id = p_tenant_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_event');
  END IF;

  -- Already cancelled is SUCCESS with zero deltas, not a refusal. The second
  -- press of the button must not read as an error to a person who is already
  -- having a bad evening, and every write below is a no-op anyway.
  IF v_event.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', true, 'alreadyCancelled', true,
      'sessionsCancelled', 0, 'poolsDeactivated', 0,
      'admissionsVoided', 0, 'refundIntents', 0
    );
  END IF;

  -- Every session of the event, cancelled or not: the pool and admission
  -- sweeps below must cover a session somebody cancelled by hand yesterday,
  -- whose pool is therefore still live.
  SELECT COALESCE(array_agg(id), '{}'::uuid[]) INTO v_sessions
    FROM public.sessions
   WHERE event_id = p_event_id AND tenant_id = p_tenant_id;

  UPDATE public.events
     SET status = 'cancelled', updated_at = now()
   WHERE id = p_event_id AND tenant_id = p_tenant_id;

  IF array_length(v_sessions, 1) IS NOT NULL THEN
    -- Only 'scheduled' moves. 'completed' is a night that HAPPENED, and
    -- rewriting it to 'cancelled' would erase the fact that people attended.
    UPDATE public.sessions
       SET status = 'cancelled', updated_at = now()
     WHERE id = ANY (v_sessions) AND tenant_id = p_tenant_id AND status = 'scheduled';
    GET DIAGNOSTICS v_cancelled = ROW_COUNT;

    -- Stop the till. This is the write that actually prevents a sale; the
    -- status flags above only stop surfaces that remember to read them.
    UPDATE public.capacity_pools
       SET is_active = false, updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND subject_kind = 'session_tier'
       AND subject_id = ANY (v_sessions)
       AND is_active;
    GET DIAGNOSTICS v_pools = ROW_COUNT;

    -- Stop the door. 'void' and not 'refunded': `refunded` is a denormalisation
    -- of a fact `order_lines` owns and refund-by-line is its SOLE writer, so
    -- stamping it here would put the door's answer out of step with the money.
    -- The executor stamps `refunded` when the money actually moves.
    UPDATE public.admissions
       SET status = 'void', updated_at = now()
     WHERE tenant_id = p_tenant_id
       AND session_id = ANY (v_sessions)
       AND status = 'valid';
    GET DIAGNOSTICS v_voided = ROW_COUNT;

    -- Who is owed. Paid and fulfilled only: a pending_payment order has taken
    -- no money to give back, and a refunded one has already had it.
    -- `total_cents > 0` because a comp line owes nothing and an intent for it
    -- would occupy the executor and log a refusal every run.
    INSERT INTO public.ticket_refund_intents (tenant_id, order_id, order_line_id, reason)
    SELECT ol.tenant_id, ol.order_id, ol.id, 'event_cancelled'
      FROM public.order_lines ol
      JOIN public.orders o ON o.id = ol.order_id
     WHERE ol.tenant_id = p_tenant_id
       AND ol.session_id = ANY (v_sessions)
       AND o.status IN ('paid', 'fulfilled')
       AND ol.total_cents > ol.refunded_cents
    ON CONFLICT (order_line_id) DO NOTHING;
    GET DIAGNOSTICS v_intents = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'alreadyCancelled', false,
    'sessionsCancelled', v_cancelled,
    'poolsDeactivated', v_pools,
    'admissionsVoided', v_voided,
    'refundIntents', v_intents,
    'actor', p_actor
  );
END;
$$;

-- Service-role only, for the reason `check_in` is: the function takes a tenant
-- id as an ARGUMENT, so granting it to `authenticated` would let any signed-in
-- user cancel any workspace's event by changing one uuid. The caller
-- authenticates the staff member and passes the tenant it resolved from the
-- session, never one the client sent.
REVOKE ALL ON FUNCTION public.cancel_event_cascade(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.cancel_event_cascade(uuid, uuid, uuid) IS
  'Cancel an event and everything that depends on it, atomically: sessions to cancelled, session_tier '
  'pools deactivated, valid admissions voided, and a refund intent per unrefunded paid line. Idempotent '
  '— every write is predicated on the state it changes. Service-role EXECUTE only: it takes the tenant '
  'as an argument and does not authenticate the caller.';

COMMIT;
