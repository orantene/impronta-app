-- Journeys atomic RPCs: draft totals (F01), resource set (F02),
-- cancel+release (F03), lesson drawdown (F10), promo identity (F11).
--
-- Timestamp sorts after 20261230000600. Do not use calendar 20260908.
-- Do not apply this file to production by hand from this session unless
-- it is the isolated qa-journeys target. The production pointer is
-- CI-gated; this migration ships with the branch.

BEGIN;

-- F11: the order remembers which code it priced with so collect can redeem.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS promo_code_id uuid REFERENCES public.tenant_promo_codes(id);

CREATE INDEX IF NOT EXISTS orders_promo_code_id_idx
  ON public.orders (promo_code_id)
  WHERE promo_code_id IS NOT NULL;

COMMENT ON COLUMN public.orders.promo_code_id IS
  'F11: identity of the promo applied at reprice. Redemption is redeem_tenant_promo at collect, not a second discount write.';

-- F10: unique consumption so concurrent final-unit and replay cannot both burn.
CREATE TABLE IF NOT EXISTS public.lesson_package_consumptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  package_id    uuid NOT NULL REFERENCES public.lesson_packages(id) ON DELETE CASCADE,
  reference_key text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lesson_package_consumptions_uniq UNIQUE (package_id, reference_key)
);

CREATE INDEX IF NOT EXISTS lesson_package_consumptions_tenant_idx
  ON public.lesson_package_consumptions (tenant_id);

ALTER TABLE public.lesson_package_consumptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lesson_package_consumptions_staff ON public.lesson_package_consumptions;
CREATE POLICY lesson_package_consumptions_staff ON public.lesson_package_consumptions
  FOR ALL TO authenticated
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

GRANT SELECT, INSERT ON public.lesson_package_consumptions TO authenticated;
GRANT ALL ON public.lesson_package_consumptions TO service_role;

-- ── F01: versioned draft totals. Zero affected rows is a conflict. ──────────

CREATE OR REPLACE FUNCTION public.pos_apply_draft_totals(
  p_tenant_id         uuid,
  p_order_id          uuid,
  p_expected_version  integer,
  p_discount_cents    bigint
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_subtotal bigint := 0;
  v_discount bigint := 0;
  v_tax bigint := 0;
  v_total bigint := 0;
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL OR p_expected_version IS NULL THEN
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

  SELECT COALESCE(SUM(total_cents), 0), COALESCE(SUM(COALESCE(tax_cents, 0)), 0)
    INTO v_subtotal, v_tax
    FROM public.order_lines
   WHERE order_id = p_order_id;

  v_discount := GREATEST(0, LEAST(COALESCE(p_discount_cents, 0), v_subtotal));
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
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_apply_draft_totals(uuid, uuid, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_apply_draft_totals(uuid, uuid, integer, bigint) TO service_role;

COMMENT ON FUNCTION public.pos_apply_draft_totals(uuid, uuid, integer, bigint) IS
  'F01: lock the draft, refuse a stale version, rewrite derived totals. Zero rows is conflict.';

-- ── F01: mutate one line and bump version in the same lock. ─────────────────

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
      talent_cost_cents, sort_order
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
      NULLIF(p_line->>'owner_tenant_id', '')::uuid,
      COALESCE(NULLIF(p_line->>'talent_cost_cents', '')::bigint, 0),
      COALESCE(NULLIF(p_line->>'sort_order', '')::integer, 0)
    );
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
    'subtotal_cents', v_subtotal,
    'discount_cents', v_discount,
    'tax_cents', v_tax,
    'total_cents', v_total
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) TO service_role;

COMMENT ON FUNCTION public.pos_mutate_draft_line(uuid, uuid, integer, text, jsonb) IS
  'F01: lock the draft, mutate one line, rewrite derived totals, bump version. Zero rows is conflict.';

-- ── F03: cancel a draft/pending sale and release THIS tenant's holds. ───────

CREATE OR REPLACE FUNCTION public.pos_cancel_draft(
  p_tenant_id uuid,
  p_order_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ids uuid[] := '{}';
BEGIN
  IF p_tenant_id IS NULL OR p_order_id IS NULL THEN
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

  IF v_order.status NOT IN ('draft', 'pending_payment') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_open');
  END IF;

  IF p_expected_version IS NOT NULL AND v_order.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  UPDATE public.orders
     SET status = 'cancelled',
         version = v_order.version + 1
   WHERE id = p_order_id
     AND tenant_id = p_tenant_id
     AND status IN ('draft', 'pending_payment')
     AND version = v_order.version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  SELECT COALESCE(array_agg(a.id), '{}')
    INTO v_ids
    FROM public.capacity_allocations a
    JOIN public.order_lines l ON l.id = a.order_line_id
   WHERE l.order_id = p_order_id
     AND a.tenant_id = p_tenant_id
     AND a.released_at IS NULL
     AND a.state = 'hold';

  IF array_length(v_ids, 1) IS NOT NULL THEN
    DECLARE
      v_rel jsonb;
    BEGIN
      v_rel := public.release_capacity(v_ids);
      IF COALESCE((v_rel->>'ok')::boolean, false) IS NOT TRUE THEN
        RAISE EXCEPTION 'release_failed';
      END IF;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'order_id', p_order_id,
    'released_allocation_ids', to_jsonb(v_ids)
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_cancel_draft(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_cancel_draft(uuid, uuid, integer) TO service_role;

COMMENT ON FUNCTION public.pos_cancel_draft(uuid, uuid, integer) IS
  'F03: cancel the sale under a row lock and release this tenant''s live allocations in the same transaction. A release failure is not a successful cancel.';

-- ── F10: atomic lesson drawdown with a unique consumption reference. ────────

CREATE OR REPLACE FUNCTION public.drawdown_lesson_package(
  p_tenant_id uuid,
  p_package_id uuid,
  p_reference_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pack public.lesson_packages%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_package_id IS NULL OR p_reference_key IS NULL OR length(trim(p_reference_key)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_pack
    FROM public.lesson_packages
   WHERE id = p_package_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_pack.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  INSERT INTO public.lesson_package_consumptions (tenant_id, package_id, reference_key)
  VALUES (p_tenant_id, p_package_id, trim(p_reference_key))
  ON CONFLICT (package_id, reference_key) DO NOTHING;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'already', true,
      'remaining_units', v_pack.remaining_units,
      'original_units', v_pack.original_units,
      'booking_id', v_pack.booking_id
    );
  END IF;

  IF v_pack.remaining_units < 1 THEN
    DELETE FROM public.lesson_package_consumptions
     WHERE package_id = p_package_id AND reference_key = trim(p_reference_key);
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  UPDATE public.lesson_packages
     SET remaining_units = remaining_units - 1,
         updated_at = now()
   WHERE id = p_package_id
     AND tenant_id = p_tenant_id
     AND remaining_units > 0;

  IF NOT FOUND THEN
    DELETE FROM public.lesson_package_consumptions
     WHERE package_id = p_package_id AND reference_key = trim(p_reference_key);
    RETURN jsonb_build_object('ok', false, 'reason', 'exhausted');
  END IF;

  SELECT * INTO v_pack FROM public.lesson_packages WHERE id = p_package_id;

  RETURN jsonb_build_object(
    'ok', true,
    'already', false,
    'remaining_units', v_pack.remaining_units,
    'original_units', v_pack.original_units,
    'booking_id', v_pack.booking_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.drawdown_lesson_package(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.drawdown_lesson_package(uuid, uuid, text) TO service_role;

COMMENT ON FUNCTION public.drawdown_lesson_package(uuid, uuid, text) IS
  'F10/C39: lock the package, insert a unique consumption key, decrement remaining. Replay of the same reference is idempotent. Concurrent last unit cannot both succeed.';

-- ── F02: capacity + talent holds in one transaction. ────────────────────────

CREATE OR REPLACE FUNCTION public.reserve_resource_set(
  p_tenant_id uuid,
  p_actor_id uuid,
  p_ttl_seconds integer,
  p_capacity jsonb,
  p_holds jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cap jsonb;
  v_hold jsonb;
  v_pool_id uuid;
  v_tenant uuid;
  v_talent uuid;
  v_starts timestamptz;
  v_ends timestamptz;
  v_before int;
  v_after int;
  v_expires timestamptz;
  v_hold_id uuid;
  v_hold_ids uuid[] := '{}';
  v_alloc jsonb;
  v_alloc_ids uuid[] := '{}';
  v_reason text;
BEGIN
  IF p_tenant_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF (p_capacity IS NULL OR jsonb_typeof(p_capacity) <> 'array' OR jsonb_array_length(p_capacity) = 0)
     AND (p_holds IS NULL OR jsonb_typeof(p_holds) <> 'array' OR jsonb_array_length(p_holds) = 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_batch', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
  END IF;

  IF p_capacity IS NOT NULL AND jsonb_typeof(p_capacity) = 'array' THEN
    FOR v_cap IN SELECT * FROM jsonb_array_elements(p_capacity)
    LOOP
      v_pool_id := NULLIF(v_cap->>'pool_id', '')::uuid;
      IF v_pool_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failed_pool_id', NULL, 'failed_talent_id', NULL);
      END IF;
      SELECT tenant_id INTO v_tenant FROM public.capacity_pools WHERE id = v_pool_id;
      IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'pool_not_found', 'failed_pool_id', v_pool_id, 'failed_talent_id', NULL);
      END IF;
      IF v_tenant IS DISTINCT FROM p_tenant_id THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant', 'failed_pool_id', v_pool_id, 'failed_talent_id', NULL);
      END IF;
    END LOOP;

    v_alloc := public.reserve_capacity_batch(p_capacity, p_ttl_seconds, NULL, p_actor_id);
    IF COALESCE((v_alloc->>'ok')::boolean, false) IS NOT TRUE THEN
      v_reason := COALESCE(v_alloc->>'reason', 'unavailable');
      RETURN jsonb_build_object(
        'ok', false,
        'reason', v_reason,
        'failed_pool_id', NULLIF(v_alloc->>'failed_pool_id', '')::uuid,
        'failed_talent_id', NULL
      );
    END IF;
    SELECT COALESCE(array_agg(x::uuid), '{}')
      INTO v_alloc_ids
      FROM jsonb_array_elements_text(COALESCE(v_alloc->'allocation_ids', '[]'::jsonb)) AS x;
    IF v_alloc ? 'expires_at' AND v_alloc->>'expires_at' IS NOT NULL THEN
      v_expires := (v_alloc->>'expires_at')::timestamptz;
    END IF;
  END IF;

  IF p_holds IS NOT NULL AND jsonb_typeof(p_holds) = 'array' THEN
    FOR v_hold IN
      SELECT value FROM jsonb_array_elements(p_holds) AS value
      ORDER BY value->>'talent_profile_id', value->>'starts_at'
    LOOP
      v_talent := NULLIF(v_hold->>'talent_profile_id', '')::uuid;
      v_starts := NULLIF(v_hold->>'starts_at', '')::timestamptz;
      v_ends := NULLIF(v_hold->>'ends_at', '')::timestamptz;
      v_before := COALESCE(NULLIF(v_hold->>'buffer_before_seconds', '')::int, 0);
      v_after := COALESCE(NULLIF(v_hold->>'buffer_after_seconds', '')::int, 0);
      IF v_talent IS NULL OR v_starts IS NULL OR v_ends IS NULL OR v_ends <= v_starts OR v_before < 0 OR v_after < 0 THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
      END IF;
      v_starts := v_starts - make_interval(secs => v_before);
      v_ends := v_ends + make_interval(secs => v_after);

      INSERT INTO public.talent_holds (
        talent_profile_id,
        tenant_id,
        inquiry_id,
        title,
        starts_at,
        ends_at,
        all_day,
        hold_strength,
        expires_at,
        created_by_user_id
      )
      VALUES (
        v_talent,
        p_tenant_id,
        NULLIF(v_hold->>'inquiry_id', '')::uuid,
        COALESCE(NULLIF(trim(v_hold->>'title'), ''), 'Reservation'),
        v_starts,
        v_ends,
        false,
        'firm',
        CASE
          WHEN p_ttl_seconds IS NULL THEN now() + interval '48 hours'
          ELSE now() + make_interval(secs => p_ttl_seconds)
        END,
        p_actor_id
      )
      RETURNING id, expires_at INTO v_hold_id, v_expires;

      v_hold_ids := v_hold_ids || v_hold_id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'hold_ids', to_jsonb(v_hold_ids),
    'allocation_ids', to_jsonb(v_alloc_ids),
    'expires_at', v_expires
  );
EXCEPTION
  WHEN exclusion_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slot_taken', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN deadlock_detected OR serialization_failure THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'deadlock', 'failed_pool_id', NULL, 'failed_talent_id', v_talent);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unavailable', 'failed_pool_id', NULL, 'failed_talent_id', v_talent, 'error', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.reserve_resource_set(uuid, uuid, integer, jsonb, jsonb) IS
  'F02: capacity batch and talent_holds inserts in one function so a later failure rolls back earlier holds. Tenant is checked before reserve_capacity_batch.';

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_apply_draft_totals(uuid,uuid,integer,bigint)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_apply_draft_totals(uuid,uuid,integer,bigint)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_mutate_draft_line(uuid,uuid,integer,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_mutate_draft_line(uuid,uuid,integer,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_cancel_draft(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_cancel_draft(uuid,uuid,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.drawdown_lesson_package(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.drawdown_lesson_package(uuid,uuid,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.reserve_resource_set(uuid,uuid,integer,jsonb,jsonb)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.reserve_resource_set(uuid,uuid,integer,jsonb,jsonb)', 'EXECUTE') THEN
    RAISE EXCEPTION 'journeys atomic RPCs are executable by anon/authenticated; the REVOKE did not take';
  END IF;
END
$check$;

COMMIT;
