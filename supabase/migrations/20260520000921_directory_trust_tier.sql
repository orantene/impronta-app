-- Closes Amendment A2 of the binding directory plan
-- (web/docs/directory-section-execution-plan-2026-05-19.md §Amendment A2).
--
-- Adds `trust_tier` to the talent_discover_index materialized view so the
-- Discover/Directory card surfaces can render real Basic/Verified/Silver/Gold
-- badges instead of the "deferred / faked-as-Basic" stopgap. Phase B #3 of
-- the directory plan will surface this through the DTO + card; this lane
-- only delivers the matview column + bridge projection.
--
-- Derivation: counts platform-scoped verified badges in
-- talent_profile_trust_badges and maps to the ladder defined in
-- project_client_trust_badges.md / project_discover_unified.md:
--
--   0 verified badges → 'basic'
--   1                 → 'verified'
--   2                 → 'silver'
--   3+                → 'gold'
--
-- This is an additive, nullable-tolerant projection — downstream consumers
-- treat trust_tier as `string | null`. Agency-scoped badges are intentionally
-- excluded from the platform ladder (they show on the agency surface, not as
-- platform-wide trust). The 15-min refresh cron + on-event triggers in
-- 20260515134903_talent_discover_index.sql already rebuild the full SELECT,
-- so they automatically pick up trust_tier after this DROP/CREATE.

BEGIN;

-- DROP + CREATE (not CREATE OR REPLACE — Postgres does not support
-- REPLACE on materialized views). Cascade drops the unique + filter
-- indexes; we recreate them below.
DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH primary_roster AS (
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
  SELECT DISTINCT ON (tpt.talent_profile_id)
    tpt.talent_profile_id,
    tt.name_en AS category_label,
    tt.slug AS category_slug
  FROM public.talent_profile_taxonomy tpt
  JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type = 'primary_role'
    AND tt.kind = 'talent_type'
  ORDER BY tpt.talent_profile_id, tpt.created_at ASC
),
trust_counts AS (
  -- Platform-scoped verified badges per talent. Agency-scoped badges are
  -- excluded from the platform ladder by design (see project_client_trust_badges.md).
  SELECT
    b.talent_profile_id,
    COUNT(*)::INT AS verified_badge_count
  FROM public.talent_profile_trust_badges b
  WHERE b.status = 'verified'
    AND b.scope  = 'platform'
    AND (b.expires_at IS NULL OR b.expires_at > now())
  GROUP BY b.talent_profile_id
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
  -- A2 — derive trust ladder tier from verified platform badge count.
  CASE
    WHEN COALESCE(tc.verified_badge_count, 0) >= 3 THEN 'gold'
    WHEN COALESCE(tc.verified_badge_count, 0) = 2  THEN 'silver'
    WHEN COALESCE(tc.verified_badge_count, 0) = 1  THEN 'verified'
    ELSE 'basic'
  END AS trust_tier,
  now() AS index_refreshed_at
FROM public.talent_profiles tp
LEFT JOIN primary_roster pr    ON pr.talent_profile_id = tp.id
LEFT JOIN primary_category pc  ON pc.talent_profile_id = tp.id
LEFT JOIN trust_counts tc      ON tc.talent_profile_id = tp.id
LEFT JOIN LATERAL public.compute_talent_availability_snapshot(tp.id) avail ON TRUE
WHERE tp.is_discoverable = TRUE
  AND tp.workflow_status IN ('approved','published');

-- Recreate indexes dropped by CASCADE.
CREATE UNIQUE INDEX IF NOT EXISTS talent_discover_index_id_uniq
  ON public.talent_discover_index (id);

CREATE INDEX IF NOT EXISTS talent_discover_index_country
  ON public.talent_discover_index (home_country_text);

CREATE INDEX IF NOT EXISTS talent_discover_index_category
  ON public.talent_discover_index (category_slug);

CREATE INDEX IF NOT EXISTS talent_discover_index_agency
  ON public.talent_discover_index (agency_tenant_id);

CREATE INDEX IF NOT EXISTS talent_discover_index_availability
  ON public.talent_discover_index (next_available_date)
  WHERE next_available_date IS NOT NULL;

-- A2 — new filter index for trust_tier (cheap; Phase B #3 will use it for
-- "minTrustTier" filtering in the directory section editor).
CREATE INDEX IF NOT EXISTS talent_discover_index_trust_tier
  ON public.talent_discover_index (trust_tier);

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Includes trust_tier (A2). Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. See project_discover_unified.md §6 + directory-section-execution-plan-2026-05-19.md §A2.';

COMMENT ON COLUMN public.talent_discover_index.trust_tier IS
  'Derived trust ladder: basic / verified / silver / gold. Counts platform-scoped, currently-valid verified badges from talent_profile_trust_badges. Agency-scoped badges intentionally excluded — they belong to the agency surface, not the platform ladder.';

-- Initial populate so consumers see data immediately. Cannot use CONCURRENT
-- on a freshly-created matview (Postgres requires a prior populated state);
-- this is a single, brief blocking refresh.
REFRESH MATERIALIZED VIEW public.talent_discover_index;

COMMIT;
