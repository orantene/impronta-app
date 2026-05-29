-- Talent-protected commission split (2026-05-29).
--
-- Amends the commission model so the platform take is NEVER carved out of the
-- talent's pay. The take is split into:
--   • a CLIENT SURCHARGE  — added on top of the service subtotal, and
--   • a SELLER DEDUCTION  — taken from the seller-of-record's margin
--                           (the workspace; or the talent only when selling
--                            independently, owning_party_type='talent').
-- See web/src/lib/billing/commission.ts for the full math + invariant.
--
-- Launch default flips global take 5%→6%, split evenly (3% client + 3% seller)
-- per the product owner's worked example (MX$4,000 booking → client 4,120 /
-- talent 3,000 / workspace 880 / platform 240).
--
-- Timestamp note: named after the latest existing migration (20261004000000)
-- so the version order stays monotonic for `supabase db push`, rather than
-- today's UTC date which would sort *before* already-staged future-dated
-- migrations.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. platform_commission_config — the client/seller split knob (platform-admin
--    controlled in Phase 0.5) + the 6% launch default.
-- ---------------------------------------------------------------------------

ALTER TABLE public.platform_commission_config
  ADD COLUMN IF NOT EXISTS client_surcharge_bps INT;

ALTER TABLE public.platform_commission_config
  DROP CONSTRAINT IF EXISTS platform_commission_config_client_surcharge_bps_chk;
ALTER TABLE public.platform_commission_config
  ADD CONSTRAINT platform_commission_config_client_surcharge_bps_chk
    CHECK (
      client_surcharge_bps IS NULL
      OR (client_surcharge_bps >= 0 AND client_surcharge_bps <= 5000)
    );

COMMENT ON COLUMN public.platform_commission_config.client_surcharge_bps IS
  'Client-side share of the total platform take, in bps (added on top of the subtotal as a surcharge). Seller-side share = default_take_bps − this. NULL = even split of the resolved total. Talent pay is never touched when a workspace is the seller of record.';

-- Launch defaults: 6% total take, 3% client surcharge + 3% seller deduction.
-- (The resolver also defaults to an even split when client_surcharge_bps is
-- NULL, so a 600 total alone already yields 3%/3% — this pins it explicitly.)
UPDATE public.platform_commission_config
   SET default_take_bps = 600,
       client_surcharge_bps = 300,
       updated_at = now()
 WHERE singleton_key = TRUE;

-- ---------------------------------------------------------------------------
-- 2. booking_commission_snapshot — persist the split so the checkout amount
--    and the 3-way transfers read straight from the frozen row.
--    The table was truncated to 0 rows in 20260522215805 and the persist RPC
--    is its only writer, so NOT NULL DEFAULT 0 is safe.
-- ---------------------------------------------------------------------------

ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS client_surcharge_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_deduction_cents INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_charged_cents    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_shortfall_cents INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.booking_commission_snapshot.client_surcharge_cents IS
  'Client-side half of the platform take, added on top of gross_cents.';
COMMENT ON COLUMN public.booking_commission_snapshot.seller_deduction_cents IS
  'Seller-side half of the platform take, collected from the workspace margin (or the talent for an independent sale).';
COMMENT ON COLUMN public.booking_commission_snapshot.gross_charged_cents IS
  'What the client is actually charged = gross_cents + client_surcharge_cents. The Stripe PaymentIntent amount.';
COMMENT ON COLUMN public.booking_commission_snapshot.seller_shortfall_cents IS
  'Uncollected seller-side fee when a workspace margin is too thin. > 0 means the platform absorbed the gap to keep the talent whole; the offer composer should prompt a price raise.';

-- ---------------------------------------------------------------------------
-- 3. engine_persist_booking_commission_snapshot — carry the four new columns.
--    Full CREATE OR REPLACE (Postgres has no partial-replace); body identical
--    to 20260522215805 except the INSERT column list + values.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.engine_persist_booking_commission_snapshot(
  p_booking_id UUID,
  p_rows JSONB
) RETURNS JSONB
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
      currency_code, payment_method, off_platform_reason, resolved_from
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
      COALESCE((v_row->>'gross_charged_cents')::int, (v_row->>'gross_cents')::int),
      COALESCE((v_row->>'seller_shortfall_cents')::int, 0),
      v_row->>'currency_code',
      v_row->>'payment_method',
      v_row->>'off_platform_reason',
      v_row->>'resolved_from'
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
GRANT EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) IS
  'Persist N commission snapshots in one call — one per inquiry_participants row. Talent-protected split (2026-05-29): each row now also carries client_surcharge_cents / seller_deduction_cents / gross_charged_cents / seller_shortfall_cents. Off-platform rows emit a per-row accrual + balance bump against the OWNING tenant (skipped for owning_party_type=talent). Idempotent via the (booking_id, participant_id) PK.';

COMMIT;
