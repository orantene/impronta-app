-- Builder P3 media library.
--
-- This repo already has public.media_assets and the public media bucket from
-- the talent-media foundation. This migration extends that canonical table for
-- tenant-owned builder/library images instead of creating a parallel asset
-- table. The existing public bucket assumption is intentional: browser uploads
-- only receive one-shot signed URLs minted by authenticated server routes, and
-- object paths are scoped to tenant/<tenant_id>/library/.

BEGIN;

DO $$
BEGIN
  CREATE TYPE public.media_purpose AS ENUM ('talent', 'branding', 'cms', 'starter_kit');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media-public',
  'media-public',
  TRUE,
  8388608,
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml'
  ]::text[]
)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.media_assets
  ALTER COLUMN owner_talent_profile_id DROP NOT NULL;

ALTER TABLE public.media_assets
  ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.agencies(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS purpose public.media_purpose NOT NULL DEFAULT 'talent',
  ADD COLUMN IF NOT EXISTS public_url TEXT,
  ADD COLUMN IF NOT EXISTS alt TEXT,
  ADD COLUMN IF NOT EXISTS mime TEXT,
  ADD COLUMN IF NOT EXISTS byte_size INTEGER,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.media_assets m
   SET tenant_id = r.tenant_id
  FROM (
    SELECT DISTINCT ON (talent_profile_id)
           talent_profile_id,
           tenant_id
      FROM public.agency_talent_roster
     WHERE status IN ('active','pending')
     ORDER BY talent_profile_id,
              is_primary DESC,
              added_at DESC
  ) r
 WHERE m.owner_talent_profile_id = r.talent_profile_id
   AND m.tenant_id IS NULL;

UPDATE public.media_assets
   SET tenant_id = '00000000-0000-0000-0000-000000000001'::UUID
 WHERE tenant_id IS NULL;

ALTER TABLE public.media_assets
  ALTER COLUMN tenant_id SET NOT NULL;

UPDATE public.media_assets
   SET created_by = uploaded_by_user_id
 WHERE created_by IS NULL
   AND uploaded_by_user_id IS NOT NULL;

UPDATE public.media_assets
   SET byte_size = LEAST(file_size, 2147483647)::INTEGER
 WHERE byte_size IS NULL
   AND file_size IS NOT NULL
   AND file_size >= 0;

UPDATE public.media_assets
   SET mime = mime_type
 WHERE mime IS NULL
   AND mime_type IS NOT NULL
   AND mime_type LIKE 'image/%';

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_owner_or_purpose_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_owner_or_purpose_check
  CHECK (
    (purpose = 'talent' AND owner_talent_profile_id IS NOT NULL)
    OR (purpose <> 'talent')
  );

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_builder_public_url_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_builder_public_url_check
  CHECK (
    public_url IS NULL
    OR public_url ~* '^(https?://|/[^/])'
  );

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_builder_mime_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_builder_mime_check
  CHECK (
    mime IS NULL
    OR mime LIKE 'image/%'
  );

ALTER TABLE public.media_assets
  DROP CONSTRAINT IF EXISTS media_assets_builder_byte_size_check;
ALTER TABLE public.media_assets
  ADD CONSTRAINT media_assets_builder_byte_size_check
  CHECK (
    byte_size IS NULL
    OR byte_size >= 0
  );

CREATE INDEX IF NOT EXISTS media_assets_tenant_created_idx
  ON public.media_assets (tenant_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS media_assets_tenant_purpose_created_idx
  ON public.media_assets (tenant_id, purpose, created_at DESC)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.media_assets.public_url IS
  'Builder P3. Denormalized public URL for tenant media library images; server derives it from storage when absent.';
COMMENT ON COLUMN public.media_assets.alt IS
  'Builder P3. Operator-editable default alt text for tenant media library images.';
COMMENT ON COLUMN public.media_assets.mime IS
  'Builder P3. Validated image MIME type for tenant media library uploads.';
COMMENT ON COLUMN public.media_assets.byte_size IS
  'Builder P3. Stored object byte size after server-side processing.';
COMMENT ON COLUMN public.media_assets.created_by IS
  'Builder P3. User who registered this tenant media asset.';

DROP POLICY IF EXISTS media_select ON public.media_assets;
CREATE POLICY media_select ON public.media_assets
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.app_role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1
          FROM public.agency_memberships m
         WHERE m.profile_id = auth.uid()
           AND m.tenant_id = media_assets.tenant_id
           AND m.status IN ('active', 'pending_acceptance')
      )
      OR EXISTS (
        SELECT 1
          FROM public.talent_profiles t
         WHERE t.id = media_assets.owner_talent_profile_id
           AND t.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
          FROM public.talent_profiles t
         WHERE t.id = media_assets.owner_talent_profile_id
           AND t.workflow_status = 'approved'::profile_workflow_status
           AND t.visibility = 'public'::visibility
           AND media_assets.approval_state = 'approved'::media_approval_state
           AND media_assets.variant_kind <> 'original'::media_variant_kind
      )
    )
  );

DROP POLICY IF EXISTS media_write_staff ON public.media_assets;
CREATE POLICY media_write_staff ON public.media_assets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.app_role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships m
       WHERE m.profile_id = auth.uid()
         AND m.tenant_id = media_assets.tenant_id
         AND m.status IN ('active', 'pending_acceptance')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.profiles p
       WHERE p.id = auth.uid()
         AND p.app_role = 'super_admin'
    )
    OR EXISTS (
      SELECT 1
        FROM public.agency_memberships m
       WHERE m.profile_id = auth.uid()
         AND m.tenant_id = media_assets.tenant_id
         AND m.status IN ('active', 'pending_acceptance')
    )
  );

DROP POLICY IF EXISTS media_assets_tenant_staff_all ON public.media_assets;
CREATE POLICY media_assets_tenant_staff_all ON public.media_assets
  FOR ALL
  USING (
    purpose <> 'talent'
    AND (
      EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.app_role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1
          FROM public.agency_memberships m
         WHERE m.profile_id = auth.uid()
           AND m.tenant_id = media_assets.tenant_id
           AND m.status IN ('active', 'pending_acceptance')
      )
    )
  )
  WITH CHECK (
    purpose <> 'talent'
    AND (
      EXISTS (
        SELECT 1
          FROM public.profiles p
         WHERE p.id = auth.uid()
           AND p.app_role = 'super_admin'
      )
      OR EXISTS (
        SELECT 1
          FROM public.agency_memberships m
         WHERE m.profile_id = auth.uid()
           AND m.tenant_id = media_assets.tenant_id
           AND m.status IN ('active', 'pending_acceptance')
      )
    )
  );

COMMIT;
