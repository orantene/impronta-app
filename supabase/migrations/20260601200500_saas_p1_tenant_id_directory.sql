-- SaaS Phase 1.B / B6 — tenantise the storefront directory layout tables.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B6,
--      docs/saas/phase-0/01-entity-ownership-map.md §3.
--
-- Directory filter panel and sidebar layout are per-agency storefront
-- configuration. Phase 1 backfills all rows to tenant #1.

BEGIN;

-- directory_filter_panel_items ----------------------------------------------

ALTER TABLE public.directory_filter_panel_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.directory_filter_panel_items
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- directory_sidebar_layout --------------------------------------------------

ALTER TABLE public.directory_sidebar_layout
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.directory_sidebar_layout
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
