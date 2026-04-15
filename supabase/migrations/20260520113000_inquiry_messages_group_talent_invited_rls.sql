-- Group thread RLS: align with engine permissions (invited + active talent) and talent_profiles join.
-- Prior policy required inquiry_participants.user_id = auth.uid() and status = active only, which
-- blocked invited talent and any talent row without user_id populated.

BEGIN;

DROP POLICY IF EXISTS inquiry_messages_group_select_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_group_select_participant ON public.inquiry_messages
  FOR SELECT USING (
    thread_type = 'group'
    AND EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.status IN ('invited', 'active')
        AND (
          (p.role IN ('client', 'coordinator') AND p.user_id = auth.uid())
          OR (
            p.role = 'talent'
            AND p.talent_profile_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.talent_profiles tp
              WHERE tp.id = p.talent_profile_id
                AND tp.user_id = auth.uid()
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS inquiry_messages_group_insert_participant ON public.inquiry_messages;
CREATE POLICY inquiry_messages_group_insert_participant ON public.inquiry_messages
  FOR INSERT WITH CHECK (
    thread_type = 'group'
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_messages.inquiry_id
        AND p.status IN ('invited', 'active')
        AND (
          (p.role IN ('client', 'coordinator') AND p.user_id = auth.uid())
          OR (
            p.role = 'talent'
            AND p.talent_profile_id IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM public.talent_profiles tp
              WHERE tp.id = p.talent_profile_id
                AND tp.user_id = auth.uid()
            )
          )
        )
    )
  );

COMMIT;
