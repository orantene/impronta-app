-- Package 3 task 3: layouts, service periods, prep stations, course fire.

BEGIN;

CREATE TABLE IF NOT EXISTS public.space_layouts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id  uuid NOT NULL REFERENCES public.venue_locations(id) ON DELETE CASCADE,
  name         text NOT NULL,
  is_active    boolean NOT NULL DEFAULT false,
  canvas       jsonb NOT NULL DEFAULT '{"w":1000,"h":800}'::jsonb,
  created_by   uuid,
  version      integer NOT NULL DEFAULT 1,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT space_layouts_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE UNIQUE INDEX IF NOT EXISTS space_layouts_one_active
  ON public.space_layouts (location_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS space_layouts_tenant_idx ON public.space_layouts (tenant_id);

ALTER TABLE public.space_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_layouts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_layouts_select_staff ON public.space_layouts;
CREATE POLICY space_layouts_select_staff ON public.space_layouts
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.space_layouts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.space_layouts TO authenticated;
GRANT ALL ON public.space_layouts TO service_role;

CREATE TABLE IF NOT EXISTS public.space_layout_items (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layout_id  uuid NOT NULL REFERENCES public.space_layouts(id) ON DELETE CASCADE,
  space_id   uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  x          numeric NOT NULL,
  y          numeric NOT NULL,
  w          numeric NOT NULL,
  h          numeric NOT NULL,
  rotation   numeric NOT NULL DEFAULT 0,
  shape      text NOT NULL DEFAULT 'rect'
);

CREATE UNIQUE INDEX IF NOT EXISTS space_layout_items_space_uniq
  ON public.space_layout_items (layout_id, space_id);

ALTER TABLE public.space_layout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.space_layout_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS space_layout_items_select_staff ON public.space_layout_items;
CREATE POLICY space_layout_items_select_staff ON public.space_layout_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.space_layouts l
      WHERE l.id = layout_id AND (public.is_staff_of_tenant(l.tenant_id) OR public.is_platform_admin())
    )
  );
REVOKE ALL ON public.space_layout_items FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.space_layout_items TO authenticated;
GRANT ALL ON public.space_layout_items TO service_role;

CREATE TABLE IF NOT EXISTS public.service_periods (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id   uuid NOT NULL REFERENCES public.venue_locations(id) ON DELETE CASCADE,
  name          text NOT NULL,
  weekday_mask  integer NOT NULL,
  starts_local  time NOT NULL,
  ends_local    time NOT NULL,
  turn_minutes  integer NOT NULL,
  rules         jsonb NOT NULL DEFAULT '{}'::jsonb,
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_periods_mask CHECK (weekday_mask BETWEEN 1 AND 127),
  CONSTRAINT service_periods_turn CHECK (turn_minutes BETWEEN 15 AND 480),
  CONSTRAINT service_periods_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 80)
);

CREATE INDEX IF NOT EXISTS service_periods_location_idx ON public.service_periods (location_id);

ALTER TABLE public.service_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_periods_select_staff ON public.service_periods;
CREATE POLICY service_periods_select_staff ON public.service_periods
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.service_periods FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.service_periods TO authenticated;
GRANT ALL ON public.service_periods TO service_role;

CREATE TABLE IF NOT EXISTS public.prep_stations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id  uuid REFERENCES public.venue_locations(id) ON DELETE SET NULL,
  code         text NOT NULL,
  name         text NOT NULL,
  kind         text NOT NULL,
  sort_order   integer NOT NULL DEFAULT 0,
  CONSTRAINT prep_stations_kind CHECK (kind IN ('kitchen', 'bar', 'pickup', 'pass')),
  CONSTRAINT prep_stations_code CHECK (code ~ '^[a-z0-9][a-z0-9_-]{0,31}$')
);

CREATE UNIQUE INDEX IF NOT EXISTS prep_stations_code_uniq ON public.prep_stations (tenant_id, code);

ALTER TABLE public.prep_stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prep_stations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS prep_stations_select_staff ON public.prep_stations;
CREATE POLICY prep_stations_select_staff ON public.prep_stations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.prep_stations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.prep_stations TO authenticated;
GRANT ALL ON public.prep_stations TO service_role;

ALTER TABLE public.talent_offerings
  ADD COLUMN IF NOT EXISTS prep_station_id uuid REFERENCES public.prep_stations(id) ON DELETE SET NULL;
ALTER TABLE public.preparation_tickets
  ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES public.prep_stations(id) ON DELETE SET NULL;
ALTER TABLE public.order_lines
  ADD COLUMN IF NOT EXISTS course_seq integer;

UPDATE public.preparation_tickets t
SET station_id = s.id
FROM public.prep_stations s
WHERE t.station_id IS NULL
  AND t.tenant_id = s.tenant_id
  AND lower(t.station) = s.code;

CREATE OR REPLACE FUNCTION public.layout_activate(
  p_tenant_id uuid,
  p_layout_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.space_layouts%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_layout_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;
  SELECT * INTO v_row FROM public.space_layouts WHERE id = p_layout_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;

  UPDATE public.space_layouts
     SET is_active = false, version = version + 1, updated_at = now()
   WHERE location_id = v_row.location_id AND is_active AND id IS DISTINCT FROM p_layout_id;

  UPDATE public.space_layouts
     SET is_active = true, version = version + 1, updated_at = now()
   WHERE id = p_layout_id AND version = v_row.version
  RETURNING * INTO v_row;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'two_active');
END;
$$;

CREATE OR REPLACE FUNCTION public.service_period_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_location_id uuid,
  p_name text,
  p_weekday_mask integer,
  p_starts_local time,
  p_ends_local time,
  p_turn_minutes integer,
  p_rules jsonb,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.service_periods%ROWTYPE;
  v_hit uuid;
BEGIN
  IF p_tenant_id IS NULL OR p_location_id IS NULL
     OR char_length(btrim(COALESCE(p_name, ''))) < 1
     OR p_weekday_mask IS NULL OR p_weekday_mask < 1 OR p_weekday_mask > 127
     OR p_starts_local IS NULL OR p_ends_local IS NULL
     OR p_turn_minutes IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT id INTO v_hit FROM public.service_periods
   WHERE tenant_id = p_tenant_id AND location_id = p_location_id
     AND id IS DISTINCT FROM p_id
     AND (weekday_mask & p_weekday_mask) <> 0
     AND starts_local < p_ends_local AND p_starts_local < ends_local;
  IF v_hit IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'overlap');
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.service_periods (
      tenant_id, location_id, name, weekday_mask, starts_local, ends_local, turn_minutes, rules
    ) VALUES (
      p_tenant_id, p_location_id, btrim(p_name), p_weekday_mask, p_starts_local, p_ends_local,
      p_turn_minutes, COALESCE(p_rules, '{}'::jsonb)
    )
    RETURNING * INTO v_row;
  ELSE
    SELECT * INTO v_row FROM public.service_periods WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
    IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
    END IF;
    UPDATE public.service_periods
       SET name = btrim(p_name),
           weekday_mask = p_weekday_mask,
           starts_local = p_starts_local,
           ends_local = p_ends_local,
           turn_minutes = p_turn_minutes,
           rules = COALESCE(p_rules, rules),
           version = version + 1
     WHERE id = p_id AND version = v_row.version
    RETURNING * INTO v_row;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'conflict'); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.prep_station_delete(
  p_tenant_id uuid,
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.prep_stations WHERE id = p_id AND tenant_id = p_tenant_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT count(*) INTO v_used FROM public.talent_offerings WHERE prep_station_id = p_id;
  IF v_used > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'station_in_use'); END IF;
  SELECT count(*) INTO v_used FROM public.preparation_tickets WHERE station_id = p_id AND status IN ('queued', 'acknowledged');
  IF v_used > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'station_in_use'); END IF;
  DELETE FROM public.prep_stations WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.layout_activate(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.service_period_upsert(uuid, uuid, uuid, text, integer, time, time, integer, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prep_station_delete(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.layout_activate(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.service_period_upsert(uuid, uuid, uuid, text, integer, time, time, integer, jsonb, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.prep_station_delete(uuid, uuid) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.layout_activate(uuid,uuid,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'layout_activate is executable by anon';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_venue uuid;
  v_loc uuid;
  v_layout uuid;
  v_reply jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p3-lay-' || substr(gen_random_uuid()::text, 1, 12), 'P3 layout proof')
  RETURNING id INTO v_tenant;
  INSERT INTO public.venues (tenant_id, name, timezone, is_default)
  VALUES (v_tenant, 'Proof', 'UTC', true) RETURNING id INTO v_venue;
  INSERT INTO public.venue_locations (tenant_id, slug, name, venue_id, timezone, is_default)
  VALUES (v_tenant, 'default', 'Default', v_venue, 'UTC', true) RETURNING id INTO v_loc;
  INSERT INTO public.space_layouts (tenant_id, location_id, name) VALUES (v_tenant, v_loc, 'Dinner')
  RETURNING id INTO v_layout;

  v_reply := public.layout_activate(v_tenant, v_layout, 1);
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 layout proof: activate failed %', v_reply;
  END IF;
  v_reply := public.layout_activate(v_tenant, v_layout, 1);
  IF v_reply->>'reason' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'P3 layout proof: expected conflict, got %', v_reply;
  END IF;

  v_reply := public.service_period_upsert(
    v_tenant, NULL, v_loc, 'Dinner', 127, '19:00', '23:00', 90, '{}'::jsonb, NULL
  );
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 period proof: insert failed %', v_reply;
  END IF;
  v_reply := public.service_period_upsert(
    v_tenant, NULL, v_loc, 'Late', 127, '22:00', '23:30', 90, '{}'::jsonb, NULL
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'overlap' THEN
    RAISE EXCEPTION 'P3 period proof: expected overlap, got %', v_reply;
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
