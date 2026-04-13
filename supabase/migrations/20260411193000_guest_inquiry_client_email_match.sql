BEGIN;
CREATE OR REPLACE FUNCTION public.find_auth_user_identity_by_email(p_email TEXT)
RETURNS TABLE (
  user_id UUID,
  app_role public.app_role,
  account_status public.account_status,
  display_name TEXT,
  has_client_profile BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    u.id AS user_id,
    p.app_role,
    p.account_status,
    p.display_name,
    EXISTS (
      SELECT 1
      FROM public.client_profiles cp
      WHERE cp.user_id = u.id
    ) AS has_client_profile
  FROM auth.users u
  LEFT JOIN public.profiles p
    ON p.id = u.id
  WHERE lower(u.email) = lower(trim(p_email))
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.find_auth_user_identity_by_email(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_auth_user_identity_by_email(TEXT) TO service_role;
COMMIT;
