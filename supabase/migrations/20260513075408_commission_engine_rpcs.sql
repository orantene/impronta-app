-- Phase B PR 2 — commission engine RPCs.
--
-- Two SECURITY DEFINER functions that the booking engine calls:
--
--   1. engine_load_commission_context(p_booking_id)
--      → Returns platform_config + tenant_override + offer line items +
--        workspace plan, all in one round trip. Reads tables that have
--        RLS restrictions (platform_commission_config is platform-admin-
--        only read), so this RPC elevates per-row.
--
--   2. engine_persist_booking_commission_snapshot(...)
--      → Inserts booking_commission_snapshot. If payment_method is
--        off-platform, also inserts an `accrual` movement + bumps the
--        platform_commission_balances row. Atomic transaction.
--
-- Pure math lives in TypeScript (web/src/lib/billing/commission.ts).
-- These functions just LOAD + PERSIST. The intermediate compute happens
-- in the Node engine path.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. engine_load_commission_context
-- ---------------------------------------------------------------------------

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
  SELECT b.inquiry_id, b.tenant_id
    INTO v_inquiry_id, v_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;

  IF v_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'commission_context: booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Workspace plan. `agencies.plan` is the canonical column per the
  --    SaaS plan model. NULL plan defaults to 'free'.
  SELECT COALESCE(a.plan, 'free')
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

  -- 5. Accepted offer for this inquiry. Take the most-recent accepted
  --    offer (there's a unique partial index ensuring at most one
  --    sent/accepted offer per inquiry).
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
  'Loads all data the commission resolver needs for a booking: platform config + tenant override + accepted offer line items + workspace plan. SECURITY DEFINER bypasses platform_commission_config''s admin-only read RLS so the engine path can resolve commissions without elevating the caller.';

-- ---------------------------------------------------------------------------
-- 2. engine_persist_booking_commission_snapshot
-- ---------------------------------------------------------------------------
--
-- Takes the fully-resolved snapshot from Node + persists. If the snapshot's
-- payment_method is off-platform (cash/wire/venue_paid/crypto/other), also
-- inserts an `accrual` movement and bumps the per-tenant balance.
--
-- Returns the inserted booking_commission_snapshot row as JSONB so the
-- caller can echo to logs.

CREATE OR REPLACE FUNCTION public.engine_persist_booking_commission_snapshot(
  p_booking_id UUID,
  p_platform_take_bps INT,
  p_platform_take_floor_cents INT,
  p_gross_cents INT,
  p_platform_fee_cents INT,
  p_workspace_fee_cents INT,
  p_talent_net_cents INT,
  p_currency_code TEXT,
  p_payment_method TEXT,
  p_off_platform_reason TEXT,
  p_resolved_from TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id UUID;
  v_existing UUID;
  v_inserted RECORD;
  v_current_balance JSONB;
  v_currency_balance INT;
BEGIN
  -- 1. Resolve tenant from booking.
  SELECT b.tenant_id INTO v_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'persist_snapshot: booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  -- 2. Snapshot is per-booking unique. Idempotent — return existing if any.
  SELECT booking_id INTO v_existing
  FROM public.booking_commission_snapshot
  WHERE booking_id = p_booking_id;
  IF v_existing IS NOT NULL THEN
    RETURN (
      SELECT to_jsonb(bcs) FROM public.booking_commission_snapshot bcs
      WHERE bcs.booking_id = p_booking_id
    );
  END IF;

  -- 3. Insert the snapshot. CHECK lanes_sum_to_gross will reject invalid math.
  INSERT INTO public.booking_commission_snapshot (
    booking_id, platform_take_bps, platform_take_floor_cents,
    gross_cents, platform_fee_cents, workspace_fee_cents, talent_net_cents,
    currency_code, payment_method, off_platform_reason, resolved_from
  ) VALUES (
    p_booking_id, p_platform_take_bps, p_platform_take_floor_cents,
    p_gross_cents, p_platform_fee_cents, p_workspace_fee_cents, p_talent_net_cents,
    p_currency_code, p_payment_method, p_off_platform_reason, p_resolved_from
  )
  RETURNING * INTO v_inserted;

  -- 4. If off-platform → create accrual movement + bump balance.
  IF p_payment_method IN ('cash', 'wire', 'venue_paid', 'crypto', 'other') THEN
    INSERT INTO public.platform_commission_movements (
      tenant_id, booking_id, movement_type, amount_cents, currency_code, note
    ) VALUES (
      v_tenant_id, p_booking_id, 'accrual', p_platform_fee_cents, p_currency_code,
      'Off-platform booking: ' || COALESCE(p_off_platform_reason, p_payment_method)
    );

    -- Ensure balance row exists (UPSERT-style).
    INSERT INTO public.platform_commission_balances (tenant_id, balances_cents)
    VALUES (v_tenant_id, jsonb_build_object(p_currency_code, p_platform_fee_cents))
    ON CONFLICT (tenant_id) DO NOTHING;

    -- Bump the currency-keyed balance.
    UPDATE public.platform_commission_balances
       SET balances_cents = jsonb_set(
             balances_cents,
             ARRAY[p_currency_code],
             to_jsonb(
               COALESCE((balances_cents ->> p_currency_code)::int, 0) + p_platform_fee_cents
             )
           ),
           updated_at = now()
     WHERE tenant_id = v_tenant_id;
  END IF;

  RETURN to_jsonb(v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.engine_persist_booking_commission_snapshot(
  UUID, INT, INT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(
  UUID, INT, INT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.engine_persist_booking_commission_snapshot IS
  'Engine-only path for inserting a booking commission snapshot + side effects (accrual movement + balance bump for off-platform). Idempotent — returns existing snapshot if one exists for the booking. SECURITY DEFINER because the snapshot table has no INSERT policy (immutability enforcement).';

COMMIT;
