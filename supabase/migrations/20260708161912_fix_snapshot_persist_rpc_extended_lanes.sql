-- FIX (P0, pre-existing drift): engine_persist_booking_commission_snapshot
-- never inserted the extended lane columns (client_surcharge_cents,
-- seller_deduction_cents, gross_charged_cents, seller_shortfall_cents) that the
-- TS engine has been sending — they defaulted to 0, so EVERY new snapshot
-- violated the updated CHECK (platform+workspace+talent = gross_charged_cents)
-- and persist failed silently. Downstream, payment fell back to charging the
-- RAW rate (client surcharge never collected). Surfaced by the offerings E2E QA
-- on 2026-07-08; last good snapshot row was 2026-06-03.
--
-- Fix: insert the four extended columns. gross_charged falls back to the lane
-- sum so any legacy caller that omits the key still satisfies the constraint.

CREATE OR REPLACE FUNCTION public.engine_persist_booking_commission_snapshot(p_booking_id uuid, p_rows jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;
