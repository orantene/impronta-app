-- Phase 2: participant RLS for inquiry_messages + inquiry_message_reads (non-staff clients/talents/coordinators)

BEGIN;

-- ── inquiry_messages: participant read (private thread)
DROP POLICY IF EXISTS inquiry_messages_private_select_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_private_select_participant ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'private'
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role IN ('client', 'coordinator')
        AND p.status IN ('invited', 'active')
    )
  );

-- ── inquiry_messages: participant read (group thread — active participants)
DROP POLICY IF EXISTS inquiry_messages_group_select_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_group_select_participant ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'group'
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status = 'active'
    )
  );

-- ── inquiry_messages: participant insert (private)
DROP POLICY IF EXISTS inquiry_messages_private_insert_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_private_insert_participant ON public.inquiry_messages
  FOR INSERT WITH CHECK (
    thread_type = 'private'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.role IN ('client', 'coordinator')
        AND p.status IN ('invited', 'active')
    )
  );

-- ── inquiry_messages: participant insert (group)
DROP POLICY IF EXISTS inquiry_messages_group_insert_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_group_insert_participant ON public.inquiry_messages
  FOR INSERT WITH CHECK (
    thread_type = 'group'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.user_id = auth.uid()
        AND p.status = 'active'
    )
  );

-- ── inquiry_messages: update own non-deleted message (edit window enforced in engine)
DROP POLICY IF EXISTS inquiry_messages_update_own ON public.inquiry_messages;
CREATE POLICY inquiry_messages_update_own ON public.inquiry_messages
  FOR UPDATE USING (
    sender_user_id = auth.uid()
    AND deleted_at IS NULL
  )
  WITH CHECK (
    sender_user_id = auth.uid()
  );

-- ── inquiry_message_reads: own rows (clients / talent / coordinators)
DROP POLICY IF EXISTS inquiry_message_reads_participant_own ON public.inquiry_message_reads;
CREATE POLICY inquiry_message_reads_participant_own ON public.inquiry_message_reads
  FOR ALL USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
