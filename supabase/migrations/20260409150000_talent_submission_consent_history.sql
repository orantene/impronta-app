BEGIN;
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.settings (key, value, updated_at)
VALUES ('talent_terms_version', '"2026-04-09"'::jsonb, now())
ON CONFLICT (key) DO NOTHING;
CREATE TABLE IF NOT EXISTS public.talent_submission_consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  consent_type TEXT NOT NULL,
  terms_version TEXT NOT NULL,
  submission_context TEXT,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_talent_submission_consents_profile
  ON public.talent_submission_consents (talent_profile_id, accepted_at DESC);
ALTER TABLE public.talent_submission_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_submission_consents_staff ON public.talent_submission_consents;
CREATE POLICY talent_submission_consents_staff ON public.talent_submission_consents
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS talent_submission_consents_talent_select_own ON public.talent_submission_consents;
CREATE POLICY talent_submission_consents_talent_select_own ON public.talent_submission_consents
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
    )
  );
DROP POLICY IF EXISTS talent_submission_consents_talent_insert_own ON public.talent_submission_consents;
CREATE POLICY talent_submission_consents_talent_insert_own ON public.talent_submission_consents
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
    )
  );
CREATE TABLE IF NOT EXISTS public.talent_submission_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  workflow_state_before public.profile_workflow_status,
  workflow_state_after public.profile_workflow_status,
  submission_kind TEXT NOT NULL DEFAULT 'initial_submission',
  submission_snapshot_id UUID REFERENCES public.talent_submission_snapshots (id) ON DELETE SET NULL,
  terms_consent_id UUID REFERENCES public.talent_submission_consents (id) ON DELETE SET NULL,
  accepted_terms_version TEXT,
  source_revision_id UUID REFERENCES public.profile_revisions (id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT talent_submission_history_kind_check
    CHECK (submission_kind IN ('initial_submission', 'resubmission'))
);
CREATE INDEX IF NOT EXISTS idx_talent_submission_history_profile
  ON public.talent_submission_history (talent_profile_id, submitted_at DESC);
ALTER TABLE public.talent_submission_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_submission_history_staff ON public.talent_submission_history;
CREATE POLICY talent_submission_history_staff ON public.talent_submission_history
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS talent_submission_history_talent_select_own ON public.talent_submission_history;
CREATE POLICY talent_submission_history_talent_select_own ON public.talent_submission_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles t
      WHERE t.id = talent_profile_id
        AND t.user_id = auth.uid()
    )
  );
CREATE OR REPLACE FUNCTION public.submit_own_talent_profile_for_review(
  p_terms_version TEXT,
  p_submission_context TEXT,
  p_completion_score NUMERIC,
  p_snapshot JSONB DEFAULT '{}'::jsonb,
  p_source_revision_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  profile_row public.talent_profiles%ROWTYPE;
  consent_id UUID;
  snapshot_id UUID;
  history_id UUID;
  submission_kind TEXT := 'initial_submission';
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_terms_version IS NULL OR length(trim(p_terms_version)) = 0 THEN
    RAISE EXCEPTION 'Terms version is required';
  END IF;

  SELECT *
  INTO profile_row
  FROM public.talent_profiles
  WHERE user_id = uid;

  IF profile_row.id IS NULL THEN
    RAISE EXCEPTION 'Talent profile not found';
  END IF;

  IF profile_row.workflow_status NOT IN ('draft', 'hidden') THEN
    RAISE EXCEPTION 'Profile is not in a submittable state';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.talent_submission_history h
    WHERE h.talent_profile_id = profile_row.id
  ) THEN
    submission_kind := 'resubmission';
  END IF;

  INSERT INTO public.talent_submission_consents (
    talent_profile_id,
    user_id,
    consent_type,
    terms_version,
    submission_context,
    accepted_at
  )
  VALUES (
    profile_row.id,
    uid,
    'talent_submission_terms',
    trim(p_terms_version),
    NULLIF(trim(COALESCE(p_submission_context, '')), ''),
    now()
  )
  RETURNING id INTO consent_id;

  INSERT INTO public.talent_submission_snapshots (
    talent_profile_id,
    submitted_by_user_id,
    workflow_status_at_submit,
    completion_score_at_submit,
    snapshot,
    created_at
  )
  VALUES (
    profile_row.id,
    uid,
    profile_row.workflow_status,
    p_completion_score,
    COALESCE(p_snapshot, '{}'::jsonb),
    now()
  )
  RETURNING id INTO snapshot_id;

  INSERT INTO public.talent_submission_history (
    talent_profile_id,
    submitted_by_user_id,
    submitted_at,
    workflow_state_before,
    workflow_state_after,
    submission_kind,
    submission_snapshot_id,
    terms_consent_id,
    accepted_terms_version,
    source_revision_id
  )
  VALUES (
    profile_row.id,
    uid,
    now(),
    profile_row.workflow_status,
    'submitted'::public.profile_workflow_status,
    submission_kind,
    snapshot_id,
    consent_id,
    trim(p_terms_version),
    p_source_revision_id
  )
  RETURNING id INTO history_id;

  UPDATE public.talent_profiles
  SET
    workflow_status = 'submitted'::public.profile_workflow_status,
    visibility = 'hidden'::public.visibility,
    profile_completeness_score = p_completion_score,
    updated_at = now()
  WHERE id = profile_row.id;

  INSERT INTO public.talent_workflow_events (
    talent_profile_id,
    actor_user_id,
    event_type,
    payload
  )
  VALUES (
    profile_row.id,
    uid,
    'submission_recorded',
    jsonb_build_object(
      'from', profile_row.workflow_status,
      'to', 'submitted',
      'submission_kind', submission_kind,
      'terms_version', trim(p_terms_version),
      'submission_history_id', history_id,
      'terms_consent_id', consent_id
    )
  );

  RETURN jsonb_build_object(
    'submission_history_id', history_id,
    'terms_consent_id', consent_id,
    'submission_snapshot_id', snapshot_id,
    'submission_kind', submission_kind,
    'workflow_state_before', profile_row.workflow_status,
    'workflow_state_after', 'submitted'
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_own_talent_profile_for_review(
  TEXT,
  TEXT,
  NUMERIC,
  JSONB,
  UUID
) TO authenticated;
COMMIT;
