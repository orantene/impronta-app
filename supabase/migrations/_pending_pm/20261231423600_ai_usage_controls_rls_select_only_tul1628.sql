-- TUL-1628 (security): workspace staff must not write their own AI usage or AI spend-cap rows.
--
-- HELD: lives in _pending_pm until the Production Migration Manager applies it after merge. NOT applied by the author.
--
-- 20260918000000_rls_staff_tenant_scope.sql created `ai_usage_monthly_staff` and `ai_tenant_controls_staff` as
-- FOR ALL TO authenticated with USING / WITH CHECK is_staff_of_tenant(tenant_id). Any signed-in staff member could
-- therefore reset their workspace's monthly AI spend or raise their own cap with a direct PostgREST call.
--
-- After this migration tenant staff can only READ their own workspace's rows. Every legitimate write already runs
-- on the service-role client (ai-provider-admin.ts, ai-usage-gate.ts increment_ai_usage_monthly, record-generation-usage),
-- and service_role bypasses RLS, so nothing in the app changes. No INSERT / UPDATE / DELETE policy is created for
-- authenticated, so those operations are denied; the table privileges are revoked as a second wall.
--
-- Idempotent. Rollback:
--   DROP POLICY ai_usage_monthly_staff_select ON public.ai_usage_monthly;
--   DROP POLICY ai_tenant_controls_staff_select ON public.ai_tenant_controls;
--   and re-create the two FOR ALL policies from 20260918000000 (only if staff writes must come back).

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.ai_tenant_controls') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_tenant_controls_staff ON public.ai_tenant_controls;
    DROP POLICY IF EXISTS ai_tenant_controls_staff_select ON public.ai_tenant_controls;
    CREATE POLICY ai_tenant_controls_staff_select ON public.ai_tenant_controls
      FOR SELECT
      TO authenticated
      USING (public.is_staff_of_tenant(tenant_id));
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_tenant_controls FROM authenticated;
  END IF;

  IF to_regclass('public.ai_usage_monthly') IS NOT NULL THEN
    DROP POLICY IF EXISTS ai_usage_monthly_staff ON public.ai_usage_monthly;
    DROP POLICY IF EXISTS ai_usage_monthly_staff_select ON public.ai_usage_monthly;
    CREATE POLICY ai_usage_monthly_staff_select ON public.ai_usage_monthly
      FOR SELECT
      TO authenticated
      USING (public.is_staff_of_tenant(tenant_id));
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.ai_usage_monthly FROM authenticated;
  END IF;
END
$$;

COMMIT;
