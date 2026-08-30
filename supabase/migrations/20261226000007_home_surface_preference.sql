-- Phase 1 (Tulala Agent): demote app_role to a home-dashboard preference.
--
-- THE PROBLEM
-- `profiles.app_role` holds exactly one of super_admin | agency_staff | talent |
-- client, and home-dashboard routing reads it. A hybrid — a user who owns both a
-- talent profile and a workspace — therefore gets exactly one home, chosen for
-- them, with no control anywhere to change it. Worse, a workspace owner's role
-- is a STAFF role rather than 'talent', so the surface that gets picked is often
-- the one they did not want, and the other one becomes unreachable from the
-- shell even though it exists and works.
--
-- WHY A NEW COLUMN RATHER THAN REUSING app_role
-- Writing a home choice into app_role would write UI state into a field that
-- gates capabilities: auth-routing, action-guards and has-capability all read it.
-- A user picking "show me my talent side" must not thereby change what they are
-- allowed to do. So the two concerns are separated, which is the actual content
-- of the demotion: app_role keeps its capability meaning and loses its routing
-- monopoly, and this column carries routing and nothing else.
--
-- Deliberately NOT an enum. It is a UI preference with three values today; a
-- text column with a CHECK can gain a fourth without an enum migration, and
-- nothing joins on it.
--
-- NULL means "never chosen", which is the correct default and is distinct from
-- any particular home. The chooser is shown exactly when more than one home is
-- valid AND this is NULL (or names a home that is no longer valid, e.g. someone
-- who chose 'talent' and later deleted the profile).
--
-- No backfill on purpose. Backfilling from app_role would re-import the very
-- guess this column exists to stop making, and would silently mark every hybrid
-- as having already chosen.
--
-- RLS: profiles already has owner-scoped policies; a user updating their own
-- preference is covered by them. No new policy, and no service-role need.
--
-- Rollback: DROP COLUMN. Nothing reads it that does not tolerate NULL.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_surface_preference text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_home_surface_preference_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_surface_preference_check
  CHECK (
    home_surface_preference IS NULL
    OR home_surface_preference IN ('workspace', 'talent', 'client')
  );

COMMENT ON COLUMN public.profiles.home_surface_preference IS
  'Which dashboard to land on when more than one is valid (hybrid accounts). UI routing ONLY — carries no capability meaning, unlike app_role. NULL = never chosen, show the chooser. Set by the user; derived structure comes from object existence (talent_profiles, agency_memberships, agency_talent_roster), never from this column.';

COMMIT;
