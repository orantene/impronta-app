-- TUL-669: client accounts stuck in 'onboarding' (backfill, NOT yet applied).
--
-- ensure_profile_for_current_user() recomputes profiles.account_status on
-- every request: a client stays 'active' only while a client_profiles row
-- exists. The guest-booker activation (TUL-465) set 'active' without creating
-- that row, so the next page load put the client back to 'onboarding'. The
-- code fix creates the row; this file repairs existing accounts with the same
-- rule the code now uses, so nothing changes for anyone the code would not
-- have activated:
--   1. a confirmed-email client who owns at least one inquiry, or is already
--      'active', gets a client_profiles row (so the RPC keeps them active);
--   2. every non-suspended client with a client_profiles row becomes 'active'.
-- Unconfirmed guest shadow accounts with no row stay 'onboarding' on purpose
-- (the claim flow relies on that). Runs with no auth.uid(), so
-- guard_profile_self_update does not fire. Idempotent.
BEGIN;

INSERT INTO public.client_profiles (user_id)
SELECT p.id
FROM public.profiles p
JOIN auth.users u ON u.id = p.id
WHERE p.app_role = 'client'
  AND p.account_status <> 'suspended'
  AND u.email_confirmed_at IS NOT NULL
  AND (
    p.account_status = 'active'
    OR EXISTS (SELECT 1 FROM public.inquiries i WHERE i.client_user_id = p.id)
  )
  AND NOT EXISTS (SELECT 1 FROM public.client_profiles cp WHERE cp.user_id = p.id)
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.profiles p
SET account_status = 'active',
    onboarding_completed_at = COALESCE(p.onboarding_completed_at, now()),
    updated_at = now()
WHERE p.app_role = 'client'
  AND p.account_status = 'onboarding'
  AND EXISTS (SELECT 1 FROM public.client_profiles cp WHERE cp.user_id = p.id);

COMMIT;
