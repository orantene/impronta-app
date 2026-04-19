-- SaaS Phase 1.B / B5 — tenantise miscellaneous operational tables.
--
-- Ref: docs/saas/phase-1/migration-plan.md §B5,
--      docs/saas/phase-0/01-entity-ownership-map.md §2 + §3.
--
-- Tables here are all tenant-scoped (operational timeline, notifications,
-- accounts, talent submission audit, workflow events). saved_talent is
-- **intentionally nullable** (hub-wide saved list — Phase 1 leaves column
-- nullable and backfills legacy rows only). B8 does NOT set NOT NULL on it.

BEGIN;

-- activity_log (tenant operational timeline, Zone 2, L26) --------------------

ALTER TABLE public.activity_log
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.activity_log
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- notifications --------------------------------------------------------------

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.notifications
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- saved_talent (nullable by design — hub-wide list stays tenant-less) --------

ALTER TABLE public.saved_talent
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

-- Phase 1 backfill: existing rows are agency-context saves, so tag tenant #1.
-- Hub-wide saves (post-Phase-7) will leave this NULL.
UPDATE public.saved_talent
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- client_accounts ------------------------------------------------------------

ALTER TABLE public.client_accounts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.client_accounts
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- client_account_contacts ----------------------------------------------------

ALTER TABLE public.client_account_contacts
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.client_account_contacts
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- translation_audit_events ---------------------------------------------------

ALTER TABLE public.translation_audit_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.translation_audit_events
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- ai_search_logs -------------------------------------------------------------

ALTER TABLE public.ai_search_logs
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.ai_search_logs
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- talent_submission_snapshots ------------------------------------------------

ALTER TABLE public.talent_submission_snapshots
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.talent_submission_snapshots
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- talent_submission_consents -------------------------------------------------

ALTER TABLE public.talent_submission_consents
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.talent_submission_consents
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- talent_submission_history --------------------------------------------------

ALTER TABLE public.talent_submission_history
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.talent_submission_history
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

-- talent_workflow_events -----------------------------------------------------

ALTER TABLE public.talent_workflow_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT;

UPDATE public.talent_workflow_events
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

COMMIT;
