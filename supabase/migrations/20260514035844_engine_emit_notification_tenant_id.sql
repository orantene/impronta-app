-- Pre-existing schema drift: `notifications.tenant_id` became NOT NULL
-- (visible in column inspection 2026-05-14) but `engine_emit_notification`
-- (created 20260513041617) still inserts without tenant_id. Every
-- engine-side ping was silently failing with 23502.
--
-- Caught by real-user QA: admin invites talent → engine logs success →
-- `[inquiry-notifications/insert] null value in column "tenant_id"...`
--
-- Fix: extend the RPC signature with a required p_tenant_id parameter.
-- Drop the old 3-arg overload first (changing signatures requires DROP
-- when arg count changes). All callers in the app are updated in the
-- companion TS commit.

BEGIN;

DROP FUNCTION IF EXISTS public.engine_emit_notification(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.engine_emit_notification(
  p_user_id   UUID,
  p_tenant_id UUID,
  p_title     TEXT,
  p_body      TEXT DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'engine_emit_notification: p_user_id is required';
  END IF;
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'engine_emit_notification: p_tenant_id is required';
  END IF;
  IF p_title IS NULL OR length(p_title) = 0 THEN
    RAISE EXCEPTION 'engine_emit_notification: p_title is required';
  END IF;

  INSERT INTO public.notifications (user_id, tenant_id, title, body)
  VALUES (p_user_id, p_tenant_id, p_title, p_body)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL    ON FUNCTION public.engine_emit_notification(UUID, UUID, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.engine_emit_notification(UUID, UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.engine_emit_notification(UUID, UUID, TEXT, TEXT) IS
  'Engine write path for notifications. SECURITY DEFINER bypasses notifications_own RLS so staff/coordinator code can ping recipients. tenant_id required per the NOT NULL schema constraint.';

COMMIT;
