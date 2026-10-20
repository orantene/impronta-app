-- TUL-1374 (Friends collective): the workspace-level "work model" (how the group
-- sells). The five models are the service-hub vocabulary already used by the
-- terms card (workspace_talent_terms.work_model, TUL-1368). NULL = not chosen.
-- Written only by the owner-only server action applyFriendsCollectivePreset (and
-- later the onboarding picker, TUL-1370), through the service role.
-- Additive. The code is fail-soft without it: the action answers "unavailable"
-- and changes nothing.
ALTER TABLE public.agencies
  ADD COLUMN IF NOT EXISTS work_model TEXT;
ALTER TABLE public.agencies
  DROP CONSTRAINT IF EXISTS agencies_work_model_chk;
ALTER TABLE public.agencies
  ADD CONSTRAINT agencies_work_model_chk
    CHECK (work_model IS NULL OR work_model IN
      ('coordinator_agency', 'open_network', 'team_studio', 'rental_studio', 'friends_collective'));
COMMENT ON COLUMN public.agencies.work_model IS
  'How this workspace sells with its talents: coordinator_agency, open_network, team_studio, rental_studio or friends_collective. NULL = not chosen.';

-- Rollback (manual): ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_work_model_chk; ALTER TABLE public.agencies DROP COLUMN IF EXISTS work_model;
