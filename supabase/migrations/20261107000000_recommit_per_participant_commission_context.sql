-- DRIFT FIX (G15) — re-commit the LIVE per-participant engine_load_commission_context.
--
-- Incident: the live prod function (project pluhdapdnuiulvxmyspd) is the
-- PER-PARTICIPANT body — it returns a `participants[]` array, resolving each
-- talent participant's owning tenant (owning_party_*) to that tenant's
-- plan_tier + workspace_commission_overrides + that participant's own offer
-- line items. But the LAST COMMITTED migration to define this function,
-- 20260926000000_fix_commission_context_rpc_columns.sql, is the OLD
-- SINGLE-TENANT body (flat tenant_id / workspace_plan / offer_line_items, NO
-- participants). The per-participant body was applied out-of-band (manual) and
-- never captured in a migration, so `supabase db reset` / any
-- rebuild-from-migrations would REINSTALL the single-tenant body.
--
-- Why that is fatal (not just wrong): commission-engine.ts reads
-- `ctx.participants` and bails with `no_participants`; persistBookingCommissionSnapshot
-- is FATAL in inquiry-engine-booking.ts (on snapshot failure it DELETEs the
-- booking and restores the inquiry to 'approved'). So with the single-tenant
-- body, EVERY booking conversion through the engine would roll back. This
-- migration makes the committed history reproduce production.
--
-- The body below is captured verbatim from the live function via
--   pg_get_functiondef('public.engine_load_commission_context(uuid)')
-- on 2026-06-28. Applying it to prod is a no-op (byte-identical to the running
-- definition); its only effect is to version the live body so a rebuild is safe.

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
  v_offer_id UUID;
  v_currency_code TEXT;
  v_platform_config JSONB;
  v_unattributed_count INT;
  v_participants JSONB;
BEGIN
  -- 1. Resolve booking → inquiry → home tenant.
  SELECT b.source_inquiry_id, b.tenant_id
    INTO v_inquiry_id, v_home_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;

  IF v_inquiry_id IS NULL THEN
    RAISE EXCEPTION 'commission_context: booking not found' USING ERRCODE = 'P0002';
  END IF;

  -- 2. Platform config (singleton).
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

  -- 3. Accepted offer.
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

  -- 4. Reject unattributed line items in v1 (house lane is v2).
  SELECT COUNT(*) INTO v_unattributed_count
  FROM public.inquiry_offer_line_items li
  WHERE li.offer_id = v_offer_id
    AND li.talent_profile_id IS NULL;

  IF v_unattributed_count > 0 THEN
    RAISE EXCEPTION 'commission_context: offer % has % line item(s) with no talent_profile_id — house lane not supported in v1', v_offer_id, v_unattributed_count;
  END IF;

  -- 5. Per-participant contexts. One row per inquiry_participants entry
  --    (role='talent', status='active') that also has at least one line item
  --    on the accepted offer. Each row carries:
  --      - participant_id, talent_profile_id, owning_party_*
  --      - tenant_id resolved from owning_party (NULL for type='talent')
  --      - workspace_plan resolved from that tenant's agencies.plan_tier
  --        (NULL for type='talent')
  --      - tenant_override row keyed by that tenant (NULL if none / type='talent')
  --      - filtered offer_line_items for this participant's talent_profile_id
  --
  --    We require each active talent participant to have ≥1 line item; if a
  --    participant has none, raise — it indicates a malformed offer.
  WITH talent_parts AS (
    SELECT
      p.id AS participant_id,
      p.talent_profile_id,
      p.owning_party_type,
      p.owning_party_id,
      CASE
        WHEN p.owning_party_type IN ('workspace', 'agency') THEN p.owning_party_id
        ELSE NULL
      END AS tenant_id
    FROM public.inquiry_participants p
    WHERE p.inquiry_id = v_inquiry_id
      AND p.role = 'talent'
      AND p.status = 'active'
      AND p.talent_profile_id IS NOT NULL
      AND p.owning_party_type IS NOT NULL
      AND p.owning_party_id IS NOT NULL
  ),
  participant_lines AS (
    SELECT
      tp.participant_id,
      tp.talent_profile_id,
      tp.owning_party_type,
      tp.owning_party_id,
      tp.tenant_id,
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
          'talent_cost_cents', (li.talent_cost * 100)::int
        ) ORDER BY li.id)
        FROM public.inquiry_offer_line_items li
        WHERE li.offer_id = v_offer_id
          AND li.talent_profile_id = tp.talent_profile_id
      ) AS line_items
    FROM talent_parts tp
    LEFT JOIN public.agencies a ON a.id = tp.tenant_id
    LEFT JOIN public.workspace_commission_overrides wco ON wco.tenant_id = tp.tenant_id
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
    RAISE EXCEPTION 'commission_context: no eligible talent participants for booking %', p_booking_id;
  END IF;

  -- Validate every participant has at least one line item. Guard against
  -- NULL: jsonb_array_length(NULL) raises in strict mode and returns NULL
  -- otherwise, neither of which is the intended check.
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_participants) elt
    WHERE COALESCE(elt->'offer_line_items', 'null'::jsonb) IN ('null'::jsonb, '[]'::jsonb)
  ) THEN
    RAISE EXCEPTION 'commission_context: at least one participant has no line items on offer %', v_offer_id;
  END IF;

  RETURN jsonb_build_object(
    'booking_id', p_booking_id,
    'home_tenant_id', v_home_tenant_id,
    'offer_id', v_offer_id,
    'currency_code', v_currency_code,
    'platform_config', v_platform_config,
    'participants', v_participants
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.engine_load_commission_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(UUID) TO authenticated;

COMMENT ON FUNCTION public.engine_load_commission_context(UUID) IS
  'Loads per-participant commission context for a booking: platform config + one context per active talent participant (owning_party -> tenant plan_tier + workspace_commission_overrides + that participant''s offer line items). SECURITY DEFINER bypasses platform_commission_config admin-only RLS. Re-committed 2026-06-28 (G15 drift fix) to version the live per-participant body so a rebuild-from-migrations reproduces prod.';

COMMIT;
