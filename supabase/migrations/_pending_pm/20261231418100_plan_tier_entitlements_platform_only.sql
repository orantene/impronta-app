-- 20261231418100_plan_tier_entitlements_platform_only.sql
--
-- HELD (supabase/migrations/_pending_pm/). NOT APPLIED ANYWHERE. TUL-1269 M1,
-- package E6 (CALCULATION: plan tier and entitlements decide what a workspace
-- pays for and gets). PM moves it into supabase/migrations/ and pushes it
-- through the migration gate. Independent of 20261231418000 (either order).
--
-- PROBLEM (code reading, 20260602100100_saas_p2_rls_tenant_scoped.sql:38-63):
--   agencies and agency_entitlements were FOR ALL is_staff_of_tenant(), so any
--   member (viewer included) could through PostgREST directly:
--     * set agencies.plan_tier = 'network' and talent_seat_limit = NULL
--       (every paid feature and unlimited seats without paying),
--     * un-suspend their own workspace (status / suspended_*),
--     * repoint agencies.stripe_account_id at another Connect account
--       (workspace payouts go to that account),
--     * insert / update / delete agency_entitlements rows.
--
-- FIX (idempotent, one transaction):
--   A. BEFORE UPDATE trigger agencies_protect_platform_columns: the platform-owned
--      columns below cannot change from a direct authenticated/anon session
--      unless the caller is a platform admin. SECURITY INVOKER on purpose (same
--      shape as profiles_protect_role_status in 20261231415400): current_user is
--      the caller's role for a direct PostgREST write, but the function owner
--      inside SECURITY DEFINER functions (reconcile_expired_plan_overrides) and
--      'service_role' for our server, so those sanctioned writers keep working.
--   B. agency_entitlements: staff keep SELECT; INSERT/UPDATE/DELETE are
--      platform-admin only (service role bypasses RLS).
--
-- PROTECTED agencies COLUMNS and their writers (grep, 2026-10-19), all service
-- role or platform admin after this PR:
--   plan_tier, talent_seat_limit   lib/stripe/workspace-billing.ts (webhook),
--       cancel-subscription.ts, apply-campaign-grant.ts, platform tenant actions,
--       reconcile_expired_plan_overrides (DEFINER), and - CHANGED IN THIS PR from
--       the member session to the service role after their own owner-only check -
--       admin-billing.ts changeWorkspacePlan and admin-plan-downgrade.ts
--       commitPlanDowngrade. DEPLOY THE CODE BEFORE APPLYING THIS FILE, or those
--       two actions fail with 42501 until the code ships.
--   status, suspended_at, suspended_reason   workspace-lifecycle.ts,
--       account/deletion.ts, platform tenant actions (all service role).
--   stripe_account_*, stripe_*_enabled, stripe_details_submitted,
--       stripe_account_synced_at   lib/payments/stripe-connect.ts (service role).
--
-- ROLLBACK:
--   BEGIN;
--   DROP TRIGGER IF EXISTS agencies_protect_platform_columns ON public.agencies;
--   DROP FUNCTION IF EXISTS public.agencies_protect_platform_columns();
--   DROP POLICY IF EXISTS agency_entitlements_staff_read          ON public.agency_entitlements;
--   DROP POLICY IF EXISTS agency_entitlements_platform_admin_write ON public.agency_entitlements;
--   CREATE POLICY agency_entitlements_tenant_staff ON public.agency_entitlements FOR ALL
--     USING (public.is_staff_of_tenant(tenant_id)) WITH CHECK (public.is_staff_of_tenant(tenant_id));
--   COMMIT;
--
-- READ-ONLY VERIFICATION (after apply):
--   SELECT tgname, tgenabled FROM pg_trigger
--    WHERE tgrelid = 'public.agencies'::regclass AND tgname = 'agencies_protect_platform_columns';
--   -- expect: one row, tgenabled 'O'
--   SELECT policyname, cmd FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'agency_entitlements' ORDER BY 1;
--   -- expect: agency_entitlements_platform_admin_write (ALL), agency_entitlements_staff_read (SELECT)
--
-- ROLLED-BACK HARNESS (staging only; :tenant = a fixture workspace, :owner = its
-- OWNER (not a platform admin); never TAL-93938 / TUL-52):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
--   UPDATE public.agencies SET plan_tier = 'network' WHERE id = :'tenant';
--   -- expect: ERROR 42501 agencies platform-owned columns ...
--   UPDATE public.agencies SET talent_seat_limit = NULL WHERE id = :'tenant';
--   -- expect: ERROR 42501
--   UPDATE public.agencies SET stripe_account_id = 'acct_test_x' WHERE id = :'tenant';
--   -- expect: ERROR 42501
--   UPDATE public.agencies SET display_name = display_name WHERE id = :'tenant';
--   -- expect: 1 row (ordinary settings still work)
--   UPDATE public.agency_entitlements SET ai_enabled = NOT ai_enabled WHERE tenant_id = :'tenant';
--   -- expect: 0 rows
--   SELECT count(*) FROM public.agency_entitlements WHERE tenant_id = :'tenant';
--   -- expect: same count as before (reads unchanged)
--   RESET ROLE;
--   SET LOCAL ROLE service_role;
--   UPDATE public.agencies SET plan_tier = plan_tier WHERE id = :'tenant';
--   -- expect: 1 row (server path unchanged)
--   ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------------
-- A. Platform-owned agencies columns.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.agencies_protect_platform_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (
          NEW.plan_tier                IS DISTINCT FROM OLD.plan_tier
       OR NEW.talent_seat_limit        IS DISTINCT FROM OLD.talent_seat_limit
       OR NEW.status                   IS DISTINCT FROM OLD.status
       OR NEW.suspended_at             IS DISTINCT FROM OLD.suspended_at
       OR NEW.suspended_reason         IS DISTINCT FROM OLD.suspended_reason
       OR NEW.stripe_account_id        IS DISTINCT FROM OLD.stripe_account_id
       OR NEW.stripe_account_platform  IS DISTINCT FROM OLD.stripe_account_platform
       OR NEW.stripe_account_status    IS DISTINCT FROM OLD.stripe_account_status
       OR NEW.stripe_charges_enabled   IS DISTINCT FROM OLD.stripe_charges_enabled
       OR NEW.stripe_payouts_enabled   IS DISTINCT FROM OLD.stripe_payouts_enabled
       OR NEW.stripe_details_submitted IS DISTINCT FROM OLD.stripe_details_submitted
       OR NEW.stripe_account_synced_at IS DISTINCT FROM OLD.stripe_account_synced_at
     )
     AND NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'agencies platform-owned columns (plan, seats, status, Stripe account) can only be changed by the platform'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.agencies_protect_platform_columns() IS
  'BEFORE UPDATE guard on agencies: plan_tier, talent_seat_limit, status, suspended_*, stripe_* change only via service role, SECURITY DEFINER functions or a platform admin (TUL-1269 M1).';

DROP TRIGGER IF EXISTS agencies_protect_platform_columns ON public.agencies;
CREATE TRIGGER agencies_protect_platform_columns
  BEFORE UPDATE ON public.agencies
  FOR EACH ROW EXECUTE FUNCTION public.agencies_protect_platform_columns();

-- ---------------------------------------------------------------------------
-- B. agency_entitlements: read for staff, write for platform admins only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_entitlements_tenant_staff ON public.agency_entitlements;

DROP POLICY IF EXISTS agency_entitlements_staff_read ON public.agency_entitlements;
CREATE POLICY agency_entitlements_staff_read ON public.agency_entitlements
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_entitlements_platform_admin_write ON public.agency_entitlements;
CREATE POLICY agency_entitlements_platform_admin_write ON public.agency_entitlements
  FOR ALL TO authenticated
  USING      (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.agencies'::regclass
       AND tgname = 'agencies_protect_platform_columns'
  ) THEN
    RAISE EXCEPTION 'E6 M1: agencies_protect_platform_columns trigger missing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'agency_entitlements'
       AND policyname = 'agency_entitlements_tenant_staff'
  ) THEN
    RAISE EXCEPTION 'E6 M1: role-blind agency_entitlements policy survived';
  END IF;
END $$;

COMMIT;
