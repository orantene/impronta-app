-- FIX — infinite RLS recursion between talent_profiles and agency_talent_roster.
--
-- Incident: migration 20260522061318_talent_public_visibility.sql rewrote the
-- `talent_select_public` policy on public.talent_profiles to inline-subquery
-- public.agency_talent_roster. That table already carries a SELECT policy
-- (`agency_talent_roster_talent_self_read`, from 20260606100000) which
-- inline-subqueries public.talent_profiles. The two policies now reference
-- each other, so Postgres re-enters RLS on each hop and aborts every
-- authenticated read of either table with:
--
--   ERROR: 42P17 infinite recursion detected in policy for relation
--          "talent_profiles"
--
-- Blast radius (observed): workspace roster, calendar, bookings, media,
-- overview metrics, talent self-profile, AND inquiry reads — because
-- `inquiries.inquiries_select_talent_participant` and
-- `inquiry_participants.inquiry_participants_talent_select` both subquery
-- talent_profiles and therefore inherit the cycle.
--
-- Fix: break the cycle at one point. The roster-visibility check moves into a
-- SECURITY DEFINER function so it reads agency_talent_roster with the function
-- owner's rights and does NOT re-enter RLS. Semantics are byte-identical to
-- the EXISTS(...) the policy used before — this is purely a recursion break.
--
-- Self-contained note: 20260522061318_talent_public_visibility.sql (which adds
-- talent_profiles.is_publicly_hidden and the recursive policy this fixes) was
-- applied to the remote DB but is NOT yet committed to `main`. So this
-- migration re-asserts the column with ADD COLUMN IF NOT EXISTS — idempotent
-- on the live DB (column already there) and keeps `main` able to build from
-- scratch until the drift migration lands. Safe to run before or after it.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_publicly_hidden BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.talent_has_public_roster(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_talent_roster r
    WHERE r.talent_profile_id = p_talent_profile_id
      AND r.status = 'active'
      AND r.agency_visibility IN ('site_visible', 'featured')
  );
$$;

COMMENT ON FUNCTION public.talent_has_public_roster(uuid) IS
  'SECURITY DEFINER: true iff the talent has at least one active roster row '
  'with the public eye ON. Used by talent_profiles.talent_select_public so the '
  'roster lookup does not re-enter RLS (prevents 42P17 mutual recursion with '
  'agency_talent_roster_talent_self_read).';

REVOKE ALL ON FUNCTION public.talent_has_public_roster(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.talent_has_public_roster(uuid)
  TO anon, authenticated, service_role;

DROP POLICY IF EXISTS talent_select_public ON public.talent_profiles;
CREATE POLICY talent_select_public ON public.talent_profiles
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_publicly_hidden = false
    AND public.talent_has_public_roster(talent_profiles.id)
  );

COMMIT;
