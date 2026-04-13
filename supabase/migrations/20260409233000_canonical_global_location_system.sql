BEGIN;
CREATE TABLE IF NOT EXISTS public.countries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  iso2 TEXT NOT NULL UNIQUE,
  name_en TEXT NOT NULL,
  name_es TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS countries_select ON public.countries;
CREATE POLICY countries_select ON public.countries
  FOR SELECT
  USING (active = TRUE AND archived_at IS NULL);
DROP POLICY IF EXISTS countries_write_staff ON public.countries;
CREATE POLICY countries_write_staff ON public.countries
  FOR ALL
  USING (public.is_agency_staff())
  WITH CHECK (public.is_agency_staff());
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS country_id UUID REFERENCES public.countries (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS population BIGINT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS residence_country_id UUID REFERENCES public.countries (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS residence_city_id UUID REFERENCES public.locations (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_country_id UUID REFERENCES public.countries (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_city_id UUID REFERENCES public.locations (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_countries_iso2_active
  ON public.countries (iso2)
  WHERE active = TRUE AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_locations_country_id_active
  ON public.locations (country_id)
  WHERE active = TRUE AND archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talent_profiles_residence_country
  ON public.talent_profiles (residence_country_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talent_profiles_residence_city
  ON public.talent_profiles (residence_city_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talent_profiles_origin_country
  ON public.talent_profiles (origin_country_id)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_talent_profiles_origin_city
  ON public.talent_profiles (origin_city_id)
  WHERE deleted_at IS NULL;
CREATE OR REPLACE FUNCTION public.default_country_name_en(p_iso2 TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(p_iso2, ''))
    WHEN 'AE' THEN 'United Arab Emirates'
    WHEN 'AR' THEN 'Argentina'
    WHEN 'AU' THEN 'Australia'
    WHEN 'BR' THEN 'Brazil'
    WHEN 'CA' THEN 'Canada'
    WHEN 'CL' THEN 'Chile'
    WHEN 'CO' THEN 'Colombia'
    WHEN 'DE' THEN 'Germany'
    WHEN 'ES' THEN 'Spain'
    WHEN 'FR' THEN 'France'
    WHEN 'GB' THEN 'United Kingdom'
    WHEN 'IT' THEN 'Italy'
    WHEN 'MX' THEN 'Mexico'
    WHEN 'NL' THEN 'Netherlands'
    WHEN 'PE' THEN 'Peru'
    WHEN 'PT' THEN 'Portugal'
    WHEN 'US' THEN 'United States'
    ELSE upper(coalesce(p_iso2, ''))
  END;
$$;
CREATE OR REPLACE FUNCTION public.default_country_name_es(p_iso2 TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(p_iso2, ''))
    WHEN 'AE' THEN 'Emiratos Arabes Unidos'
    WHEN 'AR' THEN 'Argentina'
    WHEN 'AU' THEN 'Australia'
    WHEN 'BR' THEN 'Brasil'
    WHEN 'CA' THEN 'Canada'
    WHEN 'CL' THEN 'Chile'
    WHEN 'CO' THEN 'Colombia'
    WHEN 'DE' THEN 'Alemania'
    WHEN 'ES' THEN 'Espana'
    WHEN 'FR' THEN 'Francia'
    WHEN 'GB' THEN 'Reino Unido'
    WHEN 'IT' THEN 'Italia'
    WHEN 'MX' THEN 'Mexico'
    WHEN 'NL' THEN 'Paises Bajos'
    WHEN 'PE' THEN 'Peru'
    WHEN 'PT' THEN 'Portugal'
    WHEN 'US' THEN 'Estados Unidos'
    ELSE upper(coalesce(p_iso2, ''))
  END;
$$;
INSERT INTO public.countries (iso2, name_en, name_es, active)
SELECT DISTINCT
  upper(l.country_code) AS iso2,
  public.default_country_name_en(l.country_code),
  public.default_country_name_es(l.country_code),
  COALESCE(l.active, l.archived_at IS NULL)
FROM public.locations l
WHERE coalesce(l.country_code, '') <> ''
ON CONFLICT (iso2) DO UPDATE
SET updated_at = now();
UPDATE public.locations l
SET
  country_code = upper(l.country_code),
  country_id = c.id,
  active = COALESCE(l.active, l.archived_at IS NULL),
  updated_at = now()
FROM public.countries c
WHERE c.iso2 = upper(l.country_code)
  AND (l.country_id IS NULL OR l.country_id <> c.id OR l.active IS DISTINCT FROM COALESCE(l.archived_at IS NULL, TRUE));
CREATE OR REPLACE FUNCTION public.ensure_country(
  p_iso2 TEXT,
  p_name_en TEXT DEFAULT NULL,
  p_name_es TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_iso2 TEXT := upper(trim(coalesce(p_iso2, '')));
  v_name_en TEXT := nullif(trim(coalesce(p_name_en, '')), '');
  v_name_es TEXT := nullif(trim(coalesce(p_name_es, '')), '');
  v_id UUID;
BEGIN
  IF v_iso2 = '' OR length(v_iso2) <> 2 THEN
    RAISE EXCEPTION 'Valid ISO2 country code required';
  END IF;

  INSERT INTO public.countries (iso2, name_en, name_es, active, archived_at)
  VALUES (
    v_iso2,
    coalesce(v_name_en, public.default_country_name_en(v_iso2)),
    coalesce(v_name_es, public.default_country_name_es(v_iso2)),
    TRUE,
    NULL
  )
  ON CONFLICT (iso2) DO UPDATE
  SET
    name_en = coalesce(nullif(excluded.name_en, ''), public.countries.name_en),
    name_es = coalesce(excluded.name_es, public.countries.name_es),
    active = TRUE,
    archived_at = NULL,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
CREATE OR REPLACE FUNCTION public.normalize_location_slug(p_input TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '-' FROM regexp_replace(lower(regexp_replace(coalesce(p_input, ''), '[''"]', '', 'g')), '[^a-z0-9]+', '-', 'g'));
$$;
CREATE OR REPLACE FUNCTION public.ensure_city_location(
  p_country_iso2 TEXT,
  p_country_name_en TEXT DEFAULT NULL,
  p_country_name_es TEXT DEFAULT NULL,
  p_city_slug TEXT DEFAULT NULL,
  p_city_name_en TEXT DEFAULT NULL,
  p_city_name_es TEXT DEFAULT NULL,
  p_lat DOUBLE PRECISION DEFAULT NULL,
  p_lng DOUBLE PRECISION DEFAULT NULL,
  p_population BIGINT DEFAULT NULL
)
RETURNS TABLE(country_id UUID, city_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_country_id UUID;
  v_country_iso2 TEXT := upper(trim(coalesce(p_country_iso2, '')));
  v_city_name_en TEXT := nullif(trim(coalesce(p_city_name_en, '')), '');
  v_city_name_es TEXT := nullif(trim(coalesce(p_city_name_es, '')), '');
  v_city_slug TEXT := public.normalize_location_slug(coalesce(p_city_slug, p_city_name_en, ''));
BEGIN
  IF v_country_iso2 = '' OR length(v_country_iso2) <> 2 THEN
    RAISE EXCEPTION 'Valid country ISO2 required';
  END IF;
  IF v_city_slug = '' OR v_city_name_en IS NULL THEN
    RAISE EXCEPTION 'City slug and English city name required';
  END IF;

  v_country_id := public.ensure_country(v_country_iso2, p_country_name_en, p_country_name_es);

  INSERT INTO public.locations (
    country_code,
    country_id,
    city_slug,
    display_name_en,
    display_name_es,
    latitude,
    longitude,
    population,
    active,
    archived_at
  )
  VALUES (
    v_country_iso2,
    v_country_id,
    v_city_slug,
    v_city_name_en,
    v_city_name_es,
    p_lat,
    p_lng,
    p_population,
    TRUE,
    NULL
  )
  ON CONFLICT (country_code, city_slug) DO UPDATE
  SET
    country_id = excluded.country_id,
    display_name_en = excluded.display_name_en,
    display_name_es = coalesce(excluded.display_name_es, public.locations.display_name_es),
    latitude = coalesce(excluded.latitude, public.locations.latitude),
    longitude = coalesce(excluded.longitude, public.locations.longitude),
    population = coalesce(excluded.population, public.locations.population),
    active = TRUE,
    archived_at = NULL,
    updated_at = now();

  RETURN QUERY
  SELECT v_country_id, l.id
  FROM public.locations l
  WHERE l.country_code = v_country_iso2
    AND l.city_slug = v_city_slug
  LIMIT 1;
END;
$$;
CREATE OR REPLACE FUNCTION public.sync_location_country_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.country_code := upper(trim(coalesce(NEW.country_code, '')));
  IF NEW.country_code = '' THEN
    RAISE EXCEPTION 'country_code is required';
  END IF;

  IF NEW.country_id IS NULL THEN
    NEW.country_id := public.ensure_country(NEW.country_code, NULL, NULL);
  END IF;

  NEW.active := coalesce(NEW.active, NEW.archived_at IS NULL, TRUE);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_locations_country_defaults ON public.locations;
CREATE TRIGGER tr_locations_country_defaults
BEFORE INSERT OR UPDATE ON public.locations
FOR EACH ROW
EXECUTE FUNCTION public.sync_location_country_defaults();
CREATE OR REPLACE FUNCTION public.sync_talent_profile_canonical_locations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_residence_country_id UUID;
  v_origin_country_id UUID;
BEGIN
  IF NEW.residence_city_id IS NULL AND NEW.location_id IS NOT NULL THEN
    NEW.residence_city_id := NEW.location_id;
  END IF;

  IF NEW.residence_city_id IS NOT NULL THEN
    NEW.location_id := NEW.residence_city_id;
    SELECT l.country_id INTO v_residence_country_id
    FROM public.locations l
    WHERE l.id = NEW.residence_city_id;
    IF v_residence_country_id IS NOT NULL THEN
      NEW.residence_country_id := v_residence_country_id;
    END IF;
  ELSIF NEW.location_id IS NULL THEN
    NEW.residence_country_id := NULL;
  END IF;

  IF NEW.origin_city_id IS NOT NULL THEN
    SELECT l.country_id INTO v_origin_country_id
    FROM public.locations l
    WHERE l.id = NEW.origin_city_id;
    IF v_origin_country_id IS NOT NULL THEN
      NEW.origin_country_id := v_origin_country_id;
    END IF;
  ELSIF NEW.origin_country_id IS NOT NULL AND NEW.origin_city_id IS NULL THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_talent_profiles_sync_canonical_locations ON public.talent_profiles;
CREATE TRIGGER tr_talent_profiles_sync_canonical_locations
BEFORE INSERT OR UPDATE ON public.talent_profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_talent_profile_canonical_locations();
UPDATE public.talent_profiles t
SET
  residence_city_id = coalesce(t.residence_city_id, t.location_id),
  residence_country_id = coalesce(t.residence_country_id, l.country_id),
  location_id = coalesce(t.location_id, t.residence_city_id, l.id),
  updated_at = now()
FROM public.locations l
WHERE l.id = coalesce(t.location_id, t.residence_city_id)
  AND (
    t.residence_city_id IS DISTINCT FROM coalesce(t.location_id, t.residence_city_id)
    OR t.residence_country_id IS DISTINCT FROM l.country_id
    OR t.location_id IS DISTINCT FROM coalesce(t.location_id, t.residence_city_id)
  );
CREATE OR REPLACE FUNCTION public.complete_talent_onboarding_with_locations(
  p_residence_country_iso2 TEXT,
  p_residence_country_name_en TEXT,
  p_residence_country_name_es TEXT,
  p_residence_city_slug TEXT,
  p_residence_city_name_en TEXT,
  p_residence_city_name_es TEXT,
  p_residence_lat DOUBLE PRECISION DEFAULT NULL,
  p_residence_lng DOUBLE PRECISION DEFAULT NULL,
  p_origin_country_iso2 TEXT DEFAULT NULL,
  p_origin_country_name_en TEXT DEFAULT NULL,
  p_origin_country_name_es TEXT DEFAULT NULL,
  p_origin_city_slug TEXT DEFAULT NULL,
  p_origin_city_name_en TEXT DEFAULT NULL,
  p_origin_city_name_es TEXT DEFAULT NULL,
  p_origin_lat DOUBLE PRECISION DEFAULT NULL,
  p_origin_lng DOUBLE PRECISION DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  uid UUID := auth.uid();
  v_count INT;
  v_residence_country_id UUID;
  v_residence_city_id UUID;
  v_origin_country_id UUID;
  v_origin_city_id UUID;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT country_id, city_id
  INTO v_residence_country_id, v_residence_city_id
  FROM public.ensure_city_location(
    p_residence_country_iso2,
    p_residence_country_name_en,
    p_residence_country_name_es,
    p_residence_city_slug,
    p_residence_city_name_en,
    p_residence_city_name_es,
    p_residence_lat,
    p_residence_lng,
    NULL
  );

  IF nullif(trim(coalesce(p_origin_country_iso2, '')), '') IS NOT NULL
     AND nullif(trim(coalesce(p_origin_city_name_en, '')), '') IS NOT NULL THEN
    SELECT country_id, city_id
    INTO v_origin_country_id, v_origin_city_id
    FROM public.ensure_city_location(
      p_origin_country_iso2,
      p_origin_country_name_en,
      p_origin_country_name_es,
      p_origin_city_slug,
      p_origin_city_name_en,
      p_origin_city_name_es,
      p_origin_lat,
      p_origin_lng,
      NULL
    );
  END IF;

  UPDATE public.profiles
  SET
    app_role = 'talent'::public.app_role,
    account_status = 'active'::public.account_status,
    onboarding_completed_at = now(),
    updated_at = now()
  WHERE id = uid AND account_status = 'onboarding'::public.account_status;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  INSERT INTO public.talent_profiles (
    user_id,
    profile_code,
    display_name,
    workflow_status,
    visibility,
    location_id,
    residence_country_id,
    residence_city_id,
    origin_country_id,
    origin_city_id
  )
  VALUES (
    uid,
    public.generate_profile_code(),
    (SELECT display_name FROM public.profiles WHERE id = uid),
    'draft',
    'hidden',
    v_residence_city_id,
    v_residence_country_id,
    v_residence_city_id,
    v_origin_country_id,
    v_origin_city_id
  )
  RETURNING id INTO tid;

  RETURN tid;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_country(TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_city_location(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION, BIGINT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_talent_onboarding_with_locations(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DOUBLE PRECISION, DOUBLE PRECISION
) TO authenticated;
COMMIT;
