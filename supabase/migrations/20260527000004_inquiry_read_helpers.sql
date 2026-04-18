-- Track A + B: read-side helper functions.
--
-- All functions are SECURITY INVOKER so RLS on the underlying tables applies
-- automatically. auth.uid() resolves to the calling user's identity.
--
-- Functions defined here:
--
--   get_inquiry_thread_unread_count(UUID, inquiry_thread_type) → INT
--     Unread message count for a specific thread. Used in thread header badges.
--
--   get_user_unread_inquiry_ids() → TABLE(inquiry_id UUID, last_unread_at TIMESTAMPTZ)
--     All inquiries where the calling user has unread messages, ordered by most
--     recent unread. Used for dashboard badges and inbox sorting.
--
--   get_inquiry_timeline(UUID) → TABLE(...)
--     Timeline events for an inquiry. RLS on inquiry_events filters visibility
--     automatically: staff see all events, participants see 'participants' events.
--     Returns newest-first.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. get_inquiry_thread_unread_count
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns the number of messages in a thread that were sent after the caller's
-- last_read_at watermark, excluding their own messages.
--
-- Returns 0 if the thread has no messages, the user has never opened the thread
-- (treated as last_read_at = '-infinity'), or the user sent all messages.

CREATE OR REPLACE FUNCTION public.get_inquiry_thread_unread_count(
  p_inquiry_id  UUID,
  p_thread_type public.inquiry_thread_type
) RETURNS INT
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COUNT(*)::INT
  FROM public.inquiry_messages m
  WHERE m.inquiry_id  = p_inquiry_id
    AND m.thread_type = p_thread_type
    AND m.deleted_at IS NULL
    -- Exclude messages the calling user sent themselves
    AND (m.sender_user_id IS NULL OR m.sender_user_id != auth.uid())
    -- Only messages after the watermark (default: everything if no row exists)
    AND m.created_at > COALESCE(
      (
        SELECT r.last_read_at
        FROM   public.inquiry_message_reads r
        WHERE  r.inquiry_id  = p_inquiry_id
          AND  r.thread_type = p_thread_type
          AND  r.user_id     = auth.uid()
      ),
      '-infinity'::TIMESTAMPTZ
    )
$$;

REVOKE ALL ON FUNCTION public.get_inquiry_thread_unread_count(UUID, public.inquiry_thread_type) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inquiry_thread_unread_count(UUID, public.inquiry_thread_type) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. get_user_unread_inquiry_ids
-- ─────────────────────────────────────────────────────────────────────────────
-- Scans all inquiries the calling user actively participates in and returns
-- those with at least one unread message (in any thread they can access).
--
-- Talent users only see group thread activity (inquiry_messages RLS excludes
-- private thread rows for talent), so their unread is group-only. Correct.
--
-- Ordered by most recent unread message DESC (inbox sort order).
-- Capped at 200 inquiries — no client will have more active inquiries than that.

CREATE OR REPLACE FUNCTION public.get_user_unread_inquiry_ids()
RETURNS TABLE (
  inquiry_id   UUID,
  last_unread_at TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ip.inquiry_id,
    MAX(m.created_at) AS last_unread_at
  FROM public.inquiry_participants ip
  JOIN public.inquiry_messages m
       ON  m.inquiry_id   = ip.inquiry_id
       AND m.deleted_at   IS NULL
       AND (m.sender_user_id IS NULL OR m.sender_user_id != auth.uid())
  LEFT JOIN public.inquiry_message_reads r
       ON  r.inquiry_id  = ip.inquiry_id
       AND r.user_id     = auth.uid()
       AND r.thread_type = m.thread_type
  WHERE ip.user_id = auth.uid()
    AND ip.status  = 'active'
    -- Message is unread: after watermark (or no watermark → all unread)
    AND m.created_at > COALESCE(r.last_read_at, '-infinity'::TIMESTAMPTZ)
  GROUP BY ip.inquiry_id
  ORDER BY last_unread_at DESC
  LIMIT 200
$$;

REVOKE ALL ON FUNCTION public.get_user_unread_inquiry_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_user_unread_inquiry_ids() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. get_inquiry_timeline
-- ─────────────────────────────────────────────────────────────────────────────
-- Returns timeline events for an inquiry, filtered by the caller's visibility tier.
-- RLS on inquiry_events handles the access control automatically:
--   - Staff see all events (participants + staff_only)
--   - Active participants see only 'participants' events on their inquiry
--   - Non-participants get zero rows (RLS denies access entirely)
--
-- Returned newest-first for rendering (UI reverses for ascending display).
-- Capped at 500 events — sufficient for any inquiry lifecycle.

CREATE OR REPLACE FUNCTION public.get_inquiry_timeline(
  p_inquiry_id UUID
)
RETURNS TABLE (
  id            UUID,
  inquiry_id    UUID,
  event_type    TEXT,
  actor_user_id UUID,
  actor_role    public.inquiry_event_actor_role,
  visibility    public.inquiry_event_visibility,
  payload       JSONB,
  created_at    TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    ie.id,
    ie.inquiry_id,
    ie.event_type,
    ie.actor_user_id,
    ie.actor_role,
    ie.visibility,
    ie.payload,
    ie.created_at
  FROM public.inquiry_events ie
  WHERE ie.inquiry_id = p_inquiry_id
  ORDER BY ie.created_at DESC
  LIMIT 500
$$;

REVOKE ALL ON FUNCTION public.get_inquiry_timeline(UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_inquiry_timeline(UUID) TO authenticated;

COMMIT;
