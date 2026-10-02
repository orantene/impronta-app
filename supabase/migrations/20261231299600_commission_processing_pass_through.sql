-- Processing-fee pass-through (owner decision 2026-10-01). ADDITIVE + IDEMPOTENT.
--
-- New fee model, opt-in and OFF by default (processing_mode = 'included' is
-- today's behaviour):
--   client pays subtotal + a client-only surcharge (pass_through_take_bps,
--   default 150 = 1.5%); the SELLER bears the ACTUAL payment-processing fee at
--   cost (read from the charge's balance transaction at payout time); Tulala
--   adds no seller-side fee.
--
-- What this migration does (nothing changes behaviour until the owner flips
-- platform_commission_config.processing_mode to 'pass_through'):
--   1. platform_commission_config: + processing_mode ('included'|'pass_through',
--      default 'included'), + pass_through_take_bps (default 150).
--   1b. platform_commission_config.processor_fee_rates (jsonb, DATA): processor
--      pricing per lowercase currency + "default" — percent, fixed_cents,
--      tax_on_fee. Used only to GROSS UP when a seller picks payer='client'.
--   1c. talent_profiles.processing_fee_payer / agencies.processing_fee_payer
--      ('seller' DEFAULT | 'client'): the per-seller choice of who pays the fee.
--      Default 'seller' => behaviour unchanged for everyone.
--   2. booking_commission_snapshot: + processing_mode (default 'included') —
--      + processing_fee_payer / client_processing_fee_cents /
--      processing_fee_quoted_cents; the mode is FROZEN per snapshot so flipping the setting never changes
--      an already-quoted booking.
--   3. booking_payouts: + processing_fee_cents (nullable) — the processing fee
--      carried by the leg (talent: deducted; workspace: borne from margin).
--   4. engine_platform_processing_mode() — SECURITY DEFINER reader (same
--      pattern as engine_platform_commission_split) returning
--      {processing_mode, pass_through_take_bps}.
--   5. engine_persist_booking_commission_snapshot — redefined from
--      20261226000011 (authorization guard retained, byte-identical otherwise)
--      to also store processing_mode. Absent key => 'included'.
--
-- OWNER: run `cd web && npm run db:push` BEFORE merging the PR. To switch the
-- model on later (NOT done here):
--   UPDATE platform_commission_config SET processing_mode = 'pass_through'
--    WHERE singleton_key = TRUE;
-- (default_take_bps / client_surcharge_bps are ignored in pass_through mode;
--  pass_through_take_bps drives the client surcharge.)

BEGIN;

ALTER TABLE public.platform_commission_config
  ADD COLUMN IF NOT EXISTS processing_mode TEXT NOT NULL DEFAULT 'included',
  ADD COLUMN IF NOT EXISTS pass_through_take_bps INT NOT NULL DEFAULT 150;

ALTER TABLE public.platform_commission_config
  DROP CONSTRAINT IF EXISTS platform_commission_config_processing_mode_chk;
ALTER TABLE public.platform_commission_config
  ADD CONSTRAINT platform_commission_config_processing_mode_chk
    CHECK (processing_mode IN ('included', 'pass_through'));

ALTER TABLE public.platform_commission_config
  DROP CONSTRAINT IF EXISTS platform_commission_config_pass_through_take_bps_chk;
ALTER TABLE public.platform_commission_config
  ADD CONSTRAINT platform_commission_config_pass_through_take_bps_chk
    CHECK (pass_through_take_bps >= 0 AND pass_through_take_bps <= 5000);

COMMENT ON COLUMN public.platform_commission_config.processing_mode IS
  '''included'' = legacy (processing cost absorbed in the take). ''pass_through'' = client pays subtotal + pass_through_take_bps; seller bears the actual processing fee at payout. Frozen per snapshot.';
COMMENT ON COLUMN public.platform_commission_config.pass_through_take_bps IS
  'pass_through mode only: the total platform take in bps, charged entirely to the client as a surcharge (seller share 0). Default 150 = 1.5%.';

ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS processing_mode TEXT NOT NULL DEFAULT 'included';
ALTER TABLE public.booking_commission_snapshot
  DROP CONSTRAINT IF EXISTS booking_commission_snapshot_processing_mode_chk;
ALTER TABLE public.booking_commission_snapshot
  ADD CONSTRAINT booking_commission_snapshot_processing_mode_chk
    CHECK (processing_mode IN ('included', 'pass_through'));
COMMENT ON COLUMN public.booking_commission_snapshot.processing_mode IS
  'Fee model frozen at snapshot time. pass_through rows hold PROVISIONAL lanes (before the processing fee); the payout step deducts the real fee.';

ALTER TABLE public.platform_commission_config
  ADD COLUMN IF NOT EXISTS processor_fee_rates JSONB NOT NULL DEFAULT
    '{"default":{"percent":0.029,"fixed_cents":30,"tax_on_fee":0},"mxn":{"percent":0.036,"fixed_cents":300,"tax_on_fee":0.16}}'::jsonb;
COMMENT ON COLUMN public.platform_commission_config.processor_fee_rates IS
  'Processor pricing as data, keyed by lowercase currency with a "default" fallback: {percent, fixed_cents, tax_on_fee}. fee(g) = round((percent*g + fixed_cents) * (1 + tax_on_fee)). Used to gross up when a seller picks processing_fee_payer=client.';

ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS processing_fee_payer TEXT NOT NULL DEFAULT 'seller',
  ADD COLUMN IF NOT EXISTS client_processing_fee_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS processing_fee_quoted_cents INT NOT NULL DEFAULT 0;
ALTER TABLE public.booking_commission_snapshot
  DROP CONSTRAINT IF EXISTS booking_commission_snapshot_processing_fee_payer_chk;
ALTER TABLE public.booking_commission_snapshot
  ADD CONSTRAINT booking_commission_snapshot_processing_fee_payer_chk
    CHECK (processing_fee_payer IN ('seller', 'client'));

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS processing_fee_payer TEXT NOT NULL DEFAULT 'seller';
ALTER TABLE public.talent_profiles
  DROP CONSTRAINT IF EXISTS talent_profiles_processing_fee_payer_chk;
ALTER TABLE public.talent_profiles
  ADD CONSTRAINT talent_profiles_processing_fee_payer_chk
    CHECK (processing_fee_payer IN ('seller', 'client'));

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS processing_fee_payer TEXT NOT NULL DEFAULT 'seller';
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_processing_fee_payer_chk;
ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_processing_fee_payer_chk
    CHECK (processing_fee_payer IN ('seller', 'client'));

COMMENT ON COLUMN public.talent_profiles.processing_fee_payer IS
  'Who pays the payment-processing fee on this talent''s independent sales (pass_through mode): seller (default, fee deducted from payout) or client (grossed up on top; seller receives 100% of the subtotal).';
COMMENT ON COLUMN public.agencies.processing_fee_payer IS
  'Who pays the payment-processing fee on this workspace''s sales (pass_through mode): seller (default; fee comes out of the workspace margin, talent whole) or client (grossed up; workspace keeps its full margin).';

ALTER TABLE public.booking_payouts
  ADD COLUMN IF NOT EXISTS processing_fee_cents INT;
COMMENT ON COLUMN public.booking_payouts.processing_fee_cents IS
  'pass_through: the processing fee carried by this leg (talent leg: deducted from the payout; workspace leg: borne from margin). NULL for included-mode legs.';

CREATE OR REPLACE FUNCTION public.engine_platform_processing_mode()
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'processing_mode', processing_mode,
    'pass_through_take_bps', pass_through_take_bps,
    'processor_fee_rates', processor_fee_rates
  )
  FROM public.platform_commission_config
  WHERE singleton_key = TRUE;
$$;

REVOKE ALL ON FUNCTION public.engine_platform_processing_mode() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_platform_processing_mode() FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_platform_processing_mode() TO authenticated, service_role;

COMMENT ON FUNCTION public.engine_platform_processing_mode() IS
  'Returns {processing_mode, pass_through_take_bps} from platform_commission_config so the commission engine (user client) can read the fee model despite the admin-only RLS.';

CREATE OR REPLACE FUNCTION public.engine_processing_fee_payer(p_party_type TEXT, p_party_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    CASE
      WHEN p_party_type = 'talent'    THEN (SELECT processing_fee_payer FROM public.talent_profiles WHERE id = p_party_id)
      WHEN p_party_type = 'workspace' THEN (SELECT processing_fee_payer FROM public.agencies WHERE id = p_party_id)
    END,
    'seller'
  );
$$;

REVOKE ALL ON FUNCTION public.engine_processing_fee_payer(TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_processing_fee_payer(TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_processing_fee_payer(TEXT, UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.engine_processing_fee_payer(TEXT, UUID) IS
  'Returns the seller''s processing_fee_payer (seller|client) for a talent_profiles.id or agencies.id; defaults to seller. Read by the commission engine (pass_through mode only).';

-- Persist RPC: identical to 20261226000011 (guard retained) + processing_mode.
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
      channel_referral_cents, channel_referral_party_id,
      processing_mode, processing_fee_payer, client_processing_fee_cents, processing_fee_quoted_cents
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
      NULLIF(v_row->>'channel_referral_party_id', '')::uuid,
      COALESCE(NULLIF(v_row->>'processing_mode', ''), 'included'),
      COALESCE(NULLIF(v_row->>'processing_fee_payer', ''), 'seller'),
      COALESCE((v_row->>'client_processing_fee_cents')::int, 0),
      COALESCE((v_row->>'processing_fee_quoted_cents')::int, 0)
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

REVOKE ALL ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) FROM anon;
GRANT EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) TO authenticated, service_role;

COMMIT;
