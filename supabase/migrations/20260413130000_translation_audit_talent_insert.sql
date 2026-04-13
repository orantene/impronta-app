-- Allow talent users to append translation audit rows for their own profile (EN edit → stale).

BEGIN;

CREATE POLICY translation_audit_talent_own_insert ON public.translation_audit_events
  FOR INSERT TO authenticated
  WITH CHECK (
    entity_type = 'talent_profile'
    AND EXISTS (
      SELECT 1
      FROM public.talent_profiles tp
      WHERE tp.id = entity_id
        AND tp.user_id = auth.uid()
    )
  );

COMMIT;
