-- Support Center M5 — session replay.
--
-- REQUIRED (integrator, cannot ship as SQL): create a private Storage bucket
-- named `support-replays`.
--
-- Rollback: DROP TABLE public.support_replay_sessions;

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_replay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('buffer','live')),
  status TEXT NOT NULL DEFAULT 'recording' CHECK (status IN ('recording','ended','uploaded','expired','deleted')),
  consent JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  duration_ms INTEGER,
  event_count INTEGER NOT NULL DEFAULT 0,
  chunk_count INTEGER NOT NULL DEFAULT 0,
  total_bytes BIGINT NOT NULL DEFAULT 0,
  storage_prefix TEXT,
  chunks JSONB NOT NULL DEFAULT '[]'::jsonb,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_replay_sessions_ticket_idx
  ON public.support_replay_sessions (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_replay_sessions_expires_idx
  ON public.support_replay_sessions (expires_at)
  WHERE status IN ('recording','ended','uploaded');

COMMENT ON TABLE public.support_replay_sessions IS
  'Consent-first rrweb sessions (rolling buffer or live). Platform-admin + owner read; service-role writes.';

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_replay_sessions()
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
    RAISE EXCEPTION 'support_replay_sessions.tenant_id does not match parent ticket';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_replay_sessions_tenant_autofill ON public.support_replay_sessions;
CREATE TRIGGER support_replay_sessions_tenant_autofill
  BEFORE INSERT ON public.support_replay_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_replay_sessions();

ALTER TABLE public.support_replay_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_replay_select_self ON public.support_replay_sessions;
CREATE POLICY support_replay_select_self ON public.support_replay_sessions
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_replay_select_platform ON public.support_replay_sessions;
CREATE POLICY support_replay_select_platform ON public.support_replay_sessions
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE ON public.support_replay_sessions FROM authenticated, anon;
GRANT SELECT ON public.support_replay_sessions TO authenticated;

COMMIT;
