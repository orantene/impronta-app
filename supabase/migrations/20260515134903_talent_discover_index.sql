-- D1 (Discover data layer) — talent_discover_index materialized view.
--
-- Denormalizes everything the Discover card grid needs into one
-- queryable surface so the loader stops doing N+1 joins + JS-side
-- filters at read time. The current cross-tenant loader at
-- web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts joins:
--   talent_profiles ⨯ talent_profile_taxonomy ⨯ taxonomy_terms
--                   ⨯ agency_talent_roster ⨯ agencies
--                   ⨯ media_assets ⨯ locations
-- per query, then filters category client-side. This view does the
-- joins once at refresh-time + adds availability fields the loader
-- currently can't surface at all (next_available_date, available
-- days count, 14-day availability bitmask).
--
-- Refresh: 15 min cron + on-event triggers (see refresh fn below).
-- The view is REFRESH MATERIALIZED VIEW CONCURRENTLY-safe (UNIQUE index
-- on id). On-event triggers fire on:
--   - talent_profiles.is_discoverable / workflow_status / city change
--   - agency_talent_roster (is_primary / status change)
--   - talent_availability_blocks (any insert/update/delete)
--   - agencies.plan_tier change (affects exclusivity badge)
-- Trigger logic queues a refresh by setting a `discover_index_dirty`
-- flag on a small singleton table; a separate refresher process picks
-- up the flag. This avoids per-row REFRESH which would lock the view.
--
-- Spec: web/docs/discover-and-unified-inquiry-2026-05-14.md §6
-- Memory: project_discover_unified.md (data model deltas)

BEGIN;

-- ─── 1. Helper: per-talent availability snapshot ─────────────────────────
--
-- Pure SQL function — given a talent_profile_id, returns a row with
--   * next_available_date           — first date today..today+30 not inside a block
--   * available_days_in_next_30     — count of free days in next 30
--   * availability_dots_14d         — 14-char string of '·'/'×' for next 14 days
--                                       ('·' = free, '×' = blocked)
-- If the talent has zero availability blocks the function short-circuits
-- to "fully available" without scanning. Used by the materialized view's
-- SELECT below; safe to call ad-hoc too.

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
  v_blocks_exist BOOLEAN;
  v_dots TEXT := '';
  v_free_count INT := 0;
  v_next_avail DATE := NULL;
  v_day DATE;
  v_blocked BOOLEAN;
  i INT;
BEGIN
  -- Cheap path: no blocks → fully available.
  SELECT EXISTS (
    SELECT 1 FROM public.talent_availability_blocks
    WHERE talent_profile_id = p_talent_profile_id
      AND ends_at > p_now
      AND starts_at < p_now + INTERVAL '30 days'
  ) INTO v_blocks_exist;

  IF NOT v_blocks_exist THEN
    next_available_date := v_today;
    available_days_in_next_30 := 30;
    availability_dots_14d := repeat('·', 14);
    RETURN NEXT;
    RETURN;
  END IF;

  -- Otherwise scan day-by-day. For a 30-day window this is at most 30
  -- index probes per talent. The view refreshes every 15 min so this is
  -- amortized across many reads.
  FOR i IN 0..29 LOOP
    v_day := v_today + i;
    SELECT EXISTS (
      SELECT 1 FROM public.talent_availability_blocks
      WHERE talent_profile_id = p_talent_profile_id
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
  'Computes 30-day availability snapshot for a talent. Returns next_available_date, available_days_in_next_30, and a 14-char string of free/blocked dots. Used by talent_discover_index materialized view.';

-- ─── 2. The materialized view itself ─────────────────────────────────────
--
-- Filters to is_discoverable + workflow_status published. Joins primary
-- agency (if any) for the agency-name + exclusivity badge. Joins
-- primary-role taxonomy term for category. Stamps the availability
-- snapshot per talent. One row per talent.

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH primary_roster AS (
  -- Primary agency for each talent (at most one). If no is_primary=true
  -- row, fall back to the first active roster. is_exclusive folds the
  -- plan-tier rule (Free has no exclusivity).
  SELECT DISTINCT ON (r.talent_profile_id)
    r.talent_profile_id,
    r.tenant_id AS agency_tenant_id,
    a.display_name AS agency_name,
    a.plan_tier AS agency_plan_tier,
    (r.is_primary = TRUE AND a.plan_tier IN ('studio','agency','network','hub-network')) AS is_exclusive
  FROM public.agency_talent_roster r
  JOIN public.agencies a ON a.id = r.tenant_id
  WHERE r.status IN ('active','pending')
  ORDER BY r.talent_profile_id, r.is_primary DESC, r.added_at ASC
),
primary_category AS (
  -- Primary-role taxonomy term for each talent (at most one).
  SELECT DISTINCT ON (tpt.talent_profile_id)
    tpt.talent_profile_id,
    tt.name_en AS category_label,
    tt.slug AS category_slug
  FROM public.talent_profile_taxonomy tpt
  JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type = 'primary_role'
    AND tt.kind = 'talent_type'
  ORDER BY tpt.talent_profile_id, tpt.created_at ASC
)
SELECT
  tp.id,
  tp.display_name,
  tp.first_name,
  tp.last_name,
  tp.profile_code,
  tp.home_country_text,
  tp.home_city_text,
  tp.residence_city_id,
  tp.workflow_status,
  pr.agency_tenant_id,
  pr.agency_name,
  pr.agency_plan_tier,
  COALESCE(pr.is_exclusive, FALSE) AS is_exclusive,
  pc.category_label,
  pc.category_slug,
  avail.next_available_date,
  avail.available_days_in_next_30,
  avail.availability_dots_14d,
  -- Refresh stamp — useful when debugging stale rows.
  now() AS index_refreshed_at
FROM public.talent_profiles tp
LEFT JOIN primary_roster pr ON pr.talent_profile_id = tp.id
LEFT JOIN primary_category pc ON pc.talent_profile_id = tp.id
LEFT JOIN LATERAL public.compute_talent_availability_snapshot(tp.id) avail ON TRUE
WHERE tp.is_discoverable = TRUE
  AND tp.workflow_status IN ('approved','published');

-- UNIQUE index — required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX IF NOT EXISTS talent_discover_index_id_uniq
  ON public.talent_discover_index (id);

-- Filter indexes — the loader's WHERE clauses.
CREATE INDEX IF NOT EXISTS talent_discover_index_country
  ON public.talent_discover_index (home_country_text);

CREATE INDEX IF NOT EXISTS talent_discover_index_category
  ON public.talent_discover_index (category_slug);

CREATE INDEX IF NOT EXISTS talent_discover_index_agency
  ON public.talent_discover_index (agency_tenant_id);

CREATE INDEX IF NOT EXISTS talent_discover_index_availability
  ON public.talent_discover_index (next_available_date)
  WHERE next_available_date IS NOT NULL;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. See project_discover_unified.md §6.';

-- ─── 3. Refresh function ─────────────────────────────────────────────────
--
-- CONCURRENT refresh is non-blocking for readers. Caller (cron or
-- on-event trigger) calls this; we wrap it in SECURITY DEFINER so the
-- service-role and the trigger context both have permission.

CREATE OR REPLACE FUNCTION public.refresh_talent_discover_index()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.talent_discover_index;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_talent_discover_index() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_talent_discover_index() TO service_role;

COMMENT ON FUNCTION public.refresh_talent_discover_index IS
  'Refresh the Discover materialized view. CONCURRENT so readers are never blocked. Called by 15-min cron + on-event triggers. SECURITY DEFINER.';

-- ─── 4. RLS bypass for service-role reads ────────────────────────────────
--
-- The Discover loader runs under service-role (admin client) because
-- Discover is cross-tenant by design. Materialized views inherit no
-- RLS from their source tables — they're a fully separate object — so
-- there's no policy to set here. Documented for the next reader.

COMMIT;
