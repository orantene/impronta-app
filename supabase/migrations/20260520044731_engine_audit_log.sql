-- Phase 7a — engine_audit_log
--
-- Append-only audit trail for control-plane changes to the talent
-- catalog engine: field privacy, field-catalog (enable/relabel/require),
-- group settings, taxonomy edits, and resets. Mirrors the prior-art
-- talent_profile_field_value_history pattern (20260923040000) but
-- captures *catalog* operations (which the value-history trigger does
-- not see — those mutations happen on workspace_profile_field_settings,
-- workspace_field_group_settings, agency_subtypes, etc.).
--
-- Writes are produced explicitly by server actions via logEngineAudit
-- (web/src/lib/server-actions/engine-audit.ts) through the service-role
-- client, so RLS only governs READS. INSERT-only by service role; this
-- migration deliberately omits any UPDATE/DELETE policies — audit is
-- append-only.
--
-- Fully additive — no destructive operations.

CREATE TABLE IF NOT EXISTS public.engine_audit_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  -- Tenant the change applies to. NOT NULL — every catalog/privacy
  -- change is tenant-scoped (platform-default changes are out of scope
  -- here; they'll come with Phase 9B). FK is hard-CASCADE-on-delete so
  -- audit follows a tenant teardown, matching prior tenant-scoped
  -- audit/history tables (media_asset_audits, etc.).
  tenant_id       uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,

  -- Actor identity. Nullable for system-attributed events (cache
  -- invalidation, scheduled jobs). actor_role is a free-text label —
  -- the writer passes 'agency_admin' | 'platform_admin' | 'system';
  -- we don't CHECK so future roles don't require a migration.
  actor_user_id   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role      text        NOT NULL,

  -- What was touched.
  --   surface       — UX-level grouping for the History rail
  --                   ('field-privacy' | 'field-catalog' | 'field-group'
  --                    | 'taxonomy' | 'reset').
  --   subject_kind  — concrete object class ('field' | 'group' | 'category').
  --   subject_id    — uuid of the row (profile_field_definitions.id /
  --                   profile_field_groups.id / agency_subtypes.id etc.);
  --                   intentionally NOT FK-constrained — a deprecated
  --                   field or removed subtype must still leave a readable
  --                   audit trail.
  --   subject_key   — denormalized human-readable handle (field_key /
  --                   group slug / category slug) so the History rail
  --                   can render without joining a possibly-deleted row.
  surface         text        NOT NULL,
  subject_kind    text        NOT NULL,
  subject_id      uuid        NOT NULL,
  subject_key     text,

  -- The change.
  --   operation     — 'set' | 'reset' | 'enable' | 'disable'.
  --   before_value  — snapshot of the override row before the write
  --                   (or null if no override existed → platform default).
  --   after_value   — snapshot after the write (or null on reset).
  operation       text        NOT NULL,
  before_value    jsonb,
  after_value     jsonb
);

-- Hot index: History rail loads the last N entries for a tenant
-- ordered by recency.
CREATE INDEX IF NOT EXISTS engine_audit_log_tenant_created_idx
  ON public.engine_audit_log (tenant_id, created_at DESC);

-- Secondary index: per-subject history ("show me every change to this
-- field") — cheap and aids future drill-down UX.
CREATE INDEX IF NOT EXISTS engine_audit_log_subject_idx
  ON public.engine_audit_log (subject_kind, subject_id, created_at DESC);

ALTER TABLE public.engine_audit_log ENABLE ROW LEVEL SECURITY;

-- READ policies only — append-only enforced by the absence of
-- INSERT/UPDATE/DELETE policies (service-role bypasses RLS, which is
-- the sole writer).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='engine_audit_log'
       AND policyname='engine_audit_log_tenant_select'
  ) THEN
    CREATE POLICY engine_audit_log_tenant_select
      ON public.engine_audit_log
      FOR SELECT
      USING (
        public.is_platform_admin()
        OR public.is_staff_of_tenant(tenant_id)
      );
  END IF;
END $$;
