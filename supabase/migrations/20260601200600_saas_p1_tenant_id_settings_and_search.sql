-- SaaS Phase 1.B / B7 — tenantise settings + search_queries (nullable-by-design).
--
-- Ref: docs/saas/phase-1/migration-plan.md §B7,
--      docs/saas/phase-0/01-entity-ownership-map.md §2,
--      deliverable 4 §4 (Settings Layer 4 — platform-wide rows stay NULL),
--      ownership map §2 (search_queries — hub rows stay NULL).
--
-- Unlike B1–B6, these tables **remain nullable** in B8. The NULL value carries
-- semantic meaning ("platform-wide" / "hub search"); tenant-scoped rows get a
-- real UUID. Phase 1 adds the column + backfills obvious agency rows only.
--
-- Defensive: each table is gated by to_regclass() so environments that never
-- applied the legacy migrations skip cleanly instead of halting the P1
-- rollout.

BEGIN;

-- settings -------------------------------------------------------------------
-- Six-layer settings inheritance (deliverable 4 §4): Layer 4 rows represent
-- the platform default applying to all tenants and MUST stay NULL. Tenant,
-- storefront, user, and session layers are Phase 2+ concerns; Phase 1 leaves
-- everything NULL here. No backfill — existing rows are Layer 4 platform
-- defaults by definition.

DO $$
BEGIN
  IF to_regclass('public.settings') IS NOT NULL THEN
    ALTER TABLE public.settings
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
  ELSE
    RAISE NOTICE 'settings absent — skipping tenantise';
  END IF;
END $$;

-- search_queries -------------------------------------------------------------
-- search_queries tracks both hub searches (tenant_id NULL) and storefront
-- searches (tenant_id set). Phase 1 leaves everything NULL — all existing
-- search rows predate tenant-aware search and semantically count as hub-era.

DO $$
BEGIN
  IF to_regclass('public.search_queries') IS NOT NULL THEN
    ALTER TABLE public.search_queries
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
  ELSE
    RAISE NOTICE 'search_queries absent — skipping tenantise';
  END IF;
END $$;

COMMIT;
