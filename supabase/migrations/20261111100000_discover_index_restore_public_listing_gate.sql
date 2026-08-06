-- Restore the is_publicly_listed gate on talent_discover_index.
--
-- WHY
-- ---
-- 20260803203521_public_listing_single_gate made is_publicly_listed the single
-- denormalized truth for public listing and rebuilt this matview to read it
-- (`AND tp.is_publicly_listed = true`). 20261110140000_discover_index_public_hygiene
-- later rebuilt the matview again and dropped that condition, and
-- 20261111090000_tenant_discover_exposure preserved the omission verbatim while
-- adding the tenant veto. The single-gate contract has been silently broken
-- since the hygiene rebuild.
--
-- IMPACT
-- ------
-- No live leak at the time of writing: 0 rows in the index have
-- is_publicly_listed = false, because the 23 discoverable-but-unlisted profiles
-- happen to be blocked by the workflow_status filter instead. That is
-- incidental, not a guarantee. The unguarded path: an agency turns the roster
-- eye OFF for an approved + discoverable talent -> the trigger flips
-- is_publicly_listed to false -> the talent KEEPS appearing on Discover,
-- which is exactly what the single-gate migration was written to prevent.
--
-- is_publicly_listed and is_discoverable are NOT duplicates and both are
-- required: the first is the agency's roster eye (maintained by trigger), the
-- second is the talent's own Discover opt-in. Each is a veto.
--
-- Row count is unchanged by this migration (85 -> 85).

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
    -- RESTORED (20261111100000): the roster-eye gate, dropped by 20261110140000.
    AND tp.is_publicly_listed = true
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
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. Carries verified STANDING aggregates since 20261110110000. Excludes is_test_account profiles and dead-workspace-only rosters since 20261110140000. Honours agencies.discover_exposure_enabled since 20261111090000. Requires talent_profiles.is_publicly_listed (the roster eye) since 20261111100000 -- restored after 20261110140000 dropped it.';

COMMIT;
