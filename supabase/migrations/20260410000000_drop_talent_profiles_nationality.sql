BEGIN;
-- Replace onboarding RPC without p_nationality / nationality column.
-- Drop every historical overload so we never leave duplicate signatures (PostgREST would fail to resolve).
DROP FUNCTION IF EXISTS public.complete_talent_onboarding_with_locations(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION
);
DROP FUNCTION IF EXISTS public.complete_talent_onboarding_with_locations(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT
);
DROP FUNCTION IF EXISTS public.complete_talent_onboarding_with_locations(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, DATE
);
CREATE OR REPLACE FUNCTION public.complete_talent_onboarding_with_locations(
  p_residence_country_iso2    TEXT,
  p_residence_country_name_en TEXT,
  p_residence_country_name_es TEXT,
  p_residence_city_slug       TEXT,
  p_residence_city_name_en    TEXT,
  p_residence_city_name_es    TEXT,
  p_residence_lat             DOUBLE PRECISION DEFAULT NULL,
  p_residence_lng             DOUBLE PRECISION DEFAULT NULL,
  p_origin_country_iso2       TEXT             DEFAULT NULL,
  p_origin_country_name_en    TEXT             DEFAULT NULL,
  p_origin_country_name_es    TEXT             DEFAULT NULL,
  p_origin_city_slug          TEXT             DEFAULT NULL,
  p_origin_city_name_en       TEXT             DEFAULT NULL,
  p_origin_city_name_es       TEXT             DEFAULT NULL,
  p_origin_lat                DOUBLE PRECISION DEFAULT NULL,
  p_origin_lng                DOUBLE PRECISION DEFAULT NULL,
  p_display_name              TEXT             DEFAULT NULL,
  p_first_name                TEXT             DEFAULT NULL,
  p_last_name                 TEXT             DEFAULT NULL,
  p_phone                     TEXT             DEFAULT NULL,
  p_gender                    TEXT             DEFAULT NULL,
  p_date_of_birth             DATE             DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid                   UUID;
  uid                   UUID := auth.uid();
  v_count               INT;
  v_residence_country_id UUID;
  v_residence_city_id   UUID;
  v_origin_country_id   UUID;
  v_origin_city_id      UUID;
  v_display_name        TEXT;
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
    app_role                 = 'talent'::public.app_role,
    account_status           = 'active'::public.account_status,
    onboarding_completed_at  = now(),
    updated_at               = now()
  WHERE id = uid AND account_status = 'onboarding'::public.account_status;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  v_display_name := nullif(trim(coalesce(p_display_name, '')), '');
  IF v_display_name IS NULL THEN
    SELECT display_name INTO v_display_name FROM public.profiles WHERE id = uid;
  END IF;

  INSERT INTO public.talent_profiles (
    user_id,
    profile_code,
    display_name,
    first_name,
    last_name,
    phone,
    gender,
    date_of_birth,
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
    v_display_name,
    nullif(trim(coalesce(p_first_name, '')), ''),
    nullif(trim(coalesce(p_last_name, '')), ''),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_gender, '')), ''),
    p_date_of_birth,
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
GRANT EXECUTE ON FUNCTION public.complete_talent_onboarding_with_locations(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT,
  DOUBLE PRECISION, DOUBLE PRECISION,
  TEXT, TEXT, TEXT, TEXT, TEXT, DATE
) TO authenticated;
ALTER TABLE public.talent_profiles
  DROP COLUMN IF EXISTS nationality;
COMMIT;
