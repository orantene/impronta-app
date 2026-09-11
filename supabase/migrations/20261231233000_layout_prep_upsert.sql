-- Package 3 follow-on: layout_upsert and prep_station_upsert.
-- Activate never writes capacity. Upsert never sets is_active.

BEGIN;

CREATE OR REPLACE FUNCTION public.layout_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_location_id uuid,
  p_name text,
  p_canvas jsonb,
  p_items jsonb,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.space_layouts%ROWTYPE;
  v_item jsonb;
  v_space uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_location_id IS NULL
     OR char_length(btrim(COALESCE(p_name, ''))) < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.venue_locations
     WHERE id = p_location_id AND tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.space_layouts (tenant_id, location_id, name, canvas, is_active)
    VALUES (
      p_tenant_id,
      p_location_id,
      btrim(p_name),
      COALESCE(p_canvas, '{"w":1000,"h":800}'::jsonb),
      false
    )
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.space_layouts WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
    IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
    END IF;
    UPDATE public.space_layouts
       SET name = btrim(p_name),
           canvas = COALESCE(p_canvas, canvas),
           location_id = p_location_id,
           version = version + 1,
           updated_at = now()
     WHERE id = p_id AND version = v_row.version
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  END IF;

  DELETE FROM public.space_layout_items WHERE layout_id = v_row.id;

  IF p_items IS NOT NULL AND jsonb_typeof(p_items) = 'array' THEN
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
    LOOP
      BEGIN
        v_space := (v_item->>'space_id')::uuid;
      EXCEPTION WHEN others THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
      END;
      IF v_space IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.spaces WHERE id = v_space AND tenant_id = p_tenant_id
      ) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
      END IF;
      INSERT INTO public.space_layout_items (layout_id, space_id, x, y, w, h, rotation, shape)
      VALUES (
        v_row.id,
        v_space,
        COALESCE((v_item->>'x')::numeric, 0),
        COALESCE((v_item->>'y')::numeric, 0),
        COALESCE((v_item->>'w')::numeric, 96),
        COALESCE((v_item->>'h')::numeric, 72),
        COALESCE((v_item->>'rotation')::numeric, 0),
        COALESCE(NULLIF(v_item->>'shape', ''), 'rect')
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version, 'is_active', v_row.is_active);
END;
$$;

CREATE OR REPLACE FUNCTION public.prep_station_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_location_id uuid,
  p_code text,
  p_name text,
  p_kind text,
  p_sort_order integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.prep_stations%ROWTYPE;
  v_code text;
BEGIN
  v_code := lower(btrim(COALESCE(p_code, '')));
  IF p_tenant_id IS NULL
     OR v_code !~ '^[a-z0-9][a-z0-9_-]{0,31}$'
     OR char_length(btrim(COALESCE(p_name, ''))) < 1
     OR p_kind IS NULL
     OR p_kind NOT IN ('kitchen', 'bar', 'pickup', 'pass') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.venue_locations
     WHERE id = p_location_id AND tenant_id = p_tenant_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.prep_stations (tenant_id, location_id, code, name, kind, sort_order)
    VALUES (p_tenant_id, p_location_id, v_code, btrim(p_name), p_kind, COALESCE(p_sort_order, 0))
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.prep_stations WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
    IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    UPDATE public.prep_stations
       SET location_id = p_location_id,
           code = v_code,
           name = btrim(p_name),
           kind = p_kind,
           sort_order = COALESCE(p_sort_order, sort_order)
     WHERE id = p_id
    RETURNING * INTO v_row;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
END;
$$;

REVOKE ALL ON FUNCTION public.layout_upsert(uuid, uuid, uuid, text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prep_station_upsert(uuid, uuid, uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.layout_upsert(uuid, uuid, uuid, text, jsonb, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prep_station_upsert(uuid, uuid, uuid, text, text, text, integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.layout_upsert(uuid,uuid,uuid,text,jsonb,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'layout_upsert is executable by anon';
  END IF;
  IF has_function_privilege('anon', 'public.prep_station_upsert(uuid,uuid,uuid,text,text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'prep_station_upsert is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_venue uuid;
  v_loc uuid;
  v_space uuid;
  v_layout uuid;
  v_station uuid;
  v_reply jsonb;
  v_active boolean;
  v_pools integer;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p3-up-' || substr(gen_random_uuid()::text, 1, 12), 'P3 upsert proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.venues (tenant_id, name, timezone, is_default)
  VALUES (v_tenant, 'Proof', 'UTC', true) RETURNING id INTO v_venue;
  INSERT INTO public.venue_locations (tenant_id, slug, name, venue_id, timezone, is_default)
  VALUES (v_tenant, 'default', 'Default', v_venue, 'UTC', true) RETURNING id INTO v_loc;
  INSERT INTO public.spaces (tenant_id, venue_id, kind, name, code, party_min, party_max, status)
  VALUES (v_tenant, v_venue, 'table', 'T1', 't1', 2, 4, 'active')
  RETURNING id INTO v_space;

  SELECT count(*) INTO v_pools FROM public.capacity_pools WHERE tenant_id = v_tenant;

  v_reply := public.layout_upsert(
    v_tenant, NULL, v_loc, 'Dinner', '{"w":1000,"h":800}'::jsonb,
    jsonb_build_array(jsonb_build_object('space_id', v_space, 'x', 40, 'y', 40, 'w', 96, 'h', 72, 'rotation', 0, 'shape', 'rect')),
    NULL
  );
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 layout upsert proof: insert failed %', v_reply;
  END IF;
  v_layout := (v_reply->>'id')::uuid;
  SELECT is_active INTO v_active FROM public.space_layouts WHERE id = v_layout;
  IF v_active IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'P3 layout upsert proof: upsert must not activate';
  END IF;
  IF (SELECT count(*) FROM public.capacity_pools WHERE tenant_id = v_tenant) IS DISTINCT FROM v_pools THEN
    RAISE EXCEPTION 'P3 layout upsert proof: upsert wrote capacity';
  END IF;

  v_reply := public.layout_activate(v_tenant, v_layout, (v_reply->>'version')::integer);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 layout upsert proof: activate failed %', v_reply;
  END IF;
  IF (SELECT count(*) FROM public.capacity_pools WHERE tenant_id = v_tenant) IS DISTINCT FROM v_pools THEN
    RAISE EXCEPTION 'P3 layout upsert proof: activate wrote capacity';
  END IF;

  v_reply := public.prep_station_upsert(v_tenant, NULL, v_loc, 'hot-line', 'Kitchen hot line', 'kitchen', 0);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 station upsert proof: insert failed %', v_reply;
  END IF;
  v_station := (v_reply->>'id')::uuid;
  v_reply := public.prep_station_upsert(v_tenant, NULL, v_loc, 'hot-line', 'Dup', 'kitchen', 1);
  IF v_reply->>'reason' IS DISTINCT FROM 'invalid' THEN
    RAISE EXCEPTION 'P3 station upsert proof: expected invalid on duplicate code, got %', v_reply;
  END IF;
  v_reply := public.prep_station_delete(v_tenant, v_station);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 station upsert proof: delete failed %', v_reply;
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
