-- G3a: talent live status ("Atiendo emergencias hoy").
-- One row per talent. `emergencies_until` is the instant the flag stops being
-- true (end of the talent's local day); null or a past instant means off, so a
-- forgotten toggle can never promise an emergency visit tomorrow.
-- Additive only. The public page reads through the service-role loader; there
-- is deliberately no anon grant and no anon policy.

CREATE TABLE IF NOT EXISTS public.talent_live_status (
  talent_profile_id uuid PRIMARY KEY REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  emergencies_until timestamptz NULL,
  updated_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        uuid NULL
);

COMMENT ON TABLE public.talent_live_status IS
  'G3a: talent-owned daily live flags. emergencies_until null or in the past = off. Public pages read it via the service-role loader only.';

ALTER TABLE public.talent_live_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS talent_live_status_select_owner ON public.talent_live_status;
CREATE POLICY talent_live_status_select_owner ON public.talent_live_status
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS talent_live_status_insert_owner ON public.talent_live_status;
CREATE POLICY talent_live_status_insert_owner ON public.talent_live_status
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS talent_live_status_update_owner ON public.talent_live_status;
CREATE POLICY talent_live_status_update_owner ON public.talent_live_status
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.talent_profiles tp
    WHERE tp.id = talent_profile_id AND tp.user_id = auth.uid()
  ));

REVOKE ALL ON public.talent_live_status FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.talent_live_status TO authenticated;
GRANT ALL ON public.talent_live_status TO service_role;

CREATE OR REPLACE FUNCTION public.talent_live_status_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_talent_live_status_touch ON public.talent_live_status;
CREATE TRIGGER trg_talent_live_status_touch
  BEFORE UPDATE ON public.talent_live_status
  FOR EACH ROW EXECUTE FUNCTION public.talent_live_status_touch();
