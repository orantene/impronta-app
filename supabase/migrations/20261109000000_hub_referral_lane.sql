-- Phase C — HUB REFERRAL LANE (a 4th money lane).
--
-- Owner-ratified decision (2026-06-28): when a lead enters through one
-- workspace/hub (the CHANNEL, source_workspace_id) but is managed + booked by a
-- DIFFERENT agency (the re-homed tenant_id, Phase B), the originating channel
-- earns a referral. That referral comes OUT OF THE MANAGING AGENCY'S MARGIN
-- (the workspace_fee lane) — it is NOT a new client charge and NEVER touches
-- talent pay or the platform fee. It is a 4th lane carved from workspace_fee.
--
-- Ship dark + safe:
--   • Rate is per-ORIGINATING-WORKSPACE (workspace_channel_referral_config) and
--     DEFAULTS TO 0. An unconfigured channel yields a 0 referral.
--   • The engine gates the whole lane on process.env.HUB_REFERRAL_LANE === '1'
--     (off by default), so even a configured rate is inert until the flag flips.
--   • At rate 0 the resolver math is byte-identical to today (the new lane is
--     0, deducted from nothing), so existing money tests stay green.
--
-- This migration:
--   1. workspace_channel_referral_config — per-channel referral bps (default 0).
--   2. booking_commission_snapshot — channel_referral_cents + party columns.
--   3. engine_load_commission_context — ADD top-level source_workspace_id +
--      hub_referral_bps (per-participant body PRESERVED EXACTLY).
--   4. engine_persist_booking_commission_snapshot — accept + store the 2 new
--      per-row fields.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Per-channel referral rate. Keyed by the ORIGINATING workspace (the hub /
--    channel the lead entered through = inquiries.source_workspace_id). bps,
--    0..5000 (0..50%), DEFAULT 0 so an unconfigured channel = no referral.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspace_channel_referral_config (
  source_workspace_id UUID PRIMARY KEY REFERENCES public.agencies(id) ON DELETE CASCADE,
  hub_referral_bps    INT NOT NULL DEFAULT 0 CHECK (hub_referral_bps >= 0 AND hub_referral_bps <= 5000),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_channel_referral_config IS
  'Phase C hub-referral lane: per-originating-workspace (channel) referral rate in bps. The referral is carved out of the MANAGING agency margin (workspace_fee) when a re-homed cross-tenant inquiry was sourced through a different channel. DEFAULT 0 = no referral; the engine also gates the whole lane on HUB_REFERRAL_LANE=1.';
COMMENT ON COLUMN public.workspace_channel_referral_config.source_workspace_id IS
  'The originating workspace/hub (channel) = inquiries.source_workspace_id. The party paid the referral.';
COMMENT ON COLUMN public.workspace_channel_referral_config.hub_referral_bps IS
  'Referral rate in bps (0..5000). Applied to the booking subtotal, capped at the managing workspace_fee, deducted from it. DEFAULT 0.';

ALTER TABLE public.workspace_channel_referral_config ENABLE ROW LEVEL SECURITY;

-- SELECT for any authenticated user (rates are not sensitive; the engine reads
-- via a SECURITY DEFINER RPC anyway). Writes are NOT exposed to authenticated
-- here — only the service role (which bypasses RLS) or a platform-admin tool
-- may configure rates. NOTE/follow-up: if a platform-admin UI later needs to
-- write rates under the user's JWT, add an INSERT/UPDATE policy gated on a
-- platform-admin predicate (e.g. is_platform_admin()); intentionally omitted
-- now to keep writes service-role-only while the lane ships dark.
DROP POLICY IF EXISTS workspace_channel_referral_config_select ON public.workspace_channel_referral_config;
CREATE POLICY workspace_channel_referral_config_select
  ON public.workspace_channel_referral_config
  FOR SELECT
  TO authenticated
  USING (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Snapshot columns for the new lane. Both default to a no-op (0 cents / no
--    party) so existing rows + every rate-0 booking are unaffected.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS channel_referral_cents    INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS channel_referral_party_id UUID NULL;

COMMENT ON COLUMN public.booking_commission_snapshot.channel_referral_cents IS
  'Phase C: referral paid to the originating channel, carved from this row''s workspace_fee_cents. 0 when the lane is off / rate 0 / not a re-homed cross-channel booking.';
COMMENT ON COLUMN public.booking_commission_snapshot.channel_referral_party_id IS
  'Phase C: the originating workspace (source_workspace_id) paid the channel_referral. NULL when channel_referral_cents = 0.';

-- 2b. Allow a 'channel_referral' payout leg in the ledger. The hub referral is
--     fanned out post-payment as its own leg (to the channel's Connect account),
--     so the party CHECK must accept it and the (booking, participant, party)
--     unique constraint keeps it distinct + idempotent from the workspace leg.
--     A pure additive constraint change — no existing leg is affected (rate-0
--     bookings never create a channel_referral leg).
ALTER TABLE public.booking_payouts
  DROP CONSTRAINT IF EXISTS booking_payouts_party_check;
ALTER TABLE public.booking_payouts
  ADD CONSTRAINT booking_payouts_party_check
  CHECK (party IN ('talent', 'workspace', 'channel_referral'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. engine_load_commission_context — re-create with the per-participant body
--    PRESERVED EXACTLY (verbatim from 20261107000000) and TWO new top-level
--    keys: source_workspace_id (the channel) + hub_referral_bps (its rate).
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

  -- 6. Phase C — CHANNEL: the workspace/hub the lead entered through (Phase A
  --    invariant: always set, distinct from the managing tenant_id). Plus its
  --    configured referral rate (DEFAULT 0 when no config row exists).
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

COMMENT ON FUNCTION public.engine_load_commission_context(UUID) IS
  'Loads per-participant commission context for a booking: platform config + one context per active talent participant, PLUS (Phase C) the originating channel (source_workspace_id) and its hub_referral_bps (0 when unconfigured). SECURITY DEFINER bypasses admin-only RLS. Per-participant body is byte-identical to 20261107000000; this revision only ADDS the two top-level channel keys.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. engine_persist_booking_commission_snapshot — accept + store the two new
--    per-row fields. Body re-created verbatim from 20260522215805 with ONLY the
--    INSERT column-list + values extended (channel_referral_cents defaults to 0,
--    channel_referral_party_id to NULL when a caller omits them — so an old
--    caller is a pure no-op).
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- Resolve home tenant for the booking (sanity check + used in errors).
  SELECT b.tenant_id INTO v_home_tenant_id
  FROM public.agency_bookings b
  WHERE b.id = p_booking_id;
  IF v_home_tenant_id IS NULL THEN
    RAISE EXCEPTION 'persist_snapshot: booking % not found', p_booking_id USING ERRCODE = 'P0002';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'persist_snapshot: p_rows must be a non-empty JSONB array';
  END IF;

  -- Full idempotency: if every (booking_id, participant_id) pair in p_rows
  -- already has a snapshot, short-circuit and return the existing rows.
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

  -- Insert each row. ON CONFLICT DO NOTHING preserves idempotency for the
  -- mixed case (some rows already exist, some don't) — though in practice
  -- this RPC is only called once per booking conversion.
  FOR v_row IN SELECT jsonb_array_elements(p_rows)
  LOOP
    INSERT INTO public.booking_commission_snapshot (
      booking_id, participant_id, owning_party_type, owning_party_id,
      platform_take_bps, platform_take_floor_cents,
      gross_cents, platform_fee_cents, workspace_fee_cents, talent_net_cents,
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

      -- Off-platform: accrual + balance bump for this row, scoped to the
      -- owning tenant. Skipped for owning_party_type='talent' (no tenant
      -- balance ledger for independents — talent commission flows direct).
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

  -- Return the full snapshot rowset for this booking (newly inserted +
  -- pre-existing), plus the count actually inserted by this call.
  SELECT jsonb_agg(to_jsonb(s) ORDER BY s.participant_id) INTO v_result
  FROM public.booking_commission_snapshot s
  WHERE s.booking_id = p_booking_id;

  RETURN jsonb_build_object('inserted_count', v_inserted_count, 'rows', v_result);
END;
$$;

REVOKE ALL ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) TO authenticated;

COMMENT ON FUNCTION public.engine_persist_booking_commission_snapshot(UUID, JSONB) IS
  'Persist N commission snapshots in one call — one per inquiry_participants row. Phase C adds channel_referral_cents + channel_referral_party_id per row (default 0 / NULL when a caller omits them). Off-platform rows still emit a per-row accrual + balance bump against the OWNING tenant. Idempotent via the (booking_id, participant_id) PK.';

COMMIT;
