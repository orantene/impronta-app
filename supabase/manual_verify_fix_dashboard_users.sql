-- Run this in Supabase SQL Editor as a privileged role.
-- Replace the client email before running the client section.

-- 0. Backfill missing profile rows for existing auth users
INSERT INTO public.profiles (
  id,
  display_name,
  app_role,
  account_status,
  created_at,
  updated_at
)
SELECT
  u.id,
  COALESCE(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    split_part(u.email, '@', 1)
  ),
  'client'::public.app_role,
  'onboarding'::public.account_status,
  now(),
  now()
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) IN (
  'orantene@gmail.com',
  'orantenemx@gmail.com',
  'client@example.com'
)
  AND p.id IS NULL;

-- 1. Verify current rows
SELECT
  u.email,
  p.id,
  p.app_role,
  p.account_status,
  p.onboarding_completed_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) IN (
  'orantene@gmail.com',
  'orantenemx@gmail.com',
  'client@example.com'
)
ORDER BY u.email;

-- 2. Fix admin
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

-- 3. Fix talent and ensure a live talent profile exists
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

-- 4. Fix client and ensure a client profile exists
UPDATE public.profiles
SET
  app_role = 'client'::public.app_role,
  account_status = 'active'::public.account_status,
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE id IN (
  SELECT id
  FROM auth.users
  WHERE lower(email) = 'client@example.com'
);

INSERT INTO public.client_profiles (user_id)
SELECT p.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
LEFT JOIN public.client_profiles cp ON cp.user_id = p.id
WHERE lower(u.email) = 'client@example.com'
  AND cp.user_id IS NULL;

-- 5. Verify final state
SELECT
  u.email,
  p.app_role,
  p.account_status,
  EXISTS (
    SELECT 1
    FROM public.talent_profiles tp
    WHERE tp.user_id = p.id
      AND tp.deleted_at IS NULL
  ) AS has_talent_profile,
  EXISTS (
    SELECT 1
    FROM public.client_profiles cp
    WHERE cp.user_id = p.id
  ) AS has_client_profile
FROM auth.users u
JOIN public.profiles p ON p.id = u.id
WHERE lower(u.email) IN (
  'orantene@gmail.com',
  'orantenemx@gmail.com',
  'client@example.com'
)
ORDER BY u.email;
