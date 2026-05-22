-- Talent per-agency-site visibility — a third visibility layer.
--
-- Layers gating whether a talent shows on tenant T's public site:
--   1. talent_profiles.is_publicly_hidden = false      (talent global switch)
--   2. agency_talent_roster.agency_visibility IN
--        ('site_visible','featured')                   (agency eye)
--   3. agency_talent_roster.talent_site_hidden = false  (talent per-site — NEW)
--
-- A talent on multiple rosters can now stay globally visible yet opt out of an
-- individual agency's site. talent_site_hidden is talent-controlled; writes go
-- through a server action with service-role (no RLS write policy — same as
-- agency_visibility, which is also staff/service-role-written).

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The per-site opt-out column. Default false = the talent is shown.
-- ---------------------------------------------------------------------------
ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS talent_site_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.agency_talent_roster.talent_site_hidden IS
  'Talent-controlled per-agency opt-out. true = the talent has chosen not to '
  'appear on THIS agency''s public site, even if the agency''s eye '
  '(agency_visibility) is on. Set from the talent''s Profile-visibility drawer.';

-- ---------------------------------------------------------------------------
-- 2. Public read of the roster row — also requires the talent has not opted
--    out of this site.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_talent_roster_public_site_visible ON public.agency_talent_roster;
CREATE POLICY agency_talent_roster_public_site_visible ON public.agency_talent_roster
  FOR SELECT
  USING (
    status = 'active'
    AND agency_visibility IN ('site_visible', 'featured')
    AND talent_site_hidden = false
  );

-- ---------------------------------------------------------------------------
-- 3. The two recursion-safe SECURITY DEFINER helpers that gate
--    talent_profiles.talent_select_public — both must honour the opt-out.
-- ---------------------------------------------------------------------------
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
      AND r.talent_site_hidden = false
  );
$$;

CREATE OR REPLACE FUNCTION public.talent_has_public_roster(p_talent_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.agency_talent_roster r
    WHERE r.talent_profile_id = p_talent_profile_id
      AND r.status = 'active'
      AND r.agency_visibility IN ('site_visible', 'featured')
      AND r.talent_site_hidden = false
  );
$$;

COMMIT;
