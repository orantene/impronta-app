-- M2.3 — Admin Workspace V3: booking conversion enforces per-group fulfillment
-- + admin override.
-- Ref: docs/admin-workspace-spec.md §3.3, §3.5, §9.1, §10;
--      docs/admin-workspace-roadmap.md §M2.3.
--
-- Two pieces here, applied atomically:
--
--   1. Read-only helper `engine_inquiry_group_shortfall(p_inquiry_id)` that
--      returns a JSONB array (possibly empty) describing which requirement
--      groups are under-approved. Used by:
--         • engine_convert_to_booking (for its own gating)
--         • TS engine wrapper (so on-failure callers can surface structured
--           shortfall data to the UI without an extra round-trip)
--         • readiness helpers (M5 drill-down UI)
--
--   2. Extended `engine_convert_to_booking(p_inquiry_id, p_actor_user_id,
--      p_inquiry_expected_version, p_override_reason)` — adds a 4th optional
--      parameter. Because PostgreSQL does not allow arg-count overloading of
--      SECURITY DEFINER functions with different return shapes and we already
--      have a 3-arg version in production, we DROP the old signature and
--      recreate under the new one. Every previously-valid 3-arg call must pass
--      NULL for p_override_reason (done in the TS wrapper).
--
-- Behavior rules (locked in spec §3.3, §9.1):
--   • status='booked'                         → idempotent: return existing booking id
--   • status='archived'/ frozen               → RAISE 'inquiry_frozen' / etc. (unchanged)
--   • approvals_incomplete / no_active_offer  → unchanged RAISE sentinels
--   • all groups fulfilled                    → convert normally (no override flags)
--   • groups short + no override reason       → RAISE 'requirement_groups_unfulfilled'
--   • groups short + override + actor!=admin  → RAISE 'override_not_allowed'
--   • groups short + override reason < 10 chr → RAISE 'override_reason_too_short'
--   • groups short + valid admin override     → allow conversion; persist
--     agency_bookings.created_with_override=true, override_reason=<reason>
--     and emit 'booking.converted_with_override' event (participant visibility)
--
-- Schema addition:
--   agency_bookings.created_with_override BOOLEAN NOT NULL DEFAULT false
--   agency_bookings.override_reason       TEXT
--
-- Override min length: enforced via column CHECK so future callers can't
-- bypass the RPC. The RPC pre-check gives a clean error code; the CHECK is
-- defence in depth.

BEGIN;

-- =============================================================================
-- 1. agency_bookings override metadata columns
-- =============================================================================
ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS created_with_override BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS override_reason       TEXT;

-- Defence in depth: any row flagged override_true must have a reason ≥ 10 chars.
-- Rows that aren't override are unconstrained (override_reason may be NULL).
ALTER TABLE public.agency_bookings
  DROP CONSTRAINT IF EXISTS agency_bookings_override_reason_when_override;
ALTER TABLE public.agency_bookings
  ADD CONSTRAINT agency_bookings_override_reason_when_override
  CHECK (
    created_with_override = false
    OR (override_reason IS NOT NULL AND char_length(trim(override_reason)) >= 10)
  );

COMMENT ON COLUMN public.agency_bookings.created_with_override IS
  'M2.3: true when the booking was converted while one or more requirement groups were under-approved and an admin provided an explicit override reason (spec §9.1).';
COMMENT ON COLUMN public.agency_bookings.override_reason IS
  'M2.3: operator justification recorded when created_with_override=true. Min length 10 chars enforced at both RPC (engine_convert_to_booking) and column (CHECK) layers.';

-- =============================================================================
-- 2. engine_inquiry_group_shortfall — read-only fulfillment helper
-- =============================================================================
-- Returns JSONB like:
--   [ {"group_id": "...", "role_key": "hosts", "quantity_required": 4,
--      "approved_count": 2, "shortfall": 2} , ... ]
-- Only groups with shortfall > 0 are included; empty array means "fulfilled."
--
-- "Approved" = inquiry_approvals row with status='accepted' for the inquiry's
-- current offer, joined to a talent participant in the group. This matches
-- spec §3.2: Approved = "client has approved their offer" at per-participant
-- granularity.
--
-- Legacy single-group inquiries (M1.2 backfill: one default group with
-- quantity_required = max(count(talent participants), 1)) behave identically:
-- if all talent are approved, shortfall = [] and convert proceeds normally.
CREATE OR REPLACE FUNCTION public.engine_inquiry_group_shortfall(
  p_inquiry_id UUID
) RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  WITH current_offer AS (
    SELECT current_offer_id FROM public.inquiries WHERE id = p_inquiry_id
  ),
  per_group AS (
    SELECT
      g.id                AS group_id,
      g.role_key          AS role_key,
      g.quantity_required AS quantity_required,
      COUNT(*) FILTER (
        WHERE a.status = 'accepted'
      )::int              AS approved_count
    FROM public.inquiry_requirement_groups g
    LEFT JOIN public.inquiry_participants p
      ON p.requirement_group_id = g.id
     AND p.role                  = 'talent'
     AND p.status                IN ('invited', 'active')
    LEFT JOIN public.inquiry_approvals a
      ON a.participant_id = p.id
     AND a.offer_id       = (SELECT current_offer_id FROM current_offer)
    WHERE g.inquiry_id = p_inquiry_id
    GROUP BY g.id, g.role_key, g.quantity_required
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'group_id',          group_id,
        'role_key',          role_key,
        'quantity_required', quantity_required,
        'approved_count',    approved_count,
        'shortfall',         quantity_required - approved_count
      )
      ORDER BY role_key
    ) FILTER (WHERE quantity_required > approved_count),
    '[]'::jsonb
  )
  FROM per_group;
$$;

REVOKE ALL    ON FUNCTION public.engine_inquiry_group_shortfall(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_inquiry_group_shortfall(UUID) TO authenticated;

-- =============================================================================
-- 3. engine_convert_to_booking — drop 3-arg, recreate 4-arg
-- =============================================================================
DROP FUNCTION IF EXISTS public.engine_convert_to_booking(UUID, UUID, INT);

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
  -- ── Auth / actor role lookup ──────────────────────────────────────────────
  IF auth.uid() IS DISTINCT FROM p_actor_user_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT app_role INTO v_actor_app_role
    FROM public.profiles WHERE id = p_actor_user_id;

  v_actor_role := CASE v_actor_app_role
    WHEN 'agency_staff' THEN 'coordinator'::public.inquiry_event_actor_role
    WHEN 'super_admin'  THEN 'admin'::public.inquiry_event_actor_role
    ELSE                     'admin'::public.inquiry_event_actor_role
  END;

  -- ── Inquiry lock + baseline gates ─────────────────────────────────────────
  SELECT * INTO inq FROM public.inquiries WHERE id = p_inquiry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
  IF inq.is_frozen IS TRUE THEN RAISE EXCEPTION 'inquiry_frozen'; END IF;

  -- Idempotency: already booked → return existing booking id (no version bump,
  -- no event, no shortfall check). Mirrors previous behavior — callers rely on
  -- this.
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

  -- ── Per-group fulfillment check (spec §3.3) ───────────────────────────────
  v_shortfall := public.engine_inquiry_group_shortfall(p_inquiry_id);
  v_has_shortfall := jsonb_array_length(v_shortfall) > 0;

  IF v_has_shortfall THEN
    -- No override supplied → block. TS wrapper re-fetches shortfall for UI.
    IF p_override_reason IS NULL THEN
      RAISE EXCEPTION 'requirement_groups_unfulfilled';
    END IF;

    -- Override path is admin-only (spec §9.1, §10 override subflow).
    IF v_actor_app_role IS DISTINCT FROM 'super_admin' THEN
      RAISE EXCEPTION 'override_not_allowed';
    END IF;

    v_reason_trim := trim(p_override_reason);
    IF v_reason_trim IS NULL OR char_length(v_reason_trim) < 10 THEN
      RAISE EXCEPTION 'override_reason_too_short';
    END IF;

    v_override := true;
  END IF;

  -- ── Create booking (override metadata persisted when applicable) ──────────
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
    created_with_override, override_reason
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
    CASE WHEN v_override THEN trim(p_override_reason) ELSE NULL END
  ) RETURNING id INTO v_booking_id;

  -- Snapshot talent from offer line items.
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
  WHERE li.offer_id = off.id;

  -- Update booking header totals.
  UPDATE public.agency_bookings
    SET total_talent_cost    = (SELECT COALESCE(SUM(talent_cost_total), 0)   FROM public.booking_talent WHERE booking_id = v_booking_id),
        total_client_revenue = (SELECT COALESCE(SUM(client_charge_total), 0) FROM public.booking_talent WHERE booking_id = v_booking_id),
        gross_profit         = (SELECT COALESCE(SUM(gross_profit), 0)        FROM public.booking_talent WHERE booking_id = v_booking_id)
    WHERE id = v_booking_id;

  -- Mark inquiry booked.
  UPDATE public.inquiries
    SET status         = 'booked',
        booked_at      = now(),
        next_action_by = NULL,
        version        = version + 1,
        last_edited_by = p_actor_user_id,
        last_edited_at = now()
    WHERE id = p_inquiry_id AND version = p_inquiry_expected_version;

  -- ── Events ────────────────────────────────────────────────────────────────
  -- Always emit booking.created (participant-visible, unchanged).
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

  -- Also emit staff-only override audit event when the override path was used.
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

  -- Booking-level audit log (separate system, unchanged).
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

REVOKE ALL    ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_convert_to_booking(UUID, UUID, INT, TEXT) TO authenticated;

COMMIT;
