-- Phase: persist talent identity documents (W-8s, NDAs, contracts, certs).
--
-- The drawer's FilesEditor lets admins upload a list of talent docs:
-- W-8BEN tax form, NDA, model release, contract, certifications, ID. Until
-- now this list lived in reducer state only and died on reload — the file
-- itself was never uploaded to storage either.
--
-- Solution: store the document metadata list on talent_profiles as JSONB.
-- Files themselves go into the existing private `media-originals` bucket
-- under `<talent_profile_id>/documents/<uuid>.<ext>`.
--
-- Shape of documents_data:
--   [
--     {
--       id: string,            // local id (stable, used for delete)
--       name: string,          // original filename
--       kind: string,          // 'tax' | 'release' | 'nda' | 'contract' | 'cert' | 'id' | 'other'
--       storagePath: string,   // private bucket path
--       bucketId: string,      // 'media-originals'
--       sizeBytes: number,
--       mimeType?: string,
--       uploadedAt: string,    // ISO8601
--       uploadedBy?: string,   // user_id
--     }
--   ]
--
-- DOWN: drop the column.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS documents_data JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.talent_profiles.documents_data IS
  'Talent identity / work documents (W-8, NDA, contract, etc.). Files stored in media-originals bucket; this column carries the metadata list.';

COMMIT;
