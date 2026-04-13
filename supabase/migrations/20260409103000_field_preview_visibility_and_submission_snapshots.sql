-- Close remaining gaps:
-- 1) Preview-specific field visibility toggle (`preview_visible`) for quick preview surfaces.
-- 2) Stored submission snapshot history for staff/talent clarity.

BEGIN;
-- ---------------------------------------------------------------------------
-- Field definitions: preview visibility
-- ---------------------------------------------------------------------------
ALTER TABLE public.field_definitions
ADD COLUMN IF NOT EXISTS preview_visible BOOLEAN NOT NULL DEFAULT TRUE;
-- If a field is not public-visible or is internal-only, preview visibility is effectively false.
-- Keep data consistent when toggles change.
CREATE OR REPLACE FUNCTION public.enforce_preview_visibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.internal_only = TRUE OR NEW.public_visible = FALSE THEN
    NEW.preview_visible := FALSE;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_enforce_preview_visibility ON public.field_definitions;
CREATE TRIGGER tr_enforce_preview_visibility
BEFORE INSERT OR UPDATE ON public.field_definitions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_preview_visibility();
-- ---------------------------------------------------------------------------
-- Talent submission snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.talent_submission_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  submitted_by_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  workflow_status_at_submit public.profile_workflow_status,
  completion_score_at_submit NUMERIC(5,2),
  snapshot JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_talent_submission_snapshots_profile
  ON public.talent_submission_snapshots (talent_profile_id, created_at DESC);
ALTER TABLE public.talent_submission_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_submission_snapshots_staff ON public.talent_submission_snapshots;
CREATE POLICY talent_submission_snapshots_staff ON public.talent_submission_snapshots
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS talent_submission_snapshots_talent_select_own ON public.talent_submission_snapshots;
CREATE POLICY talent_submission_snapshots_talent_select_own ON public.talent_submission_snapshots
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
COMMIT;
