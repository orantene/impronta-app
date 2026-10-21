-- 20261231418200_fee_reader_rpc_caller_guards.sql
--
-- HELD (supabase/migrations/_pending_pm/). NOT APPLIED ANYWHERE. TUL-1269 M3,
-- package E6 (CALCULATION: these functions feed the commission / fee math and
-- the effective plan). PM moves it into supabase/migrations/ and pushes it
-- through the migration gate. Independent of 418000 / 418100.
--
-- PROBLEM: four SECURITY DEFINER functions are EXECUTE-able by every signed-in
-- user and never check who is calling:
--   engine_load_commission_context(uuid)     any booking's take rates, plan,
--                                            overrides, line items, payees
--   engine_workspace_base_fee_inputs(uuid)   any workspace's base fee + caps
--   engine_platform_commission_split()       platform client/seller split
--   reconcile_expired_plan_overrides(uuid)   a WRITER; NULL sweeps every tenant
-- (engine_send_offer, also listed on the card, was already bound to auth.uid()
-- by the APPLIED 20261231415300; nothing to do here.)
--
-- WHY GUARD, NOT REVOKE: every function has a USER-SESSION caller (grep of
-- web/src and web/scripts, 2026-10-19):
--
--   function                          caller                                              client
--   engine_load_commission_context    commission-engine.ts persistBookingCommissionSnapshot
--                                       <- inquiry-engine-booking.ts convertToBooking
--                                          <- _pipeline-actions.ts convertInquiryToBookingAction  USER (requireInquiryManagerAction)
--                                          <- messaging/confirm.ts confirmRecord               USER (c.supabase)
--                                       <- _pipeline-actions.ts markBookingPaymentMethodAction (first snapshot)  USER
--                                       <- _pipeline-actions.ts markBookingPaymentMethodAction (reclassify)      SERVICE ROLE
--                                       <- orders/purchase-attribution.ts                   SERVICE ROLE
--   engine_workspace_base_fee_inputs  commission-engine.ts (same call chain as above)     USER + SERVICE ROLE
--   engine_platform_commission_split  commission-engine.ts (same call chain as above)     USER + SERVICE ROLE
--   reconcile_expired_plan_overrides  [tenantSlug]/_data-bridge/workspace-config.ts       USER (createSupabaseServerClient)
--                                     platform/tenant-management-data.ts (NULL + one)     SERVICE ROLE
--                                     platform/workspace-override-banner-data.ts (x2)     SERVICE ROLE
--                                     api/cron/reconcile-plan-overrides (NULL)            SERVICE ROLE
--
-- A revoke would break the user-session paths, and commission-engine.ts swallows
-- fee-reader failures (base fee -> 0, split -> even split): money would change
-- silently. So each function authorises its caller instead.
--
-- ADMITTED CALLERS (no successful path today loses access):
--   * service role, and internal sessions with no JWT (psql, migrations): as in
--     engine_caller_may_write_tenant_finances (20261226000011).
--   * engine_load_commission_context: staff of the booking's tenant. This is the
--     exact set engine_persist_booking_commission_snapshot already admits, and
--     the context read is only ever followed by that write.
--   * engine_workspace_base_fee_inputs: staff of p_tenant_id, OR staff of the
--     tenant of an inquiry on which p_tenant_id is an owning party (cross-tenant
--     bookings: the converting coordinator reads the seller workspace's fee).
--   * engine_platform_commission_split: platform admins and members of any
--     workspace (it is one platform-wide number, read during conversion).
--   * reconcile_expired_plan_overrides: platform admins (NULL sweep or any
--     tenant); staff of p_tenant_id for that one tenant (the dashboard self-heal).
-- Refusals raise SQLSTATE 42501.
--
-- ROLLBACK: re-run the previous definitions (bodies only; ACLs are unchanged by
-- CREATE OR REPLACE):
--   engine_load_commission_context    20261231341000_commission_context_order_backed.sql (whole file)
--   engine_workspace_base_fee_inputs  20261009000000_workspace_base_reservation_fee.sql (the CREATE OR REPLACE FUNCTION block)
--   engine_platform_commission_split  20261008000000_platform_commission_split_reader.sql (the CREATE OR REPLACE FUNCTION block)
--   reconcile_expired_plan_overrides  20260924000000_workspace_plan_overrides.sql (the CREATE OR REPLACE FUNCTION block)
--
-- READ-ONLY VERIFICATION (after apply):
--   SELECT p.proname,
--          position('forbidden' IN p.prosrc) > 0 AS guarded,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--          has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('engine_load_commission_context', 'engine_workspace_base_fee_inputs',
--                        'engine_platform_commission_split', 'reconcile_expired_plan_overrides');
--   -- expect: guarded true, auth_exec true, anon_exec false on all four
--
-- ROLLED-BACK HARNESS (staging only; :stranger = a signed-in user with no
-- membership anywhere, :owner = owner of fixture workspace :tenant, :booking =
-- a booking of :tenant; never TAL-93938 / TUL-52):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', :'stranger', 'role', 'authenticated')::text, true);
--   SELECT public.engine_load_commission_context(:'booking');          -- expect: ERROR 42501
--   SELECT public.engine_workspace_base_fee_inputs(:'tenant');         -- expect: ERROR 42501
--   SELECT public.engine_platform_commission_split();                  -- expect: ERROR 42501
--   SELECT public.reconcile_expired_plan_overrides(NULL);              -- expect: ERROR 42501
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
--   SELECT public.engine_load_commission_context(:'booking') IS NOT NULL;  -- expect: true
--   SELECT public.engine_workspace_base_fee_inputs(:'tenant') ? 'max_base_fee_cents'; -- expect: true
--   SELECT public.engine_platform_commission_split();                  -- expect: a number or NULL, no error
--   SELECT public.reconcile_expired_plan_overrides(:'tenant');         -- expect: an integer
--   SELECT public.reconcile_expired_plan_overrides(NULL);              -- expect: ERROR 42501 (owner is not platform admin)
--   ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. engine_load_commission_context: body byte-identical to
--    20261231341000 apart from the marked guard block.
-- ---------------------------------------------------------------------------
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
  -- E6 CALLER GUARD BEGIN (TUL-1269 M3). Same admitted set as
  -- engine_persist_booking_commission_snapshot (20261231300100): service role,
  -- internal sessions, and staff of the booking's tenant (platform admins
  -- included). Runs before any config, fee or participant read.
  IF NOT public.engine_caller_may_write_tenant_finances(v_home_tenant_id) THEN
    RAISE EXCEPTION 'commission_context: forbidden' USING ERRCODE = '42501';
  END IF;
  -- E6 CALLER GUARD END

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

-- ---------------------------------------------------------------------------
-- 2. engine_workspace_base_fee_inputs: same four keys, now plpgsql with a guard.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.engine_workspace_base_fee_inputs(p_tenant_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (
    public.engine_caller_may_write_tenant_finances(p_tenant_id)
    OR EXISTS (
      SELECT 1
        FROM public.inquiry_participants ip
        JOIN public.inquiries i ON i.id = ip.inquiry_id
       WHERE ip.owning_party_id = p_tenant_id
         AND ip.owning_party_type IN ('workspace', 'agency')
         AND public.is_staff_of_tenant(i.tenant_id)
    )
  ) THEN
    RAISE EXCEPTION 'base_fee_inputs: forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'base_reservation_fee_cents',
      (SELECT base_reservation_fee_cents FROM public.workspace_commission_overrides WHERE tenant_id = p_tenant_id),
    'base_reservation_fee_bps',
      (SELECT base_reservation_fee_bps FROM public.workspace_commission_overrides WHERE tenant_id = p_tenant_id),
    'max_base_fee_cents',
      (SELECT max_base_fee_cents FROM public.platform_commission_config WHERE singleton_key = TRUE),
    'max_base_fee_bps',
      (SELECT max_base_fee_bps FROM public.platform_commission_config WHERE singleton_key = TRUE)
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. engine_platform_commission_split
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.engine_platform_commission_split()
 RETURNS integer
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_role TEXT;
BEGIN
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  IF NOT (
    v_caller_role IN ('service_role', '')
    OR public.is_platform_admin()
    OR cardinality(public.current_user_tenant_ids()) > 0
  ) THEN
    RAISE EXCEPTION 'commission_split: forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT client_surcharge_bps
      FROM public.platform_commission_config
     WHERE singleton_key = TRUE
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. reconcile_expired_plan_overrides: body identical to 20260924000000 after
--    the guard (the plan_tier write runs as the function owner, so the M1
--    trigger in 418100 does not apply to it).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reconcile_expired_plan_overrides(p_tenant_id uuid DEFAULT NULL::uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  rec           RECORD;
  reconciled    INTEGER := 0;
  restore_tier  TEXT;
  restore_seats INTEGER;
  v_caller_role TEXT;
BEGIN
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );
  IF NOT (
    v_caller_role IN ('service_role', '')
    OR public.is_platform_admin()
    OR (p_tenant_id IS NOT NULL AND public.is_staff_of_tenant(p_tenant_id))
  ) THEN
    RAISE EXCEPTION 'reconcile_expired_plan_overrides: forbidden' USING ERRCODE = '42501';
  END IF;

  FOR rec IN
    SELECT * FROM public.workspace_plan_overrides
     WHERE status = 'active'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
       AND (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
  LOOP
    -- Prefer a live paid subscription over the (possibly stale) base snapshot.
    SELECT plan_key INTO restore_tier
      FROM public.workspace_subscriptions
     WHERE tenant_id = rec.tenant_id
       AND status IN ('active','trialing','past_due')
     ORDER BY updated_at DESC
     LIMIT 1;

    IF restore_tier IS NULL THEN
      restore_tier := rec.base_plan_tier;
    END IF;

    IF restore_tier = rec.base_plan_tier THEN
      -- Returning to the exact base plan — restore the exact base seat
      -- limit (it may have been a custom non-standard value).
      restore_seats := rec.base_talent_seat_limit;
    ELSE
      restore_seats := CASE restore_tier
        WHEN 'free'   THEN 10
        WHEN 'studio' THEN 50
        WHEN 'agency' THEN 200
        ELSE NULL  -- network = unlimited
      END;
    END IF;

    UPDATE public.agencies
       SET plan_tier = restore_tier,
           talent_seat_limit = restore_seats,
           updated_at = now()
     WHERE id = rec.tenant_id;

    UPDATE public.workspace_plan_overrides
       SET status = 'expired',
           ended_at = now()
     WHERE id = rec.id;

    reconciled := reconciled + 1;
  END LOOP;

  RETURN reconciled;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 5. Grants: authenticated keeps EXECUTE (user-session callers above); anon and
--    PUBLIC never. Restated so the end state does not depend on history.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.engine_load_commission_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.engine_workspace_base_fee_inputs(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_workspace_base_fee_inputs(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.engine_platform_commission_split() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engine_platform_commission_split() TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reconcile_expired_plan_overrides(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_expired_plan_overrides(uuid) TO authenticated, service_role;

DO $$
DECLARE
  v_fn TEXT;
BEGIN
  FOREACH v_fn IN ARRAY ARRAY[
    'public.engine_load_commission_context(uuid)',
    'public.engine_workspace_base_fee_inputs(uuid)',
    'public.engine_platform_commission_split()',
    'public.reconcile_expired_plan_overrides(uuid)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'E6 M3: % is anon-executable', v_fn;
    END IF;
    IF NOT has_function_privilege('authenticated', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'E6 M3: % lost authenticated (user-session callers would break)', v_fn;
    END IF;
    IF position('forbidden' IN (SELECT prosrc FROM pg_proc WHERE oid = v_fn::regprocedure)) = 0 THEN
      RAISE EXCEPTION 'E6 M3: % has no caller guard', v_fn;
    END IF;
  END LOOP;
END $$;

COMMIT;
