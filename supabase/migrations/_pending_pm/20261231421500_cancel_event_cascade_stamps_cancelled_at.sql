-- HELD MIGRATION (EVE-D01, TUL-1429): cancelling a published event always failed.
--
-- THE DEFECT. `cancel_event_cascade` (20261230000800) wrote
--   UPDATE public.events SET status = 'cancelled', updated_at = now() ...
-- without `cancelled_at`. `events_cancelled_stamp` (20261229000361) is
--   CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL))
-- so the UPDATE raised 23514 for EVERY event, the function aborted, and
-- `cancelEventRow` (web/src/lib/events/writers.ts) returned "Could not cancel
-- the event." No trigger stamps the column and no later migration redefines
-- the function, so 20261230000800 is the effective body in production.
--
-- THE FIX. One column: `cancelled_at = now()` in the SAME UPDATE as the
-- status. Everything else below is the 20261230000800 definition copied
-- verbatim: same lock, same idempotence, same sweeps, same refund intents,
-- same grants. No other behaviour changes.
--
-- ORDER OF SHIPPING. Code-first compatible. The caller only calls the RPC and
-- reads { ok, reason, counts }; it behaves identically before and after this
-- runs (before: every cancel returns "Could not cancel the event."; after:
-- cancels succeed). CREATE OR REPLACE keeps the signature, so grants carry
-- over (the REVOKE is repeated, as in the original).
--
-- MONEY NOTE. Once this applies, a successful cancel creates one
-- `ticket_refund_intents` row (reason 'event_cancelled') per paid, unrefunded
-- line of the event's sessions; the existing refund cron pays them.
--
-- NEEDS Production Migration Manager + Oran's OK. NOT APPLIED.
-- ROLLBACK: re-run the function body of 20261230000800 (CREATE OR REPLACE
-- restores the previous, failing definition). This file changes no data.

BEGIN;

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

  -- events_cancelled_stamp: (status = 'cancelled') = (cancelled_at IS NOT NULL).
  -- The stamp must ride in the SAME statement as the status.
  UPDATE public.events
     SET status = 'cancelled', cancelled_at = now(), updated_at = now()
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

-- ── Executable proof ────────────────────────────────────────────────────────
-- Runs inside this transaction and deletes everything it created before
-- COMMIT. Cancels a published event that has one paid admission and asserts
-- the status, the stamp, the void, and one refund intent. DB-backed: it runs
-- when this file is applied or replayed, never in the node test lane.
DO $proof$
DECLARE
  v_tenant  uuid;
  v_event   uuid;
  v_session uuid;
  v_order   uuid;
  v_line    uuid;
  v_adm     uuid;
  v_result  jsonb;
  v_starts  timestamptz := now() + interval '7 days';
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('eve-d01-proof-' || substr(gen_random_uuid()::text, 1, 8), 'EVE-D01 Proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.events (tenant_id, slug, title, status, published_at)
  VALUES (v_tenant, 'eve-d01-proof', 'Proof show', 'published', now())
  RETURNING id INTO v_event;

  INSERT INTO public.sessions (tenant_id, event_id, title, starts_at, ends_at, status)
  VALUES (v_tenant, v_event, 'Proof night', v_starts, v_starts + interval '2 hours', 'scheduled')
  RETURNING id INTO v_session;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, receipt_code, session_id
  ) VALUES (
    v_tenant, 'paid', 'USD', 5000, 0, 0, 5000, 'eve_d01_proof',
    'eve-d01-' || gen_random_uuid()::text, 'evd' || replace(gen_random_uuid()::text, '-', ''), v_session
  ) RETURNING id INTO v_order;

  -- order_lines_payee_xor wants exactly one of talent_profile_id /
  -- owner_tenant_id: a workspace-owned line is paid to the workspace.
  INSERT INTO public.order_lines (
    tenant_id, order_id, session_id, owner_tenant_id, label, units, unit_cents, total_cents
  ) VALUES (v_tenant, v_order, v_session, v_tenant, 'Proof ticket', 1, 5000, 5000)
  RETURNING id INTO v_line;

  INSERT INTO public.admissions (
    tenant_id, order_line_id, session_id, holder_name, starts_at, status, party_size, token_version
  ) VALUES (v_tenant, v_line, v_session, 'Proof Holder', v_starts, 'valid', 1, 1)
  RETURNING id INTO v_adm;

  v_result := public.cancel_event_cascade(v_tenant, v_event, NULL);
  IF (v_result->>'ok')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'cancel_event_cascade refused: %', v_result;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.events
     WHERE id = v_event AND status = 'cancelled' AND cancelled_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'event is not cancelled with a cancelled_at stamp';
  END IF;
  IF (SELECT status FROM public.admissions WHERE id = v_adm) <> 'void' THEN
    RAISE EXCEPTION 'the paid admission was not voided';
  END IF;
  IF (SELECT status FROM public.sessions WHERE id = v_session) <> 'cancelled' THEN
    RAISE EXCEPTION 'the session was not cancelled';
  END IF;
  IF (SELECT count(*) FROM public.ticket_refund_intents
       WHERE order_line_id = v_line AND reason = 'event_cancelled') <> 1 THEN
    RAISE EXCEPTION 'expected exactly one event_cancelled refund intent for the paid line';
  END IF;
  IF (v_result->>'refundIntents')::int <> 1 OR (v_result->>'admissionsVoided')::int <> 1 THEN
    RAISE EXCEPTION 'unexpected counts: %', v_result;
  END IF;

  -- The second press is a success with zero deltas.
  v_result := public.cancel_event_cascade(v_tenant, v_event, NULL);
  IF (v_result->>'alreadyCancelled')::boolean IS NOT TRUE OR (v_result->>'refundIntents')::int <> 0 THEN
    RAISE EXCEPTION 'second cancel was not an idempotent no-op: %', v_result;
  END IF;

  -- Cleanup: nothing this block created survives (cascades from the agency).
  DELETE FROM public.agencies WHERE id = v_tenant;

  RAISE NOTICE 'eve-d01 cancel_event_cascade proof passed';
END
$proof$;

COMMIT;
