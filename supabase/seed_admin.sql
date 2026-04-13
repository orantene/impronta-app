-- Run in the Supabase SQL editor as a privileged role after the auth user exists.
-- This targets the requested production/staging admin account directly.

UPDATE public.profiles
SET
  app_role = 'super_admin',
  account_status = 'active',
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'orantene@gmail.com'
);
