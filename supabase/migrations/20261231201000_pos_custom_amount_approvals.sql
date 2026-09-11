-- Package 1 task 1: custom amount lines and manager PIN approval.
--
-- Timestamp sorts after 20261231190100. Do not use calendar 20260911: this
-- file replaces pos_mutate_draft_line (20261230000700) and reads orders /
-- order_lines / agencies / agency_memberships.

BEGIN;

ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'catalog';

ALTER TABLE public.order_lines
  DROP CONSTRAINT IF EXISTS order_lines_kind_known;

ALTER TABLE public.order_lines
  ADD CONSTRAINT order_lines_kind_known CHECK (kind IN ('catalog', 'custom'));

COMMENT ON COLUMN public.order_lines.kind IS
  'catalog = priced from talent_offerings. custom = free-text amount; offering_id is null and owner_tenant_id is the workspace.';

-- Named here so pos_mutate_draft_line can write them. Later package files
-- IF NOT EXISTS the same columns and add their constraints/comments.
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS operator_user_id uuid;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS booking_id uuid;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS booking_kind text;

CREATE TABLE IF NOT EXISTS public.pos_approvals (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id         uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  line_id          uuid NOT NULL REFERENCES public.order_lines(id) ON DELETE CASCADE,
  kind             text NOT NULL,
  approver_user_id uuid NOT NULL,
  method           text NOT NULL,
  operation_key    text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_approvals_kind_known CHECK (kind IN ('custom_amount')),
  CONSTRAINT pos_approvals_method_known CHECK (method IN ('pin', 'session')),
  CONSTRAINT pos_approvals_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 8 AND 200)
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_approvals_line_live_uniq
  ON public.pos_approvals (line_id);

CREATE UNIQUE INDEX IF NOT EXISTS pos_approvals_operation_key_uniq
  ON public.pos_approvals (tenant_id, operation_key);

CREATE INDEX IF NOT EXISTS pos_approvals_order_idx
  ON public.pos_approvals (order_id);

ALTER TABLE public.pos_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_approvals FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_approvals_select_staff ON public.pos_approvals;
CREATE POLICY pos_approvals_select_staff ON public.pos_approvals
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE ALL ON public.pos_approvals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_approvals TO authenticated;
GRANT ALL ON public.pos_approvals TO service_role;

-- ── settings helpers ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_custom_amount_limit_cents(p_settings jsonb)
RETURNS bigint
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT GREATEST(0, COALESCE(NULLIF(p_settings #>> '{pos,approval,custom_amount_limit_cents}', '')::bigint, 0));
$$;

CREATE OR REPLACE FUNCTION public.pos_staff_pin_hash(p_settings jsonb, p_user_id uuid)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(p_settings #>> ARRAY['people', 'pins', p_user_id::text], '');
$$;

CREATE OR REPLACE FUNCTION public.pos_membership_is_manager(p_tenant_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.agency_memberships m
     WHERE m.tenant_id = p_tenant_id
       AND m.profile_id = p_user_id
       AND m.status = 'active'
       AND m.role IN ('owner', 'admin', 'manager')
  );
$$;

-- ── mutate: persist kind (and later columns stay optional) ──────────────────

CREATE OR REPLACE FUNCTION public.pos_mutate_draft_line(
  p_tenant_id         uuid,
  p_order_id          uuid,
  p_expected_version  integer,
  p_op                text,
  p_line              jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line_id uuid;
  v_units numeric;
  v_unit_cents bigint;
  v_total_cents bigint;
  v_addons uuid[] := '{}';
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_total bigint := 0;
  v_kind text;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL
     OR p_op IS NULL OR p_op NOT IN ('add', 'update', 'remove') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF v_order.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_draft');
  END IF;

  IF v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  IF p_op = 'add' THEN
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    v_kind := COALESCE(NULLIF(trim(p_line->>'kind'), ''), 'catalog');
    IF v_kind NOT IN ('catalog', 'custom') THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF v_kind = 'custom' AND NULLIF(p_line->>'offering_id', '') IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF v_units <= 0 OR v_unit_cents < 0 OR NULLIF(trim(p_line->>'label'), '') IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    IF p_line ? 'addon_ids' AND jsonb_typeof(p_line->'addon_ids') = 'array' THEN
      SELECT COALESCE(array_agg(x::uuid), '{}')
        INTO v_addons
        FROM jsonb_array_elements_text(p_line->'addon_ids') AS x
       WHERE x <> '';
    END IF;
    INSERT INTO public.order_lines (
      order_id, tenant_id, offering_id, variant_id, addon_ids, session_id,
      label, units, unit_cents, total_cents, talent_profile_id, owner_tenant_id,
      talent_cost_cents, sort_order, kind, operator_user_id, booking_id, booking_kind
    ) VALUES (
      p_order_id,
      p_tenant_id,
      NULLIF(p_line->>'offering_id', '')::uuid,
      NULLIF(p_line->>'variant_id', '')::uuid,
      COALESCE(v_addons, '{}'),
      NULLIF(p_line->>'session_id', '')::uuid,
      trim(p_line->>'label'),
      v_units,
      v_unit_cents,
      v_total_cents,
      NULLIF(p_line->>'talent_profile_id', '')::uuid,
      COALESCE(NULLIF(p_line->>'owner_tenant_id', '')::uuid, CASE WHEN v_kind = 'custom' THEN p_tenant_id ELSE NULL END),
      COALESCE(NULLIF(p_line->>'talent_cost_cents', '')::bigint, 0),
      COALESCE(NULLIF(p_line->>'sort_order', '')::integer, 0),
      v_kind,
      NULLIF(p_line->>'operator_user_id', '')::uuid,
      NULLIF(p_line->>'booking_id', '')::uuid,
      NULLIF(p_line->>'booking_kind', '')
    )
    RETURNING id INTO v_line_id;
  ELSIF p_op = 'update' THEN
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    v_units := COALESCE(NULLIF(p_line->>'units', '')::numeric, 0);
    v_unit_cents := COALESCE(NULLIF(p_line->>'unit_cents', '')::bigint, 0);
    v_total_cents := COALESCE(NULLIF(p_line->>'total_cents', '')::bigint, round(v_unit_cents * v_units)::bigint);
    IF v_line_id IS NULL OR v_units <= 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    UPDATE public.order_lines
       SET units = v_units,
           total_cents = v_total_cents
     WHERE id = v_line_id
       AND order_id = p_order_id
       AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
  ELSE
    v_line_id := NULLIF(p_line->>'id', '')::uuid;
    IF v_line_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
    END IF;
    DELETE FROM public.order_lines
     WHERE id = v_line_id
       AND order_id = p_order_id
       AND tenant_id = p_tenant_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
  END IF;

  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(COALESCE(tax_cents, 0)), 0)
    INTO v_subtotal, v_tax
    FROM public.order_lines
   WHERE order_id = p_order_id;

  v_discount := GREATEST(0, LEAST(COALESCE(v_order.discount_cents, 0), v_subtotal));
  v_total := v_subtotal - v_discount + v_tax;

  UPDATE public.orders
     SET subtotal_cents = v_subtotal,
         discount_cents = v_discount,
         tax_cents = v_tax,
         total_cents = v_total,
         version = v_order.version + 1
   WHERE id = p_order_id
     AND tenant_id = p_tenant_id
     AND status = 'draft'
     AND version = p_expected_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'version', v_order.version + 1,
    'line_id', v_line_id,
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) TO service_role;

-- ── PIN setter ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.pos_set_staff_pin(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_user_id uuid,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_people jsonb;
  v_pins jsonb;
  v_hash text;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_pin IS NULL OR p_pin !~ '^[0-9]{4,6}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF NOT public.pos_membership_is_manager(p_tenant_id, p_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
    FROM public.agencies
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_hash := crypt(p_pin, gen_salt('bf'));
  v_people := COALESCE(v_settings->'people', '{}'::jsonb);
  v_pins := COALESCE(v_people->'pins', '{}'::jsonb);
  v_pins := jsonb_set(v_pins, ARRAY[p_user_id::text], to_jsonb(v_hash), true);
  v_people := jsonb_set(v_people, ARRAY['pins'], v_pins, true);
  v_settings := jsonb_set(v_settings, ARRAY['people'], v_people, true);

  UPDATE public.agencies
     SET settings = v_settings, updated_at = now()
   WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_staff_pin(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_set_staff_pin(uuid, uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.pos_set_custom_amount_limit(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_limit_cents bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_settings jsonb;
  v_pos jsonb;
  v_approval jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_actor_id IS NULL OR p_limit_cents IS NULL OR p_limit_cents < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF NOT public.pos_membership_is_manager(p_tenant_id, p_actor_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
    FROM public.agencies
   WHERE id = p_tenant_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  v_pos := COALESCE(v_settings->'pos', '{}'::jsonb);
  v_approval := COALESCE(v_pos->'approval', '{}'::jsonb);
  v_approval := jsonb_set(v_approval, ARRAY['custom_amount_limit_cents'], to_jsonb(p_limit_cents), true);
  v_pos := jsonb_set(v_pos, ARRAY['approval'], v_approval, true);
  v_settings := jsonb_set(v_settings, ARRAY['pos'], v_pos, true);

  UPDATE public.agencies
     SET settings = v_settings, updated_at = now()
   WHERE id = p_tenant_id;

  RETURN jsonb_build_object('ok', true, 'limit_cents', p_limit_cents);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_set_custom_amount_limit(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_set_custom_amount_limit(uuid, uuid, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.pos_approve_custom_amount(
  p_tenant_id uuid,
  p_order_id uuid,
  p_line_id uuid,
  p_operation_key text,
  p_approver uuid,
  p_pin text,
  p_method text DEFAULT 'pin'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_line public.order_lines%ROWTYPE;
  v_settings jsonb;
  v_hash text;
  v_existing public.pos_approvals%ROWTYPE;
  v_approval_id uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_line_id IS NULL
     OR p_approver IS NULL OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF COALESCE(p_method, 'pin') NOT IN ('pin', 'session') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.pos_approvals
   WHERE tenant_id = p_tenant_id AND operation_key = p_operation_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'approval_id', v_existing.id, 'already', true);
  END IF;

  SELECT * INTO v_order
    FROM public.orders
   WHERE id = p_order_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_order.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_order.status IS DISTINCT FROM 'draft' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT * INTO v_line
    FROM public.order_lines
   WHERE id = p_line_id AND order_id = p_order_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_line.kind IS DISTINCT FROM 'custom' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF EXISTS (SELECT 1 FROM public.pos_approvals WHERE line_id = p_line_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_approved');
  END IF;

  IF NOT public.pos_membership_is_manager(p_tenant_id, p_approver) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_manager');
  END IF;

  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
    FROM public.agencies WHERE id = p_tenant_id;
  v_hash := public.pos_staff_pin_hash(v_settings, p_approver);
  IF v_hash IS NULL OR p_pin IS NULL OR crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid');
  END IF;

  INSERT INTO public.pos_approvals (
    tenant_id, order_id, line_id, kind, approver_user_id, method, operation_key
  ) VALUES (
    p_tenant_id, p_order_id, p_line_id, 'custom_amount', p_approver, COALESCE(p_method, 'pin'), p_operation_key
  )
  RETURNING id INTO v_approval_id;

  RETURN jsonb_build_object('ok', true, 'approval_id', v_approval_id, 'already', false);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_approve_custom_amount(uuid, uuid, uuid, text, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_approve_custom_amount(uuid, uuid, uuid, text, uuid, text, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_approve_custom_amount(uuid,uuid,uuid,text,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_approve_custom_amount(uuid,uuid,uuid,text,uuid,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_set_staff_pin(uuid,uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_set_staff_pin(uuid,uuid,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos approval RPCs are executable by anon/authenticated';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_order uuid;
  v_line uuid;
  v_reply jsonb;
  v_count integer;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p1-custom-' || substr(gen_random_uuid()::text, 1, 12), 'P1 custom amount proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.orders (
    tenant_id, status, currency, subtotal_cents, discount_cents, tax_cents,
    total_cents, source_channel, guest_session_id, version
  ) VALUES (
    v_tenant, 'draft', 'USD', 0, 0, 0, 0, 'pos', 'p1-custom-proof', 1
  ) RETURNING id INTO v_order;

  v_reply := public.pos_mutate_draft_line(
    v_tenant, v_order, 1, 'add',
    jsonb_build_object(
      'kind', 'custom',
      'label', 'Open item',
      'units', 1,
      'unit_cents', 2500,
      'total_cents', 2500,
      'owner_tenant_id', v_tenant
    )
  );
  IF COALESCE((v_reply->>'ok')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'P1 custom proof: add custom line failed: %', v_reply;
  END IF;
  SELECT id INTO v_line FROM public.order_lines WHERE order_id = v_order;

  -- Wrong PIN writes nothing.
  v_reply := public.pos_approve_custom_amount(
    v_tenant, v_order, v_line, 'p1-custom-op-aaaa', gen_random_uuid(), '0000', 'pin'
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'not_manager' AND v_reply->>'reason' IS DISTINCT FROM 'pin_invalid' THEN
    RAISE EXCEPTION 'P1 custom proof: expected not_manager or pin_invalid, got %', v_reply;
  END IF;
  SELECT count(*) INTO v_count FROM public.pos_approvals WHERE line_id = v_line;
  IF v_count <> 0 THEN
    RAISE EXCEPTION 'P1 custom proof: a refused approve wrote a row';
  END IF;

  DELETE FROM public.order_lines WHERE order_id = v_order;
  DELETE FROM public.orders WHERE id = v_order;
  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
