-- Fix: allow talent to UPDATE (soft-delete) their own media assets under RLS.
-- Some Postgres/Supabase setups require explicit WITH CHECK for UPDATE to avoid
-- "new row violates row-level security policy" errors.

BEGIN;
DROP POLICY IF EXISTS media_update_talent ON public.media_assets;
CREATE POLICY media_update_talent ON public.media_assets
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.talent_profiles t
      WHERE t.id = owner_talent_profile_id AND t.user_id = auth.uid()
    )
  );
COMMIT;
