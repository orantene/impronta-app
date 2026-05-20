-- Tighten profile_field_recommendations RLS to platform admins only.
--
-- Background
-- ──────────
-- profile_field_recommendations is the Tulala-curated mapping between
-- profile_field_definitions and taxonomy_terms (talent types). It is
-- intentionally NOT a tenant-editable surface — agencies override via
-- workspace_profile_field_settings.
--
-- The original migration (20260901120100) gated write access on
-- public.is_agency_staff(), which returns TRUE for both `super_admin`
-- AND `agency_staff` (workspace admins). That's too broad: any workspace
-- admin with direct DB access (REST + RLS-bypassing PAT) could insert /
-- delete catalog mapping rows. Surfaced in §11 of
-- web/docs/engine-architecture.md.
--
-- Fix: replace the FOR ALL policy with the canonical platform-admin
-- helper public.is_platform_admin() (super_admin only — defined in
-- 20260602100000_saas_p2_tenant_helpers.sql). SELECT stays open.
--
-- Behaviour change: zero in production (no agency-staff-only account has
-- ever been used to write here). Defence-in-depth only.
--
-- DOWN (manual):
--   DROP POLICY IF EXISTS profile_field_recommendations_write_platform_only
--     ON public.profile_field_recommendations;
--   CREATE POLICY profile_field_recommendations_write_platform_only
--     ON public.profile_field_recommendations
--     FOR ALL
--     USING (public.is_agency_staff())
--     WITH CHECK (public.is_agency_staff());

BEGIN;

DROP POLICY IF EXISTS profile_field_recommendations_write_platform_only
  ON public.profile_field_recommendations;

CREATE POLICY profile_field_recommendations_write_platform_only
  ON public.profile_field_recommendations
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMIT;
