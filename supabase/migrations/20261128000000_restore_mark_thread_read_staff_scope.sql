-- 20261128000000_restore_mark_thread_read_staff_scope.sql
--
-- Re-assert the membership-scoped access guard on inquiry_mark_thread_read so a
-- database rebuilt from these migrations matches production.
--
-- THE BUG THIS CLOSES (latent, rebuild-only — production is already correct):
-- the guard was fixed to use public.is_staff_of_tenant() in August, but that fix
-- was applied via the Management API under a JULY version (20260725081045). Main's
-- last definition of the function — 20260921000000_rls_mark_read_client_user.sql —
-- sorts after it and still uses public.is_agency_staff(), so replaying the repo's
-- migrations in order ends on the OLD, buggy definition. Production never showed it
-- because the API-applied fix ran last in wall-clock time.
--
-- Why the guard matters: is_agency_staff() reads profiles.app_role, but workspace
-- access is granted through agency_memberships. Staff who hold membership without
-- app_role='agency_staff' hit P0001 'forbidden' opening admin message threads even
-- though the app-layer capability check (agency.workspace.view) admits them. Same
-- class of bug PR #995 swept out of the server actions.
--
-- This file preserves the client_user_id arm added in 20260921000000 and is a plain
-- CREATE OR REPLACE, so it is a no-op against the current production definition.

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
  v_tenant_id         UUID;
  v_latest_message_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  -- Validate inquiry exists and capture tenant_id for the staff scope check.
  SELECT tenant_id INTO v_tenant_id
  FROM public.inquiries
  WHERE id = p_inquiry_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Access guard: tenant staff (via agency_memberships), active/invited
  -- participant, OR the inquiry's primary client (even without a participant row).
  IF NOT (
    public.is_staff_of_tenant(v_tenant_id)
    OR EXISTS (
      SELECT 1 FROM public.inquiry_participants ip
      WHERE ip.inquiry_id = p_inquiry_id
        AND ip.user_id    = v_user_id
        AND ip.status     IN ('active', 'invited')
    )
    OR EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id             = p_inquiry_id
        AND i.client_user_id = v_user_id
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Thread visibility guard: talent cannot mark private thread as read.
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
  SELECT id
  INTO v_latest_message_id
  FROM public.inquiry_messages
  WHERE inquiry_id   = p_inquiry_id
    AND thread_type  = p_thread_type
    AND deleted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  -- Upsert watermark (GREATEST guards against clock skew).
  INSERT INTO public.inquiry_message_reads (
    inquiry_id, thread_type, user_id, last_read_at, last_read_message_id
  ) VALUES (
    p_inquiry_id, p_thread_type, v_user_id, now(), v_latest_message_id
  )
  ON CONFLICT (inquiry_id, thread_type, user_id)
  DO UPDATE SET
    last_read_at         = GREATEST(public.inquiry_message_reads.last_read_at, EXCLUDED.last_read_at),
    last_read_message_id = EXCLUDED.last_read_message_id;
END;
$$;

REVOKE ALL ON FUNCTION public.inquiry_mark_thread_read(UUID, public.inquiry_thread_type) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.inquiry_mark_thread_read(UUID, public.inquiry_thread_type) TO authenticated;

COMMIT;
