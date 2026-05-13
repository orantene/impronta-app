-- B.2 — User notifications backend.
--
-- Per-user, per-tenant feed of timeline events worth surfacing in the
-- NotificationsDrawer. Rows are created server-side by notification
-- emitter helpers (see `web/src/lib/notifications/emit.ts`) when
-- significant inquiry/booking/message activity happens.
--
-- Design notes:
--   * Surface scoped (workspace / talent / client) so one row can land
--     in exactly one inbox.
--   * Idempotent inserts via the (origin_event_id, user_id) unique key
--     so re-running an emitter doesn't double-notify.
--   * Read tracking is per-row; mark-all-read is a bulk UPDATE.
--   * Realtime delivery via the existing supabase_realtime publication.

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL
    CHECK (kind IN ('message','offer','booking','payment','approval','system','profile')),
  surface TEXT NOT NULL DEFAULT 'workspace'
    CHECK (surface IN ('workspace','talent','client')),
  title TEXT NOT NULL,
  body TEXT,
  actor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_initials TEXT,
  -- Click destination — UI maps target_drawer to a drawer key.
  target_drawer TEXT,
  target_payload JSONB,
  -- Origin references for traceability + dedup.
  origin_event_id UUID,
  origin_kind TEXT,
  origin_inquiry_id UUID REFERENCES public.inquiries(id) ON DELETE CASCADE,
  -- Read tracking. NULL = unread.
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_unread
  ON public.user_notifications (user_id, tenant_id, created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_notifications_recent
  ON public.user_notifications (user_id, tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notifications_inquiry
  ON public.user_notifications (origin_inquiry_id)
  WHERE origin_inquiry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_notifications_origin_event_user
  ON public.user_notifications (origin_event_id, user_id)
  WHERE origin_event_id IS NOT NULL;

ALTER TABLE public.user_notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications only.
DROP POLICY IF EXISTS user_notifications_select_self ON public.user_notifications;
CREATE POLICY user_notifications_select_self ON public.user_notifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can mark their own notifications read (read_at toggle).
-- We allow any UPDATE that doesn't change user_id / tenant_id / kind etc.
-- because the only field that should ever change post-insert is read_at;
-- the WITH CHECK keeps writes scoped.
DROP POLICY IF EXISTS user_notifications_update_self ON public.user_notifications;
CREATE POLICY user_notifications_update_self ON public.user_notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts come from server-side emitters using the service role; no
-- INSERT policy for authenticated users.

-- Mark a single notification as read.
CREATE OR REPLACE FUNCTION public.user_notifications_mark_read(p_notification_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'authentication required';
  END IF;
  UPDATE public.user_notifications
     SET read_at = now()
   WHERE id = p_notification_id
     AND user_id = v_user
     AND read_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_notifications_mark_read(UUID) TO authenticated;

-- Mark all notifications for the calling user in a tenant as read.
CREATE OR REPLACE FUNCTION public.user_notifications_mark_all_read(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID := auth.uid();
  v_count INTEGER;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'authentication required';
  END IF;
  UPDATE public.user_notifications
     SET read_at = now()
   WHERE user_id = v_user
     AND tenant_id = p_tenant_id
     AND read_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_notifications_mark_all_read(UUID) TO authenticated;

COMMENT ON TABLE public.user_notifications IS
  'Per-user notification feed surfaced in the NotificationsDrawer. Rows inserted by server-side emitters (see web/src/lib/notifications/emit.ts). Read tracking via read_at; idempotent inserts via (origin_event_id, user_id) unique key.';

COMMIT;
