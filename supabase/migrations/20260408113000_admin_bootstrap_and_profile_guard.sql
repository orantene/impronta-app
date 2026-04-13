BEGIN;
-- Prevent regular users from changing their own role/status fields directly.
CREATE OR REPLACE FUNCTION public.guard_profile_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  IF auth.uid() = OLD.id AND NOT public.is_agency_staff() THEN
    NEW.app_role := OLD.app_role;
    NEW.account_status := OLD.account_status;
    NEW.onboarding_completed_at := OLD.onboarding_completed_at;
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS profiles_self_update_guard ON public.profiles;
CREATE TRIGGER profiles_self_update_guard
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE PROCEDURE public.guard_profile_self_update();
-- Bootstrap requested staff/admin account once the auth user exists.
UPDATE public.profiles
SET
  app_role = 'super_admin'::public.app_role,
  account_status = 'active'::public.account_status,
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'orantene@gmail.com'
);
-- Bootstrap requested talent/model account once the auth user exists.
UPDATE public.profiles
SET
  app_role = 'talent'::public.app_role,
  account_status = 'active'::public.account_status,
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'orantenemx@gmail.com'
);
INSERT INTO public.talent_profiles (
  user_id,
  profile_code,
  display_name,
  workflow_status,
  visibility
)
SELECT
  p.id,
  public.generate_profile_code(),
  p.display_name,
  'draft'::public.profile_workflow_status,
  'hidden'::public.visibility
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.talent_profiles tp
  ON tp.user_id = p.id
  AND tp.deleted_at IS NULL
WHERE lower(u.email) = 'orantenemx@gmail.com'
  AND tp.id IS NULL;
COMMIT;
