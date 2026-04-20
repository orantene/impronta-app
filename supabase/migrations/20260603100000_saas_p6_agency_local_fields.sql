-- Phase 6 — Agency-local fields (Plan §6)
--
-- Adds an optional `tenant_id` column to `field_groups` and `field_definitions`
-- so each agency (tenant) can define their own custom profile fields on top
-- of the global canonical catalog.
--
-- Semantics
--   tenant_id IS NULL       → canonical / global (visible to every tenant,
--                             editable only by platform super_admins)
--   tenant_id IS NOT NULL   → agency-local (visible + editable only to that
--                             tenant's staff via is_staff_of_tenant)
--
-- Uniqueness
--   The pre-existing `UNIQUE (key)` on field_definitions and `UNIQUE (slug)`
--   on field_groups is replaced by partial indexes so canonical and agency-
--   local namespaces stay independent. Two different agencies may both define
--   a `hair_color` agency-local field without colliding with each other or
--   with a future canonical `hair_color`.
--
-- Backwards compat
--   Existing rows are left at tenant_id=NULL → every current field stays
--   canonical. No admin pages or portfolio queries need to change to keep
--   working; they just become able to see extra agency-local rows once staff
--   start creating them.

BEGIN;

DO $$
BEGIN
  IF to_regprocedure('public.is_staff_of_tenant(uuid)') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'Missing dependency: public.is_staff_of_tenant(uuid)',
      HINT = 'Apply 20260602100000_saas_p2_tenant_helpers.sql before this migration.';
  END IF;
  IF to_regprocedure('public.is_platform_admin()') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42883',
      MESSAGE = 'Missing dependency: public.is_platform_admin()',
      HINT = 'Apply 20260602100000_saas_p2_tenant_helpers.sql before this migration.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'agencies' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42P01',
      MESSAGE = 'Missing dependency: public.agencies',
      HINT = 'Apply Phase 1 SaaS migrations before this migration.';
  END IF;
END
$$;

-- ----- field_groups ---------------------------------------------------------
ALTER TABLE public.field_groups
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies (id) ON DELETE CASCADE;

-- Drop the global UNIQUE (slug) constraint so we can use partial indexes.
-- The `IF EXISTS` lets this migration be idempotent even if a prior half-run
-- already dropped it.
ALTER TABLE public.field_groups
  DROP CONSTRAINT IF EXISTS field_groups_slug_key;

DROP INDEX IF EXISTS public.field_groups_slug_canonical_uniq;
CREATE UNIQUE INDEX field_groups_slug_canonical_uniq
  ON public.field_groups (slug)
  WHERE tenant_id IS NULL;

DROP INDEX IF EXISTS public.field_groups_slug_per_tenant_uniq;
CREATE UNIQUE INDEX field_groups_slug_per_tenant_uniq
  ON public.field_groups (tenant_id, slug)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_groups_tenant_id_idx
  ON public.field_groups (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- ----- field_definitions ----------------------------------------------------
ALTER TABLE public.field_definitions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies (id) ON DELETE CASCADE;

ALTER TABLE public.field_definitions
  DROP CONSTRAINT IF EXISTS field_definitions_key_key;

DROP INDEX IF EXISTS public.field_definitions_key_canonical_uniq;
CREATE UNIQUE INDEX field_definitions_key_canonical_uniq
  ON public.field_definitions (key)
  WHERE tenant_id IS NULL;

DROP INDEX IF EXISTS public.field_definitions_key_per_tenant_uniq;
CREATE UNIQUE INDEX field_definitions_key_per_tenant_uniq
  ON public.field_definitions (tenant_id, key)
  WHERE tenant_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS field_definitions_tenant_id_idx
  ON public.field_definitions (tenant_id)
  WHERE tenant_id IS NOT NULL;

-- Guard: a tenantised field_definition may not live inside a canonical
-- field_group (that would leak its rendering into every other tenant's admin).
-- Canonical definitions may still reference any canonical group. We enforce
-- this with a trigger rather than a CHECK because the parent's tenant_id is
-- in a different table.
CREATE OR REPLACE FUNCTION public.saas_p6_field_definition_group_tenant_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  parent_tenant UUID;
BEGIN
  IF NEW.field_group_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT tenant_id INTO parent_tenant
  FROM public.field_groups
  WHERE id = NEW.field_group_id;

  IF parent_tenant IS NULL THEN
    -- canonical group accepts both canonical and tenantised children
    RETURN NEW;
  END IF;

  IF NEW.tenant_id IS NULL THEN
    RAISE EXCEPTION 'canonical field_definition cannot live in tenantised field_group %', NEW.field_group_id
      USING ERRCODE = 'check_violation';
  ELSIF NEW.tenant_id <> parent_tenant THEN
    RAISE EXCEPTION
      'field_definition tenant_id % does not match field_group tenant_id %',
      NEW.tenant_id, parent_tenant
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS field_definitions_group_tenant_guard ON public.field_definitions;
CREATE TRIGGER field_definitions_group_tenant_guard
  BEFORE INSERT OR UPDATE OF field_group_id, tenant_id ON public.field_definitions
  FOR EACH ROW
  EXECUTE FUNCTION public.saas_p6_field_definition_group_tenant_guard();

-- ----- RLS rewrites ---------------------------------------------------------
-- Pre-Phase-6 these tables used is_agency_staff() (any staff, any tenant).
-- New model:
--   • Read: any staff of any tenant may read canonical rows. Agency-local rows
--     are restricted to staff of the owning tenant.
--   • Write (canonical): platform admins only.
--   • Write (agency-local): staff of the owning tenant.

-- field_groups ---------------------------------------------------------------
DROP POLICY IF EXISTS field_groups_staff ON public.field_groups;
DROP POLICY IF EXISTS field_groups_read ON public.field_groups;
DROP POLICY IF EXISTS field_groups_write_canonical ON public.field_groups;
DROP POLICY IF EXISTS field_groups_write_tenant ON public.field_groups;

CREATE POLICY field_groups_read ON public.field_groups
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR public.is_staff_of_tenant(tenant_id)
  );

CREATE POLICY field_groups_write_canonical ON public.field_groups
  FOR ALL
  USING      (tenant_id IS NULL AND public.is_platform_admin())
  WITH CHECK (tenant_id IS NULL AND public.is_platform_admin());

CREATE POLICY field_groups_write_tenant ON public.field_groups
  FOR ALL
  USING      (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

-- field_definitions ----------------------------------------------------------
DROP POLICY IF EXISTS field_definitions_staff ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_read ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_write_canonical ON public.field_definitions;
DROP POLICY IF EXISTS field_definitions_write_tenant ON public.field_definitions;

CREATE POLICY field_definitions_read ON public.field_definitions
  FOR SELECT
  USING (
    tenant_id IS NULL
    OR public.is_staff_of_tenant(tenant_id)
  );

CREATE POLICY field_definitions_write_canonical ON public.field_definitions
  FOR ALL
  USING      (tenant_id IS NULL AND public.is_platform_admin())
  WITH CHECK (tenant_id IS NULL AND public.is_platform_admin());

CREATE POLICY field_definitions_write_tenant ON public.field_definitions
  FOR ALL
  USING      (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id))
  WITH CHECK (tenant_id IS NOT NULL AND public.is_staff_of_tenant(tenant_id));

-- Preserve the two anon/talent read policies added later in the field-catalog
-- timeline. Those already scope with `public_visible = TRUE` + `active = TRUE`
-- and don't reference tenant_id, so unauthenticated directory queries still
-- see canonical rows. Agency-local rows default to public_visible=TRUE as well
-- and will naturally show for any storefront, which is fine for Phase 6 —
-- Phase 4 adds tenant-scoped storefront rendering that filters by hostname
-- lookup.

COMMIT;
