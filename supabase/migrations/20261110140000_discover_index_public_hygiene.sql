-- Discover index hygiene — keep test fixtures and dead workspaces out of the
-- PUBLIC talent directory.
--
-- Found 2026-07-24 auditing tulala.digital/directory, which advertises "107
-- profiles" to buyers. Two defects, both visible on the live public site:
--
--   1. Profiles flagged `talent_profiles.is_test_account = TRUE` were served
--      publicly. The flag existed and a platform-admin toggle already set it,
--      but NOTHING consumed it on the discovery path — so flagging an account
--      as a test account did not remove it from the directory. Five "QA Free
--      Seat 1-5" rows were live because of this.
--
--   2. ARCHIVED and SUSPENDED workspaces were being DISPLAYED as a talent's
--      agency. Verified on prod: "Opus Tester Studio" (archived) labelled 5
--      talents and "QA Free Browser Workspace" (suspended) labelled 5 more.
--      `primary_roster` picked the roster row by (is_primary, added_at) with no
--      regard for whether that workspace still existed, so a dead workspace
--      could win over a live one.
--
-- Both are fixed at the index, not the loader, so every consumer of the matview
-- (directory, Discover grid, section-builder cards, map pins) inherits the fix.
--
-- SCOPE — deliberately narrow. This migration removes exactly 5 rows (107 -> 102)
-- and relabels 10. It does NOT remove the seeded demo identities (Camila Ortega
-- x4, Luna Alvarez x3, Mateo Rossi x3, Noah Sinclair x3, Sofia Bennett x3, Opus
-- Tester) — those are NOT flagged as test accounts and DO sit on the live
-- `tulala` workspace, so no schema-level predicate can distinguish them from
-- real talent. Delisting them is an ops data decision (set `is_test_account`),
-- not a code one; this migration is what makes that flag actually work.
--
-- Matview columns/predicates cannot be ALTERed, so this DROP + CREATEs from the
-- current live definition (20261110110000) with the two predicates added.
--
-- ALSO RESTORES two indexes silently lost to the CASCADE in 20261110110000:
-- `_category` and `_agency`. `category_slug` is the directory's main filter
-- (discover.ts `query.eq("category_slug", ...)`) and has had no index since
-- that migration.

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH live_roster AS (
  -- Roster rows whose workspace is still live. Filtering HERE (rather than in
  -- the outer WHERE) is what stops an archived workspace from winning the
  -- DISTINCT ON below and being shown as the talent's agency.
  SELECT r.talent_profile_id,
         r.tenant_id,
         r.is_primary,
         r.added_at,
         a.display_name,
         a.plan_tier
    FROM agency_talent_roster r
    JOIN agencies a ON a.id = r.tenant_id
   WHERE r.status = ANY (ARRAY['active'::text, 'pending'::text])
     -- Deny-list, not `= 'active'`: a future status must not silently delist a
     -- paying agency's whole roster. New non-public states get added here.
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
    -- (1) A flagged test account is never public. Previously inert on this path.
    AND tp.is_test_account = false
    -- (2) Keep independents (no roster at all), but drop a talent whose ONLY
    -- rosters are on dead workspaces — they were public solely by virtue of a
    -- workspace that no longer exists. A talent on both a dead and a live
    -- workspace is unaffected (they match via the live one).
    AND (
      pr.talent_profile_id IS NOT NULL
      OR NOT EXISTS (
        SELECT 1 FROM agency_talent_roster r0
         WHERE r0.talent_profile_id = tp.id
           AND r0.status = ANY (ARRAY['active'::text, 'pending'::text])
      )
    );

-- UNIQUE index — required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX talent_discover_index_id_uniq
  ON public.talent_discover_index (id);
CREATE INDEX talent_discover_index_country
  ON public.talent_discover_index (home_country_text);
CREATE INDEX talent_discover_index_trust_tier
  ON public.talent_discover_index (trust_tier);
-- Restored (lost to the CASCADE in 20261110110000). category_slug is the
-- directory's primary filter; agency_tenant_id backs the per-workspace views.
CREATE INDEX talent_discover_index_category
  ON public.talent_discover_index (category_slug);
CREATE INDEX talent_discover_index_agency
  ON public.talent_discover_index (agency_tenant_id);

GRANT ALL ON public.talent_discover_index TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. Carries verified STANDING aggregates since 20261110110000. Excludes is_test_account profiles and dead-workspace-only rosters since 20261110140000.';

COMMIT;
-- CREATE MATERIALIZED VIEW ... AS <query> populates immediately, so no explicit
-- REFRESH is needed here.
