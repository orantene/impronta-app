-- Tenant-level Discover / hub exposure control.
--
-- Product rule (owner, 2026-08-05): every talent on a Tulala tenant is shown on
-- the Tulala discovery page by DEFAULT. A premium tenant (Impronta and the like)
-- must be able to say "I am not interested in showing my exclusive talents on
-- the Tulala platform or other Tulala hubs/networks" — and if they do stay in,
-- to choose WHICH public/network hubs may list them.
--
-- Today that is not expressible anywhere. `talent_discover_index` gates purely
-- on talent-level flags (`is_discoverable`, workflow status, is_test_account,
-- live roster), so an agency has no say at all over platform exposure — only
-- the individual talent does, one profile at a time.
--
-- Two columns on `agencies`, both defaulting to today's behaviour so shipping
-- this changes nothing until an admin flips the switch:
--
--   discover_exposure_enabled  TRUE  = list our talents on Tulala Discover and
--                                      on hubs (current behaviour, the default)
--                              FALSE = keep our talents off Tulala Discover and
--                                      off every hub. The talent's OWN
--                                      `is_discoverable` still applies on top;
--                                      this is an agency-level veto, not a
--                                      grant.
--
--   hub_exposure_tenant_ids    NULL  = any hub may list them (default)
--                              '{}'  = no hub may list them
--                              {ids} = only these hub tenants may list them
--
-- The veto keys on the talent's PRIMARY roster tenant — the workspace that
-- represents them — so a talent rostered by two agencies is governed by the one
-- that actually holds them, not by whichever row sorts first.

BEGIN;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS discover_exposure_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS hub_exposure_tenant_ids uuid[] DEFAULT NULL;

COMMENT ON COLUMN public.agencies.discover_exposure_enabled IS
  'FALSE keeps this workspace''s talents off Tulala Discover and off every hub. Agency-level veto layered on top of talent_profiles.is_discoverable. Default TRUE = platform default (all tenant talent is discoverable).';

COMMENT ON COLUMN public.agencies.hub_exposure_tenant_ids IS
  'Which hub tenants may list this workspace''s talents. NULL = all hubs (default), empty array = none, otherwise an allow-list of agencies.id where kind=''hub''. Ignored when discover_exposure_enabled is FALSE.';

-- ── Rebuild talent_discover_index with the agency veto ───────────────────────
-- Matview columns/predicates cannot be ALTERed, so this DROPs and recreates
-- from the current live definition (20261110140000) with ONE added predicate.
-- Everything else — columns, join shape, the is_test_account and dead-workspace
-- rules, indexes, grants — is carried over byte-for-byte.

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH live_roster AS (
  SELECT r.talent_profile_id,
         r.tenant_id,
         r.is_primary,
         r.added_at,
         a.display_name,
         a.plan_tier
    FROM agency_talent_roster r
    JOIN agencies a ON a.id = r.tenant_id
   WHERE r.status = ANY (ARRAY['active'::text, 'pending'::text])
     AND a.status <> ALL (ARRAY['archived'::text, 'suspended'::text])
), primary_roster AS (
  SELECT DISTINCT ON (r.talent_profile_id) r.talent_profile_id,
    r.tenant_id AS agency_tenant_id,
    r.display_name AS agency_name,
    r.plan_tier AS agency_plan_tier,
    r.is_primary = true AND (r.plan_tier = ANY (ARRAY['studio'::text, 'agency'::text, 'network'::text, 'hub-network'::text])) AS is_exclusive
   FROM live_roster r
  ORDER BY r.talent_profile_id, r.is_primary DESC, r.added_at
), primary_category AS (
  SELECT DISTINCT ON (tpt.talent_profile_id) tpt.talent_profile_id,
    tt.name_i18n ->> 'en'::text AS category_label,
    tt.slug AS category_slug
   FROM talent_profile_taxonomy tpt
     JOIN taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type = 'primary_role'::text AND tt.kind = 'talent_type'::taxonomy_kind
  ORDER BY tpt.talent_profile_id, tpt.created_at
), trust_counts AS (
  SELECT b.talent_profile_id,
    count(*)::integer AS verified_badge_count
   FROM talent_profile_trust_badges b
  WHERE b.status = 'verified'::text AND b.scope = 'platform'::text AND (b.expires_at IS NULL OR b.expires_at > now())
  GROUP BY b.talent_profile_id
)
SELECT tp.id,
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
    COALESCE(pr.is_exclusive, false) AS is_exclusive,
    pc.category_label,
    pc.category_slug,
    avail.next_available_date,
    avail.available_days_in_next_30,
    avail.availability_dots_14d,
    CASE
        WHEN COALESCE(tc.verified_badge_count, 0) >= 3 THEN 'gold'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 2 THEN 'silver'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 1 THEN 'verified'::text
        ELSE 'basic'::text
    END AS trust_tier,
    tp.rating_avg,
    tp.rating_count,
    tp.would_book_again_pct,
    now() AS index_refreshed_at
   FROM talent_profiles tp
     LEFT JOIN primary_roster pr ON pr.talent_profile_id = tp.id
     LEFT JOIN primary_category pc ON pc.talent_profile_id = tp.id
     LEFT JOIN trust_counts tc ON tc.talent_profile_id = tp.id
     LEFT JOIN LATERAL compute_talent_availability_snapshot(tp.id) avail(next_available_date, available_days_in_next_30, availability_dots_14d) ON true
  WHERE tp.is_discoverable = true
    AND (tp.workflow_status = ANY (ARRAY['approved'::profile_workflow_status, 'published'::profile_workflow_status]))
    AND tp.is_test_account = false
    AND (
      pr.talent_profile_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM agency_talent_roster r0
         WHERE r0.talent_profile_id = tp.id
           AND r0.status = ANY (ARRAY['active'::text, 'pending'::text])
      )
    )
    -- NEW (20261111090000): the agency-level veto. An independent talent (no
    -- primary roster) is unaffected — nobody speaks for them but themselves.
    AND (
      pr.agency_tenant_id IS NULL
      OR EXISTS (
        SELECT 1 FROM agencies a2
         WHERE a2.id = pr.agency_tenant_id
           AND a2.discover_exposure_enabled = true
      )
    );

CREATE UNIQUE INDEX talent_discover_index_id_uniq
  ON public.talent_discover_index (id);
CREATE INDEX talent_discover_index_country
  ON public.talent_discover_index (home_country_text);
CREATE INDEX talent_discover_index_trust_tier
  ON public.talent_discover_index (trust_tier);
CREATE INDEX talent_discover_index_category
  ON public.talent_discover_index (category_slug);
CREATE INDEX talent_discover_index_agency
  ON public.talent_discover_index (agency_tenant_id);

GRANT ALL ON public.talent_discover_index TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. Carries verified STANDING aggregates since 20261110110000. Excludes is_test_account profiles and dead-workspace-only rosters since 20261110140000. Honours agencies.discover_exposure_enabled since 20261111090000.';

COMMIT;
