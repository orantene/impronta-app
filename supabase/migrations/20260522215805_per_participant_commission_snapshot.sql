-- Per-participant commission snapshot (Option B from ADR 2026-05-22).
--
-- Problem: booking_commission_snapshot is keyed by booking_id, and
-- engine_load_commission_context resolves the rate off agency_bookings.tenant_id
-- (the inquiry's home tenant). On cross-tenant inquiries every participant is
-- commissioned at the home-tenant's tier, ignoring each talent's frozen
-- inquiry_participants.owning_party_*. Latent under flat-5% / no overrides;
-- a real mis-attribution bug the moment plan_tier_bps or per-tenant overrides
-- are populated.
--
-- Fix (this migration): commission grain becomes per inquiry_participants row.
-- One booking, N snapshots (one per talent participant), each resolved from
-- its own owning_party. Client UX unchanged; only the billing engine changes.
--
-- Schema break is free here: zero rows in booking_commission_snapshot exist in
-- production today (the QA harness restored every test row to zero before this
-- migration was authored).
--
-- House lane (line items where talent_profile_id IS NULL) is rejected by the
-- context RPC in v1 — they have no participant to attribute to. Current
-- offers do not produce them; if they ever do, a "house" snapshot row is a
-- v2 concern.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Schema: extend booking_commission_snapshot to per-participant grain.
-- ---------------------------------------------------------------------------

-- Production has 0 rows in booking_commission_snapshot (QA-verified). Local
-- dev environments MAY hold stale rows from the QA harness that don't fit the
-- new per-participant shape — truncate to a clean slate. This is safe because
-- (a) the schema break is intentional and (b) the rows that existed were never
-- referenced by anything in flight (the one prod booking has source_inquiry_id
-- = NULL and never produced a snapshot).
TRUNCATE TABLE public.booking_commission_snapshot;
TRUNCATE TABLE public.platform_commission_movements;
TRUNCATE TABLE public.platform_commission_balances;

-- Drop the booking-grain PK.
ALTER TABLE public.booking_commission_snapshot
  DROP CONSTRAINT IF EXISTS booking_commission_snapshot_pkey;

-- Participant the row attributes to. RESTRICT on delete: the snapshot
-- outlives the participant row in audit terms — if a participant is ever
-- hard-deleted, surface the error rather than silently lose commission audit.
ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS participant_id UUID
    REFERENCES public.inquiry_participants(id) ON DELETE RESTRICT;

-- Frozen owning-party for this row. owning_party_id is polymorphic
-- (agencies.id for workspace/agency types, talent_profiles.id for talent),
-- so no FK can be declared; the CHECK on type plus the resolver path keep it
-- honest.
ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS owning_party_type TEXT
    CHECK (owning_party_type IN ('agency', 'workspace', 'talent'));

ALTER TABLE public.booking_commission_snapshot
  ADD COLUMN IF NOT EXISTS owning_party_id UUID;

-- The columns must be populated; 0 prod rows means we can apply NOT NULL
-- immediately without a backfill.
ALTER TABLE public.booking_commission_snapshot
  ALTER COLUMN participant_id SET NOT NULL,
  ALTER COLUMN owning_party_type SET NOT NULL,
  ALTER COLUMN owning_party_id SET NOT NULL;

-- New composite PK.
ALTER TABLE public.booking_commission_snapshot
  ADD CONSTRAINT booking_commission_snapshot_pkey
    PRIMARY KEY (booking_id, participant_id);

-- Roll-up read index (for SUM-by-booking, e.g. Stripe app-fee).
CREATE INDEX IF NOT EXISTS booking_commission_snapshot_booking_id_idx
  ON public.booking_commission_snapshot (booking_id);

-- Owning-party read index (for "all commission I'm owed" reports).
CREATE INDEX IF NOT EXISTS booking_commission_snapshot_owning_party_idx
  ON public.booking_commission_snapshot (owning_party_type, owning_party_id);

COMMENT ON COLUMN public.booking_commission_snapshot.participant_id IS
  'inquiry_participants row this snapshot attributes to. Frozen at acceptance time.';
COMMENT ON COLUMN public.booking_commission_snapshot.owning_party_type IS
  'Frozen copy of inquiry_participants.owning_party_type at acceptance time. agency|workspace|talent.';
COMMENT ON COLUMN public.booking_commission_snapshot.owning_party_id IS
  'Frozen copy of inquiry_participants.owning_party_id at acceptance time. Polymorphic — agencies.id for workspace/agency, talent_profiles.id for talent.';

-- ---------------------------------------------------------------------------
-- 2. RLS read policy: extend to the owning-party tenant.
-- ---------------------------------------------------------------------------
--
-- v1 policy keyed reads off agency_bookings.tenant_id (the inquiry's home).
-- Under per-participant grain, a snapshot row belongs to its OWNING tenant,
-- which may differ from the home tenant. Both the home tenant (sees the full
-- booking commission picture) and the owning tenant (sees "their" rows) must
-- be allowed.

DROP POLICY IF EXISTS booking_commission_snapshot_read ON public.booking_commission_snapshot;
CREATE POLICY booking_commission_snapshot_read ON public.booking_commission_snapshot
  FOR SELECT USING (
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.agency_bookings b
      WHERE b.id = booking_commission_snapshot.booking_id
        AND public.is_staff_of_tenant(b.tenant_id)
    )
    OR (
      booking_commission_snapshot.owning_party_type IN ('agency', 'workspace')
      AND public.is_staff_of_tenant(booking_commission_snapshot.owning_party_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. engine_load_commission_context — return one context per participant.
-- ---------------------------------------------------------------------------
--
-- Replaces the singleton-context shape with a participants array. Each
-- participant row carries its own tenant (resolved from frozen owning_party_*),
-- workspace_plan, tenant_override, and its filtered line items. The resolver
-- then runs the 4-level precedence ladder per row.
--
-- Independent talents (owning_party_type='talent') carry tenant_id=NULL and
-- workspace_plan=NULL. The resolver falls to platform_default for those.
--
-- Rejects offers with unattributed line items (talent_profile_id IS NULL) in
-- v1 — see the migration header for rationale.

CREATE OR REPLACE FUNCTION public.engine_load_commission_context(p_booking_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.engine_load_commission_context(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.engine_load_commission_context(UUID) TO authenticated;

COMMENT ON FUNCTION public.engine_load_commission_context(UUID) IS
  'Per-participant commission context for a booking. Returns the platform config + one context per active talent participant, with each context carrying that participant''s owning_party-resolved tenant/plan/override and filtered line items. The resolver runs the 4-level precedence ladder per participant. SECURITY DEFINER bypasses platform_commission_config''s admin-only read RLS. v1 rejects offers with unattributed (talent_profile_id IS NULL) line items.';

-- ---------------------------------------------------------------------------
-- 4. engine_persist_booking_commission_snapshot — array of per-participant rows.
-- ---------------------------------------------------------------------------
--
-- New signature takes a single JSONB array; one snapshot row per element.
-- Per-row idempotency via (booking_id, participant_id) unique PK.
--
-- Off-platform fan-out: each row that is off-platform emits its own
-- platform_commission_movements accrual AND bumps the OWNING tenant's
-- platform_commission_balances. Independent-talent rows
-- (owning_party_type='talent') skip the accrual + balance steps (no tenant
-- balance exists for talents; their commission is owed directly).

-- Drop the obsolete scalar-param variant first — TS callers will be updated
-- in the same commit. Drops only if it exists (idempotency for re-runs).
DROP FUNCTION IF EXISTS public.engine_persist_booking_commission_snapshot(
  UUID, INT, INT, INT, INT, INT, INT, TEXT, TEXT, TEXT, TEXT
);

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
      v_row->>'currency_code',
      v_row->>'payment_method',
      v_row->>'off_platform_reason',
      v_row->>'resolved_from'
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
  'Persist N commission snapshots in one call — one per inquiry_participants row. Each row carries its own owning_party + lane split + resolved_from. Off-platform rows emit a per-row accrual + balance bump against the OWNING tenant (skipped for owning_party_type=talent). Idempotent via the (booking_id, participant_id) PK. Replaces the per-booking single-row variant from 20260513075408.';

COMMIT;
