-- Support Center M4 — ticket diagnostics + investigation fields.
--
-- One diagnostics row per ticket (unique ticket_id), platform-admin SELECT
-- only. Writes are service-role. Also adds root_cause / long_term_fix on
-- support_tickets for pasted investigation findings.
--
-- Rollback: DROP TABLE public.support_ticket_diagnostics;
-- ALTER TABLE public.support_tickets DROP COLUMN root_cause, DROP COLUMN long_term_fix;

BEGIN;

ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS root_cause TEXT,
  ADD COLUMN IF NOT EXISTS long_term_fix TEXT;

COMMENT ON COLUMN public.support_tickets.root_cause IS
  'Investigation findings pasted back from the Markdown bundle.';
COMMENT ON COLUMN public.support_tickets.long_term_fix IS
  'Long-term fix notes pasted back from the Markdown bundle.';

CREATE TABLE IF NOT EXISTS public.support_ticket_diagnostics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL UNIQUE REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  app_version TEXT,
  route TEXT,
  url TEXT,
  viewport JSONB,
  user_agent TEXT,
  locale TEXT,
  timezone TEXT,
  console_events JSONB NOT NULL DEFAULT '[]',
  network_failures JSONB NOT NULL DEFAULT '[]',
  route_history JSONB NOT NULL DEFAULT '[]',
  tenant_plan TEXT,
  feature_flags JSONB,
  audit_events JSONB,
  sentry_last_event_id TEXT,
  sentry_link TEXT,
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.support_ticket_diagnostics IS
  'Client diagnostics snapshot attached at ticket creation. Platform-admin read only.';

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_diagnostics()
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
    RAISE EXCEPTION 'support_ticket_diagnostics.tenant_id does not match parent ticket';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_diagnostics_tenant_autofill ON public.support_ticket_diagnostics;
CREATE TRIGGER support_diagnostics_tenant_autofill
  BEFORE INSERT ON public.support_ticket_diagnostics
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_diagnostics();

ALTER TABLE public.support_ticket_diagnostics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_diagnostics_select_platform ON public.support_ticket_diagnostics;
CREATE POLICY support_diagnostics_select_platform ON public.support_ticket_diagnostics
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_diagnostics FROM authenticated, anon;
GRANT SELECT ON public.support_ticket_diagnostics TO authenticated;

COMMIT;
