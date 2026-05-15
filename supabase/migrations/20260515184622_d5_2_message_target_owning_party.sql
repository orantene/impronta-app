-- D5.2 — Cross-tenant fan-out, slice 2: target_owning_party_id on
-- inquiry_messages.
--
-- D5.1 (`20260515180511_d5_cross_tenant_participant_rls.sql`) split
-- inquiry_participants admin RLS by role so an agency Milan admin can
-- no longer read talent participant rows owned by agency Berlin.
--
-- This slice does the same for the message stream. The key column:
--   inquiry_messages.target_owning_party_id (UUID, NULL = visible to
--   any staff of the inquiry's tenant_id — back-compat default).
--
-- When the D5 fan-out submit path inserts a message that should be
-- visible to ONLY one owning party (e.g. agency Milan's reply to
-- their talent's row, which Berlin should never see), it stamps
-- target_owning_party_id = milan_tenant_id. The staff RLS coalesces
-- the target with the inquiry's tenant_id so single-tenant inquiries
-- (target=NULL) behave exactly as before.
--
-- Sender logic update is INTENTIONALLY deferred (next slice — D5.3).
-- This migration is forward-compatible: existing rows backfill to NULL
-- and continue to work; new cross-tenant code paths can opt-in by
-- stamping the column.
--
-- See:
--   - web/docs/discover-and-unified-inquiry-2026-05-14.md §3.3
--   - supabase/migrations/20260513202325_thread_governance_slice_n.sql
--   - supabase/migrations/20260515180511_d5_cross_tenant_participant_rls.sql

BEGIN;

-- ─── 1. New column + type-symmetry partner ──────────────────────────────
ALTER TABLE public.inquiry_messages
  ADD COLUMN IF NOT EXISTS target_owning_party_type TEXT
    CHECK (target_owning_party_type IS NULL OR target_owning_party_type IN ('agency','workspace','talent')),
  ADD COLUMN IF NOT EXISTS target_owning_party_id UUID;

COMMENT ON COLUMN public.inquiry_messages.target_owning_party_id IS
  'D5.2: when set, restricts staff visibility to staff_of_tenant(target_owning_party_id) instead of staff_of_tenant(tenant_id). NULL = back-compat default (visible to inquiry tenant staff). Stamped by D5 cross-tenant submit paths so agency Milan sends an admin message that agency Berlin cannot read.';

COMMENT ON COLUMN public.inquiry_messages.target_owning_party_type IS
  'Companion to target_owning_party_id. Matches inquiry_participants.owning_party_type enum. NULL when target_owning_party_id is NULL.';

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_target_owning_party
  ON public.inquiry_messages (target_owning_party_id)
  WHERE target_owning_party_id IS NOT NULL;

-- ─── 2. Update the tenant_staff policy to honor the target ──────────────
-- Old: USING is_staff_of_tenant(tenant_id) — single tenant scope only.
-- New: USING is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
--      — when target set, scope to that owning party; otherwise fall back
--      to the inquiry tenant (single-tenant world unchanged).

DROP POLICY IF EXISTS inquiry_messages_tenant_staff ON public.inquiry_messages;
CREATE POLICY inquiry_messages_tenant_staff ON public.inquiry_messages
  FOR ALL
  USING (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  )
  WITH CHECK (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  );

-- ─── 3. inquiry_message_reads — same target-aware scoping ───────────────
-- Read receipts must follow the same gating; if Milan can't see a
-- Berlin-targeted message, they shouldn't see its read receipt either.

ALTER TABLE public.inquiry_message_reads
  ADD COLUMN IF NOT EXISTS target_owning_party_id UUID;

CREATE INDEX IF NOT EXISTS idx_inquiry_message_reads_target_owning_party
  ON public.inquiry_message_reads (target_owning_party_id)
  WHERE target_owning_party_id IS NOT NULL;

DROP POLICY IF EXISTS inquiry_message_reads_tenant_staff ON public.inquiry_message_reads;
CREATE POLICY inquiry_message_reads_tenant_staff ON public.inquiry_message_reads
  FOR ALL
  USING (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  )
  WITH CHECK (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  );

-- ─── 4. Participant-level policies remain unchanged ─────────────────────
-- inquiry_messages_private_select_participant (client thread) and
-- inquiry_messages_group_select_participant (group thread) check
-- whether the caller is a participant. Those rules are correct for
-- cross-tenant: if you're on the inquiry as a coordinator/talent/
-- client, you see the thread. The tenant-level scope is what the
-- agency-Milan vs agency-Berlin separation needs, and that's what
-- the staff policy enforces above.

COMMIT;
