-- Keep workspace starter-seed talent out of the public platform hub directory.
--
-- WHY
-- ---
-- `onboardStarterContent` seeds every new workspace with the SAME 5 template
-- talents (Luna Alvarez, Mateo Rossi, Sofia Bennett, Noah Sinclair, Camila
-- Ortega) so a fresh storefront isn't empty. It inserts them
-- `workflow_status='approved'`, which immediately fires
-- `trg_talent_auto_enroll_hub` → a hub roster row at
-- `agency_visibility='site_visible'`.
--
-- Net effect: every workspace ever created (real signup OR throwaway QA
-- workspace) pushed 5 more clones of the same 5 people into
-- tulala.digital/directory. Measured before this migration: 7 workspaces,
-- 33 clone profiles, e.g. "Camila Ortega" rendering three times in one row.
--
-- Note the seeder already sets `hub_visibility_status='not_submitted'` on its
-- OWN roster row — hub listing is meant to be opt-in. The trigger bypassed
-- that intent entirely for template content.
--
-- WHAT
-- ----
-- `talent_profiles.is_starter_seed` marks onboarding template content. The
-- auto-enroll trigger skips it, so:
--   * real talent still auto-enroll into the hub (behaviour unchanged), and
--   * starter seeds stay visible on THEIR OWN workspace storefront (which is
--     the whole point of the seeded first-run experience) but never enter the
--     platform-wide directory.
--
-- Existing clones are backfilled by the seeder's own structural signature
-- (source_type='agency_created' AND source_workspace_id = tenant_id on a
-- non-hub roster row), not by display name, and their hub roster rows are
-- deleted. Genuine platform demo profiles — the TAL-91xxx set that lives ONLY
-- on the hub — have no second roster row and are therefore untouched.

BEGIN;

-- ─── 1. The marker ───────────────────────────────────────────────────────────

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_starter_seed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talent_profiles.is_starter_seed IS
  'TRUE for onboarding starter-roster template talent (onboardStarterContent). Visible on its own workspace storefront; excluded from platform-hub auto-enrollment so the global directory does not fill with clones of the same 5 demo people.';

-- ─── 2. Backfill existing clones ─────────────────────────────────────────────

WITH hub AS (
  SELECT a.id
    FROM public.agencies a
   WHERE a.kind = 'hub' AND a.plan_tier = 'network' AND a.status = 'active'
   ORDER BY a.created_at ASC
   LIMIT 1
)
UPDATE public.talent_profiles tp
   SET is_starter_seed = true
 WHERE tp.deleted_at IS NULL
   AND EXISTS (
     SELECT 1
       FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = tp.id
        AND r.tenant_id <> (SELECT id FROM hub)
        AND r.status <> 'removed'
        -- The starter seeder's signature: it creates the roster row for the
        -- workspace it is seeding, with itself as the source workspace.
        AND r.source_type = 'agency_created'
        AND r.source_workspace_id = r.tenant_id
   )
   AND EXISTS (
     SELECT 1 FROM public.agency_talent_roster rh
      WHERE rh.talent_profile_id = tp.id AND rh.tenant_id = (SELECT id FROM hub)
   )
   AND tp.display_name IN (
     'Luna Alvarez', 'Mateo Rossi', 'Sofia Bennett', 'Noah Sinclair', 'Camila Ortega'
   );

-- ─── 3. Trigger skips starter seeds ──────────────────────────────────────────
--
-- Rewritten from the live definition with ONE added guard. Everything else —
-- the hub lookup, the dedupe check, the fail-safe exception block — is
-- preserved verbatim so real-talent enrollment is untouched.

CREATE OR REPLACE FUNCTION public.ensure_talent_in_platform_hub()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  hub_id uuid;
begin
  begin
    if new.deleted_at is not null then
      return new;
    end if;
    if new.workflow_status not in ('approved', 'published') then
      return new;
    end if;
    -- Onboarding template content belongs to its own workspace storefront,
    -- not the platform-wide directory. Without this every new workspace adds
    -- 5 more clones of the same demo people to tulala.digital/directory.
    if coalesce(new.is_starter_seed, false) then
      return new;
    end if;

    select a.id into hub_id
    from public.agencies a
    where a.kind = 'hub'
      and a.plan_tier = 'network'
      and a.status = 'active'
    order by a.created_at asc
    limit 1;

    if hub_id is null then
      return new;
    end if;

    if not exists (
      select 1
      from public.agency_talent_roster r
      where r.tenant_id = hub_id
        and r.talent_profile_id = new.id
        and r.status in ('pending', 'active', 'inactive')
    ) then
      insert into public.agency_talent_roster
        (tenant_id, talent_profile_id, source_type, status,
         agency_visibility, talent_site_hidden, is_primary)
      values
        (hub_id, new.id, 'platform_assigned', 'active',
         'site_visible', false, false);
    end if;
  exception when others then
    -- Fail-safe: never propagate enrollment errors to the talent write.
    null;
  end;

  return new;
end;
$function$;

-- ─── 4. Remove the clones already on the hub ─────────────────────────────────
--
-- Deletes ONLY the hub roster row. The workspace's own roster row is left
-- intact, so each starter storefront keeps its 5 talents.

WITH hub AS (
  SELECT a.id
    FROM public.agencies a
   WHERE a.kind = 'hub' AND a.plan_tier = 'network' AND a.status = 'active'
   ORDER BY a.created_at ASC
   LIMIT 1
)
DELETE FROM public.agency_talent_roster r
 USING public.talent_profiles tp
 WHERE r.talent_profile_id = tp.id
   AND r.tenant_id = (SELECT id FROM hub)
   AND tp.is_starter_seed = true;

-- The roster delete fires trg_roster_publicly_listed, which recomputes
-- is_publicly_listed per profile — starter seeds stay listed via their own
-- workspace's eye.

-- ─── 5. Keep them out of the CROSS-TENANT catalog ────────────────────────────
--
-- Removing the hub roster row is not sufficient on its own: tulala.digital's
-- global directory reads `talent_discover_index`, whose gate is
-- `is_discoverable AND is_publicly_listed` — it never consults hub membership.
-- `is_discoverable` is precisely the "include me in the cross-tenant Tulala
-- catalog" switch, so template content sets it false: still on its own
-- workspace storefront (which filters is_publicly_listed, NOT is_discoverable),
-- never in the platform-wide directory.

UPDATE public.talent_profiles
   SET is_discoverable = false, updated_at = now()
 WHERE is_starter_seed = true AND is_discoverable = true;

-- Belt and braces: hard-exclude starter seeds at the index itself so a future
-- bulk "make everything discoverable" pass can't refill the global directory
-- with clones. (An earlier alignment pass did exactly that, which is how 33
-- clones reached the public grid.) Matview predicates cannot be ALTERed, so
-- this DROPs and recreates from the live definition with one added condition.

DROP MATERIALIZED VIEW IF EXISTS public.talent_discover_index CASCADE;

CREATE MATERIALIZED VIEW public.talent_discover_index AS
WITH live_roster AS (
  SELECT r.talent_profile_id, r.tenant_id, r.is_primary, r.added_at,
         a.display_name, a.plan_tier
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
  SELECT b.talent_profile_id, count(*)::integer AS verified_badge_count
   FROM talent_profile_trust_badges b
  WHERE b.status = 'verified'::text AND b.scope = 'platform'::text AND (b.expires_at IS NULL OR b.expires_at > now())
  GROUP BY b.talent_profile_id
)
SELECT tp.id, tp.display_name, tp.first_name, tp.last_name, tp.profile_code,
    tp.home_country_text, tp.home_city_text, tp.residence_city_id, tp.workflow_status,
    pr.agency_tenant_id, pr.agency_name, pr.agency_plan_tier,
    COALESCE(pr.is_exclusive, false) AS is_exclusive,
    pc.category_label, pc.category_slug,
    avail.next_available_date, avail.available_days_in_next_30, avail.availability_dots_14d,
    CASE
        WHEN COALESCE(tc.verified_badge_count, 0) >= 3 THEN 'gold'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 2 THEN 'silver'::text
        WHEN COALESCE(tc.verified_badge_count, 0) = 1 THEN 'verified'::text
        ELSE 'basic'::text
    END AS trust_tier,
    tp.rating_avg, tp.rating_count, tp.would_book_again_pct,
    now() AS index_refreshed_at
   FROM talent_profiles tp
     LEFT JOIN primary_roster pr ON pr.talent_profile_id = tp.id
     LEFT JOIN primary_category pc ON pc.talent_profile_id = tp.id
     LEFT JOIN trust_counts tc ON tc.talent_profile_id = tp.id
     LEFT JOIN LATERAL compute_talent_availability_snapshot(tp.id) avail(next_available_date, available_days_in_next_30, availability_dots_14d) ON true
  WHERE tp.is_discoverable = true
    AND tp.is_publicly_listed = true
    AND COALESCE(tp.is_starter_seed, false) = false;

CREATE UNIQUE INDEX talent_discover_index_id_uniq ON public.talent_discover_index (id);
CREATE INDEX talent_discover_index_country ON public.talent_discover_index (home_country_text);
CREATE INDEX talent_discover_index_trust_tier ON public.talent_discover_index (trust_tier);
CREATE INDEX talent_discover_index_category ON public.talent_discover_index (category_slug);
CREATE INDEX talent_discover_index_agency ON public.talent_discover_index (agency_tenant_id);

GRANT ALL ON public.talent_discover_index TO anon, authenticated, service_role;

COMMENT ON MATERIALIZED VIEW public.talent_discover_index IS
  'Denormalized Discover catalog row per discoverable talent. Refreshed by cron (15min) + on-event triggers. Public gate is talent_profiles.is_publicly_listed (the roster eye) since 20260803203521; onboarding starter-seed template talent excluded since 20260806002850.';

COMMIT;
