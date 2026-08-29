-- Support Center — customer feature requests ("what do you need?").
--
-- A first-class request type rather than a ticket flavour: the owner wants a
-- standing list with its own lifecycle (new → planned → in progress → shipped
-- / declined), a vote count, and the requester's phone for follow-up calls.
-- Requests come from the support panel (a second CTA beside "Start a ticket")
-- and from anywhere the shell links to it.
--
-- Writes are service-role only behind app-layer guards; requesters may read
-- their OWN rows, workspace staff read their tenant's workspace-surface rows,
-- platform admins read everything (same predicate shape as support_tickets).
--
-- NOT APPLIED — integrator must `npm run db:push` before merge.
--
-- Rollback: DROP TABLE public.support_feature_request_votes,
--           public.support_feature_requests;

BEGIN;

CREATE TABLE IF NOT EXISTS public.support_feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('workspace','talent','client')),
  requester_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  area TEXT,
  -- The owner's follow-up channel: a request without a way to call back is a
  -- dead end, so the panel asks for a phone the same way tickets do.
  contact_phone TEXT,
  contact_email TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN (
    'new','under_review','planned','in_progress','shipped','declined'
  )),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  vote_count INTEGER NOT NULL DEFAULT 1,
  owner_note TEXT,
  shipped_ref TEXT,
  ticket_id UUID NULL REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_feature_requests_status_idx
  ON public.support_feature_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_feature_requests_requester_idx
  ON public.support_feature_requests (requester_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_feature_requests_tenant_idx
  ON public.support_feature_requests (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_feature_requests_open_votes_idx
  ON public.support_feature_requests (vote_count DESC)
  WHERE status IN ('new','under_review','planned','in_progress');

COMMENT ON TABLE public.support_feature_requests IS
  'Customer-submitted feature requests. Lifecycle new/under_review/planned/in_progress/shipped/declined; vote_count aggregates support_feature_request_votes.';
COMMENT ON COLUMN public.support_feature_requests.contact_phone IS
  'Follow-up number captured at submit. The HQ list shows tel: and wa.me links.';
COMMENT ON COLUMN public.support_feature_requests.shipped_ref IS
  'Free-text link or note recorded when the request ships (PR, release, doc).';

-- One vote per user per request; the creator is seeded as the first vote.
CREATE TABLE IF NOT EXISTS public.support_feature_request_votes (
  request_id UUID NOT NULL REFERENCES public.support_feature_requests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);

COMMENT ON TABLE public.support_feature_request_votes IS
  'One row per user per request. A trigger keeps support_feature_requests.vote_count in sync.';

CREATE OR REPLACE FUNCTION public.support_feature_requests_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_feature_requests_touch ON public.support_feature_requests;
CREATE TRIGGER trg_support_feature_requests_touch
  BEFORE UPDATE ON public.support_feature_requests
  FOR EACH ROW EXECUTE FUNCTION public.support_feature_requests_touch_updated_at();

CREATE OR REPLACE FUNCTION public.support_feature_request_votes_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  target UUID;
BEGIN
  target := COALESCE(NEW.request_id, OLD.request_id);
  UPDATE public.support_feature_requests r
     SET vote_count = (
       SELECT count(*) FROM public.support_feature_request_votes v WHERE v.request_id = target
     )
   WHERE r.id = target;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_feature_request_votes_sync ON public.support_feature_request_votes;
CREATE TRIGGER trg_support_feature_request_votes_sync
  AFTER INSERT OR DELETE ON public.support_feature_request_votes
  FOR EACH ROW EXECUTE FUNCTION public.support_feature_request_votes_sync();

ALTER TABLE public.support_feature_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_feature_request_votes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_feature_requests_select_requester ON public.support_feature_requests;
CREATE POLICY support_feature_requests_select_requester ON public.support_feature_requests
  FOR SELECT TO authenticated
  USING (requester_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_feature_requests_select_staff ON public.support_feature_requests;
CREATE POLICY support_feature_requests_select_staff ON public.support_feature_requests
  FOR SELECT TO authenticated
  USING (
    surface = 'workspace'
    AND tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS support_feature_requests_select_platform ON public.support_feature_requests;
CREATE POLICY support_feature_requests_select_platform ON public.support_feature_requests
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS support_feature_request_votes_select_self ON public.support_feature_request_votes;
CREATE POLICY support_feature_request_votes_select_self ON public.support_feature_request_votes
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) OR public.is_platform_admin());

REVOKE INSERT, UPDATE, DELETE ON public.support_feature_requests FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_feature_request_votes FROM authenticated, anon;
GRANT SELECT ON public.support_feature_requests TO authenticated;
GRANT SELECT ON public.support_feature_request_votes TO authenticated;

COMMIT;
