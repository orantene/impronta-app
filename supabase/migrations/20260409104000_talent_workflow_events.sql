-- Acceptance history: explicit workflow event log.
-- This records staff workflow/visibility decisions so talent history is truthful and auditable.

BEGIN;
CREATE TABLE IF NOT EXISTS public.talent_workflow_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id UUID NOT NULL REFERENCES public.talent_profiles (id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_talent_workflow_events_profile
  ON public.talent_workflow_events (talent_profile_id, created_at DESC);
ALTER TABLE public.talent_workflow_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS talent_workflow_events_staff ON public.talent_workflow_events;
CREATE POLICY talent_workflow_events_staff ON public.talent_workflow_events
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());
DROP POLICY IF EXISTS talent_workflow_events_talent_select_own ON public.talent_workflow_events;
CREATE POLICY talent_workflow_events_talent_select_own ON public.talent_workflow_events
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
