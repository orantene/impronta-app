-- Package 3 task 1: venue locations and zones.
-- public.locations is the city gazetteer; these rows are tenant places.

BEGIN;

CREATE TABLE IF NOT EXISTS public.venue_locations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  slug          text NOT NULL,
  name          text NOT NULL,
  venue_id      uuid REFERENCES public.venues(id) ON DELETE SET NULL,
  timezone      text NOT NULL,
  address       jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default    boolean NOT NULL DEFAULT false,
  sort_order    integer NOT NULL DEFAULT 0,
  status        text NOT NULL DEFAULT 'active',
  version       integer NOT NULL DEFAULT 1,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_locations_slug_shape CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  CONSTRAINT venue_locations_status CHECK (status IN ('active', 'closed')),
  CONSTRAINT venue_locations_tz CHECK (char_length(btrim(timezone)) BETWEEN 1 AND 64),
  CONSTRAINT venue_locations_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT venue_locations_version CHECK (version >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS venue_locations_tenant_slug_uniq
  ON public.venue_locations (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS venue_locations_one_default
  ON public.venue_locations (tenant_id) WHERE is_default;
CREATE INDEX IF NOT EXISTS venue_locations_tenant_idx
  ON public.venue_locations (tenant_id, sort_order);

ALTER TABLE public.venue_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_locations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venue_locations_select_staff ON public.venue_locations;
CREATE POLICY venue_locations_select_staff ON public.venue_locations
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.venue_locations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venue_locations TO authenticated;
GRANT ALL ON public.venue_locations TO service_role;

CREATE TABLE IF NOT EXISTS public.venue_location_zones (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  location_id    uuid NOT NULL REFERENCES public.venue_locations(id) ON DELETE CASCADE,
  name           text NOT NULL,
  kind           text NOT NULL,
  surcharge_bps  integer NOT NULL DEFAULT 0,
  sort_order     integer NOT NULL DEFAULT 0,
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_location_zones_kind CHECK (kind IN ('floor', 'bar', 'terrace', 'room', 'counter')),
  CONSTRAINT venue_location_zones_surcharge CHECK (surcharge_bps BETWEEN 0 AND 10000),
  CONSTRAINT venue_location_zones_name CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT venue_location_zones_version CHECK (version >= 1)
);

CREATE INDEX IF NOT EXISTS venue_location_zones_location_idx
  ON public.venue_location_zones (location_id, sort_order);
CREATE INDEX IF NOT EXISTS venue_location_zones_tenant_idx
  ON public.venue_location_zones (tenant_id);

ALTER TABLE public.venue_location_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_location_zones FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS venue_location_zones_select_staff ON public.venue_location_zones;
CREATE POLICY venue_location_zones_select_staff ON public.venue_location_zones
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());
REVOKE ALL ON public.venue_location_zones FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.venue_location_zones TO authenticated;
GRANT ALL ON public.venue_location_zones TO service_role;

ALTER TABLE public.spaces
  ADD COLUMN IF NOT EXISTS location_id uuid REFERENCES public.venue_locations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS zone_id uuid REFERENCES public.venue_location_zones(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS spaces_location_idx ON public.spaces (location_id);
CREATE INDEX IF NOT EXISTS spaces_zone_idx ON public.spaces (zone_id);

INSERT INTO public.venue_locations (
  tenant_id, slug, name, venue_id, timezone, is_default, sort_order, status
)
SELECT
  a.id,
  'default',
  COALESCE(NULLIF(btrim(v.name), ''), NULLIF(btrim(a.display_name), ''), 'Default'),
  v.id,
  COALESCE(NULLIF(btrim(v.timezone), ''), 'UTC'),
  true,
  0,
  'active'
FROM public.agencies a
LEFT JOIN LATERAL (
  SELECT id, name, timezone
  FROM public.venues
  WHERE tenant_id = a.id
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1
) v ON true
WHERE NOT EXISTS (
  SELECT 1 FROM public.venue_locations vl
  WHERE vl.tenant_id = a.id AND vl.slug = 'default'
);

UPDATE public.spaces s
SET location_id = vl.id
FROM public.venue_locations vl
WHERE s.tenant_id = vl.tenant_id
  AND vl.is_default
  AND s.location_id IS NULL;

CREATE OR REPLACE FUNCTION public.venue_location_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_slug text,
  p_name text,
  p_venue_id uuid,
  p_timezone text,
  p_address jsonb,
  p_is_default boolean,
  p_sort_order integer,
  p_status text,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.venue_locations%ROWTYPE;
  v_slug text;
  v_active integer;
  v_defaults integer;
  v_default boolean;
BEGIN
  IF p_tenant_id IS NULL
     OR char_length(btrim(COALESCE(p_slug, ''))) < 1
     OR char_length(btrim(COALESCE(p_name, ''))) < 1
     OR char_length(btrim(COALESCE(p_timezone, ''))) < 1
     OR COALESCE(p_status, '') NOT IN ('active', 'closed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  v_slug := lower(btrim(p_slug));
  IF v_slug !~ '^[a-z0-9][a-z0-9_-]{0,62}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.venue_locations WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.venue_locations
    WHERE tenant_id = p_tenant_id AND slug = v_slug
      AND id IS DISTINCT FROM p_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'duplicate_slug');
  END IF;

  IF p_id IS NOT NULL AND p_status = 'closed' THEN
    SELECT count(*) INTO v_active
      FROM public.venue_locations
     WHERE tenant_id = p_tenant_id AND status = 'active' AND id IS DISTINCT FROM p_id;
    IF v_active = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'last_location');
    END IF;
  END IF;

  v_default := COALESCE(p_is_default, false);

  IF p_id IS NULL THEN
    IF v_default THEN
      UPDATE public.venue_locations
         SET is_default = false, version = version + 1, updated_at = now()
       WHERE tenant_id = p_tenant_id AND is_default;
    ELSE
      SELECT count(*) INTO v_defaults
        FROM public.venue_locations
       WHERE tenant_id = p_tenant_id AND is_default;
      IF v_defaults = 0 THEN
        v_default := true;
      END IF;
    END IF;

    INSERT INTO public.venue_locations (
      tenant_id, slug, name, venue_id, timezone, address, is_default, sort_order, status
    ) VALUES (
      p_tenant_id, v_slug, btrim(p_name), p_venue_id, btrim(p_timezone),
      COALESCE(p_address, '{}'::jsonb), v_default,
      COALESCE(p_sort_order, 0), p_status
    )
    RETURNING * INTO v_row;
  ELSE
    v_default := COALESCE(p_is_default, v_row.is_default);
    IF v_default THEN
      UPDATE public.venue_locations
         SET is_default = false, version = version + 1, updated_at = now()
       WHERE tenant_id = p_tenant_id AND is_default AND id IS DISTINCT FROM p_id;
    ELSE
      SELECT count(*) INTO v_defaults
        FROM public.venue_locations
       WHERE tenant_id = p_tenant_id AND is_default AND id IS DISTINCT FROM p_id;
      IF v_defaults = 0 THEN
        v_default := true;
      END IF;
    END IF;

    UPDATE public.venue_locations
       SET slug = v_slug,
           name = btrim(p_name),
           venue_id = p_venue_id,
           timezone = btrim(p_timezone),
           address = COALESCE(p_address, address),
           is_default = v_default,
           sort_order = COALESCE(p_sort_order, sort_order),
           status = p_status,
           version = version + 1,
           updated_at = now()
     WHERE id = p_id AND version = v_row.version
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'slug', v_row.slug,
    'version', v_row.version,
    'is_default', v_row.is_default
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_location_set_default(
  p_tenant_id uuid,
  p_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.venue_locations%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_row FROM public.venue_locations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF v_row.status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;

  UPDATE public.venue_locations
     SET is_default = false, version = version + 1, updated_at = now()
   WHERE tenant_id = p_tenant_id AND is_default AND id IS DISTINCT FROM p_id;

  UPDATE public.venue_locations
     SET is_default = true, version = version + 1, updated_at = now()
   WHERE id = p_id AND version = v_row.version
  RETURNING * INTO v_row;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_location_zone_upsert(
  p_tenant_id uuid,
  p_id uuid,
  p_location_id uuid,
  p_name text,
  p_kind text,
  p_surcharge_bps integer,
  p_sort_order integer,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loc public.venue_locations%ROWTYPE;
  v_row public.venue_location_zones%ROWTYPE;
BEGIN
  IF p_tenant_id IS NULL OR p_location_id IS NULL
     OR char_length(btrim(COALESCE(p_name, ''))) < 1
     OR COALESCE(p_kind, '') NOT IN ('floor', 'bar', 'terrace', 'room', 'counter')
     OR COALESCE(p_surcharge_bps, 0) < 0
     OR COALESCE(p_surcharge_bps, 0) > 10000 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_loc FROM public.venue_locations WHERE id = p_location_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_loc.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;

  IF p_id IS NOT NULL THEN
    SELECT * INTO v_row FROM public.venue_location_zones WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
    END IF;
    IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
    END IF;

    UPDATE public.venue_location_zones
       SET location_id = p_location_id,
           name = btrim(p_name),
           kind = p_kind,
           surcharge_bps = COALESCE(p_surcharge_bps, 0),
           sort_order = COALESCE(p_sort_order, sort_order),
           version = version + 1,
           updated_at = now()
     WHERE id = p_id AND version = v_row.version
    RETURNING * INTO v_row;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'conflict');
    END IF;
  ELSE
    INSERT INTO public.venue_location_zones (
      tenant_id, location_id, name, kind, surcharge_bps, sort_order
    ) VALUES (
      p_tenant_id, p_location_id, btrim(p_name), p_kind,
      COALESCE(p_surcharge_bps, 0), COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'version', v_row.version);
END;
$$;

CREATE OR REPLACE FUNCTION public.venue_location_zone_delete(
  p_tenant_id uuid,
  p_id uuid,
  p_expected_version integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.venue_location_zones%ROWTYPE;
  v_used integer;
BEGIN
  IF p_tenant_id IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_row FROM public.venue_location_zones WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_row.tenant_id IS DISTINCT FROM p_tenant_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'wrong_tenant');
  END IF;
  IF p_expected_version IS NOT NULL AND v_row.version IS DISTINCT FROM p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'conflict', 'version', v_row.version);
  END IF;

  SELECT count(*) INTO v_used FROM public.spaces WHERE zone_id = p_id;
  IF v_used > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'has_spaces');
  END IF;

  DELETE FROM public.venue_location_zones WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;

REVOKE ALL ON FUNCTION public.venue_location_upsert(uuid, uuid, text, text, uuid, text, jsonb, boolean, integer, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venue_location_set_default(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venue_location_zone_upsert(uuid, uuid, uuid, text, text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.venue_location_zone_delete(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.venue_location_upsert(uuid, uuid, text, text, uuid, text, jsonb, boolean, integer, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.venue_location_set_default(uuid, uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.venue_location_zone_upsert(uuid, uuid, uuid, text, text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.venue_location_zone_delete(uuid, uuid, integer) TO service_role;

DO $check$
BEGIN
  IF has_function_privilege('anon', 'public.venue_location_upsert(uuid,uuid,text,text,uuid,text,jsonb,boolean,integer,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'venue_location_upsert is executable by anon';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.venue_location_upsert(uuid,uuid,text,text,uuid,text,jsonb,boolean,integer,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'venue_location_upsert lost service_role execute';
  END IF;
END
$check$;

DO $proof$
DECLARE
  v_tenant uuid;
  v_venue uuid;
  v_loc uuid;
  v_zone uuid;
  v_reply jsonb;
BEGIN
  INSERT INTO public.agencies (slug, display_name)
  VALUES ('p3-loc-' || substr(gen_random_uuid()::text, 1, 12), 'P3 locations proof')
  RETURNING id INTO v_tenant;

  INSERT INTO public.venues (tenant_id, name, timezone, is_default)
  VALUES (v_tenant, 'Proof venue', 'America/Mexico_City', true)
  RETURNING id INTO v_venue;

  v_reply := public.venue_location_upsert(
    v_tenant, NULL, 'default', 'Default', v_venue, 'America/Mexico_City',
    '{}'::jsonb, true, 0, 'active', NULL
  );
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 loc proof: expected create ok, got %', v_reply;
  END IF;
  v_loc := (v_reply->>'id')::uuid;

  v_reply := public.venue_location_upsert(
    v_tenant, NULL, 'default', 'Other', v_venue, 'America/Mexico_City',
    '{}'::jsonb, false, 1, 'active', NULL
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'duplicate_slug' THEN
    RAISE EXCEPTION 'P3 loc proof: expected duplicate_slug, got %', v_reply;
  END IF;

  v_reply := public.venue_location_upsert(
    v_tenant, v_loc, 'default', 'Default', v_venue, 'America/Mexico_City',
    '{}'::jsonb, true, 0, 'closed', 1
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'last_location' THEN
    RAISE EXCEPTION 'P3 loc proof: expected last_location, got %', v_reply;
  END IF;

  v_reply := public.venue_location_upsert(
    v_tenant, v_loc, 'default', 'Default', v_venue, 'America/Mexico_City',
    '{}'::jsonb, true, 0, 'active', 0
  );
  IF v_reply->>'reason' IS DISTINCT FROM 'conflict' THEN
    RAISE EXCEPTION 'P3 loc proof: expected conflict, got %', v_reply;
  END IF;

  v_reply := public.venue_location_zone_upsert(
    v_tenant, NULL, v_loc, 'Main floor', 'floor', 0, 0, NULL
  );
  IF v_reply->>'ok' IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'P3 loc proof: expected zone create, got %', v_reply;
  END IF;
  v_zone := (v_reply->>'id')::uuid;

  INSERT INTO public.spaces (tenant_id, venue_id, kind, name, location_id, zone_id)
  VALUES (v_tenant, v_venue, 'table', 'T1', v_loc, v_zone);

  v_reply := public.venue_location_zone_delete(v_tenant, v_zone, 1);
  IF v_reply->>'reason' IS DISTINCT FROM 'has_spaces' THEN
    RAISE EXCEPTION 'P3 loc proof: expected has_spaces, got %', v_reply;
  END IF;

  DELETE FROM public.agencies WHERE id = v_tenant;
END
$proof$;

COMMIT;
