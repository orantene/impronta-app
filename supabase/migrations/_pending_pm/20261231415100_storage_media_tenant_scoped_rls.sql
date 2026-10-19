-- 20261231415100_storage_media_tenant_scoped_rls.sql
-- HELD FILE (PM applies). P0 SECURITY, PR 0b-2: "businesses only touch their own files".
--
-- THE HOLE. The storage policies on the buckets media-public and media-originals
-- gate staff with the GLOBAL helper public.is_agency_staff() (profiles.app_role
-- IN ('super_admin','agency_staff')). Every self-serve studio owner carries app_role
-- 'agency_staff', so any studio owner, straight through the Storage API (which
-- bypasses the tenant-scoped server routes), could:
--   * list and read every other tenant's PRIVATE originals (NDAs, IDs, W-8s,
--     contracts)                                   [staff_select_originals_media]
--   * insert / delete files in any tenant's originals
--                          [staff_insert_originals_media, staff_delete_originals_media]
--   * insert / update / delete any tenant's PUBLIC media (deface a live site's
--     images)  [staff_insert_public_media, staff_update_public_media, staff_delete_public_media]
-- Reproduced on staging (fxlankepwnvelxjrahwk) in a rolled-back transaction as an
-- agency_staff user of tenant A against tenant B's paths: every one of those
-- succeeded.
--
-- OBJECT-PATH CONVENTIONS (from the code that uploads, and from existing rows):
--   tenant/<tenant_id>/...                  server routes (service role): library, branding, talent
--   <talent_profile_id>/<kind>/<file>       roster editor direct uploads, talent documents/gallery
--   <tenant_id>/staging/<file>              staged uploads before a talent is assigned
-- So the "tenant segment" is segment 2 after a literal `tenant/`, else segment 1,
-- which is EITHER a tenant id (staging) OR a talent_profiles.id that must be
-- resolved to its managing tenant(s) through agency_talent_roster.
--
-- THE FIX. Replace the five global-staff policies with tenant-scoped ones driven by
-- ONE helper, public.storage_media_staff_can_touch(name), built on
-- is_staff_of_tenant() (which already lets the platform admin through). Public READ
-- on media-public (storage_media_public_select) is untouched: it is a public bucket
-- and sites render from it. Talent-self policies (talent owns the <talent_profile_id>/
-- folder) are untouched. Server routes using the service role bypass RLS and are
-- unaffected; signed upload URLs are token-authorised and unaffected. After this
-- migration the ONLY user-session writers on these buckets are the roster editor's
-- direct browser uploads (EditorSections.tsx, TalentEditForm.tsx), which write
-- under <talent_profile_id>/ for a talent the tenant rosters: still allowed.
-- A user who is staff of NO tenant that owns the path gets no access.
--
-- Idempotent (CREATE OR REPLACE / DROP POLICY IF EXISTS). No data touched.
-- Reversal = re-create the five global policies (a known-insecure state).

CREATE OR REPLACE FUNCTION public.storage_media_staff_can_touch(p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    -- tenant/<tenant_id>/...
    WHEN split_part(p_name, '/', 1) = 'tenant'
         AND split_part(p_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_staff_of_tenant(split_part(p_name, '/', 2)::uuid)
    -- <tenant_id>/staging/... OR <talent_profile_id>/...
    WHEN split_part(p_name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN public.is_staff_of_tenant(split_part(p_name, '/', 1)::uuid)
           OR EXISTS (
             SELECT 1
             FROM public.agency_talent_roster r
             WHERE r.talent_profile_id = split_part(p_name, '/', 1)::uuid
               AND r.removed_at IS NULL
               AND r.status IN ('pending', 'active')
               AND public.is_staff_of_tenant(r.tenant_id)
           )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.storage_media_staff_can_touch(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.storage_media_staff_can_touch(text) TO authenticated, service_role;

-- Drop the global-staff policies (and any earlier broad ones, by every name they have carried).
DROP POLICY IF EXISTS staff_insert_public_media        ON storage.objects;
DROP POLICY IF EXISTS staff_update_public_media        ON storage.objects;
DROP POLICY IF EXISTS staff_delete_public_media        ON storage.objects;
DROP POLICY IF EXISTS staff_insert_originals_media     ON storage.objects;
DROP POLICY IF EXISTS staff_delete_originals_media     ON storage.objects;
DROP POLICY IF EXISTS staff_select_originals_media     ON storage.objects;
DROP POLICY IF EXISTS storage_media_public_insert_staff ON storage.objects;
DROP POLICY IF EXISTS storage_media_originals_select_authenticated ON storage.objects;
DROP POLICY IF EXISTS storage_media_originals_insert_authenticated ON storage.objects;

-- media-public: tenant-scoped staff writes (public READ stays as storage_media_public_select).
CREATE POLICY staff_insert_public_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-public' AND public.storage_media_staff_can_touch(name));

CREATE POLICY staff_update_public_media ON storage.objects
  FOR UPDATE TO authenticated
  USING      (bucket_id = 'media-public' AND public.storage_media_staff_can_touch(name))
  WITH CHECK (bucket_id = 'media-public' AND public.storage_media_staff_can_touch(name));

CREATE POLICY staff_delete_public_media ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media-public' AND public.storage_media_staff_can_touch(name));

-- media-originals (PRIVATE): tenant-scoped staff select / insert / delete.
CREATE POLICY staff_select_originals_media ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'media-originals' AND public.storage_media_staff_can_touch(name));

CREATE POLICY staff_insert_originals_media ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'media-originals' AND public.storage_media_staff_can_touch(name));

CREATE POLICY staff_delete_originals_media ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'media-originals' AND public.storage_media_staff_can_touch(name));

-- PRODUCTION DRIFT (found 2026-10-18 before applying to prod): production carries three MERGED
-- policies on storage.objects (objects_merged_{select,insert,delete}_authenticated) that fold
-- inquiry-files, pitch-files and the media buckets together and use the GLOBAL is_agency_staff()
-- for media-public / media-originals. Policies are permissive (OR), so the replacement policies
-- above would NOT close the hole there. Staging has no such policies. Rewrite them in place,
-- keeping the inquiry-files / pitch-files / talent-own branches byte for byte, when they exist.
-- (storage_media_staff_can_touch also covers platform admins through is_staff_of_tenant.)
-- objects_merged_select_authenticated never granted media-public select to staff (public read
-- covers it), so only media-originals changes there.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'objects_merged_select_authenticated') THEN
    ALTER POLICY objects_merged_select_authenticated ON storage.objects
      USING (
        ((bucket_id = 'inquiry-files'::text) AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name)))
        OR ((bucket_id = 'pitch-files'::text) AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name)))
        OR ((bucket_id = 'media-originals'::text) AND public.storage_media_staff_can_touch(name))
        OR ((bucket_id = 'media-originals'::text) AND (EXISTS (SELECT 1 FROM public.talent_profiles t WHERE ((t.id)::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()))))
      );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'objects_merged_insert_authenticated') THEN
    ALTER POLICY objects_merged_insert_authenticated ON storage.objects
      WITH CHECK (
        ((bucket_id = 'inquiry-files'::text) AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name)))
        OR ((bucket_id = 'pitch-files'::text) AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name)))
        OR ((bucket_id = 'media-originals'::text) AND public.storage_media_staff_can_touch(name))
        OR ((bucket_id = 'media-public'::text) AND public.storage_media_staff_can_touch(name))
        OR ((bucket_id = 'media-originals'::text) AND (EXISTS (SELECT 1 FROM public.talent_profiles t WHERE ((t.id)::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()))))
        OR ((bucket_id = 'media-public'::text) AND (EXISTS (SELECT 1 FROM public.talent_profiles t WHERE ((t.id)::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()))))
      );
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname = 'objects_merged_delete_authenticated') THEN
    ALTER POLICY objects_merged_delete_authenticated ON storage.objects
      USING (
        ((bucket_id = 'inquiry-files'::text) AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name)))
        OR ((bucket_id = 'pitch-files'::text) AND public.is_staff_of_tenant(public._pitch_files_tenant_from_path(name)))
        OR ((bucket_id = 'media-originals'::text) AND public.storage_media_staff_can_touch(name))
        OR ((bucket_id = 'media-public'::text) AND public.storage_media_staff_can_touch(name))
        OR ((bucket_id = 'media-originals'::text) AND (EXISTS (SELECT 1 FROM public.talent_profiles t WHERE ((t.id)::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()))))
        OR ((bucket_id = 'media-public'::text) AND (EXISTS (SELECT 1 FROM public.talent_profiles t WHERE ((t.id)::text = (storage.foldername(objects.name))[1] AND t.user_id = auth.uid()))))
      );
  END IF;
END $$;

