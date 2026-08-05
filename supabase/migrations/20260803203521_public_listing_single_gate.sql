-- Unify the "is this talent publicly listed?" gate behind ONE column.
--
-- WHY
-- ---
-- Three surfaces each decided public listing differently, so an agency could
-- approve a talent and still get a faceless card:
--
--   * `media_select` RLS  -> talent_profiles.workflow_status='approved'
--                            AND talent_profiles.visibility='public'
--   * talent_discover_index -> workflow_status IN ('approved','published')
--   * directory listing     -> only is_publicly_hidden=false
--
-- Meanwhile the product moved the actual approve control to the roster "eye"
-- (`agency_talent_roster.agency_visibility`), which writes NONE of the columns
-- above (see setRosterTalentSiteVisibility — its own comment says it "replaces
-- the old Draft/Published workflow"). Result on prod, verified via
-- talent_workflow_events: `loba` and `rocio` were approved with the eye on
-- 2026-07-31, produced zero workflow_status_changed events, and therefore
-- rendered in the directory with their photos RLS-filtered to nothing. Both
-- have approved card+hero assets sitting in media-public.
--
-- WHAT
-- ----
-- `talent_profiles.is_publicly_listed` becomes the single denormalized truth,
-- maintained by trigger from the roster eye. All three surfaces read it:
--   - cheap for RLS (plain column test, no correlated subquery per media row)
--   - trivial for PostgREST (the directory loader can `.eq(...)` it)
--   - one place to change the rule
--
-- THE RULE
-- --------
-- A talent is publicly listed when they are not deleted / not a test account /
-- not self-hidden, AND either
--   (a) they sit on at least one LIVE roster whose eye is on, or
--   (b) they are independent (no live roster at all) and self-published via
--       workflow_status — independents have no agency to flip an eye for them,
--       so their own status stays authoritative.
--
-- Measured against prod before writing: this gains 10 profiles and loses 0.

BEGIN;

-- ─── 1. The column ───────────────────────────────────────────────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_publicly_listed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talent_profiles.is_publicly_listed IS
  'Single source of truth for public listing. Maintained by trigger from agency_talent_roster.agency_visibility (the roster eye); independents fall back to workflow_status. Never write this directly — set the eye instead.';

-- ─── 2. The predicate ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talent_compute_publicly_listed(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM talent_profiles tp
     WHERE tp.id = p_talent_profile_id
       AND tp.deleted_at IS NULL
       AND COALESCE(tp.is_test_account, false) = false
       AND COALESCE(tp.is_publicly_hidden, false) = false
       AND (
         -- (a) rostered: the agency eye is authoritative
         EXISTS (
           SELECT 1
             FROM agency_talent_roster r
             JOIN agencies a ON a.id = r.tenant_id
            WHERE r.talent_profile_id = tp.id
              AND r.status = ANY (ARRAY['active'::text, 'pending'::text])
              AND a.status <> ALL (ARRAY['archived'::text, 'suspended'::text])
              AND r.agency_visibility = ANY (ARRAY['site_visible'::text, 'featured'::text])
         )
         -- (b) independent: no live roster anywhere, so self-published wins
         OR (
           NOT EXISTS (
             SELECT 1
               FROM agency_talent_roster r0
              WHERE r0.talent_profile_id = tp.id
                AND r0.status = ANY (ARRAY['active'::text, 'pending'::text])
           )
           AND tp.workflow_status = ANY (
             ARRAY['approved'::profile_workflow_status, 'published'::profile_workflow_status]
           )
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION public.talent_compute_publicly_listed(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_compute_publicly_listed(uuid)
  TO anon, authenticated, service_role;

-- ─── 3. Recompute helper + triggers ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.talent_refresh_publicly_listed(p_ids uuid[])
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE talent_profiles tp
     SET is_publicly_listed = public.talent_compute_publicly_listed(tp.id)
   WHERE tp.id = ANY (p_ids)
     AND tp.is_publicly_listed IS DISTINCT FROM public.talent_compute_publicly_listed(tp.id);
$$;

-- talent_profiles: recompute own row when an input column moves.
--
-- AFTER, not BEFORE: talent_compute_publicly_listed re-reads the row, and in a
-- BEFORE trigger the row still holds its OLD values, so the gate would be
-- computed from the pre-update workflow_status. The recursive UPDATE this
-- performs cannot loop — it writes only is_publicly_listed, which is not in the
-- trigger's UPDATE OF column list, and talent_refresh_publicly_listed's
-- IS DISTINCT FROM guard makes it a no-op once the value is settled.
CREATE OR REPLACE FUNCTION public.trg_talent_profiles_publicly_listed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.talent_refresh_publicly_listed(ARRAY[NEW.id]);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS talent_profiles_publicly_listed ON public.talent_profiles;
CREATE TRIGGER talent_profiles_publicly_listed
  AFTER UPDATE OF workflow_status, visibility, is_test_account, is_publicly_hidden, deleted_at
  ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_talent_profiles_publicly_listed();

DROP TRIGGER IF EXISTS talent_profiles_publicly_listed_ins ON public.talent_profiles;
CREATE TRIGGER talent_profiles_publicly_listed_ins
  AFTER INSERT ON public.talent_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_talent_profiles_publicly_listed();

-- agency_talent_roster: the eye lives here, so this is the important one.
-- OLD/NEW are only both populated on UPDATE, hence the TG_OP branches.
CREATE OR REPLACE FUNCTION public.trg_roster_publicly_listed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.talent_refresh_publicly_listed(ARRAY[NEW.talent_profile_id]);
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.talent_refresh_publicly_listed(ARRAY[OLD.talent_profile_id]);
  ELSE
    PERFORM public.talent_refresh_publicly_listed(
      ARRAY[NEW.talent_profile_id, OLD.talent_profile_id]::uuid[]
    );
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS roster_publicly_listed ON public.agency_talent_roster;
CREATE TRIGGER roster_publicly_listed
  AFTER INSERT OR DELETE OR UPDATE OF agency_visibility, status, tenant_id, talent_profile_id
  ON public.agency_talent_roster
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_roster_publicly_listed();

-- agencies: archiving/suspending a workspace delists its whole roster.
CREATE OR REPLACE FUNCTION public.trg_agencies_publicly_listed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.talent_refresh_publicly_listed(
    ARRAY(
      SELECT r.talent_profile_id
        FROM agency_talent_roster r
       WHERE r.tenant_id = NEW.id
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS agencies_publicly_listed ON public.agencies;
CREATE TRIGGER agencies_publicly_listed
  AFTER UPDATE OF status ON public.agencies
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status)
  EXECUTE FUNCTION public.trg_agencies_publicly_listed();

-- ─── 4. Test-fixture hygiene (REQUIRED for this migration to be a no-op) ─────
--
-- Nine QA fixtures already have their roster eye ON (set by old bulk runs on the
-- `tulala` hub) while workflow_status='hidden' kept them out. Making the eye
-- authoritative would therefore PROMOTE them into the public directory and
-- Discover — all nine have zero photos, so they would render as exactly the
-- faceless cards this migration exists to remove.
--
-- `is_test_account` is the mechanism 20261110140000 built for this and
-- deliberately left to an ops decision. Enumerated by profile_code rather than
-- matched by a name/email heuristic so the list is auditable and reversible:
--   UPDATE talent_profiles SET is_test_account = false WHERE profile_code IN (...);
--
-- The flag only affects public listing and platform counts — it does NOT touch
-- auth, so these accounts stay usable for QA sign-in.
UPDATE public.talent_profiles
   SET is_test_account = true
 WHERE profile_code IN (
   'TAL-92011',      -- Identity QA-1779328209
   'TAL-92023',      -- Local QA
   'TAL-92012',      -- Placetest Autocomplete
   'TAL-92024',      -- Test Shell Create
   'TAL-92006',      -- Test TalentQA-1779319125
   'TAL-AUDIT-0512', -- QA Talent Dashboard Audit
   'TAL-92001',      -- Sofía Herrera      (tulum-talent-sofia@impronta.test)
   'TAL-92002',      -- Carmen Díaz        (tulum-talent-carmen@impronta.test)
   'TAL-92003'       -- Luis Ortega        (tulum-talent-luis@impronta.test)
 )
   AND is_test_account = false;

-- ─── 5. Backfill ─────────────────────────────────────────────────────────────

UPDATE public.talent_profiles tp
   SET is_publicly_listed = public.talent_compute_publicly_listed(tp.id);

CREATE INDEX IF NOT EXISTS talent_profiles_publicly_listed_idx
  ON public.talent_profiles (is_publicly_listed)
  WHERE is_publicly_listed;

-- ─── 6. media_select RLS reads the column ────────────────────────────────────
--
-- Only the LAST branch changes: the public-read arm now trusts the unified gate
-- instead of workflow_status/visibility. Staff, super-admin and own-profile arms
-- are preserved verbatim so nobody loses access to their own media.

DROP POLICY IF EXISTS media_select ON public.media_assets;
CREATE POLICY media_select ON public.media_assets
FOR SELECT
USING (
  deleted_at IS NULL
  AND (
    EXISTS (
      SELECT 1 FROM profiles p
       WHERE p.id = (SELECT auth.uid()) AND p.app_role = 'super_admin'::app_role
    )
    OR EXISTS (
      SELECT 1 FROM agency_memberships m
       WHERE m.profile_id = (SELECT auth.uid())
         AND m.tenant_id = media_assets.tenant_id
         AND m.status = ANY (ARRAY['active'::text, 'pending_acceptance'::text])
    )
    OR EXISTS (
      SELECT 1 FROM talent_profiles t
       WHERE t.id = media_assets.owner_talent_profile_id
         AND t.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1 FROM talent_profiles t
       WHERE t.id = media_assets.owner_talent_profile_id
         AND t.is_publicly_listed = true
         AND media_assets.approval_state = 'approved'::media_approval_state
         AND media_assets.variant_kind <> 'original'::media_variant_kind
    )
  )
);

-- ─── 7. talent_discover_index reads the column ───────────────────────────────
--
-- Matview predicates cannot be ALTERed, so this DROP + CREATEs from the live
-- definition (20261110140000) with ONLY the public-gate predicate swapped.
-- `is_test_account` and the dead-workspace rule now live inside
-- talent_compute_publicly_listed, so they are dropped from the outer WHERE
-- rather than duplicated.

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
    AND tp.is_publicly_listed = true;

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
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Loader: web/src/app/(workspace)/[tenantSlug]/_data-bridge/discover.ts. Public gate is talent_profiles.is_publicly_listed (the roster eye) since 20260803203521.';

COMMIT;
