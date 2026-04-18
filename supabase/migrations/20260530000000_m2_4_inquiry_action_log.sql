-- M2.4 — Admin Workspace V3: inquiry_action_log (operational audit trail).
-- Ref: docs/admin-workspace-spec.md §10.1, docs/admin-workspace-roadmap.md §M2.4.
--
-- Distinct from inquiry_events:
--   • inquiry_events    = domain facts, success-only, user-visible in timeline.
--   • inquiry_action_log = every admin/coordinator action attempt incl. failures.
--     Operational/debug surface only — not user-visible in Phase 1.
--
-- Scope for M2.4 is strictly the table + indexes + RLS. The logInquiryAction
-- helper lands in a sibling file in web/src/lib/inquiry/. Wiring to engine
-- actions happens in M2.1, M2.2, M2.3 — each of those PRs will land with the
-- helper call paths populated. Per roadmap §"Dependencies": this migration
-- must merge before M2.1/M2.2/M2.3 merge so their wiring has a table to write to.
--
-- Invariants (§10.3):
--   1. Logging must never block the action. Enforced at helper level.
--   2. No retry on failed inserts — a failed log write is lost (accepted trade-off).
--   3. Metadata JSONB must stay <2KB (CHECK constraint here).
--   4. No PII in metadata (enforced by code review, not schema).

-- =============================================================================
-- Table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.inquiry_action_log (
  id            BIGSERIAL   PRIMARY KEY,
  inquiry_id    UUID        NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  actor_user_id UUID        NOT NULL REFERENCES auth.users(id)       ON DELETE RESTRICT,
  action_type   TEXT        NOT NULL,
  result        TEXT        NOT NULL CHECK (result IN ('success', 'failure')),
  reason        TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inquiry_action_log_metadata_size
    CHECK (metadata IS NULL OR octet_length(metadata::text) < 2048)
);

COMMENT ON TABLE public.inquiry_action_log IS
  'Operational audit trail of admin/coordinator action attempts (incl. failures). Distinct from inquiry_events (which is user-visible, success-only). Never user-visible in Phase 1.';

COMMENT ON COLUMN public.inquiry_action_log.reason IS
  'Failure reason code or override justification. Free text, but stays short.';
COMMENT ON COLUMN public.inquiry_action_log.metadata IS
  'Small context payload: target_user_id, group_id, etc. Size-checked <2KB. NO PII.';

-- =============================================================================
-- Indexes
-- =============================================================================

-- Per-inquiry drill-down, newest-first. The canonical read path from the admin
-- workspace and from M7 QA spot-checks.
CREATE INDEX IF NOT EXISTS inquiry_action_log_inquiry_idx
  ON public.inquiry_action_log (inquiry_id, created_at DESC);

-- "What did this admin do recently" — used for debugging escalations.
CREATE INDEX IF NOT EXISTS inquiry_action_log_actor_idx
  ON public.inquiry_action_log (actor_user_id, created_at DESC);

-- Failure-rate analytics per action_type (M8.1 monitors via this).
CREATE INDEX IF NOT EXISTS inquiry_action_log_type_idx
  ON public.inquiry_action_log (action_type, created_at DESC);

-- BRIN for cheap time-range scans on an unbounded-growth table (§10.4 — no
-- retention policy in Phase 1; retention is a Phase 3 concern).
CREATE INDEX IF NOT EXISTS inquiry_action_log_created_at_brin
  ON public.inquiry_action_log USING BRIN (created_at);

-- =============================================================================
-- RLS
-- =============================================================================
ALTER TABLE public.inquiry_action_log ENABLE ROW LEVEL SECURITY;

-- Staff only. Phase 1 does not expose the log to clients or talent (spec §10:
-- "Not user-visible in Phase 1"). Absence of a SELECT policy for non-staff
-- denies reads by default under RLS.
DROP POLICY IF EXISTS inquiry_action_log_staff_all ON public.inquiry_action_log;
CREATE POLICY inquiry_action_log_staff_all ON public.inquiry_action_log
  FOR ALL
  USING       (public.is_agency_staff())
  WITH CHECK  (public.is_agency_staff());
