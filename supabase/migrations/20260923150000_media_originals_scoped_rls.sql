-- 20260923150000_media_originals_scoped_rls.sql
-- SECURITY HOTFIX (Phase 0): close the media-originals open read/write hole.
--
-- The PRIVATE "media-originals" bucket holds NDAs, government IDs, W-8s and
-- contracts. Two broad policies granted EVERY authenticated user read+write
-- with no owner / tenant / path predicate:
--   * storage_media_originals_select_authenticated  (SELECT, USING bucket_id only)
--   * storage_media_originals_insert_authenticated  (INSERT, WITH CHECK bucket_id only)
-- => any logged-in user (incl. a talent of another agency, or a client) could
--    read/write any tenant's private documents by path. Confirmed live via
--    pg_policies on 2026-05-18.
--
-- Scoped staff/talent INSERT + DELETE policies already exist on this bucket
-- (staff_insert_originals_media / talent_insert_originals_media /
--  staff_delete_originals_media / talent_delete_own_originals_media). SELECT,
-- however, had ONLY the broad policy. This migration:
--   1. drops the two broad "any authenticated" policies, and
--   2. adds the MISSING scoped SELECT policies, mirroring the exact
--      predicates already used by the existing scoped INSERT/DELETE policies
--      (is_agency_staff() for staff; talent owns the folder for talent-self).
--
-- App-layer server actions (actionUploadTalentDocument /
-- actionDeleteTalentDocument) additionally roster/tenant-scope via
-- requireStaffTenantAction, and downloads use server-side signed URLs
-- (service role bypasses RLS), so this tightening does not break the admin
-- Files drawer or talent-self access.
--
-- Additive + supersede. No data touched. Reversible (reverting re-creates
-- the broad policies — a known-insecure state, not a resting point).

DROP POLICY IF EXISTS storage_media_originals_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_media_originals_insert_authenticated ON storage.objects;

-- Agency staff may read originals at the storage layer; the application layer
-- still narrows to the staff member's tenant + roster.
CREATE POLICY staff_select_originals_media ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media-originals' AND is_agency_staff());

-- A talent may read ONLY files under their own <talent_profile_id>/ prefix.
CREATE POLICY talent_select_own_originals_media ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'media-originals'
    AND EXISTS (
      SELECT 1 FROM talent_profiles t
      WHERE t.id::text = (storage.foldername(objects.name))[1]
        AND t.user_id = auth.uid()
    )
  );
