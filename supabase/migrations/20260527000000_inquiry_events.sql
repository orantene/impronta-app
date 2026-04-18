-- Track B: canonical inquiry event stream.
--
-- Introduces:
--   inquiry_event_visibility ENUM  ('participants' | 'staff_only')
--   inquiry_event_actor_role ENUM  ('system' | 'admin' | 'coordinator' | 'client' | 'talent')
--   inquiry_events table           — immutable append-only event log
--   engine_emit_event()            — single write-path helper for engine RPCs
--   engine_emit_system_event()     — system/cron write-path (no actor_user_id)
--
-- Invariants enforced here:
--   1. REVOKE INSERT/UPDATE/DELETE from authenticated — app layer cannot write directly.
--   2. Two RLS policies: staff see all rows; participants see 'participants' rows on their inquiries.
--   3. event_type is TEXT (not a PG ENUM) to allow forward-compatible additions without ALTER TYPE locks.
--   4. engine_emit_event is NOT granted to authenticated — only callable from SECURITY DEFINER engine RPCs.

BEGIN;

-- ── Enum: visibility tier ─────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.inquiry_event_visibility AS ENUM (
    'participants',  -- all active inquiry participants (client, talent, staff)
    'staff_only'     -- admin and coordinator only
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Enum: actor role ──────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.inquiry_event_actor_role AS ENUM (
    'system',       -- cron jobs, TTL expiry, automated transitions
    'admin',        -- super_admin app_role
    'coordinator',  -- agency_staff app_role
    'client',       -- client participant
    'talent'        -- talent participant
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Table ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inquiry_events (
  id              UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id      UUID                          NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  -- TEXT not ENUM: new event types can be added without ALTER TYPE table lock.
  event_type      TEXT                          NOT NULL CHECK (char_length(event_type) > 0),
  actor_user_id   UUID                          REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      public.inquiry_event_actor_role NOT NULL DEFAULT 'system',
  visibility      public.inquiry_event_visibility NOT NULL DEFAULT 'participants',
  payload         JSONB                         NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ                   NOT NULL DEFAULT now()
);

-- Primary timeline read: one inquiry ordered newest-first.
CREATE INDEX IF NOT EXISTS ix_inquiry_events_timeline
  ON public.inquiry_events (inquiry_id, created_at DESC);

-- Filter by event type within an inquiry (e.g. all offer events).
CREATE INDEX IF NOT EXISTS ix_inquiry_events_type_within_inquiry
  ON public.inquiry_events (inquiry_id, event_type, created_at DESC);

-- Analytics: high-value event types across all inquiries.
-- Partial index; extend the list as needed without touching other rows.
CREATE INDEX IF NOT EXISTS ix_inquiry_events_global_type
  ON public.inquiry_events (event_type, created_at DESC)
  WHERE event_type IN (
    'inquiry.created',
    'booking.created',
    'inquiry.cancelled',
    'offer.accepted',
    'offer.rejected'
  );

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE public.inquiry_events ENABLE ROW LEVEL SECURITY;

-- Staff: full read access to all events on all inquiries (including staff_only).
DROP POLICY IF EXISTS inquiry_events_staff_read ON public.inquiry_events;

CREATE POLICY inquiry_events_staff_read ON public.inquiry_events
  FOR SELECT
  USING (public.is_agency_staff());

-- Participants: read events on their inquiries where visibility = 'participants'.
DROP POLICY IF EXISTS inquiry_events_participant_read ON public.inquiry_events;

CREATE POLICY inquiry_events_participant_read ON public.inquiry_events
  FOR SELECT
  USING (
    visibility = 'participants'
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = inquiry_events.inquiry_id
        AND ip.user_id    = auth.uid()
        AND ip.status     = 'active'
    )
  );

-- Block all direct writes from authenticated. Engine RPCs (SECURITY DEFINER) are the sole writers.
REVOKE INSERT, UPDATE, DELETE
  ON public.inquiry_events FROM authenticated;

-- ── engine_emit_event — single write-path for all engine RPCs ─────────────────
--
-- Called from within engine RPCs (SECURITY DEFINER). NOT granted to authenticated.
-- All event writes for state transitions must go through this function so that:
--   a) There is one code path for event emission (easy to audit/trace).
--   b) The REVOKE on the table is the enforcement layer — this function succeeds
--      only because it runs as the definer role, not as the calling user.

CREATE OR REPLACE FUNCTION public.engine_emit_event(
  p_inquiry_id    UUID,
  p_event_type    TEXT,
  p_actor_user_id UUID,
  p_actor_role    public.inquiry_event_actor_role,
  p_visibility    public.inquiry_event_visibility,
  p_payload       JSONB DEFAULT '{}'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF char_length(p_event_type) = 0 THEN
    RAISE EXCEPTION 'engine_emit_event: event_type cannot be empty';
  END IF;

  INSERT INTO public.inquiry_events (
    inquiry_id, event_type, actor_user_id, actor_role, visibility, payload
  ) VALUES (
    p_inquiry_id, p_event_type, p_actor_user_id, p_actor_role, p_visibility, p_payload
  );
END;
$$;

-- NOT granted to authenticated. Only reachable from other SECURITY DEFINER functions.
REVOKE ALL ON FUNCTION public.engine_emit_event(UUID, TEXT, UUID, public.inquiry_event_actor_role, public.inquiry_event_visibility, JSONB) FROM PUBLIC;

-- ── engine_emit_system_event — for cron / TTL jobs (service_role) ────────────

CREATE OR REPLACE FUNCTION public.engine_emit_system_event(
  p_inquiry_id UUID,
  p_event_type TEXT,
  p_payload    JSONB DEFAULT '{}'
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.inquiry_events (
    inquiry_id, event_type, actor_user_id, actor_role, visibility, payload
  ) VALUES (
    p_inquiry_id, p_event_type, NULL, 'system', 'participants', p_payload
  );
END;
$$;

-- NOT granted to authenticated. Called by service_role jobs only.
REVOKE ALL ON FUNCTION public.engine_emit_system_event(UUID, TEXT, JSONB) FROM PUBLIC;

COMMIT;
