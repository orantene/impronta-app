-- Package 3 task 2: restaurant party waitlist (T08). Not waitlist_offers.

BEGIN;

CREATE TABLE IF NOT EXISTS public.party_waitlist (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id        uuid REFERENCES public.venue_locations(id) ON DELETE SET NULL,
  zone_id            uuid REFERENCES public.venue_location_zones(id) ON DELETE SET NULL,
  party_size         integer NOT NULL,
  holder_name        text NOT NULL,
  holder_phone       text,
  holder_email       text,
  note               text,
  quoted_minutes     integer,
  status             text NOT NULL DEFAULT 'waiting',
  joined_at          timestamptz NOT NULL DEFAULT now(),
  notified_at        timestamptz,
  notify_expires_at  timestamptz,
  seated_visit_id    uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  position           integer NOT NULL DEFAULT 0,
  version            integer NOT NULL DEFAULT 1,
  operation_key      text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT party_waitlist_size CHECK (party_size BETWEEN 1 AND 200),
  CONSTRAINT party_waitlist_status CHECK (status IN ('waiting', 'notified', 'seated', 'left', 'expired')),
  CONSTRAINT party_waitlist_name CHECK (char_length(btrim(holder_name)) BETWEEN 1 AND 120),
  CONSTRAINT party_waitlist_key_shape CHECK (operation_key IS NULL OR char_length(btrim(operation_key)) BETWEEN 8 AND 80)
);

CREATE INDEX IF NOT EXISTS party_waitlist_queue_idx
  ON public.party_waitlist (tenant_id, location_id, status, position, joined_at);
CREATE UNIQUE INDEX IF NOT EXISTS party_waitlist_operation_key_uniq
  ON public.party_waitlist (tenant_id, operation_key)
  WHERE operation_key IS NOT NULL;

ALTER TABLE public.party_waitlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.party_waitlist FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS party_waitlist_select_staff ON public.party_waitlist;
CREATE POLICY party_waitlist_select_staff ON public.party_waitlist
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.party_waitlist FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.party_waitlist TO authenticated;
GRANT ALL ON public.party_waitlist TO service_role;

CREATE OR REPLACE FUNCTION public.party_waitlist_join(
  p_tenant_id uuid,
  p_location_id uuid,
  p_zone_id uuid,
  p_party_size integer,
  p_holder_name text,
  p_holder_phone text,
  p_holder_email text,
  p_note text,
  p_quoted_minutes integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
  v_pos integer;
BEGIN
  IF p_tenant_id IS NULL OR p_party_size IS NULL OR p_party_size < 1 OR p_party_size > 200
     OR char_length(btrim(COALESCE(p_holder_name, ''))) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_locations WHERE id = p_location_id AND tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT COALESCE(max(position), 0) + 1 INTO v_pos
    FROM public.party_waitlist
   WHERE tenant_id = p_tenant_id
     AND location_id IS NOT DISTINCT FROM p_location_id
     AND status IN ('waiting', 'notified');

  INSERT INTO public.party_waitlist (
    tenant_id, location_id, zone_id, party_size, holder_name, holder_phone,
    holder_email, note, quoted_minutes, status, position
  ) VALUES (
    p_tenant_id, p_location_id, p_zone_id, p_party_size, btrim(p_holder_name),
    NULLIF(btrim(p_holder_phone), ''), NULLIF(btrim(p_holder_email), ''),
    NULLIF(btrim(p_note), ''), p_quoted_minutes, 'waiting', v_pos
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'position', v_row.position, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_notify(
  p_tenant_id uuid,
  p_id uuid,
  p_ttl_seconds integer,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
  v_ttl integer;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  v_ttl := GREATEST(COALESCE(p_ttl_seconds, 300), 30);

  SELECT * INTO v_row FROM public.party_waitlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_row.status = 'seated' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_seated');
  END IF;
  IF v_row.status IN ('left', 'expired') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;

  UPDATE public.party_waitlist
     SET status = 'notified',
         notified_at = now(),
         notify_expires_at = now() + make_interval(secs => v_ttl),
         version = version + 1,
         updated_at = now()
   WHERE id = p_id AND version = v_row.version
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'version', v_row.version,
    'notify_expires_at', v_row.notify_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_seat(
  p_tenant_id uuid,
  p_id uuid,
  p_space_id uuid,
  p_operation_key text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
  v_occ uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL OR p_space_id IS NULL
     OR char_length(btrim(COALESCE(p_operation_key, ''))) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_row FROM public.party_waitlist
   WHERE tenant_id = p_tenant_id AND operation_key = p_operation_key;
  IF FOUND AND v_row.id = p_id AND v_row.status = 'seated' THEN
    RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'visit_id', v_row.seated_visit_id, 'already', true, 'version', v_row.version);
  END IF;

  SELECT * INTO v_row FROM public.party_waitlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_row.status = 'seated' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_seated');
  END IF;
  IF v_row.status IN ('left', 'expired')
     OR (v_row.notify_expires_at IS NOT NULL AND v_row.notify_expires_at < now() AND v_row.status = 'notified') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;

  SELECT id INTO v_occ FROM public.visits
   WHERE tenant_id = p_tenant_id AND status = 'open'
     AND (space_id = p_space_id OR joined_space_id = p_space_id)
   FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'space_occupied'); END IF;

  UPDATE public.party_waitlist
     SET status = 'seated',
         operation_key = p_operation_key,
         version = version + 1,
         updated_at = now()
   WHERE id = p_id AND version = v_row.version
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'party_size', v_row.party_size, 'version', v_row.version, 'claimed', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_attach_visit(
  p_tenant_id uuid,
  p_id uuid,
  p_visit_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.party_waitlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  UPDATE public.party_waitlist
     SET seated_visit_id = p_visit_id, updated_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id, 'visit_id', p_visit_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_unclaim(
  p_tenant_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.party_waitlist
     SET status = 'waiting',
         operation_key = NULL,
         version = version + 1,
         updated_at = now()
   WHERE id = p_id AND tenant_id = p_tenant_id AND status = 'seated' AND seated_visit_id IS NULL;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_leave(
  p_tenant_id uuid,
  p_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.party_waitlist%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.party_waitlist WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_row.status = 'seated' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_seated');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;
  UPDATE public.party_waitlist
     SET status = 'left', version = version + 1, updated_at = now()
   WHERE id = p_id AND version = v_row.version;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.party_waitlist_reap()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_n integer;
BEGIN
  UPDATE public.party_waitlist
     SET status = 'expired', version = version + 1, updated_at = now()
   WHERE status = 'notified'
     AND notify_expires_at IS NOT NULL
     AND notify_expires_at < now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'expired', v_n);
END;
$$;

REVOKE ALL ON FUNCTION public.party_waitlist_join(uuid, uuid, uuid, integer, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_notify(uuid, uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_seat(uuid, uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_attach_visit(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_unclaim(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_leave(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.party_waitlist_reap() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.party_waitlist_join(uuid, uuid, uuid, integer, text, text, text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_notify(uuid, uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_seat(uuid, uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_attach_visit(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_unclaim(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_leave(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.party_waitlist_reap() TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.party_waitlist_seat(uuid,uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'party_waitlist_seat is executable by anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.party_waitlist_seat(uuid,uuid,uuid,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'party_waitlist_seat lost service_role execute';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_reply jsonb;
  v_id uuid;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p3-wl-' || substr(gen_random_uuid()::text, 1, 12), 'P3 waitlist proof')
  RETURNING id INTO v_tenant;

  v_reply := public.party_waitlist_join(v_tenant, NULL, NULL, 2, 'Ada', NULL, NULL, NULL, 15);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 waitlist proof: join failed %', v_reply;
  END IF;
  v_id := (v_reply->>'id')::uuid;

  v_reply := public.party_waitlist_seat(v_tenant, v_id, gen_random_uuid(), 'seat-key-aaaa', 0);
  IF v_reply->>'reason' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'P3 waitlist proof: expected conflict, got %', v_reply;
  END IF;

  v_reply := public.party_waitlist_leave(v_tenant, v_id, 1);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 waitlist proof: leave failed %', v_reply;
  END IF;
  v_reply := public.party_waitlist_seat(v_tenant, v_id, gen_random_uuid(), 'seat-key-bbbb', 2);
  IF v_reply->>'reason' IS DISTINCT FROM 'already_seated' AND v_reply->>'reason' IS DISTINCT FROM 'expired' THEN
    RAISE EXCEPTION 'P3 waitlist proof: expected expired/already after leave, got %', v_reply;
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
