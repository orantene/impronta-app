BEGIN;
ALTER TABLE public.profiles
  ALTER COLUMN app_role DROP DEFAULT,
  ALTER COLUMN app_role DROP NOT NULL;
CREATE OR REPLACE FUNCTION public.bootstrap_profile_from_auth_email(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_email TEXT;
BEGIN
  SELECT lower(email)
  INTO user_email
  FROM auth.users
  WHERE id = p_user_id;

  IF user_email IS NULL THEN
    RETURN;
  END IF;

  IF user_email = 'orantene@gmail.com' THEN
    UPDATE public.profiles
    SET
      app_role = 'super_admin'::public.app_role,
      account_status = 'active'::public.account_status,
      onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
      updated_at = now()
    WHERE id = p_user_id;
  END IF;
END;
$$;
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
    NULL,
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

  PERFORM public.bootstrap_profile_from_auth_email(NEW.id);

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
    NULL,
    'onboarding'
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.bootstrap_profile_from_auth_email(auth_user.id);

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
      WHEN public.profiles.account_status = 'suspended' THEN 'suspended'::public.account_status
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN 'active'::public.account_status
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN 'active'::public.account_status
      ELSE 'onboarding'::public.account_status
    END,
    onboarding_completed_at = CASE
      WHEN public.profiles.account_status = 'suspended' THEN public.profiles.onboarding_completed_at
      WHEN public.profiles.app_role IN ('super_admin', 'agency_staff') THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'talent' AND has_talent_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      WHEN public.profiles.app_role = 'client' AND has_client_profile THEN COALESCE(public.profiles.onboarding_completed_at, now())
      ELSE NULL
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
CREATE OR REPLACE FUNCTION public.complete_talent_onboarding()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid UUID;
  uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET
    app_role = 'talent'::public.app_role,
    account_status = 'active'::public.account_status,
    onboarding_completed_at = now(),
    updated_at = now()
  WHERE id = uid
    AND account_status IN ('registered'::public.account_status, 'onboarding'::public.account_status);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  SELECT tp.id
  INTO tid
  FROM public.talent_profiles tp
  WHERE tp.user_id = uid
    AND tp.deleted_at IS NULL
  LIMIT 1;

  IF tid IS NULL THEN
    INSERT INTO public.talent_profiles (
      user_id,
      profile_code,
      display_name,
      workflow_status,
      visibility
    )
    VALUES (
      uid,
      public.generate_profile_code(),
      (SELECT display_name FROM public.profiles WHERE id = uid),
      'draft',
      'hidden'
    )
    RETURNING id INTO tid;
  END IF;

  IF v_count = 0 AND tid IS NULL THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  RETURN tid;
END;
$$;
CREATE OR REPLACE FUNCTION public.complete_client_onboarding()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid UUID := auth.uid();
  v_count INT;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET
    app_role = 'client'::public.app_role,
    account_status = 'active'::public.account_status,
    onboarding_completed_at = now(),
    updated_at = now()
  WHERE id = uid
    AND account_status IN ('registered'::public.account_status, 'onboarding'::public.account_status);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  INSERT INTO public.client_profiles (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
UPDATE public.profiles p
SET
  app_role = NULL,
  account_status = 'onboarding'::public.account_status,
  onboarding_completed_at = NULL,
  updated_at = now()
WHERE p.app_role = 'client'
  AND p.account_status IN ('registered'::public.account_status, 'onboarding'::public.account_status)
  AND NOT EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.user_id = p.id
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.user_id = p.id
      AND tp.deleted_at IS NULL
  );
UPDATE public.profiles p
SET
  app_role = NULL,
  account_status = 'onboarding'::public.account_status,
  onboarding_completed_at = NULL,
  updated_at = now()
WHERE p.id IN (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'orantenemx@gmail.com'
)
  AND EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.user_id = p.id
      AND tp.deleted_at IS NULL
      AND tp.workflow_status = 'draft'::public.profile_workflow_status
      AND tp.visibility = 'hidden'::public.visibility
      AND COALESCE(tp.profile_completeness_score, 0) = 0
      AND tp.first_name IS NULL
      AND tp.last_name IS NULL
      AND tp.short_bio IS NULL
      AND tp.height_cm IS NULL
      AND tp.gender IS NULL
  );
UPDATE public.talent_profiles tp
SET
  deleted_at = COALESCE(tp.deleted_at, now()),
  updated_at = now()
WHERE tp.user_id IN (
  SELECT p.id
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE lower(u.email) = 'orantenemx@gmail.com'
    AND p.app_role IS NULL
    AND p.account_status = 'onboarding'::public.account_status
)
  AND tp.deleted_at IS NULL
  AND tp.workflow_status = 'draft'::public.profile_workflow_status
  AND tp.visibility = 'hidden'::public.visibility
  AND COALESCE(tp.profile_completeness_score, 0) = 0
  AND tp.first_name IS NULL
  AND tp.last_name IS NULL
  AND tp.short_bio IS NULL
  AND tp.height_cm IS NULL
  AND tp.gender IS NULL;
UPDATE public.profiles p
SET
  account_status = CASE
    WHEN p.account_status = 'suspended'::public.account_status THEN 'suspended'::public.account_status
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
    WHEN p.account_status = 'suspended'::public.account_status THEN p.onboarding_completed_at
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
    ELSE NULL
  END,
  updated_at = now()
WHERE p.account_status <> 'suspended'::public.account_status;
INSERT INTO public.client_profiles (user_id)
SELECT p.id
FROM public.profiles p
LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
WHERE p.app_role = 'client'
  AND p.account_status = 'active'
  AND cp.user_id IS NULL;
SELECT public.bootstrap_profile_from_auth_email(id)
FROM auth.users
WHERE lower(email) = 'orantene@gmail.com';
COMMIT;
