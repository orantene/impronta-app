-- FIX — engine_load_commission_context references two non-existent columns.
--
-- Incident: the commission context-loader RPC (shipped in
-- 20260513075408_commission_engine_rpcs.sql) was written against column names
-- that do not exist on the live schema:
--
--   • `agency_bookings.inquiry_id`  → the actual column is `source_inquiry_id`
--   • `agencies.plan`               → the actual column is `plan_tier`
--
-- plpgsql does not validate column references at CREATE time, so the function
-- deployed cleanly and only fails at runtime with 42703. Every call therefore
-- throws at step 1, `persistBookingCommissionSnapshot` returns
-- `context_load_failed`, and because that path is intentionally non-fatal the
-- booking is created with NO commission snapshot — silently.
--
-- Result observed in production: 1 booking exists, 0 rows in
-- booking_commission_snapshot. The commission pipeline (platform-fee snapshot,
-- 3-lane split, off-platform accrual + balance bump) has never run.
--
-- Fix: re-create the function with the correct column names. Body is otherwise
-- byte-identical to 20260513075408.

BEGIN;

CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inquiry_id UUID;
  v_tenant_id UUID;
  v_workspace_plan TEXT;
  v_platform_config JSONB;
  v_tenant_override JSONB;
  v_line_items JSONB;
  v_offer_id UUID;
  v_currency_code TEXT;
BEGIN
  -- 1. Resolve booking → inquiry → tenant.
  --    FIX: column is `source_inquiry_id`, not `inquiry_id`.
  SELECT b.source_inquiry_id, b.tenant_id
    INTO v_inquiry_id, v_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;

  IF v_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'commission_context: booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Workspace plan.
  --    FIX: column is `plan_tier`, not `plan`.
  SELECT COALESCE(a.plan_tier, 'free')
    INTO v_workspace_plan
  FROM public.agencies a
  WHERE a.id = v_tenant_id;
  IF v_workspace_plan IS NULL THEN
    v_workspace_plan := 'free';
  END IF;

  -- 3. Platform config (singleton).
  SELECT jsonb_build_object(
    'default_take_bps', pcc.default_take_bps,
    'default_take_floor_cents', pcc.default_take_floor_cents,
    'plan_tier_bps', pcc.plan_tier_bps,
    'cash_settlement_threshold_cents', pcc.cash_settlement_threshold_cents,
    'cash_settlement_currency', pcc.cash_settlement_currency
  ) INTO v_platform_config
  FROM public.platform_commission_config pcc
  WHERE pcc.singleton_key = TRUE;

  IF v_platform_config IS NULL THEN
    RAISE EXCEPTION 'commission_context: platform_commission_config singleton missing — re-run seed';
  END IF;

  -- 4. Tenant override (may be NULL).
  SELECT jsonb_build_object(
    'platform_take_bps', wco.platform_take_bps,
    'platform_take_floor_cents', wco.platform_take_floor_cents,
    'default_workspace_take_bps', wco.default_workspace_take_bps,
    'default_workspace_take_per_unit_cents', wco.default_workspace_take_per_unit_cents,
    'default_workspace_take_per_unit_label', wco.default_workspace_take_per_unit_label
  ) INTO v_tenant_override
  FROM public.workspace_commission_overrides wco
  WHERE wco.tenant_id = v_tenant_id;

  -- 5. Accepted offer for this inquiry.
  SELECT io.id, io.currency_code
    INTO v_offer_id, v_currency_code
  FROM public.inquiry_offers io
  WHERE io.inquiry_id = v_inquiry_id
    AND io.status = 'accepted'
  ORDER BY io.accepted_at DESC NULLS LAST, io.created_at DESC
  LIMIT 1;

  IF v_offer_id IS NULL THEN
    RAISE EXCEPTION 'commission_context: no accepted offer for booking %', p_booking_id;
  END IF;

  -- 6. Offer line items projected to the resolver's input shape.
  SELECT jsonb_agg(jsonb_build_object(
    'units', li.units::numeric,
    'unit_price_cents', (li.unit_price * 100)::int,
    'talent_cost_cents', (li.talent_cost * 100)::int
  ) ORDER BY li.id)
    INTO v_line_items
  FROM public.inquiry_offer_line_items li
  WHERE li.offer_id = v_offer_id;

  IF v_line_items IS NULL OR jsonb_array_length(v_line_items) = 0 THEN
    RAISE EXCEPTION 'commission_context: offer % has no line items', v_offer_id;
  END IF;

  RETURN jsonb_build_object(
    'tenant_id', v_tenant_id,
    'workspace_plan', v_workspace_plan,
    'platform_config', v_platform_config,
    'tenant_override', v_tenant_override,
    'offer_id', v_offer_id,
    'currency_code', v_currency_code,
    'offer_line_items', v_line_items
  );
END;
$$;

REVOKE ALL ON FUNCTION public.engine_load_commission_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(UUID) TO authenticated;

COMMENT ON FUNCTION public.engine_load_commission_context(UUID) IS
  'Loads all data the commission resolver needs for a booking: platform config + tenant override + accepted offer line items + workspace plan. SECURITY DEFINER bypasses platform_commission_config''s admin-only read RLS. Fixed 2026-05-22: source_inquiry_id / plan_tier column names.';

COMMIT;
