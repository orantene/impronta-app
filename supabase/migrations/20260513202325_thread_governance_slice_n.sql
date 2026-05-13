-- Messages Consolidation Plan v2 — Slice N
-- Thread governance + server-side permissions hardening.
--
-- Per plan §6 (engine-level permission matrix), inquiry_messages
-- visibility must enforce the thread-type × participant-role rules at
-- the database layer. The audit revealed one gap:
--
--   The existing Group thread SELECT/INSERT policies (from
--   20260520108000_phase2_inquiry_messages_participant_rls.sql) allow
--   ANY active participant to read or write. But clients ARE active
--   participants on every inquiry — they'd silently see + send to
--   the Group thread, violating plan §4.2 ("Client visibility:
--   never").
--
-- This migration tightens both policies to require role != 'client'.
-- The Private (Client) thread policies are already correct
-- (role IN 'client', 'coordinator') so they're unchanged.

BEGIN;

-- ── Group thread READ: clients excluded ──────────────────────────────
DROP POLICY IF EXISTS inquiry_messages_group_select_participant
  ON public.inquiry_messages;

CREATE POLICY inquiry_messages_group_select_participant
  ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'group'
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('active', 'invited')
        -- Plan §4.2: clients NEVER see the Talent Group thread.
        AND p.role <> 'client'
    )
  );

-- ── Group thread INSERT: clients excluded ────────────────────────────
DROP POLICY IF EXISTS inquiry_messages_group_insert_participant
  ON public.inquiry_messages;

CREATE POLICY inquiry_messages_group_insert_participant
  ON public.inquiry_messages
  FOR INSERT WITH CHECK (
    thread_type = 'group'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status IN ('active', 'invited')
        -- Plan §4.2: clients NEVER send to the Talent Group thread.
        AND p.role <> 'client'
    )
  );

-- ── Documentation: the locked permission matrix from plan §6 ────────
-- Wrapped in DO blocks because some target policies live in
-- companion migrations whose run-order vs. this one is not
-- guaranteed across environments (fresh remote vs. local linked
-- replays diverge). If the policy isn't there yet, skip — the
-- comment is documentation, not load-bearing behavior.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inquiry_messages_private_select_participant' AND tablename = 'inquiry_messages') THEN
    EXECUTE $cmt$COMMENT ON POLICY inquiry_messages_private_select_participant
      ON public.inquiry_messages IS
      'Plan §6: Client thread visible to client + admin + approved coordinators only. Talent is excluded (role=talent fails the IN clause).'$cmt$;
  END IF;
END $$;

COMMENT ON POLICY inquiry_messages_group_select_participant
  ON public.inquiry_messages IS
  'Plan §6: Group thread visible to admin + coordinators + talent participants. Clients are excluded (role<>client).';

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'inquiry_messages_private_insert_participant' AND tablename = 'inquiry_messages') THEN
    EXECUTE $cmt$COMMENT ON POLICY inquiry_messages_private_insert_participant
      ON public.inquiry_messages IS
      'Plan §6: only client + coordinators can post to the Client thread. Plain talent cannot — they upgrade via coordinator_join_requests first.'$cmt$;
  END IF;
END $$;

COMMENT ON POLICY inquiry_messages_group_insert_participant
  ON public.inquiry_messages IS
  'Plan §6: only admin + coordinators + talent can post to the Group thread. Clients are excluded.';

COMMIT;
