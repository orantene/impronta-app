-- Allow talent to manage their own objects in media-public and media-originals
-- Path convention: first segment MUST be talent_profiles.id (UUID) for ownership checks.

BEGIN;
-- Make migration idempotent (safe to re-run from SQL editor).
DROP POLICY IF EXISTS "talent_insert_public_media" ON storage.objects;
DROP POLICY IF EXISTS "talent_update_own_public_media" ON storage.objects;
DROP POLICY IF EXISTS "talent_delete_own_public_media" ON storage.objects;
DROP POLICY IF EXISTS "talent_insert_originals_media" ON storage.objects;
DROP POLICY IF EXISTS "talent_delete_own_originals_media" ON storage.objects;
CREATE POLICY "talent_insert_public_media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-public'
  AND EXISTS (
    SELECT 1 FROM public.talent_profiles t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.user_id = auth.uid()
  )
);
CREATE POLICY "talent_update_own_public_media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'media-public'
  AND EXISTS (
    SELECT 1 FROM public.talent_profiles t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.user_id = auth.uid()
  )
);
CREATE POLICY "talent_delete_own_public_media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media-public'
  AND EXISTS (
    SELECT 1 FROM public.talent_profiles t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.user_id = auth.uid()
  )
);
CREATE POLICY "talent_insert_originals_media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-originals'
  AND EXISTS (
    SELECT 1 FROM public.talent_profiles t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.user_id = auth.uid()
  )
);
CREATE POLICY "talent_delete_own_originals_media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media-originals'
  AND EXISTS (
    SELECT 1 FROM public.talent_profiles t
    WHERE t.id::text = (storage.foldername(name))[1]
      AND t.user_id = auth.uid()
  )
);
COMMIT;
