-- Talent visibility overhaul — eye toggle replaces the Draft/Published lifecycle.
--
-- New model, two clean gates (no workflow_status lifecycle):
--   1. Agency directory visibility  → agency_talent_roster.agency_visibility
--      (existing column: 'site_visible'/'featured' = eye ON, 'roster_only' = OFF).
--   2. Talent self-visibility        → talent_profiles.is_publicly_hidden (new).
--      A talent-controlled GLOBAL kill-switch across all of Tulala.
--
-- A talent is publicly visible iff: not deleted AND is_publicly_hidden = false
-- AND some agency has them site_visible/featured.
--
-- The legacy workflow_status / visibility columns stay (claim + approval flows,
-- audit) but stop gating public display.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Talent self-visibility kill-switch.
-- ---------------------------------------------------------------------------
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_publicly_hidden BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talent_profiles.is_publicly_hidden IS
  'Talent-controlled global kill-switch. true = talent has hidden their profile '
  'across all of Tulala (every directory, agency site, public page). Overrides '
  'any agency_talent_roster.agency_visibility. Set from talent account settings.';

-- ---------------------------------------------------------------------------
-- 2. Public read policy — anon-readable iff not globally hidden AND some agency
--    has the eye ON. This enforces the eye toggle at the DB layer; the old
--    policy gated on workflow_status='approved' AND visibility='public', which
--    hid the entire Draft roster regardless of the agency's choice.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS talent_select_public ON public.talent_profiles;
CREATE POLICY talent_select_public ON public.talent_profiles
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND is_publicly_hidden = false
    AND EXISTS (
      SELECT 1
      FROM public.agency_talent_roster r
      WHERE r.talent_profile_id = talent_profiles.id
        AND r.status = 'active'
        AND r.agency_visibility IN ('site_visible', 'featured')
    )
  );

COMMIT;
