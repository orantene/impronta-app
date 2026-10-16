-- Promos v1 · PR1b (TUL-941): the redemption state machine, in the database.
--
-- held -> confirmed | released ; confirmed -> no_show | released | voided.
--
-- WHY PLPGSQL AND NOT TS: "first 3 clients" is a contended resource. The last
-- seat is decided by counting and inserting in ONE transaction while holding
-- the promo row lock, the same discipline as redeem_tenant_promo
-- (20261229000243). Counting in Node then inserting lets two buyers both see
-- "1 left" and both take it.
--
-- WHAT COUNTS: confirmed and no_show (L1: a no-show seat stays consumed), plus held rows whose hold has NOT expired. An expired
-- hold frees its seat the moment it expires, not when the sweeper gets to it,
-- so a slow cron can never make a promo look sold out.
--
-- Every function returns jsonb {ok, reason, ...} and never raises for an
-- ordinary refusal. Every one is idempotent: repeating a transition that
-- already happened returns {ok:true, already:true}.
--
-- SECURITY DEFINER, so EXECUTE is revoked from PUBLIC, anon AND authenticated
-- (Supabase grants the named roles explicitly; FROM PUBLIC alone leaves them)
-- and granted to service_role only. Asserted at the bottom.

BEGIN;

-- ── hold ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.promo_hold(
  p_code_id        uuid,
  p_customer_id    uuid,
  p_order_id       uuid,
  p_booking_id     uuid,
  p_line_id        uuid,
  p_hold_minutes   integer,
  p_amount_cents   bigint,
  p_is_price_promo boolean,
  p_source         text,
  p_client_status  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code      public.tenant_promo_codes%ROWTYPE;
  v_existing  public.tenant_promo_redemptions%ROWTYPE;
  v_total     integer;
  v_for_cust  integer;
  v_expires   timestamptz;
  v_id        uuid;
BEGIN
  -- 10 min (instant) up to 24h (request-to-book). Anything else is a bug.
  IF p_hold_minutes IS NULL OR p_hold_minutes < 1 OR p_hold_minutes > 1440
     OR p_amount_cents IS NULL OR p_amount_cents < 0
     OR (p_order_id IS NULL AND p_booking_id IS NULL) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- No anonymous holds: there would be no one to apply the per-client cap to.
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_required');
  END IF;

  -- THE LOCK IS THE POINT: every concurrent holder of this promo queues here,
  -- so the counts below cannot change between the check and the insert.
  SELECT * INTO v_code
    FROM public.tenant_promo_codes
   WHERE id = p_code_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;

  IF NOT v_code.is_active OR v_code.is_paused OR v_code.is_draft OR v_code.archived_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  IF (v_code.starts_at IS NOT NULL AND now() < v_code.starts_at)
     OR (v_code.ends_at IS NOT NULL AND now() >= v_code.ends_at) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_window');
  END IF;

  -- A personal promo belongs to one customer; anyone else is refused.
  IF v_code.customer_id IS NOT NULL AND v_code.customer_id <> p_customer_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_your_promo');
  END IF;

  v_expires := now() + make_interval(mins => p_hold_minutes);

  -- Same order again: a retry, or a re-hold after the old one lapsed. The
  -- (promo_code_id, order_id) unique index means a lapsed row must be REUSED,
  -- not inserted beside.
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.tenant_promo_redemptions
     WHERE promo_code_id = p_code_id AND order_id = p_order_id
     FOR UPDATE;
    IF FOUND THEN
      IF v_existing.status = 'confirmed'
         OR (v_existing.status = 'held' AND (v_existing.hold_expires_at IS NULL OR v_existing.hold_expires_at > now())) THEN
        RETURN jsonb_build_object('ok', true, 'already', true, 'redemption_id', v_existing.id,
                                  'status', v_existing.status, 'hold_expires_at', v_existing.hold_expires_at);
      END IF;
      IF v_existing.status NOT IN ('released', 'held') THEN
        -- voided / no_show rows are history; this order cannot reuse the code.
        RETURN jsonb_build_object('ok', false, 'reason', 'not_reusable');
      END IF;
    END IF;
  END IF;

  -- Expired holds excluded: status='held' AND hold_expires_at > now().
  SELECT count(*) INTO v_total
    FROM public.tenant_promo_redemptions r
   WHERE r.promo_code_id = p_code_id
     AND (r.status IN ('confirmed', 'no_show')
          OR (r.status = 'held' AND (r.hold_expires_at IS NULL OR r.hold_expires_at > now())));

  IF v_code.max_redemptions IS NOT NULL AND v_total >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  -- Max 1 active hold per client per promo, whatever per_customer_limit says.
  IF EXISTS (
    SELECT 1 FROM public.tenant_promo_redemptions r
     WHERE r.promo_code_id = p_code_id
       AND r.customer_id = p_customer_id
       AND r.status = 'held' AND (r.hold_expires_at IS NULL OR r.hold_expires_at > now())
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'hold_exists');
  END IF;

  SELECT count(*) INTO v_for_cust
    FROM public.tenant_promo_redemptions r
   WHERE r.promo_code_id = p_code_id
     AND r.customer_id = p_customer_id
     AND (r.status IN ('confirmed', 'no_show')
          OR (r.status = 'held' AND (r.hold_expires_at IS NULL OR r.hold_expires_at > now())));

  IF v_for_cust >= v_code.per_customer_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_limit_reached');
  END IF;

  BEGIN
    IF v_existing.id IS NOT NULL THEN
      UPDATE public.tenant_promo_redemptions
         SET status = 'held', hold_expires_at = v_expires, customer_id = p_customer_id,
             booking_id = p_booking_id, line_id = p_line_id, amount_cents = p_amount_cents,
             is_price_promo = COALESCE(p_is_price_promo, true), source = p_source,
             client_status = p_client_status, voided_at = NULL
       WHERE id = v_existing.id
      RETURNING id INTO v_id;
    ELSE
      INSERT INTO public.tenant_promo_redemptions
        (promo_code_id, order_id, booking_id, line_id, customer_id, amount_cents,
         is_price_promo, source, client_status, status, hold_expires_at)
      VALUES
        (p_code_id, p_order_id, p_booking_id, p_line_id, p_customer_id, p_amount_cents,
         COALESCE(p_is_price_promo, true), p_source, p_client_status, 'held', v_expires)
      RETURNING id INTO v_id;
    END IF;
  EXCEPTION WHEN unique_violation THEN
    -- Another live price promo already sits on this line / order / booking.
    RETURN jsonb_build_object('ok', false, 'reason', 'line_taken');
  END;

  RETURN jsonb_build_object('ok', true, 'already', false, 'redemption_id', v_id,
                            'status', 'held', 'hold_expires_at', v_expires);
END;
$$;

-- ── confirm: held -> confirmed, with the snapshots reports read ────────────

CREATE OR REPLACE FUNCTION public.promo_confirm(
  p_redemption_id  uuid,
  p_list_cents     bigint,
  p_discount_cents bigint,
  p_currency       text,
  p_source_channel text,
  p_client_status  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code_id uuid;
  v_code    public.tenant_promo_codes%ROWTYPE;
  v_row     public.tenant_promo_redemptions%ROWTYPE;
  v_total   integer;
BEGIN
  IF p_list_cents IS NULL OR p_list_cents < 0 OR p_discount_cents IS NULL OR p_discount_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT promo_code_id INTO v_code_id FROM public.tenant_promo_redemptions WHERE id = p_redemption_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_redemption');
  END IF;

  -- Promo lock first, then the row: the same order promo_hold takes them in,
  -- so a confirm and a hold can never deadlock each other.
  SELECT * INTO v_code FROM public.tenant_promo_codes WHERE id = v_code_id FOR UPDATE;
  SELECT * INTO v_row FROM public.tenant_promo_redemptions WHERE id = p_redemption_id FOR UPDATE;

  IF v_row.status = 'confirmed' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status <> 'held' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_held');
  END IF;

  -- Paid after the hold lapsed (slow 3DS, say). Honour it only if the seat is
  -- still free; otherwise the caller refunds. Counted under the promo lock.
  IF v_row.hold_expires_at IS NOT NULL AND v_row.hold_expires_at <= now()
     AND v_code.max_redemptions IS NOT NULL THEN
    SELECT count(*) INTO v_total
      FROM public.tenant_promo_redemptions r
     WHERE r.promo_code_id = v_code_id
       AND r.id <> p_redemption_id
       AND (r.status IN ('confirmed', 'no_show')
            OR (r.status = 'held' AND (r.hold_expires_at IS NULL OR r.hold_expires_at > now())));
    IF v_total >= v_code.max_redemptions THEN
      UPDATE public.tenant_promo_redemptions SET status = 'released' WHERE id = p_redemption_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'hold_expired');
    END IF;
  END IF;

  UPDATE public.tenant_promo_redemptions
     SET status = 'confirmed',
         hold_expires_at = NULL,
         list_cents = p_list_cents,
         discount_cents = p_discount_cents,
         amount_cents = p_discount_cents,
         currency = p_currency,
         source_channel = p_source_channel,
         client_status = COALESCE(p_client_status, client_status)
   WHERE id = p_redemption_id;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- ── release: held -> released; confirmed -> released only when allowed ─────
-- (client cancel inside the free window, "Libera tu lugar" >= 4h, talent
-- cancel). TS policy decides WHEN; this only enforces the legal transitions.

CREATE OR REPLACE FUNCTION public.promo_release(
  p_redemption_id   uuid,
  p_from_confirmed  boolean
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tenant_promo_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.tenant_promo_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_redemption');
  END IF;
  IF v_row.status = 'released' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status = 'held' OR (v_row.status = 'confirmed' AND COALESCE(p_from_confirmed, false)) THEN
    UPDATE public.tenant_promo_redemptions SET status = 'released', hold_expires_at = NULL
     WHERE id = p_redemption_id;
    RETURN jsonb_build_object('ok', true, 'already', false);
  END IF;
  RETURN jsonb_build_object('ok', false, 'reason', 'bad_transition');
END;
$$;

-- ── no_show: confirmed -> no_show. L1: the seat stays CONSUMED, never returned,
-- or a no-show could game the counter. So every limit count in this file treats
-- no_show as taken (confirmed, no_show, live held). redeem_tenant_promo and the
-- TS LIMIT_STATUSES (PR1a) do not yet; aligning them is a follow-up. ─────────

CREATE OR REPLACE FUNCTION public.promo_no_show(p_redemption_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tenant_promo_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.tenant_promo_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_redemption');
  END IF;
  IF v_row.status = 'no_show' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status <> 'confirmed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_transition');
  END IF;
  UPDATE public.tenant_promo_redemptions SET status = 'no_show' WHERE id = p_redemption_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- ── void: full refund. Row kept for the audit trail. ───────────────────────

CREATE OR REPLACE FUNCTION public.promo_void(p_redemption_id uuid) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.tenant_promo_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.tenant_promo_redemptions WHERE id = p_redemption_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_redemption');
  END IF;
  IF v_row.status = 'voided' THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;
  IF v_row.status NOT IN ('held', 'confirmed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_transition');
  END IF;
  UPDATE public.tenant_promo_redemptions
     SET status = 'voided', voided_at = now(), hold_expires_at = NULL
   WHERE id = p_redemption_id;
  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

-- ── sweep: expired holds -> released. Correctness never depends on it (the
-- counts already ignore expired holds); it keeps the table honest for reports.

CREATE OR REPLACE FUNCTION public.promo_sweep_expired_holds(p_limit integer) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  WITH due AS (
    SELECT id FROM public.tenant_promo_redemptions
     WHERE status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= now()
     ORDER BY hold_expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000))
     -- SKIP LOCKED: a hold being confirmed right now is left to its confirm.
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.tenant_promo_redemptions r
     SET status = 'released', hold_expires_at = NULL
    FROM due WHERE r.id = due.id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'released', v_n);
END;
$$;

-- ── grants ─────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.promo_hold(uuid, uuid, uuid, uuid, uuid, integer, bigint, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_confirm(uuid, bigint, bigint, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_release(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_no_show(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_void(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.promo_sweep_expired_holds(integer) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.promo_hold(uuid, uuid, uuid, uuid, uuid, integer, bigint, boolean, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_confirm(uuid, bigint, bigint, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_release(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_no_show(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_void(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.promo_sweep_expired_holds(integer) TO service_role;

-- Assert the REVOKE took. A silently failed revoke on a DEFINER function is an
-- anon write path into redemptions, and it is invisible without this.
DO $check$
DECLARE
  f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.promo_hold(uuid,uuid,uuid,uuid,uuid,integer,bigint,boolean,text,text)',
    'public.promo_confirm(uuid,bigint,bigint,text,text,text)',
    'public.promo_release(uuid,boolean)',
    'public.promo_no_show(uuid)',
    'public.promo_void(uuid)',
    'public.promo_sweep_expired_holds(integer)'
  ] LOOP
    IF has_function_privilege('anon', f, 'EXECUTE')
       OR has_function_privilege('authenticated', f, 'EXECUTE') THEN
      RAISE EXCEPTION '% is executable by anon/authenticated; the REVOKE did not take', f;
    END IF;
    IF NOT has_function_privilege('service_role', f, 'EXECUTE') THEN
      RAISE EXCEPTION '% is not executable by service_role', f;
    END IF;
  END LOOP;
END
$check$;



-- ── redeem_tenant_promo counts the same set as promo_hold ─────────────────
-- A no-show keeps its slot consumed (design L1) and an expired hold frees it,
-- so the legacy redeem path and the hold path cannot disagree on "sold out".
CREATE OR REPLACE FUNCTION public.redeem_tenant_promo(
  p_code_id      UUID,
  p_order_id     UUID,
  p_customer_id  UUID,
  p_amount_cents BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code        public.tenant_promo_codes%ROWTYPE;
  v_total       INTEGER;
  v_for_cust    INTEGER;
BEGIN
  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- THE LOCK IS THE POINT: every concurrent redeemer of this code queues here.
  SELECT * INTO v_code
    FROM public.tenant_promo_codes
   WHERE id = p_code_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_code');
  END IF;

  IF NOT v_code.is_active THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'inactive');
  END IF;

  SELECT count(*) INTO v_total
    FROM public.tenant_promo_redemptions
   WHERE promo_code_id = p_code_id
     AND status IN ('confirmed', 'held', 'no_show')
     AND NOT (status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= now());

  IF v_code.max_redemptions IS NOT NULL AND v_total >= v_code.max_redemptions THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  -- Refused, not treated as unlimited: an anonymous checkout must not be the
  -- way around a one-per-person code. per_customer_limit is NOT NULL, > 0.
  IF p_customer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_required');
  END IF;

  SELECT count(*) INTO v_for_cust
    FROM public.tenant_promo_redemptions
   WHERE promo_code_id = p_code_id
     AND customer_id = p_customer_id
     AND status IN ('confirmed', 'held', 'no_show')
     AND NOT (status = 'held' AND hold_expires_at IS NOT NULL AND hold_expires_at <= now());

  IF v_for_cust >= v_code.per_customer_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'customer_limit_reached');
  END IF;

  INSERT INTO public.tenant_promo_redemptions
    (promo_code_id, order_id, customer_id, amount_cents, status)
  VALUES (p_code_id, p_order_id, p_customer_id, p_amount_cents, 'confirmed')
  ON CONFLICT (promo_code_id, order_id) DO NOTHING;

  -- A swallowed conflict is THIS order redeeming twice: the idempotent retry.
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  RETURN jsonb_build_object('ok', true, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_tenant_promo(UUID, UUID, UUID, BIGINT) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.redeem_tenant_promo(uuid,uuid,uuid,bigint)', 'EXECUTE') THEN
    RAISE EXCEPTION 'redeem_tenant_promo is executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMIT;
