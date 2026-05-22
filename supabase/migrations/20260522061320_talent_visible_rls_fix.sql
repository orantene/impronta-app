-- Fix infinite-recursion in talent_select_public (follow-on to 20260522061318).
--
-- The previous policy embedded an inline `EXISTS (SELECT ... FROM
-- agency_talent_roster ...)`. Evaluating that subquery re-applies
-- agency_talent_roster's own RLS, which transitively re-enters
-- talent_profiles' policy — Postgres aborts with
-- "infinite recursion detected in policy for relation talent_profiles".
--
-- Fix: move the roster check into a SECURITY DEFINER function. It runs as the
-- function owner, bypassing RLS on agency_talent_roster, so there is no policy
-- re-entry. The public gate is unchanged in meaning: a talent_profiles row is
-- anon-readable iff the talent has not globally hidden themselves AND some
-- agency has them site_visible / featured.

BEGIN;

CREATE OR REPLACE FUNCTION public.talent_is_site_visible_anywhere(p_talent_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_talent_roster r
    WHERE r.talent_profile_id = p_talent_id
      AND r.status = 'active'
      AND r.agency_visibility IN ('site_visible', 'featured')
  );
$$;

COMMENT ON FUNCTION public.talent_is_site_visible_anywhere(uuid) IS
  'True when the talent is site_visible/featured on at least one active agency '
  'roster. SECURITY DEFINER so it can be called from the talent_profiles RLS '
  'policy without re-entering agency_talent_roster RLS (recursion guard).';

GRANT EXECUTE ON FUNCTION public.talent_is_site_visible_anywhere(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS talent_select_public ON public.talent_profiles;
CREATE POLICY talent_select_public ON public.talent_profiles
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_publicly_hidden = false
    AND public.talent_is_site_visible_anywhere(id)
  );

COMMIT;
