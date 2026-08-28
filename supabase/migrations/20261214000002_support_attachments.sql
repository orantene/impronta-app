-- Support Center Round 2 W3.1 — image attachments on tickets.
--
-- REQUIRED: create private Storage bucket `support-attachments`
-- (not auto-created here). Writes are service-role only. Authenticated
-- clients may SELECT rows whose parent ticket they can already see.
-- Attachments live as long as the ticket (FK cascade). Replay reap does
-- not touch this bucket.
--
-- NOT APPLIED — integrator must `npm run db:push` before merge.

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  message_id UUID NULL REFERENCES public.support_messages(id) ON DELETE SET NULL,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  content_type TEXT NOT NULL,
  byte_size BIGINT NOT NULL,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_attachments_ticket_idx
  ON public.support_attachments (ticket_id, created_at DESC);

COMMENT ON TABLE public.support_attachments IS
  'Image attachments on support tickets. Bytes live in the private support-attachments bucket. Path minted server-side as {ticketId}/{uuid}.{ext}.';

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_attachments()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tid UUID;
BEGIN
  SELECT tenant_id INTO parent_tid FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'tenant_autofill: parent support ticket % not found', NEW.ticket_id;
  END IF;
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := parent_tid;
  ELSIF parent_tid IS NOT NULL AND NEW.tenant_id <> parent_tid THEN
    RAISE EXCEPTION 'tenant_autofill: support_attachments.tenant_id % does not match parent ticket tenant %', NEW.tenant_id, parent_tid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_support_attachments ON public.support_attachments;
CREATE TRIGGER trg_tenant_autofill_support_attachments
  BEFORE INSERT ON public.support_attachments
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_attachments();

ALTER TABLE public.support_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_attachments_select ON public.support_attachments;
CREATE POLICY support_attachments_select ON public.support_attachments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_attachments.ticket_id
        AND (
          t.requester_user_id = (SELECT auth.uid())
          OR (t.surface = 'workspace' AND t.tenant_id IS NOT NULL AND public.is_staff_of_tenant(t.tenant_id))
          OR public.is_platform_admin()
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.support_attachments FROM authenticated, anon;
GRANT SELECT ON public.support_attachments TO authenticated;

COMMIT;
