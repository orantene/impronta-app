-- Tighten public.profile_field_definitions write RLS to platform admins only.
--
-- Background:
--   The original definitions migration (20260901120000_profile_field_definitions.sql)
--   created policy `profile_field_definitions_write_platform_only` but
--   USING/WITH CHECK is_agency_staff() — i.e. any agency staffer could
--   write to the platform-curated catalog directly via Supabase/PostgREST.
--   The table comment explicitly states "agencies cannot add new fields";
--   the policy contradicted the spec.
--
--   The sibling tables profile_field_groups + parent_category_field_groups
--   were already tightened to is_platform_admin() in
--   20260916000000_rls_field_architecture_v1.sql. This migration brings
--   profile_field_definitions in line with that pattern (and matches the
--   companion tightening of profile_field_recommendations in
--   20260520045506_tighten_profile_field_recommendations_rls.sql).
--
-- Surfaced by:
--   web/docs/engine-architecture.md §11 Known Debt (Bug 1 expanded)
--   P-12 engine-debt sweep agent (2026-05-19)
--
-- Read remains broad (any authenticated user) — the catalog is meant to be
-- readable by every workspace; the lockdown is write-only.

-- Drop the broad write policy.
DROP POLICY IF EXISTS profile_field_definitions_write_platform_only
  ON public.profile_field_definitions;

-- Recreate with the canonical platform-admin gate.
CREATE POLICY profile_field_definitions_write_platform_only
  ON public.profile_field_definitions
  FOR ALL
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

COMMENT ON POLICY profile_field_definitions_write_platform_only
  ON public.profile_field_definitions IS
  'Platform-curated field catalog. Only super-admins can INSERT/UPDATE/DELETE; agencies override per-tenant via workspace_profile_field_settings.';
