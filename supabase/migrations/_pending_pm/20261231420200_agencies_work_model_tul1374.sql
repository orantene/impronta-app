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

-- Who may change these two columns. 418000 (held) lets any ACTIVE non-viewer
-- member UPDATE agencies and its 418100 trigger narrows only the plan / seats /
-- status / Stripe columns, so an editor could still rewrite the model or point
-- every request at another inbox through PostgREST. Same shape as
-- agencies_protect_platform_columns (418100): browser sessions (authenticated /
-- anon) must be the workspace OWNER (active) or a platform admin; the service
-- role (our owner-only server actions) and SECURITY DEFINER functions are not
-- 'authenticated' and pass.
CREATE OR REPLACE FUNCTION public.agencies_protect_work_model()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (
          NEW.work_model                  IS DISTINCT FROM OLD.work_model
       OR NEW.default_coordinator_user_id IS DISTINCT FROM OLD.default_coordinator_user_id
     )
     AND NOT public.is_platform_admin()
     AND NOT EXISTS (
       SELECT 1 FROM public.agency_memberships m
        WHERE m.tenant_id = NEW.id
          AND m.profile_id = auth.uid()
          AND m.role = 'owner'
          AND m.status = 'active'
     ) THEN
    RAISE EXCEPTION 'agencies.work_model and default_coordinator_user_id can only be changed by the workspace owner or the platform'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.agencies_protect_work_model() IS
  'BEFORE UPDATE guard on agencies: work_model and default_coordinator_user_id change only via service role, SECURITY DEFINER functions, the active workspace owner or a platform admin (TUL-1374).';

DROP TRIGGER IF EXISTS agencies_protect_work_model ON public.agencies;
CREATE TRIGGER agencies_protect_work_model
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_protect_work_model();

-- The owner's share per member, set by the owner on the roster row (workspace x
-- talent): a percentage (bps, 0..9000 = at most 90%) or a fixed amount in one
-- currency. NULL = no share (the member keeps her whole line). Applied when an
-- order is priced, through the line's talent cost (lib/service-hub/collective-split.ts).
ALTER TABLE public.agency_talent_roster
  ADD COLUMN IF NOT EXISTS owner_share_kind TEXT,
  ADD COLUMN IF NOT EXISTS owner_share_bps INT,
  ADD COLUMN IF NOT EXISTS owner_share_cents BIGINT,
  ADD COLUMN IF NOT EXISTS owner_share_currency TEXT;
ALTER TABLE public.agency_talent_roster
  DROP CONSTRAINT IF EXISTS agency_talent_roster_owner_share_chk;
ALTER TABLE public.agency_talent_roster
  ADD CONSTRAINT agency_talent_roster_owner_share_chk CHECK (
    owner_share_kind IS NULL
    OR (owner_share_kind = 'percent' AND owner_share_bps BETWEEN 0 AND 9000
        AND owner_share_cents IS NULL AND owner_share_currency IS NULL)
    OR (owner_share_kind = 'fixed' AND owner_share_cents BETWEEN 0 AND 1000000000000
        AND char_length(owner_share_currency) = 3 AND owner_share_bps IS NULL)
  );
COMMENT ON COLUMN public.agency_talent_roster.owner_share_kind IS
  'Friends collective: how the owner is paid from this member''s sales: percent (owner_share_bps, max 9000) or fixed (owner_share_cents + owner_share_currency). NULL = none.';

-- Rollback (manual): DROP TRIGGER IF EXISTS agencies_protect_work_model ON public.agencies; DROP FUNCTION IF EXISTS public.agencies_protect_work_model(); ALTER TABLE public.agencies DROP CONSTRAINT IF EXISTS agencies_work_model_chk; ALTER TABLE public.agencies DROP COLUMN IF EXISTS work_model; ALTER TABLE public.agency_talent_roster DROP CONSTRAINT IF EXISTS agency_talent_roster_owner_share_chk; ALTER TABLE public.agency_talent_roster DROP COLUMN IF EXISTS owner_share_kind, DROP COLUMN IF EXISTS owner_share_bps, DROP COLUMN IF EXISTS owner_share_cents, DROP COLUMN IF EXISTS owner_share_currency;
