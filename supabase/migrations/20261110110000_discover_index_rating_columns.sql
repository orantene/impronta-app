-- STANDING v3 (item 9) — surface verified standing in the Discover matview.
--
-- The `talent_discover_index` materialized view feeds the Discover card grid and
-- the section-builder / marketing talent cards (via _data-bridge/discover.ts).
-- Until now it carried no rating, so card standing only rendered on the directory
-- list-row (which reads talent_profiles directly). This adds the denormalized
-- verified-standing aggregates so the same STANDING chip can render on the
-- Discover / section-builder / marketing cards — still GATED at the app layer by
-- the directory.card.show-standing token + the tenant reviews entitlement.
--
-- Matview columns cannot be added with ALTER, so this DROP + CREATEs the view
-- from its CURRENT live definition (captured via pg_get_viewdef 2026-07-08:
-- includes the primary_roster / primary_category (name_i18n) / trust_counts CTEs
-- and the trust_tier column) with three columns appended:
--   rating_avg           — public verified average (published + verified_paid)
--   rating_count         — count of those public reviews (0 => "no rating")
--   would_book_again_pct — % would-book-again over non-null answers, or NULL
-- All three come straight off talent_profiles (recomputed by
-- talent_reviews_recompute_summary). The blended, cross-tenant nature of these
-- aggregates is intentional (portable STANDING; see the v3 decisions doc).
--
-- Grants + indexes are reproduced to match the pre-drop live object exactly
-- (id_uniq, country, trust_tier; ALL to anon/authenticated/service_role). The
-- refresh function (refresh_talent_discover_index) is unaffected — it references
-- the view by name and is not a CASCADE dependency (verified: zero dependents).

BEGIN;

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH primary_roster AS (
  SELECT DISTINCT ON (r.talent_profile_id) r.talent_profile_id,
    r.tenant_id AS agency_tenant_id,
    a.display_name AS agency_name,
    a.plan_tier AS agency_plan_tier,
    r.is_primary = true AND (a.plan_tier = ANY (ARRAY['studio'::text, 'agency'::text, 'network'::text, 'hub-network'::text])) AS is_exclusive
   FROM agency_talent_roster r
     JOIN agencies a ON a.id = r.tenant_id
  WHERE r.status = ANY (ARRAY['active'::text, 'pending'::text])
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
    -- STANDING v3 (item 9): verified reputation aggregates, denormalized off
    -- talent_profiles so the Discover / section-builder / marketing cards can
    -- render the standing chip without an extra per-card query.
    tp.rating_avg,
    tp.rating_count,
    tp.would_book_again_pct,
    now() AS index_refreshed_at
   FROM talent_profiles tp
     LEFT JOIN primary_roster pr ON pr.talent_profile_id = tp.id
     LEFT JOIN primary_category pc ON pc.talent_profile_id = tp.id
     LEFT JOIN trust_counts tc ON tc.talent_profile_id = tp.id
     LEFT JOIN LATERAL compute_talent_availability_snapshot(tp.id) avail(next_available_date, available_days_in_next_30, availability_dots_14d) ON true
  WHERE tp.is_discoverable = true AND (tp.workflow_status = ANY (ARRAY['approved'::profile_workflow_status, 'published'::profile_workflow_status]));

-- UNIQUE index — required for REFRESH MATERIALIZED VIEW CONCURRENTLY.
CREATE UNIQUE INDEX talent_discover_index_id_uniq
  ON public.talent_discover_index (id);
CREATE INDEX talent_discover_index_country
  ON public.talent_discover_index (home_country_text);
CREATE INDEX talent_discover_index_trust_tier
  ON public.talent_discover_index (trust_tier);

-- Reproduce the pre-drop grants (owner=postgres; anon/authenticated/service_role
-- had full privileges). The Discover loader reads it under service_role.
GRANT ALL ON public.talent_discover_index TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. Carries verified STANDING aggregates (rating_avg/rating_count/would_book_again_pct) since 20261110110000.';

COMMIT;
-- CREATE MATERIALIZED VIEW ... AS <query> populates immediately, so no explicit
-- REFRESH is needed here. The 15-min cron + on-event triggers keep it fresh.
