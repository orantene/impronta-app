-- Support Center M1 — ticketing foundation.
--
-- Four tables (tickets, messages, reads, events) plus a platform switch
-- (`platform_settings.workspace_support_enabled`, default FALSE so this
-- ships dark). Writes are service-role only; authenticated clients may
-- SELECT through the policies below. RLS predicates use the initplan form
-- `(SELECT auth.uid())`.
--
-- Rollback: drop the four tables, drop the helper functions/triggers, and
-- `ALTER TABLE public.platform_settings DROP COLUMN workspace_support_enabled`.

BEGIN;

-- ── platform switch ──────────────────────────────────────────────────────────

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS workspace_support_enabled BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.platform_settings.workspace_support_enabled IS
  'HQ opt-in for the in-app support launcher. Default FALSE; flipping this on is an integrator step after verification.';

-- ── support_tickets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  surface TEXT NOT NULL CHECK (surface IN ('workspace','talent','client','guest')),
  requester_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  guest_session_id UUID NULL REFERENCES public.guest_sessions(id) ON DELETE SET NULL,
  talent_profile_id UUID NULL REFERENCES public.talent_profiles(id) ON DELETE SET NULL,
  client_profile_id UUID NULL REFERENCES public.client_profiles(id) ON DELETE SET NULL,
  CONSTRAINT support_tickets_requester_present
    CHECK (requester_user_id IS NOT NULL OR guest_session_id IS NOT NULL),
  subject TEXT NOT NULL DEFAULT '',
  category TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  origin_surface_slug TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','closed')),
  waiting_on TEXT CHECK (waiting_on IN ('support','requester')),
  CONSTRAINT support_tickets_waiting_on_matches_status
    CHECK ((status = 'open') = (waiting_on IS NOT NULL)),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')),
  handled_by TEXT NOT NULL DEFAULT 'human' CHECK (handled_by IN ('ai','human')),
  escalated_at TIMESTAMPTZ,
  escalation_reason TEXT CHECK (escalation_reason IN (
    'user_requested','ai_low_confidence','ai_sentiment','ai_suggested','ai_unavailable','staff_initiated'
  )),
  assignee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  contact_email TEXT,
  contact_phone TEXT,
  callback_requested BOOLEAN NOT NULL DEFAULT FALSE,
  callback_pref TEXT CHECK (callback_pref IN ('anytime','morning','afternoon','evening')),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_preview TEXT,
  message_count INTEGER NOT NULL DEFAULT 0,
  first_human_response_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  reopened_count SMALLINT NOT NULL DEFAULT 0,
  satisfaction_rating SMALLINT CHECK (satisfaction_rating BETWEEN 1 AND 5),
  satisfaction_comment TEXT,
  rated_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_tickets_tenant_last_idx
  ON public.support_tickets (tenant_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_requester_last_idx
  ON public.support_tickets (requester_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_open_queue_idx
  ON public.support_tickets (status, waiting_on, last_message_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS support_tickets_escalated_human_idx
  ON public.support_tickets (escalated_at DESC)
  WHERE handled_by = 'human' AND status = 'open';
CREATE INDEX IF NOT EXISTS support_tickets_tags_gin
  ON public.support_tickets USING GIN (tags);

COMMENT ON TABLE public.support_tickets IS
  'In-app support tickets. tenant_id is nullable for platform-scoped talent tickets. Writes are service-role only.';
COMMENT ON COLUMN public.support_tickets.ticket_number IS
  'Monotonic public reference (#123). Identity, never reused.';
COMMENT ON COLUMN public.support_tickets.waiting_on IS
  'Who owes the next reply. NOT NULL iff status = open.';
COMMENT ON COLUMN public.support_tickets.handled_by IS
  'ai until a human takes over. Phase 1 defaults to human.';
COMMENT ON COLUMN public.support_tickets.guest_session_id IS
  'Reserved for unauthenticated guests. Unused in v1.';

-- ── support_messages ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  author_kind TEXT NOT NULL CHECK (author_kind IN ('requester','agent','ai','system')),
  author_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  message_kind TEXT NOT NULL DEFAULT 'text' CHECK (message_kind IN ('text','card','system','note')),
  body TEXT NOT NULL,
  card_payload JSONB,
  ai_meta JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  body_tsv tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(body, ''))) STORED
);

CREATE INDEX IF NOT EXISTS support_messages_ticket_created_idx
  ON public.support_messages (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_messages_body_tsv_gin
  ON public.support_messages USING GIN (body_tsv);

COMMENT ON TABLE public.support_messages IS
  'Messages on a support ticket. message_kind=note is staff-only (internal). tenant_id is trigger-autofilled from the parent ticket.';
COMMENT ON COLUMN public.support_messages.message_kind IS
  'text | card | system | note. note is visible to platform admins only.';
COMMENT ON COLUMN public.support_messages.card_payload IS
  'Structured in-thread card when message_kind=card.';

-- ── support_message_reads ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_message_reads (
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id UUID NULL REFERENCES public.support_messages(id) ON DELETE SET NULL,
  PRIMARY KEY (ticket_id, user_id)
);

COMMENT ON TABLE public.support_message_reads IS
  'Per-user read watermark for a support ticket. Self-read only.';

-- ── support_ticket_events ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tenant_id UUID NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('requester','agent','ai','system')),
  actor_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'created','message_sent','status_changed','escalated','assigned','priority_changed',
    'category_changed','contact_updated','rated','reopened','auto_close_warning',
    'auto_closed','diagnostic_attached','insight_generated'
  )),
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_created_idx
  ON public.support_ticket_events (ticket_id, created_at DESC);

COMMENT ON TABLE public.support_ticket_events IS
  'Append-only ticket audit. Every notification dispatch uses one of these rows as its eventId for dedupe.';

-- ── updated_at ───────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.support_tickets_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_touch_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_touch_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.support_tickets_touch_updated_at();

-- ── tenant autofill (copy-when-null, raise on mismatch, allow NULL parent) ───

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_messages()
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
    RAISE EXCEPTION 'tenant_autofill: support_messages.tenant_id % does not match parent ticket tenant %', NEW.tenant_id, parent_tid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_support_messages ON public.support_messages;
CREATE TRIGGER trg_tenant_autofill_support_messages
  BEFORE INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_messages();

CREATE OR REPLACE FUNCTION public.tenant_autofill_support_ticket_events()
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
    RAISE EXCEPTION 'tenant_autofill: support_ticket_events.tenant_id % does not match parent ticket tenant %', NEW.tenant_id, parent_tid;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenant_autofill_support_ticket_events ON public.support_ticket_events;
CREATE TRIGGER trg_tenant_autofill_support_ticket_events
  BEFORE INSERT ON public.support_ticket_events
  FOR EACH ROW EXECUTE FUNCTION public.tenant_autofill_support_ticket_events();

-- ── denormalize parent ticket on message insert (skip internal notes) ────────

CREATE OR REPLACE FUNCTION public.support_messages_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.message_kind = 'note' THEN
    RETURN NEW;
  END IF;
  UPDATE public.support_tickets
     SET last_message_at = NEW.created_at,
         last_message_preview = left(NEW.body, 140),
         message_count = message_count + 1,
         first_human_response_at = CASE
           WHEN NEW.author_kind = 'agent' AND first_human_response_at IS NULL
           THEN NEW.created_at
           ELSE first_human_response_at
         END
   WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_messages_after_insert ON public.support_messages;
CREATE TRIGGER trg_support_messages_after_insert
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.support_messages_after_insert();

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS support_tickets_select_requester ON public.support_tickets;
CREATE POLICY support_tickets_select_requester ON public.support_tickets
  FOR SELECT TO authenticated
  USING (requester_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_tickets_select_staff ON public.support_tickets;
CREATE POLICY support_tickets_select_staff ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    surface = 'workspace'
    AND tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(tenant_id)
  );

DROP POLICY IF EXISTS support_tickets_select_platform ON public.support_tickets;
CREATE POLICY support_tickets_select_platform ON public.support_tickets
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

DROP POLICY IF EXISTS support_messages_select ON public.support_messages;
CREATE POLICY support_messages_select ON public.support_messages
  FOR SELECT TO authenticated
  USING (
    (message_kind <> 'note' OR public.is_platform_admin())
    AND EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_messages.ticket_id
        AND (
          t.requester_user_id = (SELECT auth.uid())
          OR (t.surface = 'workspace' AND t.tenant_id IS NOT NULL AND public.is_staff_of_tenant(t.tenant_id))
          OR public.is_platform_admin()
        )
    )
  );

DROP POLICY IF EXISTS support_message_reads_select_self ON public.support_message_reads;
CREATE POLICY support_message_reads_select_self ON public.support_message_reads
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS support_ticket_events_select ON public.support_ticket_events;
CREATE POLICY support_ticket_events_select ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.support_tickets t
      WHERE t.id = support_ticket_events.ticket_id
        AND (
          t.requester_user_id = (SELECT auth.uid())
          OR (t.surface = 'workspace' AND t.tenant_id IS NOT NULL AND public.is_staff_of_tenant(t.tenant_id))
          OR public.is_platform_admin()
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.support_tickets FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_messages FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_message_reads FROM authenticated, anon;
REVOKE INSERT, UPDATE, DELETE ON public.support_ticket_events FROM authenticated, anon;

GRANT SELECT ON public.support_tickets TO authenticated;
GRANT SELECT ON public.support_messages TO authenticated;
GRANT SELECT ON public.support_message_reads TO authenticated;
GRANT SELECT ON public.support_ticket_events TO authenticated;

COMMIT;
