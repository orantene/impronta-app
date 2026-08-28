-- Support Center M7 — approved fixes (proposed actions).
--
-- Requester-visible proposals HQ can compose. Writes are service-role only.
-- Visibility matches support_tickets (requester, workspace staff, platform admin).
--
-- Also extends support_ticket_events.event_type for expiry records.
--
-- Rollback: DROP TABLE public.support_proposed_actions;
-- restore the prior event_type CHECK.

BEGIN;

ALTER TABLE public.support_ticket_events
  DROP CONSTRAINT IF EXISTS support_ticket_events_event_type_check;

ALTER TABLE public.support_ticket_events
  ADD CONSTRAINT support_ticket_events_event_type_check
  CHECK (event_type IN (
    'created','message_sent','status_changed','escalated','assigned','priority_changed',
    'category_changed','contact_updated','rated','reopened','auto_close_warning',
    'auto_closed','diagnostic_attached','insight_generated','proposed_action_expired'
  ));

CREATE TABLE IF NOT EXISTS public.support_proposed_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  proposed_by UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('settings_patch','builder_draft_revision','instruction')),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  payload JSONB NOT NULL,
  preview JSONB,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN (
    'proposed','approved','declined','applied','failed','expired'
  )),
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  applied_result JSONB,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_proposed_actions_ticket_idx
  ON public.support_proposed_actions (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_proposed_actions_open_idx
  ON public.support_proposed_actions (status, expires_at)
  WHERE status = 'proposed';

COMMENT ON TABLE public.support_proposed_actions IS
  'HQ-composed fixes the requester must approve before apply. Writes are service-role only.';

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_proposed_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  SELECT tenant_id INTO parent_tenant FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tenant;
  ELSIF parent_tenant IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM parent_tenant THEN
    RAISE EXCEPTION 'support_proposed_actions.tenant_id does not match parent ticket';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_proposed_actions_tenant_autofill ON public.support_proposed_actions;
CREATE TRIGGER support_proposed_actions_tenant_autofill
  BEFORE INSERT ON public.support_proposed_actions
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_proposed_actions();

ALTER TABLE public.support_proposed_actions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_proposed_actions_select ON public.support_proposed_actions;
CREATE POLICY support_proposed_actions_select ON public.support_proposed_actions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_proposed_actions.ticket_id
        AND (
          t.requester_user_id = (SELECT auth.uid())
          OR (t.surface = 'workspace' AND t.tenant_id IS NOT NULL AND public.is_staff_of_tenant(t.tenant_id))
          OR public.is_platform_admin()
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.support_proposed_actions FROM authenticated, anon;
GRANT SELECT ON public.support_proposed_actions TO authenticated;

COMMIT;
