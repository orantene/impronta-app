-- Self-serve workspace signup tracking.
--
-- Marketing signups now have a direct Free-plan path: the lead captured on
-- /get-started can be claimed by the registering operator account and
-- provisioned into a real workspace automatically.
--
-- These additive columns let the app bind a lead to:
--   - the auth/profile row that claimed it
--   - the tenant that was provisioned from it
--   - the timestamp of that claim
--
-- The existing `status='onboarded'` value remains the lifecycle marker; this
-- migration avoids introducing a parallel state machine for the first
-- self-serve slice.

BEGIN;

ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS claimed_by_profile_id UUID
    REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS provisioned_tenant_id UUID
    REFERENCES public.agencies(id) ON DELETE SET NULL;

ALTER TABLE public.saas_marketing_signups
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.saas_marketing_signups.claimed_by_profile_id IS
  'Operator auth/profile row that converted this marketing lead into a real workspace signup.';

COMMENT ON COLUMN public.saas_marketing_signups.provisioned_tenant_id IS
  'Workspace created (or re-used) when the lead completed self-serve signup.';

COMMENT ON COLUMN public.saas_marketing_signups.claimed_at IS
  'When the lead was claimed by an authenticated operator account.';

CREATE INDEX IF NOT EXISTS saas_marketing_signups_claimed_by_idx
  ON public.saas_marketing_signups (claimed_by_profile_id)
  WHERE claimed_by_profile_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS saas_marketing_signups_provisioned_tenant_idx
  ON public.saas_marketing_signups (provisioned_tenant_id)
  WHERE provisioned_tenant_id IS NOT NULL;

COMMIT;
