-- Auth onboarding: new users need role selection; RPCs to complete Talent / Client paths safely

BEGIN;
-- New signups land in onboarding until they choose Talent or Client
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
  );
  RETURN NEW;
END;
$$;
CREATE SEQUENCE IF NOT EXISTS public.talent_profile_code_seq START WITH 1;
CREATE OR REPLACE FUNCTION public.generate_profile_code()
RETURNS TEXT
LANGUAGE sql
AS $$
  SELECT 'TAL-' || lpad(nextval('public.talent_profile_code_seq')::text, 5, '0');
$$;
CREATE UNIQUE INDEX IF NOT EXISTS idx_talent_profiles_one_live_user
  ON public.talent_profiles (user_id)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;
-- Allow authenticated users to create their own talent row (onboarding / claim flows)
CREATE POLICY talent_insert_self ON public.talent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
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
  WHERE id = uid AND account_status = 'onboarding'::public.account_status;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'Invalid onboarding state';
  END IF;

  INSERT INTO public.client_profiles (user_id)
  VALUES (uid)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_talent_onboarding() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_client_onboarding() TO authenticated;
COMMIT;
