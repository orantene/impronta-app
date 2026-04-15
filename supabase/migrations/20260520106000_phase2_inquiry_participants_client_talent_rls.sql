-- Allow clients and talents to read their own inquiry_participants rows (non-staff).

BEGIN;

DROP POLICY IF EXISTS inquiry_participants_client_select ON public.inquiry_participants;
CREATE POLICY inquiry_participants_client_select ON public.inquiry_participants
  FOR SELECT USING (
    user_id = auth.uid()
    AND role = 'client'
  );

DROP POLICY IF EXISTS inquiry_participants_talent_select ON public.inquiry_participants;
CREATE POLICY inquiry_participants_talent_select ON public.inquiry_participants
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      WHERE tp.id = inquiry_participants.talent_profile_id
        AND tp.user_id = auth.uid()
    )
    AND role = 'talent'
  );

COMMIT;
