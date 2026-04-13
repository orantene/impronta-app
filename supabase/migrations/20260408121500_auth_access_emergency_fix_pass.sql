BEGIN;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, app_role, account_status)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(NEW.email, '@', 1)
    ),
    'client',
    'onboarding'
  )
  ON CONFLICT (id) DO UPDATE
  SET
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    account_status = CASE
      WHEN public.profiles.account_status = 'registered' THEN 'onboarding'::public.account_status
      ELSE public.profiles.account_status
    END,
    updated_at = now();

  RETURN NEW;
END;
$$;
CREATE OR REPLACE FUNCTION public.ensure_profile_for_current_user()
RETURNS public.profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  auth_user auth.users%ROWTYPE;
  profile_row public.profiles%ROWTYPE;
  has_client_profile BOOLEAN := FALSE;
  has_talent_profile BOOLEAN := FALSE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT *
  INTO auth_user
  FROM auth.users
  WHERE id = auth.uid();

  IF auth_user.id IS NULL THEN
    RAISE EXCEPTION 'Auth user missing';
  END IF;

  INSERT INTO public.profiles (id, display_name, app_role, account_status)
  VALUES (
    auth_user.id,
    COALESCE(
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'name',
      split_part(auth_user.email, '@', 1)
    ),
    'client',
    'onboarding'
  )
  ON CONFLICT (id) DO NOTHING;

  SELECT EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.user_id = auth.uid()
  ) INTO has_client_profile;

  SELECT EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.user_id = auth.uid()
      AND tp.deleted_at IS NULL
  ) INTO has_talent_profile;

  UPDATE public.profiles
  SET
    display_name = COALESCE(
      public.profiles.display_name,
      auth_user.raw_user_meta_data ->> 'full_name',
      auth_user.raw_user_meta_data ->> 'name',
      split_part(auth_user.email, '@', 1)
    ),
    account_status = CASE
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN 'active'::public.account_status
      WHEN public.profiles.account_status = 'registered' THEN 'onboarding'::public.account_status
      ELSE public.profiles.account_status
    END,
    onboarding_completed_at = CASE
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      ELSE public.profiles.onboarding_completed_at
    END,
    updated_at = now()
  WHERE public.profiles.id = auth.uid();

  SELECT *
  INTO profile_row
  FROM public.profiles
  WHERE id = auth.uid();

  RETURN profile_row;
END;
$$;
GRANT EXECUTE ON FUNCTION public.ensure_profile_for_current_user() TO authenticated;
UPDATE public.profiles p
SET
  account_status = CASE
    WHEN p.app_role IN ('super_admin', 'agency_staff') THEN 'active'::public.account_status
    WHEN p.app_role = 'talent'
      AND EXISTS (
        SELECT 1
        FROM public.talent_profiles tp
        WHERE tp.user_id = p.id
          AND tp.deleted_at IS NULL
      ) THEN 'active'::public.account_status
    WHEN p.app_role = 'client'
      AND EXISTS (
        SELECT 1
        FROM public.client_profiles cp
        WHERE cp.user_id = p.id
      ) THEN 'active'::public.account_status
    ELSE 'onboarding'::public.account_status
  END,
  onboarding_completed_at = CASE
    WHEN p.app_role IN ('super_admin', 'agency_staff') THEN COALESCE(p.onboarding_completed_at, now())
    WHEN p.app_role = 'talent'
      AND EXISTS (
        SELECT 1
        FROM public.talent_profiles tp
        WHERE tp.user_id = p.id
          AND tp.deleted_at IS NULL
      ) THEN COALESCE(p.onboarding_completed_at, now())
    WHEN p.app_role = 'client'
      AND EXISTS (
        SELECT 1
        FROM public.client_profiles cp
        WHERE cp.user_id = p.id
      ) THEN COALESCE(p.onboarding_completed_at, now())
    ELSE p.onboarding_completed_at
  END,
  updated_at = now()
WHERE p.account_status = 'registered';
INSERT INTO public.client_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
WHERE p.app_role = 'client'
  AND p.account_status = 'active'
  AND cp.user_id IS NULL;
COMMIT;
