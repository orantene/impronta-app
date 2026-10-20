-- 20261231418000_tenant_admin_tables_role_aware_rls.sql
--
-- HELD (supabase/migrations/_pending_pm/). NOT APPLIED ANYWHERE. TUL-1269 item 5,
-- package E6 (permission). PM moves it into supabase/migrations/ and pushes it
-- through the migration gate (staging first, then production with Oran's yes).
--
-- PROBLEM (code reading, 20260602100100_saas_p2_rls_tenant_scoped.sql:38-63):
--   agencies, agency_memberships and agency_domains each had ONE policy,
--   FOR ALL USING/WITH CHECK public.is_staff_of_tenant(<tenant>). That helper
--   ignores the member's role and also admits status 'pending_acceptance'. So
--   any member, including a viewer or someone who has not accepted an invite
--   yet, could through PostgREST directly:
--     * PATCH their own agency_memberships row to role 'owner',
--     * rewrite or delete any other member (owner included),
--     * delete the agencies row, or add / repoint agency_domains rows.
--
-- FIX (idempotent, one transaction):
--   1. public.caller_has_active_tenant_role(tenant, roles[]): platform admin, or
--      an ACTIVE membership holding one of the roles. pending_acceptance never
--      counts for writes.
--   2. Reads are unchanged: each table keeps a FOR SELECT is_staff_of_tenant()
--      policy, so pending invitees keep the read surface they had (invite
--      preview). agency_memberships_self_select and
--      agency_domains_public_active_select are not touched.
--   3. agency_memberships writes: platform admin, or an ACTIVE owner/admin, and
--      then only on SOMEONE ELSE's row that is not (and does not become) an
--      owner row, with a team role (no owner, no hub roles). So nobody raises
--      their own role, and ownership moves only through the platform /
--      transfer path.
--   4. agency_domains writes: ACTIVE owner/admin (the app further narrows custom
--      domains to the owner via manage_agency_domains).
--   5. agencies: UPDATE by ACTIVE non-viewer members (viewer is read-only in the
--      capability model, lib/access/roles.ts); INSERT / DELETE platform admin
--      only. Which columns a member may change is narrowed by the M1 trigger in
--      20261231418100 (plan tier, seats, status, Stripe account).
--
-- WHO WRITES THESE TABLES TODAY (grep, 2026-10-19) - nothing below loses access:
--   agency_memberships: every app writer uses the service role
--     (team-management.ts, team-invite/[id]/route.ts, workspace-lifecycle.ts,
--     workspace-signup.server.ts, talent-workspace-provision.ts, platform admin
--     actions). No SECURITY INVOKER SQL function writes it.
--   agency_domains: settings/domain-actions.ts on the member's session after
--     requireCapability('manage_agency_domains') (owner); everything else is
--     service role (alternate-domain.ts, ensure-workspace-domain.ts, cron).
--   agencies: member-session writers are settings actions gated on staff roles
--     (owner/admin/manager/editor); plan/billing/lifecycle/Stripe writers are
--     service role. Trigger-side writers (sync_agency_takes_reservations,
--     pos_set_custom_amount_limit, reconcile_expired_plan_overrides) are
--     SECURITY DEFINER and bypass RLS.
--
-- ROLLBACK (restores the exact pre-file policies):
--   BEGIN;
--   DROP POLICY IF EXISTS agency_memberships_staff_read     ON public.agency_memberships;
--   DROP POLICY IF EXISTS agency_memberships_manager_insert ON public.agency_memberships;
--   DROP POLICY IF EXISTS agency_memberships_manager_update ON public.agency_memberships;
--   DROP POLICY IF EXISTS agency_memberships_manager_delete ON public.agency_memberships;
--   CREATE POLICY agency_memberships_tenant_staff ON public.agency_memberships FOR ALL
--     USING (public.is_staff_of_tenant(tenant_id)) WITH CHECK (public.is_staff_of_tenant(tenant_id));
--   DROP POLICY IF EXISTS agencies_staff_read             ON public.agencies;
--   DROP POLICY IF EXISTS agencies_member_update          ON public.agencies;
--   DROP POLICY IF EXISTS agencies_platform_admin_insert  ON public.agencies;
--   DROP POLICY IF EXISTS agencies_platform_admin_delete  ON public.agencies;
--   CREATE POLICY agencies_tenant_staff ON public.agencies FOR ALL
--     USING (public.is_staff_of_tenant(id)) WITH CHECK (public.is_staff_of_tenant(id));
--   DROP POLICY IF EXISTS agency_domains_staff_read  ON public.agency_domains;
--   DROP POLICY IF EXISTS agency_domains_admin_write ON public.agency_domains;
--   CREATE POLICY agency_domains_tenant_staff ON public.agency_domains FOR ALL
--     USING (public.is_staff_of_tenant(tenant_id)) WITH CHECK (public.is_staff_of_tenant(tenant_id));
--   DROP FUNCTION IF EXISTS public.caller_has_active_tenant_role(uuid, text[]);
--   COMMIT;
--
-- READ-ONLY VERIFICATION (after apply):
--   SELECT tablename, policyname, cmd, roles FROM pg_policies
--    WHERE schemaname = 'public'
--      AND tablename IN ('agencies', 'agency_memberships', 'agency_domains')
--    ORDER BY 1, 2;
--   -- expect: no *_tenant_staff rows; *_staff_read (SELECT) + the write policies above.
--   SELECT has_function_privilege('anon', 'public.caller_has_active_tenant_role(uuid,text[])', 'EXECUTE');
--   -- expect: false
--
-- ROLLED-BACK HARNESS (staging only; fill the three ids from a staging fixture
-- workspace: :tenant, a VIEWER member :viewer, an OWNER member :owner; never
-- TAL-93938 / TUL-52):
--   BEGIN;
--   SET LOCAL ROLE authenticated;
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', :'viewer', 'role', 'authenticated')::text, true);
--   UPDATE public.agency_memberships SET role = 'owner'
--    WHERE tenant_id = :'tenant' AND profile_id = :'viewer';
--   -- expect: 0 rows (UPDATE 0)
--   UPDATE public.agency_memberships SET role = 'viewer'
--    WHERE tenant_id = :'tenant' AND profile_id = :'owner';
--   -- expect: 0 rows
--   INSERT INTO public.agency_memberships (tenant_id, profile_id, role, status)
--   VALUES (:'tenant', gen_random_uuid(), 'admin', 'active');
--   -- expect: ERROR new row violates row-level security policy
--   DELETE FROM public.agencies WHERE id = :'tenant';
--   -- expect: 0 rows
--   UPDATE public.agencies SET display_name = display_name WHERE id = :'tenant';
--   -- expect: 0 rows (viewer)
--   SELECT count(*) FROM public.agency_memberships WHERE tenant_id = :'tenant';
--   -- expect: > 0 (reads unchanged)
--   SELECT set_config('request.jwt.claims',
--     json_build_object('sub', :'owner', 'role', 'authenticated')::text, true);
--   UPDATE public.agency_memberships SET role = 'editor'
--    WHERE tenant_id = :'tenant' AND profile_id = :'viewer';
--   -- expect: 1 row (owner manages someone else)
--   UPDATE public.agency_memberships SET role = 'admin'
--    WHERE tenant_id = :'tenant' AND profile_id = :'owner';
--   -- expect: 0 rows (never your own row)
--   UPDATE public.agencies SET display_name = display_name WHERE id = :'tenant';
--   -- expect: 1 row
--   ROLLBACK;

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Role-aware membership helper (writes). SECURITY DEFINER so it reads
--    agency_memberships past its own RLS; authenticated-only (policy helper).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.caller_has_active_tenant_role(
  target_tenant_id UUID,
  allowed_roles TEXT[]
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin()
    OR EXISTS (
      SELECT 1
      FROM public.agency_memberships m
      WHERE m.profile_id = auth.uid()
        AND m.tenant_id  = target_tenant_id
        AND m.status     = 'active'
        AND m.role       = ANY (allowed_roles)
    );
$$;

COMMENT ON FUNCTION public.caller_has_active_tenant_role(UUID, TEXT[]) IS
  'Caller is a platform admin, or an ACTIVE member of the tenant whose role is in allowed_roles. pending_acceptance never qualifies. Write-policy helper (TUL-1269 item 5).';

REVOKE ALL ON FUNCTION public.caller_has_active_tenant_role(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.caller_has_active_tenant_role(uuid, text[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. agency_memberships
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_memberships_tenant_staff ON public.agency_memberships;

DROP POLICY IF EXISTS agency_memberships_staff_read ON public.agency_memberships;
CREATE POLICY agency_memberships_staff_read ON public.agency_memberships
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_memberships_manager_insert ON public.agency_memberships;
CREATE POLICY agency_memberships_manager_insert ON public.agency_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin'])
      AND profile_id <> auth.uid()
      AND role = ANY (ARRAY['admin', 'manager', 'coordinator', 'editor', 'viewer'])
    )
  );

DROP POLICY IF EXISTS agency_memberships_manager_update ON public.agency_memberships;
CREATE POLICY agency_memberships_manager_update ON public.agency_memberships
  FOR UPDATE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin'])
      AND profile_id <> auth.uid()
      AND role = ANY (ARRAY['admin', 'manager', 'coordinator', 'editor', 'viewer'])
    )
  )
  WITH CHECK (
    public.is_platform_admin()
    OR (
      public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin'])
      AND profile_id <> auth.uid()
      AND role = ANY (ARRAY['admin', 'manager', 'coordinator', 'editor', 'viewer'])
    )
  );

DROP POLICY IF EXISTS agency_memberships_manager_delete ON public.agency_memberships;
CREATE POLICY agency_memberships_manager_delete ON public.agency_memberships
  FOR DELETE TO authenticated
  USING (
    public.is_platform_admin()
    OR (
      public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin'])
      AND profile_id <> auth.uid()
      AND role = ANY (ARRAY['admin', 'manager', 'coordinator', 'editor', 'viewer'])
    )
  );

-- ---------------------------------------------------------------------------
-- 3. agencies (tenant_id IS the id column)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agencies_tenant_staff ON public.agencies;

DROP POLICY IF EXISTS agencies_staff_read ON public.agencies;
CREATE POLICY agencies_staff_read ON public.agencies
  FOR SELECT
  USING (public.is_staff_of_tenant(id));

DROP POLICY IF EXISTS agencies_member_update ON public.agencies;
CREATE POLICY agencies_member_update ON public.agencies
  FOR UPDATE TO authenticated
  USING (public.caller_has_active_tenant_role(id, ARRAY['owner', 'admin', 'manager', 'coordinator', 'editor']))
  WITH CHECK (public.caller_has_active_tenant_role(id, ARRAY['owner', 'admin', 'manager', 'coordinator', 'editor']));

DROP POLICY IF EXISTS agencies_platform_admin_insert ON public.agencies;
CREATE POLICY agencies_platform_admin_insert ON public.agencies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS agencies_platform_admin_delete ON public.agencies;
CREATE POLICY agencies_platform_admin_delete ON public.agencies
  FOR DELETE TO authenticated
  USING (public.is_platform_admin());

-- ---------------------------------------------------------------------------
-- 4. agency_domains
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS agency_domains_tenant_staff ON public.agency_domains;

DROP POLICY IF EXISTS agency_domains_staff_read ON public.agency_domains;
CREATE POLICY agency_domains_staff_read ON public.agency_domains
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS agency_domains_admin_write ON public.agency_domains;
CREATE POLICY agency_domains_admin_write ON public.agency_domains
  FOR ALL TO authenticated
  USING      (public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin']))
  WITH CHECK (public.caller_has_active_tenant_role(tenant_id, ARRAY['owner', 'admin']));

-- ---------------------------------------------------------------------------
-- 5. Assert the end state, so a partial apply cannot report success.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public'
       AND policyname IN ('agency_memberships_tenant_staff', 'agencies_tenant_staff', 'agency_domains_tenant_staff')
  ) THEN
    RAISE EXCEPTION 'E6 item 5: a role-blind FOR ALL policy survived';
  END IF;
  IF has_function_privilege('anon', 'public.caller_has_active_tenant_role(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'E6 item 5: caller_has_active_tenant_role is anon-executable';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.caller_has_active_tenant_role(uuid,text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'E6 item 5: authenticated cannot run the policy helper (every member write would fail)';
  END IF;
END $$;

COMMIT;
