-- Finance P0 — authorize the money-writing engine RPCs, and close the anon grants.
--
-- FOUND BY: the Finance/Payments day-one audit, 2026-09-01.
--
-- Three SECURITY DEFINER functions were reachable by callers who should never
-- have been able to invoke them:
--
--   1. engine_persist_booking_commission_snapshot(uuid, jsonb)
--      EXECUTE was granted to `authenticated` and the body performed NO
--      authorization check — it verified only that the booking existed. Those
--      rows are what `executeBookingTransfers` reads to decide how much money
--      to send to whom, and the same call also writes
--      `platform_commission_movements` + `platform_commission_balances` for a
--      CALLER-SUPPLIED tenant id. Any logged-in user could therefore write the
--      payout split for a booking whose snapshot had not been persisted yet.
--
--   2. record_discount_redemption(...)
--      EXECUTE reachable by `anon` — an unauthenticated writer into a financial
--      ledger, able to burn a campaign's max_redemptions.
--
--   3. engine_platform_commission_split()
--      EXECUTE reachable by `anon` — discloses the platform's take-rate split.
--
-- WHY THIS IS NOT A PLAIN REVOKE (for #1 and #3)
-- ---------------------------------------------
-- `convertToBooking` and the mark-as-cash reclassification call both of these
-- on the END USER's RLS client, not a service-role one — `lib/saas/admin-scope.ts`
-- states it outright: "all mutations run on `supabase` (user client)". Revoking
-- EXECUTE from `authenticated` would therefore break booking conversion
-- outright. The correct shape for a SECURITY DEFINER function that legitimately
-- needs an end-user caller is to AUTHORIZE ITSELF, which is what this migration
-- adds. #2 has exactly one caller (the Stripe webhook handler, on a service-role
-- client), so there a straight revoke IS correct.
--
-- Note on REVOKE — you need BOTH halves, verified against this database on
-- 2026-09-01. A privilege can reach `anon` by two independent routes:
--
--   • a PUBLIC grant, where revoking from `anon` alone is a no-op; and
--   • an EXPLICIT grant to the `anon` role, which Supabase's default privileges
--     (`ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON FUNCTIONS TO anon,
--     authenticated, service_role`) attach to every new function in `public` —
--     where revoking from PUBLIC alone is a no-op.
--
-- These functions had the second kind: `proacl` read `anon=X/postgres`. A
-- REVOKE ... FROM PUBLIC left `has_function_privilege('anon', ...)` still true.
-- Every function below is therefore revoked from PUBLIC *and* from anon, and
-- the result asserted with `has_function_privilege`.
--
-- NOT IN THIS MIGRATION, deliberately: `engine_load_commission_context` (a READ
-- function — cross-tenant disclosure, not money movement) and validation of the
-- caller-supplied `owning_party_id` inside p_rows. Both are follow-ups; this
-- migration is scoped to the two findings that let an unauthorized caller WRITE.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. The caller-authorization helper.
--
-- Returns true when the caller is allowed to write financial records for
-- `p_tenant_id`. Three admitted callers:
--
--   • service_role  — our own server code (webhooks, service-role clients)
--   • an internal / direct connection (migrations, psql) — `request.jwt.claims`
--     is unset there, and such a session is already superuser-equivalent
--   • an end user who is staff of that tenant. `is_staff_of_tenant` already
--     folds in `is_platform_admin()`, so super-admins pass through it.
--
-- Anything else — notably `anon`, and an `authenticated` user who is not staff
-- of the tenant — is refused.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engine_caller_may_write_tenant_finances(
  p_tenant_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
BEGIN
  -- Read the PostgREST JWT role. Both claim shapes are checked; a direct
  -- database connection has neither, and resolves to '' (internal).
  v_caller_role := COALESCE(
    NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    ''
  );

  IF v_caller_role IN ('service_role', '') THEN
    RETURN TRUE;
  END IF;

  IF p_tenant_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN public.is_staff_of_tenant(p_tenant_id);
END;
$$;

COMMENT ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) IS
  'Authorization gate for SECURITY DEFINER financial RPCs that accept an end-user caller. True for service_role, for internal/direct connections, and for staff of the tenant (which includes platform admins). Added by the 2026-09-01 finance audit.';

REVOKE ALL ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_caller_may_write_tenant_finances(UUID) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. engine_persist_booking_commission_snapshot — authorize the caller.
--
-- Body is byte-identical to the deployed version APART FROM the guard block
-- marked below. Do not remove that block when editing this function.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.engine_persist_booking_commission_snapshot(
  p_booking_id UUID,
  p_rows JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_home_tenant_id UUID;
  v_row JSONB;
  v_inserted_count INT := 0;
  v_existing_count INT;
  v_result JSONB;
BEGIN
  SELECT b.tenant_id INTO v_home_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;
  IF v_home_tenant_id IS NULL THEN
    RAISE EXCEPTION 'persist_snapshot: booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  -- ── AUTHORIZATION GUARD (finance audit 2026-09-01) ────────────────────────
  -- These rows decide who gets paid. Without this check any authenticated user
  -- could write the payout split for any booking, and forge an accrual against
  -- any tenant. Keep this immediately after the booking lookup.
  IF NOT public.engine_caller_may_write_tenant_finances(v_home_tenant_id) THEN
    RAISE EXCEPTION 'persist_snapshot: not authorized to write commission records for booking %', p_booking_id
      USING ERRCODE = '42501';
  END IF;
  -- ── END GUARD ─────────────────────────────────────────────────────────────

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'persist_snapshot: p_rows must be a non-empty JSONB array';
  END IF;

  SELECT COUNT(*) INTO v_existing_count
  FROM public.booking_commission_snapshot s
  WHERE s.booking_id = p_booking_id
    AND s.participant_id IN (
      SELECT (elt->>'participant_id')::uuid
      FROM jsonb_array_elements(p_rows) elt
    );

  IF v_existing_count = jsonb_array_length(p_rows) THEN
    SELECT jsonb_agg(to_jsonb(s) ORDER BY s.participant_id) INTO v_result
    FROM public.booking_commission_snapshot s
    WHERE s.booking_id = p_booking_id;
    RETURN jsonb_build_object('inserted_count', 0, 'rows', v_result);
  END IF;

  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.booking_commission_snapshot (
      booking_id, participant_id, owning_party_type, owning_party_id,
      platform_take_bps, platform_take_floor_cents,
      gross_cents, platform_fee_cents, workspace_fee_cents, talent_net_cents,
      client_surcharge_cents, seller_deduction_cents, gross_charged_cents, seller_shortfall_cents,
      currency_code, payment_method, off_platform_reason, resolved_from,
      channel_referral_cents, channel_referral_party_id
    ) VALUES (
      p_booking_id,
      (v_row->>'participant_id')::uuid,
      v_row->>'owning_party_type',
      (v_row->>'owning_party_id')::uuid,
      (v_row->>'platform_take_bps')::int,
      (v_row->>'platform_take_floor_cents')::int,
      (v_row->>'gross_cents')::int,
      (v_row->>'platform_fee_cents')::int,
      (v_row->>'workspace_fee_cents')::int,
      (v_row->>'talent_net_cents')::int,
      COALESCE((v_row->>'client_surcharge_cents')::int, 0),
      COALESCE((v_row->>'seller_deduction_cents')::int, 0),
      COALESCE(
        (v_row->>'gross_charged_cents')::int,
        (v_row->>'platform_fee_cents')::int
          + (v_row->>'workspace_fee_cents')::int
          + (v_row->>'talent_net_cents')::int
      ),
      COALESCE((v_row->>'seller_shortfall_cents')::int, 0),
      v_row->>'currency_code',
      v_row->>'payment_method',
      v_row->>'off_platform_reason',
      v_row->>'resolved_from',
      COALESCE((v_row->>'channel_referral_cents')::int, 0),
      NULLIF(v_row->>'channel_referral_party_id', '')::uuid
    )
    ON CONFLICT (booking_id, participant_id) DO NOTHING;

    IF FOUND THEN
      v_inserted_count := v_inserted_count + 1;

      IF (v_row->>'payment_method') IN ('cash', 'wire', 'venue_paid', 'crypto', 'other')
         AND (v_row->>'owning_party_type') IN ('workspace', 'agency')
      THEN
        INSERT INTO public.platform_commission_movements (
          tenant_id, booking_id, movement_type, amount_cents, currency_code, note
        ) VALUES (
          (v_row->>'owning_party_id')::uuid,
          p_booking_id,
          'accrual',
          (v_row->>'platform_fee_cents')::int,
          v_row->>'currency_code',
          'Off-platform booking participant ' || (v_row->>'participant_id') ||
            ': ' || COALESCE(v_row->>'off_platform_reason', v_row->>'payment_method')
        );

        INSERT INTO public.platform_commission_balances (tenant_id, balances_cents)
        VALUES (
          (v_row->>'owning_party_id')::uuid,
          jsonb_build_object(v_row->>'currency_code', (v_row->>'platform_fee_cents')::int)
        )
        ON CONFLICT (tenant_id) DO NOTHING;

        UPDATE public.platform_commission_balances
           SET balances_cents = jsonb_set(
                 balances_cents,
                 ARRAY[v_row->>'currency_code'],
                 to_jsonb(
                   COALESCE((balances_cents ->> (v_row->>'currency_code'))::int, 0)
                     + (v_row->>'platform_fee_cents')::int
                 )
               ),
               updated_at = now()
         WHERE tenant_id = (v_row->>'owning_party_id')::uuid;
      END IF;
    END IF;
  END LOOP;

  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.participant_id) INTO v_result
  FROM public.booking_commission_snapshot s
  WHERE s.booking_id = p_booking_id;

  RETURN jsonb_build_object('inserted_count', v_inserted_count, 'rows', v_result);
END;
$$;

-- The end-user path (convertToBooking, mark-as-cash) legitimately needs
-- `authenticated`; the guard above is what makes that safe. `anon` never does.
REVOKE ALL ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. engine_platform_commission_split — same end-user path, no anon.
--    Read-only over a singleton config row; `authenticated` is required because
--    commission-engine.ts reads it on the user client during conversion.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.engine_platform_commission_split() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_platform_commission_split() FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_platform_commission_split() TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. record_discount_redemption — service_role ONLY.
--    Single caller: lib/stripe/webhook-handler.ts, on createServiceRoleClient().
--    No end-user path exists, so no in-body guard is needed.
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.record_discount_redemption(TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_discount_redemption(TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_discount_redemption(TEXT, TEXT, TEXT, UUID, UUID, TEXT, UUID) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Assert the end state. A grant that silently survives a revoke is the exact
--    failure this migration exists to fix, so fail the migration rather than
--    report success on a database where it did not take.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.engine_persist_booking_commission_snapshot(uuid,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.engine_platform_commission_split()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.engine_caller_may_write_tenant_finances(uuid)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.record_discount_redemption(text,text,text,uuid,uuid,text,uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.record_discount_redemption(text,text,text,uuid,uuid,text,uuid)', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'finance P0 migration: a revoke did not take — anon/authenticated still holds EXECUTE on a financial RPC';
  END IF;

  -- The end-user path must survive: convertToBooking and mark-as-cash call
  -- these on the user client, so `authenticated` losing them would break
  -- booking conversion.
  IF NOT has_function_privilege('authenticated', 'public.engine_persist_booking_commission_snapshot(uuid,jsonb)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.engine_platform_commission_split()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'finance P0 migration: authenticated lost EXECUTE on the booking-conversion path';
  END IF;
END $$;
