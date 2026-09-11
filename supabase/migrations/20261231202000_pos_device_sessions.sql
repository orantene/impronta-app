-- Package 1 task 2: till lock and operator switch.
-- Drawer stays on the open shift; the operator on the device changes.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_device_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  device_key        text NOT NULL,
  operator_user_id  uuid,
  shift_id          uuid REFERENCES public.pos_shifts(id) ON DELETE SET NULL,
  locked_at         timestamptz,
  unlocked_at       timestamptz,
  last_seen_at      timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_device_sessions_key_shape CHECK (char_length(btrim(device_key)) BETWEEN 8 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_device_sessions_tenant_device_uniq
  ON public.pos_device_sessions (tenant_id, device_key);

ALTER TABLE public.pos_device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_device_sessions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pos_device_sessions_select_staff ON public.pos_device_sessions;
CREATE POLICY pos_device_sessions_select_staff ON public.pos_device_sessions
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE ALL ON public.pos_device_sessions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_device_sessions TO authenticated;
GRANT ALL ON public.pos_device_sessions TO service_role;

CREATE OR REPLACE FUNCTION public.pos_touch_device_session(
  p_tenant_id uuid,
  p_device_key text,
  p_shift_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.pos_device_sessions (tenant_id, device_key, shift_id, last_seen_at)
  VALUES (p_tenant_id, p_device_key, p_shift_id, now())
  ON CONFLICT (tenant_id, device_key) DO UPDATE
    SET last_seen_at = now(),
        shift_id = COALESCE(EXCLUDED.shift_id, public.pos_device_sessions.shift_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_lock_till(
  p_tenant_id uuid,
  p_device_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_device_sessions%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR char_length(btrim(COALESCE(p_device_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_row
    FROM public.pos_device_sessions
   WHERE tenant_id = p_tenant_id AND device_key = p_device_key
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.pos_device_sessions (tenant_id, device_key, locked_at, last_seen_at)
    VALUES (p_tenant_id, p_device_key, now(), now())
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pos_device_sessions
       SET locked_at = now(), last_seen_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('ok', true, 'session_id', v_row.id, 'locked_at', v_row.locked_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_unlock_till(
  p_tenant_id uuid,
  p_device_key text,
  p_user_id uuid,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_device_sessions%ROWTYPE;
  v_hash text;
  v_settings jsonb;
BEGIN
  IF p_tenant_id IS NULL OR p_user_id IS NULL OR char_length(btrim(COALESCE(p_device_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings FROM public.agencies WHERE id = p_tenant_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  v_hash := public.pos_staff_pin_hash(v_settings, p_user_id);
  IF v_hash IS NULL OR p_pin IS NULL OR extensions.crypt(p_pin, v_hash) IS DISTINCT FROM v_hash THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pin_invalid');
  END IF;

  SELECT * INTO v_row
    FROM public.pos_device_sessions
   WHERE tenant_id = p_tenant_id AND device_key = p_device_key
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.pos_device_sessions (tenant_id, device_key, operator_user_id, unlocked_at, locked_at, last_seen_at)
    VALUES (p_tenant_id, p_device_key, p_user_id, now(), NULL, now())
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.pos_device_sessions
       SET operator_user_id = p_user_id,
           locked_at = NULL,
           unlocked_at = now(),
           last_seen_at = now()
     WHERE id = v_row.id
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('ok', true, 'session_id', v_row.id, 'operator_user_id', v_row.operator_user_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_switch_operator(
  p_tenant_id uuid,
  p_device_key text,
  p_user_id uuid,
  p_pin text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_device_sessions%ROWTYPE;
  v_unlock jsonb;
BEGIN
  SELECT * INTO v_row
    FROM public.pos_device_sessions
   WHERE tenant_id = p_tenant_id AND device_key = p_device_key
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_session');
  END IF;
  IF v_row.locked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'locked');
  END IF;
  -- Same PIN check as unlock; shift_id is left untouched.
  v_unlock := public.pos_unlock_till(p_tenant_id, p_device_key, p_user_id, p_pin);
  IF COALESCE((v_unlock->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN v_unlock;
  END IF;
  RETURN jsonb_build_object(
    'ok', true,
    'session_id', v_unlock->>'session_id',
    'operator_user_id', v_unlock->>'operator_user_id',
    'shift_id', v_row.shift_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.pos_lock_till(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_unlock_till(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.pos_switch_operator(uuid, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_lock_till(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_unlock_till(uuid, text, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.pos_switch_operator(uuid, text, uuid, text) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_lock_till(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.pos_unlock_till(uuid,text,uuid,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos device session RPCs are executable by anon/authenticated';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_reply jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p1-lock-' || substr(gen_random_uuid()::text, 1, 12), 'P1 lock proof')
  RETURNING id INTO v_tenant;

  v_reply := public.pos_unlock_till(v_tenant, 'device-key-aa', gen_random_uuid(), '1234');
  IF v_reply->>'reason' IS DISTINCT FROM 'pin_invalid' THEN
    RAISE EXCEPTION 'P1 lock proof: expected pin_invalid, got %', v_reply;
  END IF;
  IF EXISTS (SELECT 1 FROM public.pos_device_sessions WHERE tenant_id = v_tenant) THEN
    RAISE EXCEPTION 'P1 lock proof: a refused unlock wrote a session';
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
