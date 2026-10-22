-- TUL-1591 (a): did this talent LEAVE this workspace? A yes/no for the edge.
--
-- HELD in _pending_pm. Additive and idempotent: one new read-only function. Nothing existing
-- changes. Not applied by this PR (no db push).
--
-- Why: when a talent leaves a workspace, her old /t/<code> links on that workspace's site
-- should go to the group (its home) instead of a dead page (rule `leavingOutcome`,
-- TUL-1378 / #4178). The edge (proxy.ts -> host-context.ts) runs with the ANON key, and
-- anon can read only site-visible ACTIVE roster rows, so it cannot tell "left" from "never
-- here". This answers that one question and nothing else.
--
-- Returns true only when ALL hold, else false (the visitor keeps the real 404):
--   - the code (live code or retired alias, same resolver the public profile uses) names
--     a profile whose roster row on THIS workspace is `removed`;
--   - that row was public when she left: agency_visibility IN ('site_visible','featured')
--     AND talent_site_hidden = false;
--   - the profile is still public now (the repo's public-listing gate,
--     isPublicCatalogProfile): deleted_at IS NULL, is_publicly_hidden = false,
--     is_publicly_listed = true, visibility = 'public', profile_kind = 'person';
--   - she has no other (non-removed) row on this workspace.
-- Never returns a row, an id, a date or a reason.
-- Read-only, STABLE, SECURITY DEFINER with a pinned search_path. Callers treat an error or
-- a missing function as "no" (the visitor keeps the real 404).
--
-- Disclosure (P1 review on #4235): profile codes are sequential, so without the public
-- conditions above anyone could list everyone a workspace removed. With them, the only
-- yes is for a profile that is public today AND that this workspace was showing publicly
-- when she left: public history, not new information. Listed in PUBLIC_SURFACE_FUNCTIONS
-- (web/src/lib/saas/public-surface-functions.ts) because the anon edge client calls it.
--
-- Rollback:
--   DROP FUNCTION IF EXISTS public.talent_left_workspace(uuid, text);

BEGIN;

CREATE OR REPLACE FUNCTION public.talent_left_workspace(p_tenant_id uuid, p_profile_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH code AS (
    SELECT rc.profile_id
      FROM public.resolve_talent_profile_code(p_profile_code) rc
     LIMIT 1
  )
  SELECT p_tenant_id IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM code c
         JOIN public.talent_profiles tp ON tp.id = c.profile_id
         JOIN public.agency_talent_roster r ON r.talent_profile_id = tp.id
        WHERE r.tenant_id = p_tenant_id
          AND r.status = 'removed'
          -- Only someone this workspace SHOWED publicly when she left (the roster eye was
          -- on and her site was not hidden): their removal is not a secret. A row that was
          -- never public stays a plain 404, so the removed list cannot be enumerated.
          AND r.agency_visibility IN ('site_visible', 'featured')
          AND r.talent_site_hidden = false
          -- And she is still a public profile today: the repo's public-listing gate
          -- (isPublicCatalogProfile in web/src/lib/offerings/business-catalog.ts):
          -- not deleted, not hidden, publicly listed, visibility public, a person.
          AND tp.deleted_at IS NULL
          AND tp.is_publicly_hidden = false
          AND tp.is_publicly_listed = true
          AND tp.visibility = 'public'
          AND tp.profile_kind = 'person'
     )
     AND NOT EXISTS (
       SELECT 1
         FROM code c
         JOIN public.agency_talent_roster r ON r.talent_profile_id = c.profile_id
        WHERE r.tenant_id = p_tenant_id
          AND r.status <> 'removed'
     );
$$;

COMMENT ON FUNCTION public.talent_left_workspace(uuid, text) IS
  'TUL-1591: true only when the profile code names a still-public person whose PUBLIC roster row on this workspace was removed, with no other row on it. Yes/no only, for the edge leaver redirect.';

REVOKE ALL ON FUNCTION public.talent_left_workspace(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_left_workspace(uuid, text) TO anon, authenticated, service_role;

COMMIT;
