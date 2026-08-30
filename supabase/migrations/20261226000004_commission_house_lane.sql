-- Menu Phase 1: house lane in commission context + convert revenue recompute.
-- Based on engine_load_commission_context from 20261109000000 and
-- engine_convert_to_booking from 20261225000000 (auth gate + logistics cols).
--
-- CRITICAL: exclude house lines from booking_talent AND re-base header totals
-- onto inquiry_offer_line_items in the SAME statement. Exclude alone → $0 revenue.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. engine_load_commission_context — talent + house participants
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inquiry_id UUID;
  v_home_tenant_id UUID;
  v_offer_id UUID;
  v_currency_code TEXT;
  v_platform_config JSONB;
  v_unattributed_count INT;
  v_participants JSONB;
  v_source_workspace_id UUID;
  v_hub_referral_bps INT;
BEGIN
  SELECT b.source_inquiry_id, b.tenant_id
    INTO v_inquiry_id, v_home_tenant_id
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

  -- Owner-completeness: every line must name talent XOR workspace.
  SELECT COUNT(*) INTO v_unattributed_count
  FROM public.inquiry_offer_line_items li
  WHERE li.offer_id = v_offer_id
    AND li.talent_profile_id IS NULL
    AND li.owner_tenant_id IS NULL;

  IF v_unattributed_count > 0 THEN
    RAISE EXCEPTION 'commission_context: offer % has % line item(s) with no payee (talent or owner_tenant_id)', v_offer_id, v_unattributed_count;
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
      (
        SELECT jsonb_agg(jsonb_build_object(
          'units', li.units::numeric,
          'unit_price_cents', (li.unit_price * 100)::int,
          -- House lane: force talent_cost_cents = 0. Never read the column —
          -- a stray value silently shrinks the workspace payout.
          'talent_cost_cents', CASE
            WHEN ap.lane = 'house' THEN 0
            ELSE (li.talent_cost * 100)::int
          END
        ) ORDER BY li.id)
        FROM public.inquiry_offer_line_items li
        WHERE li.offer_id = v_offer_id
          AND (
            (ap.lane = 'talent' AND li.talent_profile_id = ap.talent_profile_id)
            OR (ap.lane = 'house' AND li.owner_tenant_id = ap.owning_party_id)
          )
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
    RAISE EXCEPTION 'commission_context: at least one participant has no line items on offer %', v_offer_id;
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

REVOKE ALL ON FUNCTION public.engine_load_commission_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(UUID) TO service_role;

COMMENT ON FUNCTION public.engine_load_commission_context(UUID) IS
  'Per-participant commission context: talent lanes + house (workspace menu) lanes. House lines force talent_cost_cents=0.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. engine_convert_to_booking — exclude house from booking_talent; sum lines
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engine_convert_to_booking(
  p_inquiry_id               UUID,
  p_actor_user_id            UUID,
  p_inquiry_expected_version INT,
  p_override_reason          TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inq              RECORD;
  off              RECORD;
  v_booking_id     UUID;
  v_actor_role     public.inquiry_event_actor_role := 'admin';
  v_actor_app_role TEXT;
  v_shortfall      JSONB;
  v_has_shortfall  BOOLEAN;
  v_override       BOOLEAN := false;
  v_reason_trim    TEXT;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_actor_user_id
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT app_role INTO v_actor_app_role
    FROM public.profiles WHERE id = p_actor_user_id;

  v_actor_role := CASE v_actor_app_role
    WHEN 'agency_staff' THEN 'coordinator'::public.inquiry_event_actor_role
    WHEN 'super_admin'  THEN 'admin'::public.inquiry_event_actor_role
    ELSE                     'admin'::public.inquiry_event_actor_role
  END;

  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  IF inq.booked_at IS NOT NULL THEN
    SELECT id INTO v_booking_id
    FROM public.agency_bookings
    WHERE source_inquiry_id = p_inquiry_id
    ORDER BY created_at DESC
    LIMIT 1;
    IF v_booking_id IS NOT NULL THEN
      RETURN v_booking_id;
    END IF;
  END IF;

  IF inq.version <> p_inquiry_expected_version THEN RAISE EXCEPTION 'version_conflict'; END IF;
  IF inq.status  <> 'approved'                  THEN RAISE EXCEPTION 'approvals_incomplete'; END IF;
  IF inq.current_offer_id IS NULL               THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  SELECT * INTO off FROM public.inquiry_offers WHERE id = inq.current_offer_id FOR UPDATE;
  IF NOT FOUND OR off.status <> 'accepted'      THEN RAISE EXCEPTION 'no_active_offer'; END IF;

  v_shortfall := public.engine_inquiry_group_shortfall(p_inquiry_id);
  v_has_shortfall := jsonb_array_length(v_shortfall) > 0;

  IF v_has_shortfall THEN
    IF p_override_reason IS NULL THEN
      RAISE EXCEPTION 'requirement_groups_unfulfilled';
    END IF;

    IF v_actor_app_role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'override_not_allowed';
    END IF;

    v_reason_trim := trim(p_override_reason);
    IF v_reason_trim IS NULL OR char_length(v_reason_trim) < 10 THEN
      RAISE EXCEPTION 'override_reason_too_short';
    END IF;

    v_override := true;
  END IF;

  INSERT INTO public.agency_bookings (
    source_inquiry_id,
    client_user_id, client_account_id, client_contact_id,
    owner_staff_id, created_by_staff_id,
    title, status,
    contact_name, contact_email, contact_phone,
    event_type_id, event_date, venue_location_text,
    total_client_revenue, currency_code, client_summary,
    source_type_snapshot, tenant_id_snapshot,
    coordinator_user_id_snapshot, owner_user_id_snapshot,
    event_timezone_snapshot,
    coordinator_response_time_ms, time_to_first_offer_ms, time_to_booking_ms,
    created_with_override, override_reason,
    wardrobe_notes,
    equipment_notes,
    transport_notes,
    lodging_notes,
    meals_notes,
    access_notes,
    deadline_at,
    timezone
  ) VALUES (
    p_inquiry_id,
    inq.client_user_id, inq.client_account_id, inq.client_contact_id,
    p_actor_user_id, p_actor_user_id,
    COALESCE(inq.contact_name || ' — booking', 'Booking'), 'confirmed',
    inq.contact_name, inq.contact_email, inq.contact_phone,
    inq.event_type_id, inq.event_date, inq.event_location,
    off.total_client_price, off.currency_code, off.notes,
    inq.source_type, inq.tenant_id,
    inq.coordinator_id, inq.owner_user_id,
    inq.event_timezone,
    NULL, NULL, NULL,
    v_override,
    CASE WHEN v_override THEN trim(p_override_reason) ELSE NULL END,
    inq.wardrobe_notes,
    inq.equipment_notes,
    inq.transport_notes,
    inq.lodging_notes,
    inq.meals_notes,
    inq.access_notes,
    inq.deadline_at,
    inq.event_timezone
  ) RETURNING id INTO v_booking_id;

  -- Talent lines only. House/menu lines must NOT enter booking_talent (review,
  -- fulfilment, and client booking UIs treat those rows as talent roster).
  INSERT INTO public.booking_talent (
    booking_id, talent_profile_id, talent_name_snapshot, profile_code_snapshot,
    role_label, pricing_unit, units,
    talent_cost_rate, client_charge_rate,
    talent_cost_total, client_charge_total, gross_profit, sort_order
  )
  SELECT
    v_booking_id, li.talent_profile_id, tp.display_name, tp.profile_code,
    li.label, li.pricing_unit, li.units,
    CASE WHEN li.units IS NULL OR li.units = 0 THEN 0 ELSE li.talent_cost / li.units END,
    li.unit_price, li.talent_cost, li.total_price, (li.total_price - li.talent_cost), li.sort_order
  FROM public.inquiry_offer_line_items li
  LEFT JOIN public.talent_profiles tp ON tp.id = li.talent_profile_id
  WHERE li.offer_id = off.id
    AND li.talent_profile_id IS NOT NULL;

  -- Header totals from ALL offer lines (talent + house). Summing booking_talent
  -- alone after the house exclusion would book every menu order at $0.
  UPDATE public.agency_bookings
    SET total_talent_cost = (
          SELECT COALESCE(SUM(li.talent_cost), 0)
          FROM public.inquiry_offer_line_items li
          WHERE li.offer_id = off.id
        ),
        total_client_revenue = (
          SELECT COALESCE(SUM(li.total_price), 0)
          FROM public.inquiry_offer_line_items li
          WHERE li.offer_id = off.id
        ),
        gross_profit = (
          SELECT COALESCE(SUM(li.total_price - li.talent_cost), 0)
          FROM public.inquiry_offer_line_items li
          WHERE li.offer_id = off.id
        )
    WHERE id = v_booking_id;

  UPDATE public.inquiries
    SET status         = 'booked',
        booked_at      = now(),
        next_action_by = NULL,
        version        = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

  PERFORM public.engine_emit_event(
    p_inquiry_id,
    'booking.created',
    p_actor_user_id,
    v_actor_role,
    'participants',
    jsonb_build_object(
      'booking_id', v_booking_id,
      'title',      COALESCE(inq.contact_name || ' — booking', 'Booking')
    )
  );

  IF v_override THEN
    PERFORM public.engine_emit_event(
      p_inquiry_id,
      'booking.converted_with_override',
      p_actor_user_id,
      v_actor_role,
      'staff_only',
      jsonb_build_object(
        'booking_id',      v_booking_id,
        'override_reason', trim(p_override_reason),
        'shortfall',       v_shortfall
      )
    );
  END IF;

  INSERT INTO public.booking_activity_log (booking_id, actor_user_id, event_type, payload)
  VALUES (
    v_booking_id,
    p_actor_user_id,
    'booking.converted_from_inquiry',
    jsonb_build_object(
      'inquiry_id',            p_inquiry_id,
      'created_with_override', v_override
    )
  );

  RETURN v_booking_id;
END;
$$;

REVOKE ALL ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) TO service_role;

COMMIT;
