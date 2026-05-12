-- ============================================================================
-- RLS Field Architecture V1 — 2026-05-11
-- ============================================================================
--
-- WHY
-- ───
-- The field-architecture migrations (20260907180000, 20260907210000,
-- 20260907240000) created 10 tables WITHOUT enabling Row Level Security.
-- Supabase Advisor flagged these as critical security issues:
--
--   profile_field_groups
--   parent_category_field_groups
--   workspace_field_group_settings
--   talent_profile_trust_badges
--   talent_agency_permission_requests
--   talent_agency_data_grants
--   talent_profile_external_calendars
--   agency_talent_media
--   agency_talent_skill_overrides
--   taxonomy_term_requests
--
-- Without RLS, anyone with an authenticated JWT could read or modify any
-- row in these tables — including granting themselves trust badges or
-- modifying another tenant's workspace settings.
--
-- WHAT
-- ────
-- This migration enables RLS on all 10 tables and adds policies that
-- match the existing patterns in talent_profile_field_values.sql:
--   • Catalog tables → authenticated read, platform-admin write only
--   • Tenant-scoped tables → is_staff_of_tenant(tenant_id) gates everything
--   • Talent-scoped tables → owner OR agency staff (via roster) OR platform admin
--   • User-submitted requests → submitter reads/writes own; platform reviews
--
-- Helpers used (defined in earlier migrations):
--   public.is_platform_admin()       — super_admin app_role
--   public.is_staff_of_tenant(uuid)  — agency membership OR platform admin
--
-- IDEMPOTENCY: every policy has DROP POLICY IF EXISTS first.
-- ============================================================================

BEGIN;

-- ════════════════════════════════════════════════════════════════════════════
-- 1. profile_field_groups — platform catalog (13 reusable field bundles)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.profile_field_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pfg_select_authenticated ON public.profile_field_groups;
CREATE POLICY pfg_select_authenticated ON public.profile_field_groups
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pfg_write_platform_admin ON public.profile_field_groups;
CREATE POLICY pfg_write_platform_admin ON public.profile_field_groups
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 2. parent_category_field_groups — platform catalog (group-to-category map)
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.parent_category_field_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pcfg_select_authenticated ON public.parent_category_field_groups;
CREATE POLICY pcfg_select_authenticated ON public.parent_category_field_groups
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS pcfg_write_platform_admin ON public.parent_category_field_groups;
CREATE POLICY pcfg_write_platform_admin ON public.parent_category_field_groups
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 3. workspace_field_group_settings — tenant-scoped overrides
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.workspace_field_group_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wfgs_all_tenant_staff ON public.workspace_field_group_settings;
CREATE POLICY wfgs_all_tenant_staff ON public.workspace_field_group_settings
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- ════════════════════════════════════════════════════════════════════════════
-- 4. talent_profile_trust_badges
--    Talent reads their own. Agency staff manage agency-scoped badges for
--    their tenant. Platform admins manage platform-scoped badges.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.talent_profile_trust_badges ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tptb_select_own ON public.talent_profile_trust_badges;
CREATE POLICY tptb_select_own ON public.talent_profile_trust_badges
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_trust_badges.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tptb_select_tenant_staff ON public.talent_profile_trust_badges;
CREATE POLICY tptb_select_tenant_staff ON public.talent_profile_trust_badges
  FOR SELECT
  USING (
    (scope = 'agency' AND scope_tenant_id IS NOT NULL
      AND public.is_staff_of_tenant(scope_tenant_id))
    OR EXISTS (
      SELECT 1 FROM public.agency_talent_roster atr
       WHERE atr.talent_profile_id = talent_profile_trust_badges.talent_profile_id
         AND atr.status = 'active'
         AND public.is_staff_of_tenant(atr.tenant_id)
    )
  );

DROP POLICY IF EXISTS tptb_write_platform_admin ON public.talent_profile_trust_badges;
CREATE POLICY tptb_write_platform_admin ON public.talent_profile_trust_badges
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS tptb_write_agency_scoped ON public.talent_profile_trust_badges;
CREATE POLICY tptb_write_agency_scoped ON public.talent_profile_trust_badges
  FOR ALL
  USING (
    scope = 'agency'
    AND scope_tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(scope_tenant_id)
  )
  WITH CHECK (
    scope = 'agency'
    AND scope_tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(scope_tenant_id)
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 5. talent_agency_permission_requests
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.talent_agency_permission_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tapr_select_own_talent ON public.talent_agency_permission_requests;
CREATE POLICY tapr_select_own_talent ON public.talent_agency_permission_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_agency_permission_requests.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tapr_update_own_talent ON public.talent_agency_permission_requests;
CREATE POLICY tapr_update_own_talent ON public.talent_agency_permission_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_agency_permission_requests.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_agency_permission_requests.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tapr_select_requesting_tenant ON public.talent_agency_permission_requests;
CREATE POLICY tapr_select_requesting_tenant ON public.talent_agency_permission_requests
  FOR SELECT
  USING (public.is_staff_of_tenant(requesting_tenant_id));

DROP POLICY IF EXISTS tapr_insert_requesting_tenant ON public.talent_agency_permission_requests;
CREATE POLICY tapr_insert_requesting_tenant ON public.talent_agency_permission_requests
  FOR INSERT
  WITH CHECK (public.is_staff_of_tenant(requesting_tenant_id));

DROP POLICY IF EXISTS tapr_platform_admin ON public.talent_agency_permission_requests;
CREATE POLICY tapr_platform_admin ON public.talent_agency_permission_requests
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 6. talent_agency_data_grants
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.talent_agency_data_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tadg_all_own_talent ON public.talent_agency_data_grants;
CREATE POLICY tadg_all_own_talent ON public.talent_agency_data_grants
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_agency_data_grants.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_agency_data_grants.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tadg_select_tenant_staff ON public.talent_agency_data_grants;
CREATE POLICY tadg_select_tenant_staff ON public.talent_agency_data_grants
  FOR SELECT
  USING (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS tadg_platform_admin ON public.talent_agency_data_grants;
CREATE POLICY tadg_platform_admin ON public.talent_agency_data_grants
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 7. talent_profile_external_calendars
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.talent_profile_external_calendars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tpec_all_own_talent ON public.talent_profile_external_calendars;
CREATE POLICY tpec_all_own_talent ON public.talent_profile_external_calendars
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_external_calendars.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = talent_profile_external_calendars.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS tpec_select_roster_tenant ON public.talent_profile_external_calendars;
CREATE POLICY tpec_select_roster_tenant ON public.talent_profile_external_calendars
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agency_talent_roster atr
       WHERE atr.talent_profile_id = talent_profile_external_calendars.talent_profile_id
         AND atr.status = 'active'
         AND public.is_staff_of_tenant(atr.tenant_id)
    )
  );

DROP POLICY IF EXISTS tpec_platform_admin ON public.talent_profile_external_calendars;
CREATE POLICY tpec_platform_admin ON public.talent_profile_external_calendars
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- 8. agency_talent_media
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agency_talent_media ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atm_all_tenant_staff ON public.agency_talent_media;
CREATE POLICY atm_all_tenant_staff ON public.agency_talent_media
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS atm_select_own_talent ON public.agency_talent_media;
CREATE POLICY atm_select_own_talent ON public.agency_talent_media
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = agency_talent_media.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 9. agency_talent_skill_overrides
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.agency_talent_skill_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS atso_all_tenant_staff ON public.agency_talent_skill_overrides;
CREATE POLICY atso_all_tenant_staff ON public.agency_talent_skill_overrides
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

DROP POLICY IF EXISTS atso_select_own_talent ON public.agency_talent_skill_overrides;
CREATE POLICY atso_select_own_talent ON public.agency_talent_skill_overrides
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles tp
       WHERE tp.id = agency_talent_skill_overrides.talent_profile_id
         AND tp.user_id = auth.uid()
    )
  );

-- ════════════════════════════════════════════════════════════════════════════
-- 10. taxonomy_term_requests
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.taxonomy_term_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ttr_select_own_submitter ON public.taxonomy_term_requests;
CREATE POLICY ttr_select_own_submitter ON public.taxonomy_term_requests
  FOR SELECT
  USING (requested_by_user_id = auth.uid());

DROP POLICY IF EXISTS ttr_insert_authenticated ON public.taxonomy_term_requests;
CREATE POLICY ttr_insert_authenticated ON public.taxonomy_term_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (requested_by_user_id IS NULL OR requested_by_user_id = auth.uid())
  );

DROP POLICY IF EXISTS ttr_select_own_tenant ON public.taxonomy_term_requests;
CREATE POLICY ttr_select_own_tenant ON public.taxonomy_term_requests
  FOR SELECT
  USING (
    requested_by_tenant_id IS NOT NULL
    AND public.is_staff_of_tenant(requested_by_tenant_id)
  );

DROP POLICY IF EXISTS ttr_platform_admin ON public.taxonomy_term_requests;
CREATE POLICY ttr_platform_admin ON public.taxonomy_term_requests
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

-- ════════════════════════════════════════════════════════════════════════════
-- Final assertion — confirm RLS is enabled on all 10 tables.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_unprotected TEXT[];
BEGIN
  SELECT ARRAY_AGG(c.relname ORDER BY c.relname)
    INTO v_unprotected
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relname IN (
       'profile_field_groups',
       'parent_category_field_groups',
       'workspace_field_group_settings',
       'talent_profile_trust_badges',
       'talent_agency_permission_requests',
       'talent_agency_data_grants',
       'talent_profile_external_calendars',
       'agency_talent_media',
       'agency_talent_skill_overrides',
       'taxonomy_term_requests'
     )
     AND NOT c.relrowsecurity;

  IF v_unprotected IS NOT NULL AND array_length(v_unprotected, 1) > 0 THEN
    RAISE EXCEPTION
      'RLS migration incomplete — these tables still have RLS disabled: %',
      v_unprotected;
  END IF;
END $$;

COMMIT;
