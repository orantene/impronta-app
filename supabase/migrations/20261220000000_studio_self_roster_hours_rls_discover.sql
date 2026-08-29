-- W3 own-studio glue + hours RLS + honest Discover dots.
--
-- 1. Backfill a self roster row for talent-owned workspaces
--    (owner membership → that person's talent_profile). Never set
--    is_primary. Never downgrade featured/site_visible. Only upgrade
--    roster_only on those self rows (the historical self-link landing).
-- 2. talent_booking_hours stays ONE row per person. Staff of ANY
--    active-rostered tenant may READ. Staff WRITE only resource or
--    unclaimed (user_id IS NULL) profiles. Talent still writes own.
-- 3. Discover availability snapshot unions bookings + unexpired firm
--    holds so dots stop ignoring appointments.

BEGIN;

-- ─── 1. Self-roster backfill ───────────────────────────────────────────────

INSERT INTO public.agency_talent_roster (
  tenant_id,
  talent_profile_id,
  source_type,
  status,
  agency_visibility,
  hub_visibility_status,
  is_primary,
  direct_booking_enabled,
  added_by,
  source_workspace_id
)
SELECT
  a.id,
  tp.id,
  'agency_created',
  'active',
  'site_visible',
  'not_submitted',
  false,
  true,
  m.profile_id,
  a.id
FROM public.agencies a
JOIN public.agency_memberships m
  ON m.tenant_id = a.id
 AND m.role = 'owner'
 AND m.status = 'active'
JOIN public.talent_profiles tp
  ON tp.user_id = m.profile_id
 AND tp.deleted_at IS NULL
WHERE a.status = 'active'
  AND a.kind = 'agency'
  AND NOT EXISTS (
    SELECT 1
    FROM public.agency_talent_roster r
    WHERE r.tenant_id = a.id
      AND r.talent_profile_id = tp.id
  );

UPDATE public.agency_talent_roster r
SET
  status = 'active',
  agency_visibility = CASE
    WHEN r.agency_visibility = 'roster_only' THEN 'site_visible'
    ELSE r.agency_visibility
  END,
  direct_booking_enabled = CASE
    WHEN r.agency_visibility = 'roster_only' THEN true
    ELSE r.direct_booking_enabled
  END
FROM public.agency_memberships m
JOIN public.talent_profiles tp
  ON tp.user_id = m.profile_id
 AND tp.deleted_at IS NULL
WHERE r.tenant_id = m.tenant_id
  AND r.talent_profile_id = tp.id
  AND m.role = 'owner'
  AND m.status = 'active'
  AND r.is_primary IS NOT TRUE
  AND (
    r.status IS DISTINCT FROM 'active'
    OR r.agency_visibility = 'roster_only'
  );

-- ─── 2. Hours RLS ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS talent_booking_hours_staff ON public.talent_booking_hours;
DROP POLICY IF EXISTS talent_booking_hours_staff_read ON public.talent_booking_hours;
DROP POLICY IF EXISTS talent_booking_hours_staff_write ON public.talent_booking_hours;

CREATE POLICY talent_booking_hours_staff_read ON public.talent_booking_hours
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = talent_booking_hours.talent_profile_id
        AND r.status = 'active'
        AND public.is_staff_of_tenant(r.tenant_id)
    )
  );

CREATE POLICY talent_booking_hours_staff_write ON public.talent_booking_hours
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      WHERE tp.id = talent_booking_hours.talent_profile_id
        AND (tp.profile_kind = 'resource' OR tp.user_id IS NULL)
        AND EXISTS (
          SELECT 1
          FROM public.agency_talent_roster r
          WHERE r.talent_profile_id = tp.id
            AND r.status = 'active'
            AND public.is_staff_of_tenant(r.tenant_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      WHERE tp.id = talent_booking_hours.talent_profile_id
        AND (tp.profile_kind = 'resource' OR tp.user_id IS NULL)
        AND EXISTS (
          SELECT 1
          FROM public.agency_talent_roster r
          WHERE r.talent_profile_id = tp.id
            AND r.status = 'active'
            AND public.is_staff_of_tenant(r.tenant_id)
        )
    )
  );

-- ─── 3. Discover dots include bookings + firm holds ────────────────────────

CREATE OR REPLACE FUNCTION public.compute_talent_availability_snapshot(
  p_talent_profile_id UUID,
  p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  next_available_date DATE,
  available_days_in_next_30 INT,
  availability_dots_14d TEXT
)
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_today DATE := (p_now AT TIME ZONE 'UTC')::DATE;
  v_busy_exist BOOLEAN;
  v_dots TEXT := '';
  v_free_count INT := 0;
  v_next_avail DATE := NULL;
  v_day DATE;
  v_blocked BOOLEAN;
  i INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.talent_availability_blocks
    WHERE talent_profile_id = p_talent_profile_id
      AND ends_at > p_now
      AND starts_at < p_now + INTERVAL '30 days'
    UNION ALL
    SELECT 1 FROM public.talent_bookings
    WHERE talent_profile_id = p_talent_profile_id
      AND status IN ('confirmed', 'completed')
      AND ends_at > p_now
      AND starts_at < p_now + INTERVAL '30 days'
    UNION ALL
    SELECT 1 FROM public.talent_holds
    WHERE talent_profile_id = p_talent_profile_id
      AND hold_strength = 'firm'
      AND (expires_at IS NULL OR expires_at > p_now)
      AND ends_at > p_now
      AND starts_at < p_now + INTERVAL '30 days'
  ) INTO v_busy_exist;

  IF NOT v_busy_exist THEN
    next_available_date := v_today;
    available_days_in_next_30 := 30;
    availability_dots_14d := repeat('·', 14);
    RETURN NEXT;
    RETURN;
  END IF;

  FOR i IN 0..29 LOOP
    v_day := v_today + i;
    SELECT EXISTS (
      SELECT 1 FROM public.talent_availability_blocks
      WHERE talent_profile_id = p_talent_profile_id
        AND starts_at < (v_day + 1)::TIMESTAMPTZ
        AND ends_at   > v_day::TIMESTAMPTZ
      UNION ALL
      SELECT 1 FROM public.talent_bookings
      WHERE talent_profile_id = p_talent_profile_id
        AND status IN ('confirmed', 'completed')
        AND starts_at < (v_day + 1)::TIMESTAMPTZ
        AND ends_at   > v_day::TIMESTAMPTZ
      UNION ALL
      SELECT 1 FROM public.talent_holds
      WHERE talent_profile_id = p_talent_profile_id
        AND hold_strength = 'firm'
        AND (expires_at IS NULL OR expires_at > p_now)
        AND starts_at < (v_day + 1)::TIMESTAMPTZ
        AND ends_at   > v_day::TIMESTAMPTZ
    ) INTO v_blocked;

    IF NOT v_blocked THEN
      v_free_count := v_free_count + 1;
      IF v_next_avail IS NULL THEN
        v_next_avail := v_day;
      END IF;
    END IF;

    IF i < 14 THEN
      v_dots := v_dots || CASE WHEN v_blocked THEN '×' ELSE '·' END;
    END IF;
  END LOOP;

  next_available_date := v_next_avail;
  available_days_in_next_30 := v_free_count;
  availability_dots_14d := v_dots;
  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.compute_talent_availability_snapshot IS
  'Computes 30-day availability snapshot for a talent. Unions availability_blocks, confirmed/completed bookings, and unexpired firm holds. Used by talent_discover_index.';

COMMIT;
