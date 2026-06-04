-- Recipient safety (Lane C / S4 of the conversational-inquiry MVP).
--
-- Spec: web/docs/conversational-inquiry-deep-dives-2026-06-03.md Part C, layer L5
--       ("Recipient controls + reputation").
-- Contract: web/src/lib/inquiry/guest-chat-contract.ts §8 (InquiryReportReason,
--           BlockSubjectType, BlockScope) + the S4 migrationColumns block.
--
-- Two net-new tables that give a talent / agency-staff recipient the ability to
-- protect themselves from an abusive sender on a guest-first messaging surface:
--
--   • user_blocks      — a staff recipient blocks a *guest session* OR a
--                        *registered client user* from reaching them. Enforced
--                        at the guest message-send + inquiry-create paths
--                        (the enforcement guard `isBlocked()` lives in
--                        web/src/lib/inquiry/recipient-safety.ts and is wired
--                        into those paths by Lane A — see that lane's actions).
--
--   • inquiry_reports  — a staff recipient reports a sender on an inquiry. The
--                        review queue (status='open') is the hook for
--                        account_status='suspended' (Lane C / L6). Repeated
--                        reports against one subject ALSO feed the buyer's trust
--                        DOWN — see the note on the reporter/subject denorm
--                        columns below + recipient-safety.ts.
--
-- Both tables are tenant-scoped (REFERENCES public.agencies(id), the tenant
-- root) and RLS-protected. RLS posture:
--   • Tenant staff get full access to rows in their own tenant
--     (public.is_staff_of_tenant(tenant_id) — same helper as
--      inquiry_user_flags / inquiry_messages staff policies). This is the ONLY
--      write path: these are ENFORCEMENT / abuse-signal tables, so writes must
--      be authorised by tenant staff membership, never by a bare "I authored it"
--      self check (that would let any authenticated user plant a block/report in
--      any tenant against any subject — a cross-tenant griefing primitive).
--   • A user can additionally READ the rows THEY authored
--     (blocker_user_id / reporter_user_id = auth.uid()) via a SELECT-only self
--     policy — so a talent who is staff can see their own blocks even via a
--     self-scoped query, and the row is never visible cross-tenant.
--   • The default authenticated INSERT/UPDATE/DELETE grant is REVOKEd on both
--     tables as defence-in-depth behind the staff write policy.
-- Writes/reads from the guest-chat enforcement path go through the service-role
-- client (which bypasses RLS) behind the app-layer ownership gate, exactly as
-- the guest message engine does — RLS here is the defence-in-depth backstop for
-- any authenticated (staff) access.

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- user_blocks — a staff recipient blocks a guest session or a client user.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES public.agencies(id)        ON DELETE CASCADE,
  -- WHO is blocking (the recipient): a talent / agency-staff user.
  blocker_user_id          UUID        NOT NULL REFERENCES public.profiles(id)        ON DELETE CASCADE,
  -- WHAT is blocked: a guest session OR a registered client user (exactly one).
  blocked_subject_type     TEXT        NOT NULL CHECK (blocked_subject_type IN ('guest_session', 'client_user')),
  blocked_guest_session_id UUID        REFERENCES public.guest_sessions(id)           ON DELETE CASCADE,
  blocked_client_user_id   UUID        REFERENCES public.profiles(id)                 ON DELETE CASCADE,
  scope                    TEXT        NOT NULL DEFAULT 'messaging' CHECK (scope IN ('messaging', 'all')),
  reason                   TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one subject reference, matching blocked_subject_type.
  CONSTRAINT user_blocks_subject_xor CHECK (
    (blocked_subject_type = 'guest_session' AND blocked_guest_session_id IS NOT NULL AND blocked_client_user_id IS NULL)
    OR
    (blocked_subject_type = 'client_user'   AND blocked_client_user_id   IS NOT NULL AND blocked_guest_session_id IS NULL)
  )
);

COMMENT ON TABLE public.user_blocks IS
  'A staff recipient (blocker_user_id) blocks a guest session or a registered client from reaching them within a tenant. Enforced at the guest message-send + inquiry-create paths via web/src/lib/inquiry/recipient-safety.ts isBlocked().';

-- One active block per (tenant, blocker, subject). Partial-unique per subject
-- kind so the XOR column that is NULL doesn't collapse the index.
CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_guest_uniq
  ON public.user_blocks (tenant_id, blocker_user_id, blocked_guest_session_id)
  WHERE blocked_guest_session_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_blocks_client_uniq
  ON public.user_blocks (tenant_id, blocker_user_id, blocked_client_user_id)
  WHERE blocked_client_user_id IS NOT NULL;

-- Lookup indexes for the enforcement guard: "is THIS subject blocked by anyone
-- in this tenant?" (the guard does not need to know the blocker up front).
CREATE INDEX IF NOT EXISTS user_blocks_guest_lookup_idx
  ON public.user_blocks (tenant_id, blocked_guest_session_id)
  WHERE blocked_guest_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS user_blocks_client_lookup_idx
  ON public.user_blocks (tenant_id, blocked_client_user_id)
  WHERE blocked_client_user_id IS NOT NULL;

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Tenant staff: full access to blocks in their own tenant (coordination +
-- review). Matches the inquiry_messages_staff posture.
DROP POLICY IF EXISTS user_blocks_staff ON public.user_blocks;
CREATE POLICY user_blocks_staff ON public.user_blocks
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Self: a user can READ the blocks THEY created (self-scoped queries). This is
-- SELECT-ONLY by design — WRITES are authorised exclusively by the staff policy
-- above (is_staff_of_tenant in WITH CHECK). A pure self WITH CHECK would let any
-- authenticated user INSERT a block row into ANY tenant against ANY subject
-- (their own blocker_user_id satisfies the check while tenant_id/subject are
-- unconstrained) — a cross-tenant denial-of-conversation write primitive. The
-- enforcement guard isBlocked() reads under the service-role client, so a forged
-- row would silently refuse a victim's messages. Restrict writes to staff.
DROP POLICY IF EXISTS user_blocks_self ON public.user_blocks;
CREATE POLICY user_blocks_self ON public.user_blocks
  FOR SELECT
  USING (blocker_user_id = auth.uid());

-- Defence-in-depth: revoke the default authenticated DML grant so a direct
-- PostgREST write can't reach the table even if a future PERMISSIVE policy were
-- added by mistake. SELECT stays (gated by the policies above). Writes flow
-- through the staff policy via the service-role enforcement path / a staff JWT.
REVOKE INSERT, UPDATE, DELETE ON public.user_blocks FROM authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- inquiry_reports — a staff recipient reports a sender on an inquiry.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.inquiry_reports (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID        NOT NULL REFERENCES public.agencies(id)   ON DELETE CASCADE,
  inquiry_id                UUID        NOT NULL REFERENCES public.inquiries(id)  ON DELETE CASCADE,
  reporter_user_id          UUID        NOT NULL REFERENCES public.profiles(id)   ON DELETE CASCADE,
  -- WHO is being reported (denormalized for the review queue; on a guest thread
  -- the reported subject may be a guest session with no client user yet, so one
  -- of these may be NULL). These columns are also the join key for the
  -- "repeated reports against one subject → trust-down + suspend" rollup
  -- (Lane C / L6) — see recipient-safety.ts reportInquiry() trust-down note.
  reported_guest_session_id UUID        REFERENCES public.guest_sessions(id)      ON DELETE SET NULL,
  reported_client_user_id   UUID        REFERENCES public.profiles(id)            ON DELETE SET NULL,
  reason                    TEXT        NOT NULL CHECK (reason IN ('spam', 'harassment', 'scam_or_fraud', 'off_platform', 'inappropriate', 'other')),
  detail                    TEXT,
  status                    TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at               TIMESTAMPTZ
);

COMMENT ON TABLE public.inquiry_reports IS
  'A staff recipient (reporter_user_id) reports a sender on an inquiry. status=open feeds the platform review queue (Lane C / L6, the hook for account_status=suspended). Repeated reports against one reported subject also feed the buyer trust ladder DOWN — see web/src/lib/inquiry/recipient-safety.ts.';

CREATE INDEX IF NOT EXISTS inquiry_reports_inquiry_idx
  ON public.inquiry_reports (inquiry_id);

-- Review-queue hot path: open reports per tenant.
CREATE INDEX IF NOT EXISTS inquiry_reports_status_idx
  ON public.inquiry_reports (tenant_id, status)
  WHERE status = 'open';

-- Subject rollup for the trust-down / suspension hook ("how many open/total
-- reports does this subject have?").
CREATE INDEX IF NOT EXISTS inquiry_reports_guest_subject_idx
  ON public.inquiry_reports (reported_guest_session_id)
  WHERE reported_guest_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS inquiry_reports_client_subject_idx
  ON public.inquiry_reports (reported_client_user_id)
  WHERE reported_client_user_id IS NOT NULL;

ALTER TABLE public.inquiry_reports ENABLE ROW LEVEL SECURITY;

-- Tenant staff: full access to reports in their own tenant (file + triage).
DROP POLICY IF EXISTS inquiry_reports_staff ON public.inquiry_reports;
CREATE POLICY inquiry_reports_staff ON public.inquiry_reports
  FOR ALL
  USING (public.is_staff_of_tenant(tenant_id))
  WITH CHECK (public.is_staff_of_tenant(tenant_id));

-- Self: a reporter can READ the reports THEY filed. SELECT-ONLY by design —
-- same root cause as user_blocks: a self WITH CHECK lets any authenticated user
-- file a report in ANY tenant against ANY subject on ANY inquiry (only
-- reporter_user_id is constrained), which would feed the "repeated reports ->
-- trust-down + suspend" rollup with sockpuppet spam. Writes are staff-only via
-- inquiry_reports_staff. (MVP scope: the reportInquiry() action that backs the
-- trust-chip is already staff-only. If client self-report is ever a product
-- need, add a TIGHT policy asserting the reporter is a participant of inquiry_id
-- AND inquiry_id belongs to tenant_id — not a bare reporter_user_id check.)
DROP POLICY IF EXISTS inquiry_reports_self ON public.inquiry_reports;
CREATE POLICY inquiry_reports_self ON public.inquiry_reports
  FOR SELECT
  USING (reporter_user_id = auth.uid());

-- Defence-in-depth: revoke the default authenticated DML grant (see user_blocks).
REVOKE INSERT, UPDATE, DELETE ON public.inquiry_reports FROM authenticated;

COMMIT;
