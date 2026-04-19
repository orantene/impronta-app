-- SaaS Phase 1.B / B4 — tenantise the analytics family.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B4,
--      docs/saas/phase-0/01-entity-ownership-map.md §3 (analytics is tenant-scoped).
--
-- Every analytics row belongs to one agency's dashboards. Phase 1 backfills
-- all existing rows to tenant #1.

BEGIN;

-- analytics_events -----------------------------------------------------------

ALTER TABLE public.analytics_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_events
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- analytics_daily_rollups ----------------------------------------------------

ALTER TABLE public.analytics_daily_rollups
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_daily_rollups
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- analytics_funnel_steps -----------------------------------------------------

ALTER TABLE public.analytics_funnel_steps
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_funnel_steps
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- analytics_search_sessions --------------------------------------------------

ALTER TABLE public.analytics_search_sessions
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_search_sessions
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- analytics_kpi_snapshots ----------------------------------------------------

ALTER TABLE public.analytics_kpi_snapshots
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_kpi_snapshots
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- analytics_api_cache --------------------------------------------------------

ALTER TABLE public.analytics_api_cache
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.analytics_api_cache
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
