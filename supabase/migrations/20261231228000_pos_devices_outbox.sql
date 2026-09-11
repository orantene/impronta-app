-- Package 3 task 7: device registry and cash-only offline outbox.

BEGIN;

CREATE TABLE IF NOT EXISTS public.pos_devices (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id    uuid REFERENCES public.venue_locations(id) ON DELETE SET NULL,
  device_key     text NOT NULL,
  name           text NOT NULL,
  kind           text NOT NULL,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  app_version    text,
  registered_by  uuid,
  status         text NOT NULL DEFAULT 'active',
  settings       jsonb NOT NULL DEFAULT '{}'::jsonb,
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pos_devices_key_shape CHECK (char_length(btrim(device_key)) BETWEEN 8 AND 80),
  CONSTRAINT pos_devices_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT pos_devices_kind CHECK (kind IN ('tablet', 'phone', 'display', 'printer', 'reader')),
  CONSTRAINT pos_devices_status CHECK (status IN ('active', 'disabled'))
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_devices_tenant_key_uniq
  ON public.pos_devices (tenant_id, device_key);

ALTER TABLE public.pos_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_devices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_devices_select_staff ON public.pos_devices;
CREATE POLICY pos_devices_select_staff ON public.pos_devices
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.pos_devices FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_devices TO authenticated;
GRANT ALL ON public.pos_devices TO service_role;

ALTER TABLE public.pos_device_sessions
  ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES public.pos_devices(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.pos_outbox (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  device_id     uuid NOT NULL REFERENCES public.pos_devices(id) ON DELETE CASCADE,
  command       jsonb NOT NULL,
  operation_key text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  applied_at    timestamptz,
  result        jsonb,
  CONSTRAINT pos_outbox_key_shape CHECK (char_length(btrim(operation_key)) BETWEEN 8 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS pos_outbox_operation_key_uniq
  ON public.pos_outbox (tenant_id, operation_key);

ALTER TABLE public.pos_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_outbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pos_outbox_select_staff ON public.pos_outbox;
CREATE POLICY pos_outbox_select_staff ON public.pos_outbox
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.pos_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.pos_outbox TO authenticated;
GRANT ALL ON public.pos_outbox TO service_role;

CREATE OR REPLACE FUNCTION public.pos_device_register(
  p_tenant_id uuid,
  p_device_key text,
  p_name text,
  p_kind text,
  p_location_id uuid,
  p_registered_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_devices%ROWTYPE;
  v_key text := btrim(COALESCE(p_device_key, ''));
BEGIN
  IF p_tenant_id IS NULL OR char_length(v_key) < 8 OR char_length(btrim(COALESCE(p_name, ''))) < 1
     OR p_kind IS NULL OR p_kind NOT IN ('tablet', 'phone', 'display', 'printer', 'reader') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  INSERT INTO public.pos_devices (tenant_id, device_key, name, kind, location_id, registered_by)
  VALUES (p_tenant_id, v_key, btrim(p_name), p_kind, p_location_id, p_registered_by)
  ON CONFLICT (tenant_id, device_key) DO UPDATE
    SET name = EXCLUDED.name,
        kind = EXCLUDED.kind,
        location_id = COALESCE(EXCLUDED.location_id, public.pos_devices.location_id),
        version = public.pos_devices.version + 1,
        last_seen_at = now()
  RETURNING * INTO v_row;
  UPDATE public.pos_device_sessions
     SET device_id = v_row.id
   WHERE tenant_id = p_tenant_id AND device_key = v_key AND device_id IS NULL;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_device_heartbeat(
  p_tenant_id uuid,
  p_device_key text,
  p_app_version text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_devices%ROWTYPE;
  v_min text;
BEGIN
  IF p_tenant_id IS NULL OR char_length(btrim(COALESCE(p_device_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_row
    FROM public.pos_devices
   WHERE tenant_id = p_tenant_id AND device_key = btrim(p_device_key)
   FOR UPDATE;
  IF NOT FOUND OR v_row.status = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_device');
  END IF;
  v_min := NULLIF(v_row.settings->>'min_app_version', '');
  IF v_min IS NOT NULL AND COALESCE(p_app_version, '') < v_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale_app');
  END IF;
  UPDATE public.pos_devices
     SET last_seen_at = now(),
         app_version = COALESCE(NULLIF(btrim(COALESCE(p_app_version, '')), ''), app_version)
   WHERE id = v_row.id;
  UPDATE public.pos_device_sessions
     SET device_id = v_row.id, last_seen_at = now()
   WHERE tenant_id = p_tenant_id AND device_key = v_row.device_key;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_device_update(
  p_tenant_id uuid,
  p_id uuid,
  p_settings jsonb,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.pos_devices%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  SELECT * INTO v_row FROM public.pos_devices WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;
  UPDATE public.pos_devices
     SET settings = COALESCE(p_settings, settings),
         version = version + 1
   WHERE id = v_row.id
   RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.pos_outbox_apply(
  p_tenant_id uuid,
  p_device_id uuid,
  p_operation_key text,
  p_command jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := btrim(COALESCE(p_operation_key, ''));
  v_device public.pos_devices%ROWTYPE;
  v_existing public.pos_outbox%ROWTYPE;
  v_kind text;
  v_method text;
  v_reserve jsonb;
  v_row public.pos_outbox%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_device_id IS NULL OR char_length(v_key) < 8 OR p_command IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  SELECT * INTO v_existing
    FROM public.pos_outbox
   WHERE tenant_id = p_tenant_id AND operation_key = v_key;
  IF FOUND THEN
    RETURN jsonb_build_object('ok', true, 'already', true, 'id', v_existing.id, 'result', v_existing.result);
  END IF;

  SELECT * INTO v_device FROM public.pos_devices WHERE id = p_device_id FOR UPDATE;
  IF NOT FOUND OR v_device.tenant_id IS DISTINCT FROM p_tenant_id OR v_device.status = 'disabled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_device');
  END IF;

  v_kind := p_command->>'kind';
  v_method := COALESCE(p_command->>'method', 'cash');
  IF v_kind IS DISTINCT FROM 'cash_collect'
     OR v_method IS DISTINCT FROM 'cash'
     OR p_command ? 'provider'
     OR p_command ? 'payment_intent'
     OR p_command ? 'checkout_session' THEN
    INSERT INTO public.pos_outbox (tenant_id, device_id, command, operation_key, applied_at, result)
    VALUES (
      p_tenant_id, p_device_id, p_command, v_key, now(),
      jsonb_build_object('ok', false, 'reason', 'not_replayable')
    )
    RETURNING * INTO v_row;
    RETURN jsonb_build_object('ok', false, 'reason', 'not_replayable', 'id', v_row.id);
  END IF;

  IF p_command->>'order_id' IS NULL OR COALESCE((p_command->>'amount_cents')::bigint, 0) <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  v_reserve := public.pos_reserve_collection(
    p_tenant_id,
    (p_command->>'order_id')::uuid,
    v_key,
    (p_command->>'amount_cents')::bigint,
    'cash',
    COALESCE(v_device.registered_by, p_tenant_id),
    NULL,
    120
  );
  IF (v_reserve->>'ok')::boolean IS NOT TRUE THEN
    RETURN jsonb_build_object('ok', false, 'reason', COALESCE(v_reserve->>'reason', 'unavailable'));
  END IF;

  INSERT INTO public.pos_outbox (tenant_id, device_id, command, operation_key, applied_at, result)
  VALUES (p_tenant_id, p_device_id, p_command, v_key, now(), v_reserve)
  RETURNING * INTO v_row;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'result', v_reserve);
END;
$$;

REVOKE ALL ON FUNCTION public.pos_device_register(uuid, text, text, text, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_device_register(uuid, text, text, text, uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.pos_device_heartbeat(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_device_heartbeat(uuid, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.pos_device_update(uuid, uuid, jsonb, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_device_update(uuid, uuid, jsonb, integer) TO service_role;
REVOKE ALL ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pos_outbox_apply(uuid, uuid, text, jsonb) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.pos_outbox_apply(uuid,uuid,text,jsonb)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.pos_device_heartbeat(uuid,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'pos device/outbox is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_reply jsonb;
BEGIN
  v_reply := public.pos_device_heartbeat(gen_random_uuid(), 'unknown-device-key', '1.0.0');
  IF v_reply->>'reason' IS DISTINCT FROM 'unknown_device' THEN
    RAISE EXCEPTION 'P3 device proof: expected unknown_device, got %', v_reply;
  END IF;
  v_reply := public.pos_outbox_apply(
    gen_random_uuid(), gen_random_uuid(), 'outbox-key-aa',
    jsonb_build_object('kind', 'card_collect', 'provider', 'stripe')
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'unknown_device' THEN
    RAISE EXCEPTION 'P3 outbox proof: expected unknown_device before replay, got %', v_reply;
  END IF;
END
$proof$;

COMMIT;
