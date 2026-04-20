-- SaaS Phase 1.B / B4 — tenantise the analytics family.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B4,
--      docs/saas/phase-0/01-entity-ownership-map.md §3 (analytics is tenant-scoped).
--
-- Every analytics row belongs to one agency's dashboards. Phase 1 backfills
-- all existing rows to tenant #1.
--
-- Defensive: each table is gated by to_regclass() so environments that never
-- applied the legacy analytics migration (20260413120000) skip cleanly
-- instead of halting the P1 rollout. When those tables are created later the
-- ADD COLUMN is idempotent so no fixup migration is needed.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.analytics_events') IS NOT NULL THEN
    ALTER TABLE public.analytics_events
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_events
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_events absent — skipping tenantise';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.analytics_daily_rollups') IS NOT NULL THEN
    ALTER TABLE public.analytics_daily_rollups
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_daily_rollups
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_daily_rollups absent — skipping tenantise';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.analytics_funnel_steps') IS NOT NULL THEN
    ALTER TABLE public.analytics_funnel_steps
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_funnel_steps
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_funnel_steps absent — skipping tenantise';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.analytics_search_sessions') IS NOT NULL THEN
    ALTER TABLE public.analytics_search_sessions
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_search_sessions
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_search_sessions absent — skipping tenantise';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.analytics_kpi_snapshots') IS NOT NULL THEN
    ALTER TABLE public.analytics_kpi_snapshots
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_kpi_snapshots
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_kpi_snapshots absent — skipping tenantise';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.analytics_api_cache') IS NOT NULL THEN
    ALTER TABLE public.analytics_api_cache
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.analytics_api_cache
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'analytics_api_cache absent — skipping tenantise';
  END IF;
END $$;

COMMIT;
