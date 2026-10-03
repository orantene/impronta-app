-- Order-backed commission context: no accepted offer required.
--
-- Phase 0.5c (`20261229000241`) taught `commission_line_items_for` to read
-- `order_lines` when the booking has an `order_id`, but
-- `engine_load_commission_context` still refused without an accepted
-- `inquiry_offers` row. Vanity CatalogBookingSheet → `createPurchase` never
-- creates an offer, so `persistBookingCommissionSnapshot` could not run and
-- Talent Money stayed at $0 Collected despite a paid order.
--
-- When `agency_bookings.order_id` is set:
--   • currency comes from `orders.currency` (fallback booking.currency_code)
--   • owner-completeness is checked on `order_lines`
--   • `offer_id` may be null in the returned context
-- Offer-backed bookings keep the previous accepted-offer gate.

BEGIN;

CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inquiry_id UUID;
  v_home_tenant_id UUID;
  v_order_id UUID;
  v_booking_currency TEXT;
  v_offer_id UUID;
  v_currency_code TEXT;
  v_platform_config JSONB;
  v_unattributed_count INT;
  v_participants JSONB;
  v_source_workspace_id UUID;
  v_hub_referral_bps INT;
BEGIN
  SELECT b.source_inquiry_id, b.tenant_id, b.order_id, b.currency_code
    INTO v_inquiry_id, v_home_tenant_id, v_order_id, v_booking_currency
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;

  IF v_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'commission_context: booking not found' USING ERRCODE = 'P0002';
  END IF;

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

  -- Optional accepted offer (quoted path). Order-backed sales may have none.
  SELECT io.id, io.currency_code
    INTO v_offer_id, v_currency_code
  FROM public.inquiry_offers io
  WHERE io.inquiry_id = v_inquiry_id
    AND io.status = 'accepted'
  ORDER BY io.accepted_at DESC NULLS LAST, io.created_at DESC
  LIMIT 1;

  IF v_order_id IS NOT NULL THEN
    SELECT o.currency INTO v_currency_code
      FROM public.orders o
     WHERE o.id = v_order_id;
    v_currency_code := COALESCE(v_currency_code, v_booking_currency, 'USD');

    SELECT COUNT(*) INTO v_unattributed_count
      FROM public.order_lines ol
     WHERE ol.order_id = v_order_id
       AND ol.talent_profile_id IS NULL
       AND ol.owner_tenant_id IS NULL;

    IF v_unattributed_count > 0 THEN
      RAISE EXCEPTION
        'commission_context: order % has % line item(s) with no payee (talent or owner_tenant_id)',
        v_order_id, v_unattributed_count;
    END IF;
  ELSE
    IF v_offer_id IS NULL THEN
      RAISE EXCEPTION 'commission_context: no accepted offer for booking %', p_booking_id;
    END IF;

    SELECT COUNT(*) INTO v_unattributed_count
      FROM public.inquiry_offer_line_items li
     WHERE li.offer_id = v_offer_id
       AND li.talent_profile_id IS NULL
       AND li.owner_tenant_id IS NULL;

    IF v_unattributed_count > 0 THEN
      RAISE EXCEPTION
        'commission_context: offer % has % line item(s) with no payee (talent or owner_tenant_id)',
        v_offer_id, v_unattributed_count;
    END IF;
  END IF;

  WITH talent_parts AS (
    SELECT
      p.id AS participant_id,
      p.talent_profile_id,
      p.owning_party_type,
      p.owning_party_id,
      CASE
        WHEN p.owning_party_type IN ('workspace', 'agency') THEN p.owning_party_id
        ELSE NULL
      END AS tenant_id,
      'talent'::text AS lane
    FROM public.inquiry_participants p
    WHERE p.inquiry_id = v_inquiry_id
      AND p.role = 'talent'
      AND p.status = 'active'
      AND p.talent_profile_id IS NOT NULL
      AND p.owning_party_type IS NOT NULL
      AND p.owning_party_id IS NOT NULL
  ),
  house_parts AS (
    SELECT
      p.id AS participant_id,
      NULL::uuid AS talent_profile_id,
      p.owning_party_type,
      p.owning_party_id,
      p.owning_party_id AS tenant_id,
      'house'::text AS lane
    FROM public.inquiry_participants p
    WHERE p.inquiry_id = v_inquiry_id
      AND p.role = 'house'
      AND p.status = 'active'
      AND p.owning_party_type IN ('workspace', 'agency')
      AND p.owning_party_id IS NOT NULL
  ),
  all_parts AS (
    SELECT * FROM talent_parts
    UNION ALL
    SELECT * FROM house_parts
  ),
  participant_lines AS (
    SELECT
      ap.participant_id,
      ap.talent_profile_id,
      ap.owning_party_type,
      ap.owning_party_id,
      ap.tenant_id,
      ap.lane,
      COALESCE(a.plan_tier, 'free') AS workspace_plan,
      jsonb_build_object(
        'platform_take_bps', wco.platform_take_bps,
        'platform_take_floor_cents', wco.platform_take_floor_cents,
        'default_workspace_take_bps', wco.default_workspace_take_bps,
        'default_workspace_take_per_unit_cents', wco.default_workspace_take_per_unit_cents,
        'default_workspace_take_per_unit_label', wco.default_workspace_take_per_unit_label
      ) AS tenant_override_jsonb,
      wco.tenant_id IS NOT NULL AS has_override,
      public.commission_line_items_for(
        p_booking_id, ap.lane, ap.talent_profile_id, ap.owning_party_id
      ) AS line_items
    FROM all_parts ap
    LEFT JOIN public.agencies a ON a.id = ap.tenant_id
    LEFT JOIN public.workspace_commission_overrides wco ON wco.tenant_id = ap.tenant_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'participant_id', pl.participant_id,
      'talent_profile_id', pl.talent_profile_id,
      'owning_party_type', pl.owning_party_type,
      'owning_party_id', pl.owning_party_id,
      'tenant_id', pl.tenant_id,
      'workspace_plan', CASE WHEN pl.owning_party_type = 'talent' THEN NULL ELSE pl.workspace_plan END,
      'tenant_override', CASE WHEN pl.has_override THEN pl.tenant_override_jsonb ELSE NULL END,
      'offer_line_items', pl.line_items
    )
    ORDER BY pl.participant_id
  ) INTO v_participants
  FROM participant_lines pl;

  IF v_participants IS NULL OR jsonb_array_length(v_participants) = 0 THEN
    RAISE EXCEPTION 'commission_context: no eligible participants (talent or house) for booking %', p_booking_id;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_participants) elt
    WHERE COALESCE(elt->'offer_line_items', 'null'::jsonb) IN ('null'::jsonb, '[]'::jsonb)
  ) THEN
    RAISE EXCEPTION
      'commission_context: at least one participant has no line items for booking %',
      p_booking_id;
  END IF;

  SELECT i.source_workspace_id INTO v_source_workspace_id
  FROM public.inquiries i
  WHERE i.id = v_inquiry_id;

  v_hub_referral_bps := COALESCE(
    (SELECT c.hub_referral_bps
       FROM public.workspace_channel_referral_config c
      WHERE c.source_workspace_id = v_source_workspace_id),
    0
  );

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'home_tenant_id', v_home_tenant_id,
    'offer_id', v_offer_id,
    'currency_code', v_currency_code,
    'platform_config', v_platform_config,
    'participants', v_participants,
    'source_workspace_id', v_source_workspace_id,
    'hub_referral_bps', v_hub_referral_bps
  );
END;
$function$;

COMMENT ON FUNCTION public.engine_load_commission_context(uuid) IS
  'Load per-participant commission context. Order-backed bookings use order_lines '
  'and do not require an accepted offer; quoted bookings still require one.';

DO $$
DECLARE
  v_src TEXT;
BEGIN
  SELECT prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'engine_load_commission_context';

  IF position('v_order_id' IN v_src) = 0 THEN
    RAISE EXCEPTION 'order-backed commission context missing v_order_id';
  END IF;
  IF position('commission_line_items_for' IN v_src) = 0 THEN
    RAISE EXCEPTION 'order-backed commission context lost commission_line_items_for';
  END IF;
  IF position('v_unattributed_count' IN v_src) = 0 THEN
    RAISE EXCEPTION 'order-backed commission context lost unattributed-line guard';
  END IF;
END $$;

COMMIT;
