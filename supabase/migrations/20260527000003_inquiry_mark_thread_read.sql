-- Track A: inquiry_mark_thread_read RPC.
--
-- Upserts a watermark row in inquiry_message_reads for the calling user.
-- Called when: (a) user opens a message thread tab, (b) user sends a message.
--
-- Invariants enforced:
--   1. Caller must be an active inquiry participant OR agency staff.
--   2. Talent participants cannot mark the 'private' thread as read (they have no access).
--   3. last_read_at never decreases — GREATEST() guard in the UPSERT.
--   4. last_read_message_id is set to the most recent message in the thread at call time.
--   5. Idempotent: repeated calls on the same (inquiry, thread_type) are safe.
--
-- Note: inquiry_message_reads table was created in 20260520102000 with composite PK
-- (inquiry_id, thread_type, user_id) and uses public.inquiry_thread_type ENUM.
-- RLS policies (staff_all + participant_own) were added in 20260520108000.
-- No schema changes to the table are needed here.

BEGIN;

CREATE OR REPLACE FUNCTION public.inquiry_mark_thread_read(
  p_inquiry_id  UUID,
  p_thread_type public.inquiry_thread_type
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id           UUID;
  v_latest_message_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Validate inquiry exists.
  IF NOT EXISTS (SELECT 1 FROM public.inquiries WHERE id = p_inquiry_id) THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Access guard: user must be an active/invited participant OR agency staff.
  IF NOT (
    public.is_agency_staff()
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = p_inquiry_id
        AND ip.user_id    = v_user_id
        AND ip.status     IN ('active', 'invited')
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Thread visibility guard: talent cannot mark private thread as read.
  -- (Talent has no RLS access to private inquiry_messages rows.)
  IF p_thread_type = 'private' THEN
    IF EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = p_inquiry_id
        AND ip.user_id    = v_user_id
        AND ip.role       = 'talent'
    ) THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  -- Resolve the most recent message in this thread.
  -- NULL if the thread has no messages yet — still valid (marks "opened, nothing to read").
  SELECT id
  INTO v_latest_message_id
  FROM public.inquiry_messages
  WHERE inquiry_id   = p_inquiry_id
    AND thread_type  = p_thread_type
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Upsert watermark.
  -- GREATEST ensures last_read_at never decreases (clock skew protection).
  INSERT INTO public.inquiry_message_reads (
    inquiry_id, thread_type, user_id, last_read_at, last_read_message_id
  ) VALUES (
    p_inquiry_id, p_thread_type, v_user_id, now(), v_latest_message_id
  )
  ON CONFLICT (inquiry_id, thread_type, user_id)
  DO UPDATE SET
    last_read_at        = GREATEST(public.inquiry_message_reads.last_read_at, EXCLUDED.last_read_at),
    last_read_message_id = EXCLUDED.last_read_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inquiry_mark_thread_read(UUID, public.inquiry_thread_type) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.inquiry_mark_thread_read(UUID, public.inquiry_thread_type) TO authenticated;

COMMIT;
