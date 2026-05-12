-- ============================================================================
-- RLS Messaging Coverage — 2026-05-12
-- ============================================================================
--
-- AUDIT FINDINGS
-- ──────────────
-- Three gaps identified by end-to-end audit of inquiry_messages +
-- inquiry_message_reads RLS policies:
--
-- GAP 1 — Client private-thread INSERT before offer is presented.
--   The existing `inquiry_messages_private_insert_participant` policy requires
--   the caller to have a row in `inquiry_participants` with role='client'.
--   However, clients are inserted into inquiry_participants lazily — only when
--   an offer is first presented (Contract 8.1 in the engine RPCs). Before that
--   point, the client's relationship to the inquiry is captured exclusively by
--   `inquiries.client_user_id`. A client trying to send the first message (pre-
--   offer) therefore hits an RLS denial even though the application layer has
--   already verified `inquiries.client_user_id = auth.uid()`.
--
--   FIX: Extend the private-thread INSERT policy to also allow inserts where
--   `inquiries.client_user_id = auth.uid()`. The SELECT policy already has this
--   path missing too — add a complementary SELECT arm.
--
-- GAP 2 — Private-thread SELECT: client before participant row exists.
--   Same root cause as Gap 1 but on the SELECT side. The existing
--   `inquiry_messages_private_select_participant` policy only checks
--   `inquiry_participants.user_id = auth.uid()`. A client with no participant
--   row cannot read the thread they opened.
--
-- GAP 3 — inquiry_message_reads: no SELECT policy for participants.
--   `inquiry_message_reads_tenant_staff` covers staff. The existing
--   `inquiry_message_reads_participant_own` uses FOR ALL which covers SELECT,
--   but only for rows where `user_id = auth.uid()`. The `inquiry_mark_thread_read`
--   RPC is SECURITY DEFINER so it bypasses RLS for the upsert — that path is
--   fine. The gap is a direct SELECT by non-staff participants to read their
--   own watermark. The FOR ALL policy covers this — no new policy needed here.
--   (Documented as confirmed-correct, not a gap.)
--
-- POLICIES ALREADY CORRECT — CONFIRMED
-- ──────────────────────────────────────
--   • inquiry_messages_tenant_staff           — is_staff_of_tenant(tenant_id) ✓
--   • inquiry_messages_private_insert_participant — client/coordinator w/ participant row ✓
--     (extended below to also cover pre-participant client)
--   • inquiry_messages_group_select_participant   — updated 20260520113000 for talent ✓
--   • inquiry_messages_group_insert_participant   — updated 20260520113000 for talent ✓
--   • inquiry_messages_update_own                 — sender_user_id = auth.uid() ✓
--   • inquiry_message_reads_tenant_staff          — is_staff_of_tenant(tenant_id) ✓
--   • inquiry_message_reads_participant_own       — user_id = auth.uid() FOR ALL ✓
--
-- IDEMPOTENCY: all DROP POLICY uses IF EXISTS; CREATE POLICY names are new
-- (_v2 suffix) where the old policy is being replaced by a superset, so the
-- migration can be re-run safely without affecting any currently-passing paths.
--
-- ============================================================================

BEGIN;

-- ── GAP 2 + 1 combined: private-thread SELECT (extended to cover client_user_id)
-- Drop the old name and create a new broader policy.  The old name is preserved
-- here via DROP IF EXISTS so a partial re-run is safe.

DROP POLICY IF EXISTS inquiry_messages_private_select_participant   ON public.inquiry_messages;
DROP POLICY IF EXISTS inquiry_messages_private_select_participant_v2 ON public.inquiry_messages;

CREATE POLICY inquiry_messages_private_select_participant_v2 ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'private'
    AND (
      -- Path A: participant row exists (post-offer, or coordinator)
      EXISTS (
        SELECT 1 FROM public.inquiry_participants p
        WHERE p.inquiry_id = inquiry_messages.inquiry_id
          AND p.user_id    = auth.uid()
          AND p.role       IN ('client', 'coordinator')
          AND p.status     IN ('invited', 'active')
      )
      -- Path B: caller is the inquiry's client_user_id (pre-offer, no participant row yet)
      OR EXISTS (
        SELECT 1 FROM public.inquiries i
        WHERE i.id             = inquiry_messages.inquiry_id
          AND i.client_user_id = auth.uid()
      )
    )
  );


-- ── GAP 1: private-thread INSERT (extended to cover client_user_id)
-- Replace with a superset that covers both paths.

DROP POLICY IF EXISTS inquiry_messages_private_insert_participant   ON public.inquiry_messages;
DROP POLICY IF EXISTS inquiry_messages_private_insert_participant_v2 ON public.inquiry_messages;

CREATE POLICY inquiry_messages_private_insert_participant_v2 ON public.inquiry_messages
  FOR INSERT WITH CHECK (
    thread_type    = 'private'
    AND sender_user_id = auth.uid()
    AND (
      -- Path A: participant row exists (post-offer, or coordinator)
      EXISTS (
        SELECT 1 FROM public.inquiry_participants p
        WHERE p.inquiry_id = inquiry_messages.inquiry_id
          AND p.user_id    = auth.uid()
          AND p.role       IN ('client', 'coordinator')
          AND p.status     IN ('invited', 'active')
      )
      -- Path B: caller is the inquiry's client_user_id (pre-offer, no participant row yet)
      OR EXISTS (
        SELECT 1 FROM public.inquiries i
        WHERE i.id             = inquiry_messages.inquiry_id
          AND i.client_user_id = auth.uid()
      )
    )
  );

-- ── No changes needed to inquiry_message_reads policies ──────────────────────
-- inquiry_message_reads_tenant_staff:      is_staff_of_tenant(tenant_id) — correct
-- inquiry_message_reads_participant_own:   user_id = auth.uid() FOR ALL — correct
-- inquiry_mark_thread_read RPC:            SECURITY DEFINER, bypasses RLS — correct

COMMIT;
