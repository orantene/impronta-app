-- Package 3 task 5: event seat maps, holds, exchange, comp, series, delivery.

BEGIN;

CREATE TABLE IF NOT EXISTS public.event_series (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_series_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 160)
);

CREATE INDEX IF NOT EXISTS event_series_tenant_idx ON public.event_series (tenant_id);

ALTER TABLE public.event_series ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_series FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_series_select_staff ON public.event_series;
CREATE POLICY event_series_select_staff ON public.event_series
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.event_series FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_series TO authenticated;
GRANT ALL ON public.event_series TO service_role;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS event_series_id uuid REFERENCES public.event_series(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS sessions_event_series_idx
  ON public.sessions (event_series_id) WHERE event_series_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.event_seat_maps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  session_id  uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  layout_id   uuid NOT NULL REFERENCES public.space_layouts(id) ON DELETE RESTRICT,
  version     integer NOT NULL DEFAULT 1,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT event_seat_maps_session_uniq UNIQUE (session_id)
);

ALTER TABLE public.event_seat_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_seat_maps FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS event_seat_maps_select_staff ON public.event_seat_maps;
CREATE POLICY event_seat_maps_select_staff ON public.event_seat_maps
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.event_seat_maps FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.event_seat_maps TO authenticated;
GRANT ALL ON public.event_seat_maps TO service_role;

CREATE TABLE IF NOT EXISTS public.admission_holds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  session_id         uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  seat_space_id      uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  guest_session_id   text,
  expires_at         timestamptz NOT NULL,
  order_id           uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  allocation_id      uuid REFERENCES public.capacity_allocations(id) ON DELETE SET NULL,
  status             text NOT NULL DEFAULT 'held',
  version            integer NOT NULL DEFAULT 1,
  operation_key      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admission_holds_status CHECK (status IN ('held', 'released', 'converted')),
  CONSTRAINT admission_holds_key_shape CHECK (operation_key IS NULL OR char_length(btrim(operation_key)) BETWEEN 8 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS admission_holds_live_seat_uniq
  ON public.admission_holds (session_id, seat_space_id) WHERE status = 'held';
CREATE UNIQUE INDEX IF NOT EXISTS admission_holds_operation_key_uniq
  ON public.admission_holds (tenant_id, operation_key, seat_space_id) WHERE operation_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS admission_holds_reap_idx
  ON public.admission_holds (expires_at) WHERE status = 'held';

ALTER TABLE public.admission_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admission_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_holds_select_staff ON public.admission_holds;
CREATE POLICY admission_holds_select_staff ON public.admission_holds
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.admission_holds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.admission_holds TO authenticated;
GRANT ALL ON public.admission_holds TO service_role;

ALTER TABLE public.admissions
  ADD COLUMN IF NOT EXISTS delivery jsonb,
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.ticket_refund_intents
  DROP CONSTRAINT IF EXISTS ticket_refund_intents_reason_check;
ALTER TABLE public.ticket_refund_intents
  ADD CONSTRAINT ticket_refund_intents_reason_check
  CHECK (reason IN ('seat_lost_after_payment', 'event_cancelled', 'session_cancelled', 'admission_exchange'));

CREATE OR REPLACE FUNCTION public.admission_hold_seats(
  p_tenant_id uuid,
  p_session_id uuid,
  p_seat_ids uuid[],
  p_guest_session_id text,
  p_ttl_s integer,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_ttl integer := GREATEST(30, LEAST(COALESCE(p_ttl_s, 180), 3600));
  v_session public.sessions%ROWTYPE;
  v_existing public.admission_holds%ROWTYPE;
  v_seat uuid;
  v_space public.spaces%ROWTYPE;
  v_hold public.admission_holds%ROWTYPE;
  v_pool uuid;
  v_reserve jsonb;
  v_alloc uuid;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_expires timestamptz;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_seat_ids IS NULL
     OR cardinality(p_seat_ids) < 1 OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.admission_holds
   WHERE tenant_id = p_tenant_id AND operation_key = v_key
   LIMIT 1;
  IF FOUND THEN
    IF v_existing.status = 'held' AND v_existing.expires_at > now() THEN
      RETURN jsonb_build_object('ok', true, 'already', true, 'id', v_existing.id, 'expires_at', v_existing.expires_at);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'hold_expired');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_session.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_expires := now() + make_interval(secs => v_ttl);

  FOREACH v_seat IN ARRAY p_seat_ids LOOP
    SELECT * INTO v_space FROM public.spaces WHERE id = v_seat FOR UPDATE;
    IF NOT FOUND OR v_space.tenant_id IS DISTINCT FROM p_tenant_id OR v_space.kind IS DISTINCT FROM 'seat' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;

    SELECT * INTO v_hold
      FROM public.admission_holds
     WHERE session_id = p_session_id AND seat_space_id = v_seat AND status = 'held'
     FOR UPDATE;
    IF FOUND THEN
      IF v_hold.expires_at > now() AND v_hold.guest_session_id IS DISTINCT FROM NULLIF(btrim(COALESCE(p_guest_session_id, '')), '') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
      END IF;
      IF v_hold.expires_at <= now() THEN
        IF v_hold.allocation_id IS NOT NULL THEN
          PERFORM public.release_capacity(ARRAY[v_hold.allocation_id]);
        END IF;
        UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_hold.id;
      ELSIF v_hold.guest_session_id IS NOT DISTINCT FROM NULLIF(btrim(COALESCE(p_guest_session_id, '')), '') THEN
        v_ids := array_append(v_ids, v_hold.id);
        CONTINUE;
      END IF;
    END IF;

    SELECT cp.id INTO v_pool
      FROM public.capacity_pools cp
     WHERE cp.tenant_id = p_tenant_id
       AND cp.subject_kind = 'space'
       AND cp.subject_id = v_seat
     ORDER BY cp.created_at
     LIMIT 1;

    v_alloc := NULL;
    IF v_pool IS NOT NULL THEN
      v_reserve := public.reserve_resource_set_v2(
        p_tenant_id,
        v_key || ':' || v_seat::text,
        NULL,
        v_ttl,
        jsonb_build_array(
          jsonb_build_object(
            'pool_id', v_pool,
            'units', 1,
            'starts_at', v_session.starts_at,
            'ends_at', v_session.ends_at
          )
        ),
        '[]'::jsonb
      );
      IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
      END IF;
      IF jsonb_typeof(v_reserve->'allocation_ids') = 'array'
         AND jsonb_array_length(v_reserve->'allocation_ids') > 0 THEN
        v_alloc := (v_reserve->'allocation_ids'->>0)::uuid;
      END IF;
    END IF;

    BEGIN
      INSERT INTO public.admission_holds (
        tenant_id, session_id, seat_space_id, guest_session_id, expires_at,
        allocation_id, status, operation_key
      ) VALUES (
        p_tenant_id, p_session_id, v_seat, NULLIF(btrim(COALESCE(p_guest_session_id, '')), ''),
        v_expires, v_alloc, 'held', v_key
      )
      RETURNING * INTO v_hold;
    EXCEPTION
      WHEN unique_violation THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'seat_taken');
    END;
    v_ids := array_append(v_ids, v_hold.id);
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'ids', to_jsonb(v_ids), 'expires_at', v_expires, 'id', v_ids[1]);
END;
$$;

CREATE OR REPLACE FUNCTION public.admission_hold_reap(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.admission_holds%ROWTYPE;
  v_n integer := 0;
BEGIN
  FOR v_row IN
    SELECT * FROM public.admission_holds
     WHERE status = 'held' AND expires_at <= now()
     ORDER BY expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
     FOR UPDATE SKIP LOCKED
  LOOP
    IF v_row.allocation_id IS NOT NULL THEN
      PERFORM public.release_capacity(ARRAY[v_row.allocation_id]);
    END IF;
    UPDATE public.admission_holds SET status = 'released', version = version + 1 WHERE id = v_row.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'released', v_n);
END;
$$;

CREATE OR REPLACE FUNCTION public.admission_exchange(
  p_tenant_id uuid,
  p_admission_id uuid,
  p_to_session_id uuid,
  p_operation_key text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_adm public.admissions%ROWTYPE;
  v_to public.sessions%ROWTYPE;
  v_from public.sessions%ROWTYPE;
  v_old_cents bigint := 0;
  v_new_cents bigint := 0;
  v_line uuid;
  v_delta bigint;
BEGIN
  IF p_tenant_id IS NULL OR p_admission_id IS NULL OR p_to_session_id IS NULL OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_adm FROM public.admissions WHERE id = p_admission_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_adm.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF p_expected_version IS NOT NULL AND v_adm.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;
  IF v_adm.session_id IS NOT DISTINCT FROM p_to_session_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'same_session');
  END IF;
  IF v_adm.status IS DISTINCT FROM 'valid' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT * INTO v_to FROM public.sessions WHERE id = p_to_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_adm.session_id IS NOT NULL THEN
    SELECT * INTO v_from FROM public.sessions WHERE id = v_adm.session_id;
  END IF;

  IF v_adm.order_line_id IS NOT NULL THEN
    SELECT total_cents INTO v_old_cents FROM public.order_lines WHERE id = v_adm.order_line_id;
  END IF;
  v_old_cents := COALESCE(v_old_cents, v_adm.door_amount_cents, 0);

  SELECT COALESCE(tov.amount_cents, o.amount_cents, 0) INTO v_new_cents
    FROM public.sessions s
    LEFT JOIN public.talent_offerings o ON o.id = s.offering_id
    LEFT JOIN public.talent_offering_variants tov
      ON tov.offering_id = s.offering_id
   WHERE s.id = p_to_session_id
   ORDER BY tov.sort_order NULLS LAST
   LIMIT 1;
  v_new_cents := COALESCE(v_new_cents, 0);
  v_delta := v_new_cents - v_old_cents;

  UPDATE public.admissions
     SET session_id = p_to_session_id,
         starts_at = v_to.starts_at,
         version = version + 1,
         updated_at = now()
   WHERE id = v_adm.id;

  IF v_delta > 0 AND v_adm.order_line_id IS NOT NULL THEN
    INSERT INTO public.order_lines (
      tenant_id, order_id, offering_id, session_id, label, units, unit_cents, total_cents
    )
    SELECT ol.tenant_id, ol.order_id, ol.offering_id, p_to_session_id,
           'Exchange balance', 1, v_delta, v_delta
      FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id
    RETURNING id INTO v_line;
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'price_up_needs_payment',
      'amount_cents', v_delta, 'line_id', v_line, 'id', v_adm.id
    );
  END IF;

  IF v_delta < 0 AND v_adm.order_line_id IS NOT NULL THEN
    INSERT INTO public.ticket_refund_intents (tenant_id, order_id, order_line_id, reason)
    SELECT ol.tenant_id, ol.order_id, ol.id, 'admission_exchange'
      FROM public.order_lines ol WHERE ol.id = v_adm.order_line_id
    ON CONFLICT (order_line_id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_adm.id, 'delta_cents', v_delta, 'version', v_adm.version + 1);
END;
$$;

CREATE OR REPLACE FUNCTION public.admission_comp(
  p_tenant_id uuid,
  p_session_id uuid,
  p_tier_variant_id uuid,
  p_holder_name text,
  p_holder_email text,
  p_reason text,
  p_approver uuid,
  p_actor_role text,
  p_operation_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_session public.sessions%ROWTYPE;
  v_variant public.talent_offering_variants%ROWTYPE;
  v_limit bigint;
  v_price bigint := 0;
  v_approved boolean := false;
  v_order uuid;
  v_line uuid;
  v_adm uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_tier_variant_id IS NULL
     OR char_length(btrim(COALESCE(p_holder_name, ''))) < 1 OR char_length(v_key) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_session FROM public.sessions WHERE id = p_session_id AND tenant_id = p_tenant_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  SELECT * INTO v_variant FROM public.talent_offering_variants WHERE id = p_tier_variant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  v_price := COALESCE(v_variant.amount_cents, 0);

  SELECT limit_cents INTO v_limit
    FROM public.role_limits
   WHERE tenant_id = p_tenant_id
     AND role = COALESCE(NULLIF(btrim(COALESCE(p_actor_role, '')), ''), 'editor')
     AND action = 'discount';
  IF v_limit IS NOT NULL AND v_price > v_limit THEN
    SELECT true INTO v_approved
      FROM public.approval_requests
     WHERE tenant_id = p_tenant_id
       AND kind = 'discount'
       AND subject_id IN (p_session_id, p_tier_variant_id)
       AND decision = 'approved'
     LIMIT 1;
    IF v_approved IS NOT TRUE THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'needs_approval');
    END IF;
  END IF;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, session_id
  ) VALUES (
    p_tenant_id, 'paid', 'USD', 0, v_price, 0, 0, 'admission_comp', v_key, p_session_id
  ) RETURNING id INTO v_order;

  INSERT INTO public.order_lines (
    tenant_id, order_id, offering_id, variant_id, session_id, label, units, unit_cents, total_cents
  ) VALUES (
    p_tenant_id, v_order, v_variant.offering_id, v_variant.id, p_session_id,
    'Comp', 1, 0, 0
  ) RETURNING id INTO v_line;

  INSERT INTO public.admissions (
    tenant_id, order_line_id, session_id, holder_name, holder_email, starts_at,
    status, party_size, token_version
  ) VALUES (
    p_tenant_id, v_line, p_session_id, btrim(p_holder_name),
    NULLIF(btrim(COALESCE(p_holder_email, '')), ''), v_session.starts_at,
    'valid', GREATEST(1, COALESCE(v_variant.admits_per_unit, 1)), 1
  ) RETURNING id INTO v_adm;

  RETURN jsonb_build_object('ok', true, 'id', v_adm, 'order_id', v_order, 'line_id', v_line);
END;
$$;

CREATE OR REPLACE FUNCTION public.event_seat_map_upsert(
  p_tenant_id uuid,
  p_session_id uuid,
  p_layout_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_session_id IS NULL OR p_layout_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.sessions WHERE id = p_session_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.space_layouts WHERE id = p_layout_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  INSERT INTO public.event_seat_maps (tenant_id, session_id, layout_id)
  VALUES (p_tenant_id, p_session_id, p_layout_id)
  ON CONFLICT (session_id) DO UPDATE
    SET layout_id = EXCLUDED.layout_id, version = public.event_seat_maps.version + 1
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.event_series_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_name text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.event_series%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR char_length(btrim(COALESCE(p_name, ''))) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_id IS NOT NULL THEN
    UPDATE public.event_series SET name = btrim(p_name)
     WHERE id = p_id AND tenant_id = p_tenant_id
     RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  ELSE
    INSERT INTO public.event_series (tenant_id, name) VALUES (p_tenant_id, btrim(p_name))
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id);
END;
$$;

REVOKE ALL ON FUNCTION public.admission_hold_seats(uuid, uuid, uuid[], text, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_hold_seats(uuid, uuid, uuid[], text, integer, text) TO service_role;
REVOKE ALL ON FUNCTION public.admission_hold_reap(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_hold_reap(integer) TO service_role;
REVOKE ALL ON FUNCTION public.admission_exchange(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_exchange(uuid, uuid, uuid, text, integer) TO service_role;
REVOKE ALL ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admission_comp(uuid, uuid, uuid, text, text, text, uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.event_seat_map_upsert(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_seat_map_upsert(uuid, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.event_series_upsert(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.event_series_upsert(uuid, uuid, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.admission_hold_seats(uuid,uuid,uuid[],text,integer,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admission_exchange(uuid,uuid,uuid,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.admission_comp(uuid,uuid,uuid,text,text,text,uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'event hold/exchange/comp is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.admission_hold_seats(gen_random_uuid(), gen_random_uuid(), ARRAY[gen_random_uuid()], 'guest', 60, 'hold-key-aa');
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P3 seat-hold proof: expected not_found, got %', v_reply;
  END IF;
  v_reply := public.admission_exchange(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'exch-key-aa', 1);
  IF v_reply->>'reason' IS DISTINCT FROM 'not_found' THEN
    RAISE EXCEPTION 'P3 exchange proof: expected not_found, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
