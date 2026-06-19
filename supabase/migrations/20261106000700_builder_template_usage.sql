-- Builder Template Usage / Adoption Tally — D7 (provenance + adoption signal)
-- ============================================================================
-- public.builder_template_usage — one row per time a published `builder_templates`
-- template is APPLIED (inserted) into a tenant's builder tree via the Add Gallery
-- "+" insert path. Each row records which template, which tenant, on which surface
-- and page, and when — powering the Template Manager's per-card adoption stat
-- ("applied N times across M tenants").
--
-- This is the durable counterpart to the per-node `props.__sourceTemplateId`
-- provenance stamp: the stamp lives inside the tenant's tree ("this node is a copy
-- of template X"); this table is the aggregate signal ("template X has been applied
-- N times").
--
-- Inserts are append-only and happen through the service-role admin client behind
-- the insert chokepoint, so NO insert policy is needed (mirroring builder_lab_audit).
-- Reads are gated to super_admin (the Lab Template Manager is super_admin-only).
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.builder_template_usage (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid        NOT NULL REFERENCES public.builder_templates(id) ON DELETE CASCADE,
  tenant_id   uuid,                                   -- the tenant whose tree received the insert (null when unknown)
  surface     text,                                   -- builder surface ('homepage' | 'cms_page' | 'talent_page' | 'talent_site' | 'platform_lab' | ...)
  page_ref    text,                                   -- opaque page/slug reference for the inserted-into page
  inserted_at timestamptz NOT NULL DEFAULT now()
);

-- The adoption stat aggregates by template_id; tenant breakdown counts distinct
-- tenant_id. Both lookups stay cheap with these indexes.
CREATE INDEX IF NOT EXISTS builder_template_usage_template_id_idx
  ON public.builder_template_usage (template_id);
CREATE INDEX IF NOT EXISTS builder_template_usage_tenant_id_idx
  ON public.builder_template_usage (tenant_id)
  WHERE tenant_id IS NOT NULL;

COMMENT ON TABLE public.builder_template_usage IS
  'Append-only tally of builder_templates applications (one row per Add-Gallery insert of a template) carrying template/tenant/surface/page/time. Inserted via service-role behind the insert chokepoint; read by super_admin for the Template Manager adoption stat.';
COMMENT ON COLUMN public.builder_template_usage.tenant_id IS
  'Tenant whose builder tree received the insert; null when the insert context has no resolvable tenant.';
COMMENT ON COLUMN public.builder_template_usage.surface IS
  'Builder surface the template was applied on (homepage | cms_page | talent_page | talent_site | platform_lab | ...).';

-- ── RLS ──────────────────────────────────────────────────────────────────────
-- Reads gated to super_admin (the Lab is super_admin-only); inserts go through
-- the service-role client, which bypasses RLS, so no insert policy is declared.
-- (Mirrors public.builder_lab_audit's RLS pattern.)

ALTER TABLE public.builder_template_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS btu_select_super_admin ON public.builder_template_usage;
CREATE POLICY btu_select_super_admin ON public.builder_template_usage
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin());

COMMIT;
