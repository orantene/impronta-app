-- T1-04 B: the four tables of 20261230002200 had RLS ON and ZERO policies.
--
-- Timestamp sorts after 20261230002300. Not a calendar 2026-09 date: these
-- tables are created at 20261230002200 and a calendar-dated file would sort
-- before them on a replay from zero.
--
-- WHY THIS IS NOT MERELY UNTIDY. `ENABLE ROW LEVEL SECURITY` with no policy
-- denies everything to a policy-bound role, which reads as "closed" and is why
-- it slipped through review. But Supabase grants table privileges to `anon`
-- and `authenticated` on every new table, and the SERVICE ROLE bypasses RLS
-- entirely, so the actual state was: nobody could read anything, every write
-- path had to be service-role, and the grants sat there waiting for the first
-- person to add a permissive policy for one purpose and hand it to every
-- tenant. The pattern that has already cost this repo real holes is a REVOKE
-- that never happened next to an RLS flag that looked like it had.
--
-- So each table gets the same shape as `orders`: a tenant-staff SELECT policy,
-- writes revoked from anon and authenticated, service_role granted, anon SELECT
-- revoked outright. `entitlement_credits` additionally gets the customer's own
-- read, mirroring `orders_customer_select` (20261228000142) because it is the
-- same question: does this authenticated user own the customer row this row
-- hangs off.

BEGIN;

-- ── tax_categories ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tax_categories_staff_select ON public.tax_categories;
CREATE POLICY tax_categories_staff_select ON public.tax_categories
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.tax_categories FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.tax_categories FROM anon;
GRANT SELECT ON public.tax_categories TO authenticated;
GRANT ALL ON public.tax_categories TO service_role;

-- ── catalog_modifier_groups ────────────────────────────────────────────────

DROP POLICY IF EXISTS catalog_modifier_groups_staff_select ON public.catalog_modifier_groups;
CREATE POLICY catalog_modifier_groups_staff_select ON public.catalog_modifier_groups
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.catalog_modifier_groups FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.catalog_modifier_groups FROM anon;
GRANT SELECT ON public.catalog_modifier_groups TO authenticated;
GRANT ALL ON public.catalog_modifier_groups TO service_role;

-- ── catalog_modifiers ──────────────────────────────────────────────────────
-- Carries its own tenant_id (not only group_id), so the predicate is the same
-- one and does not need a join that RLS would evaluate per row.

DROP POLICY IF EXISTS catalog_modifiers_staff_select ON public.catalog_modifiers;
CREATE POLICY catalog_modifiers_staff_select ON public.catalog_modifiers
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.catalog_modifiers FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.catalog_modifiers FROM anon;
GRANT SELECT ON public.catalog_modifiers TO authenticated;
GRANT ALL ON public.catalog_modifiers TO service_role;

-- ── entitlement_credits ────────────────────────────────────────────────────
-- Staff of the tenant, plus the customer whose credit it is. The second policy
-- is `orders_customer_select` with the table name changed: a credit is only
-- spendable by the person it belongs to, so that person must be able to see it.

DROP POLICY IF EXISTS entitlement_credits_staff_select ON public.entitlement_credits;
CREATE POLICY entitlement_credits_staff_select ON public.entitlement_credits
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS entitlement_credits_customer_select ON public.entitlement_credits;
CREATE POLICY entitlement_credits_customer_select ON public.entitlement_credits
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.customers c
     WHERE c.id = entitlement_credits.customer_id AND c.user_id = auth.uid()
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.entitlement_credits FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.entitlement_credits FROM anon;
GRANT SELECT ON public.entitlement_credits TO authenticated;
GRANT ALL ON public.entitlement_credits TO service_role;

-- ── Assert the grants actually took. A green apply has lied here before. ───

DO $check$
DECLARE
  v_table text;
  v_missing int;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'tax_categories', 'catalog_modifier_groups', 'catalog_modifiers', 'entitlement_credits'
  ] LOOP
    IF has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       OR has_table_privilege('anon', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || v_table, 'DELETE') THEN
      RAISE EXCEPTION '%: a revoke did not take, client roles still hold anon-read or write access', v_table;
    END IF;

    IF NOT has_table_privilege('authenticated', 'public.' || v_table, 'SELECT') THEN
      RAISE EXCEPTION '%: authenticated cannot SELECT, so the staff policy can never be reached', v_table;
    END IF;

    IF NOT has_table_privilege('service_role', 'public.' || v_table, 'INSERT') THEN
      RAISE EXCEPTION '%: service_role cannot write, so nothing could ever be recorded', v_table;
    END IF;

    SELECT count(*) INTO v_missing
      FROM pg_policies
     WHERE schemaname = 'public' AND tablename = v_table;
    IF v_missing = 0 THEN
      RAISE EXCEPTION '%: row level security is on with no policy, which denies every read', v_table;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname = v_table AND c.relrowsecurity
    ) THEN
      RAISE EXCEPTION '%: row level security is OFF, so the policies are decoration', v_table;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'entitlement_credits'
       AND policyname = 'entitlement_credits_customer_select'
  ) THEN
    RAISE EXCEPTION 'entitlement_credits: the customer read policy is missing';
  END IF;

  RAISE NOTICE 'PROOF PASS: four tables carry a staff policy, an anon revoke, and a service_role grant';
END
$check$;

COMMIT;
