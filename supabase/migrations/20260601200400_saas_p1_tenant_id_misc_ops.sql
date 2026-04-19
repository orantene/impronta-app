-- SaaS Phase 1.B / B5 — tenantise miscellaneous operational tables.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B5,
--      docs/saas/phase-0/01-entity-ownership-map.md §2 + §3.
--
-- Tables here are all tenant-scoped (operational timeline, notifications,
-- accounts, talent submission audit, workflow events). saved_talent is
-- **intentionally nullable** (hub-wide saved list — Phase 1 leaves column
-- nullable and backfills legacy rows only). B8 does NOT set NOT NULL on it.
--
-- Defensive: each table is gated by to_regclass() so environments that never
-- applied the legacy migrations skip cleanly instead of halting the P1
-- rollout. When those tables are created later the ADD COLUMN is idempotent
-- so no fixup migration is needed.

BEGIN;

-- activity_log (tenant operational timeline, Zone 2, L26) --------------------

DO $$
BEGIN
  IF to_regclass('public.activity_log') IS NOT NULL THEN
    ALTER TABLE public.activity_log
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.activity_log
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'activity_log absent — skipping tenantise';
  END IF;
END $$;

-- notifications --------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL THEN
    ALTER TABLE public.notifications
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.notifications
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'notifications absent — skipping tenantise';
  END IF;
END $$;

-- saved_talent (nullable by design — hub-wide list stays tenant-less) --------

DO $$
BEGIN
  IF to_regclass('public.saved_talent') IS NOT NULL THEN
    ALTER TABLE public.saved_talent
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    -- Phase 1 backfill: existing rows are agency-context saves, so tag tenant #1.
    -- Hub-wide saves (post-Phase-7) will leave this NULL.
    UPDATE public.saved_talent
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'saved_talent absent — skipping tenantise';
  END IF;
END $$;

-- client_accounts ------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.client_accounts') IS NOT NULL THEN
    ALTER TABLE public.client_accounts
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.client_accounts
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'client_accounts absent — skipping tenantise';
  END IF;
END $$;

-- client_account_contacts ----------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.client_account_contacts') IS NOT NULL THEN
    ALTER TABLE public.client_account_contacts
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.client_account_contacts
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'client_account_contacts absent — skipping tenantise';
  END IF;
END $$;

-- translation_audit_events ---------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.translation_audit_events') IS NOT NULL THEN
    ALTER TABLE public.translation_audit_events
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.translation_audit_events
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'translation_audit_events absent — skipping tenantise';
  END IF;
END $$;

-- ai_search_logs -------------------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.ai_search_logs') IS NOT NULL THEN
    ALTER TABLE public.ai_search_logs
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.ai_search_logs
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'ai_search_logs absent — skipping tenantise';
  END IF;
END $$;

-- talent_submission_snapshots ------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.talent_submission_snapshots') IS NOT NULL THEN
    ALTER TABLE public.talent_submission_snapshots
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.talent_submission_snapshots
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'talent_submission_snapshots absent — skipping tenantise';
  END IF;
END $$;

-- talent_submission_consents -------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.talent_submission_consents') IS NOT NULL THEN
    ALTER TABLE public.talent_submission_consents
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.talent_submission_consents
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'talent_submission_consents absent — skipping tenantise';
  END IF;
END $$;

-- talent_submission_history --------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.talent_submission_history') IS NOT NULL THEN
    ALTER TABLE public.talent_submission_history
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.talent_submission_history
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'talent_submission_history absent — skipping tenantise';
  END IF;
END $$;

-- talent_workflow_events -----------------------------------------------------

DO $$
BEGIN
  IF to_regclass('public.talent_workflow_events') IS NOT NULL THEN
    ALTER TABLE public.talent_workflow_events
      ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;
    UPDATE public.talent_workflow_events
       SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
     WHERE tenant_id IS NULL;
  ELSE
    RAISE NOTICE 'talent_workflow_events absent — skipping tenantise';
  END IF;
END $$;

COMMIT;
