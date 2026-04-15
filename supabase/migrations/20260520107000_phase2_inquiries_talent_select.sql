-- Talents participating in an inquiry may read the inquiry row (v2 roster).

BEGIN;

DROP POLICY IF EXISTS inquiries_select_talent_participant ON public.inquiries;
CREATE POLICY inquiries_select_talent_participant ON public.inquiries
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.inquiry_participants p
      INNER JOIN public.talent_profiles tp ON tp.id = p.talent_profile_id
      WHERE p.inquiry_id = inquiries.id
        AND p.role = 'talent'
        AND tp.user_id = auth.uid()
    )
  );

COMMIT;
