-- Allow agency staff to upload/update/delete talent media objects (replace bad assets, etc.).
-- Path convention unchanged: first segment = talent_profiles.id.

BEGIN;
DROP POLICY IF EXISTS "staff_insert_public_media" ON storage.objects;
DROP POLICY IF EXISTS "staff_update_public_media" ON storage.objects;
DROP POLICY IF EXISTS "staff_delete_public_media" ON storage.objects;
DROP POLICY IF EXISTS "staff_insert_originals_media" ON storage.objects;
DROP POLICY IF EXISTS "staff_delete_originals_media" ON storage.objects;
CREATE POLICY "staff_insert_public_media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-public'
  AND public.is_agency_staff()
);
CREATE POLICY "staff_update_public_media"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'media-public'
  AND public.is_agency_staff()
);
CREATE POLICY "staff_delete_public_media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media-public'
  AND public.is_agency_staff()
);
CREATE POLICY "staff_insert_originals_media"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'media-originals'
  AND public.is_agency_staff()
);
CREATE POLICY "staff_delete_originals_media"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'media-originals'
  AND public.is_agency_staff()
);
COMMIT;
