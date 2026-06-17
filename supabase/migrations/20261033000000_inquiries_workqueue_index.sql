-- Migration: 20261033000000_inquiries_workqueue_index.sql
--
-- Adds a composite index on (tenant_id, status, created_at DESC) to
-- support the work-queue loaders (loadWorkspaceInquiries, loadInquiriesForMessages)
-- that filter by tenant_id + status and order by created_at DESC.
--
-- Existing indexes checked before adding:
--   - inquiries_tenant_id_created_idx  → (tenant_id, created_at DESC)
--     Covers tenant scoping + ordering but NOT status filtering; Postgres
--     must still recheck all rows for the status predicate after the
--     index scan.
--   - idx_inquiries_status_priority    → (status, priority, created_at DESC)
--     No tenant_id prefix; forces a full-tenant scan when tenant_id is
--     the dominant selectivity predicate (multi-tenant schema: one tenant
--     << total rows, so leading on tenant_id wins).
--   - idx_inquiries_next_action_by     → (next_action_by, status)
--     Different leading column; does not cover the tenant+status+date
--     query shape.
--
-- The new index covers: WHERE tenant_id = $1 AND status IN (...)
-- ORDER BY created_at DESC — the exact query shape emitted by:
--   loadWorkspaceInquiries     (NOT IN closed-status list, ORDER BY created_at DESC)
--   loadInquiriesForMessages   (IN open-status list,       ORDER BY created_at DESC)
--
-- On the Free-tier Supabase instance this shrinks the work-queue scan
-- from O(all tenant rows) to O(matching status rows), reducing per-request
-- egress on every admin Messages / Triage page load.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_inquiries_tenant_status_created
  ON public.inquiries (tenant_id, status, created_at DESC);

COMMIT;
