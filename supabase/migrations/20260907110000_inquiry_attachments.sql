-- Phase 3.12 / Messages — Slice B / Files tab.
--
-- Adds:
--   • inquiry_attachments         — metadata table (one row per file)
--   • storage bucket "inquiry-files" — private, staff-gated
--
-- Files belong to an inquiry × tenant. Only tenant staff can upload, list,
-- delete, and download. Clients/talent can list+download once they're
-- inquiry participants (future slice will extend RLS).

BEGIN;

-- ── 1. Metadata table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inquiry_attachments (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL REFERENCES public.agencies(id)  ON DELETE CASCADE,
  inquiry_id      UUID        NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  uploaded_by     UUID        NOT NULL REFERENCES public.profiles(id)  ON DELETE SET NULL,
  storage_path    TEXT        NOT NULL,
  filename        TEXT        NOT NULL,
  mime_type       TEXT,
  byte_size       BIGINT,
  description     TEXT,
  visibility      TEXT        NOT NULL DEFAULT 'staff'
                                CHECK (visibility IN ('staff', 'shared')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

COMMENT ON TABLE public.inquiry_attachments IS
  'File attachments for an inquiry workspace (call sheets, briefs, contracts, references). Storage bucket: inquiry-files.';

CREATE INDEX IF NOT EXISTS inquiry_attachments_inquiry_idx
  ON public.inquiry_attachments (tenant_id, inquiry_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS inquiry_attachments_uploaded_by_idx
  ON public.inquiry_attachments (uploaded_by);

ALTER TABLE public.inquiry_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_attachments_staff_all ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_staff_all ON public.inquiry_attachments
  FOR ALL
  USING       (public.is_staff_of_tenant(tenant_id))
  WITH CHECK  (public.is_staff_of_tenant(tenant_id));

-- Participants can read (their own inquiry attachments) when visibility = 'shared'.
DROP POLICY IF EXISTS inquiry_attachments_participant_select ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_participant_select ON public.inquiry_attachments
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND visibility = 'shared'
    AND EXISTS (
      SELECT 1 FROM public.inquiry_participants p
      WHERE p.inquiry_id = inquiry_attachments.inquiry_id
        AND p.tenant_id  = inquiry_attachments.tenant_id
        AND p.user_id    = auth.uid()
        AND p.removed_at IS NULL
    )
  );

-- Touch trigger could be added later if we ever update rows in place.

-- ── 2. Storage bucket ────────────────────────────────────────────────────────
-- The bucket is created idempotently. RLS on storage.objects is keyed off
-- bucket_id, so we add policies that gate by tenant_id encoded in the path.
-- Path convention: {tenant_id}/{inquiry_id}/{uuid}-{filename}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inquiry-files',
  'inquiry-files',
  FALSE,
  104857600,                     -- 100 MB cap per file
  NULL                           -- accept all types; UI guards extension
)
ON CONFLICT (id) DO NOTHING;

-- Helper: extract tenant_id (first path segment) for RLS checks.
CREATE OR REPLACE FUNCTION public._inquiry_files_tenant_from_path(name TEXT)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::UUID
$$;

GRANT EXECUTE ON FUNCTION public._inquiry_files_tenant_from_path(TEXT) TO authenticated;

-- Storage policies (staff-only, gated by tenant in path).
DROP POLICY IF EXISTS inquiry_files_staff_select ON storage.objects;
CREATE POLICY inquiry_files_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'inquiry-files'
    AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS inquiry_files_staff_insert ON storage.objects;
CREATE POLICY inquiry_files_staff_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inquiry-files'
    AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS inquiry_files_staff_delete ON storage.objects;
CREATE POLICY inquiry_files_staff_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'inquiry-files'
    AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name))
  );

DROP POLICY IF EXISTS inquiry_files_staff_update ON storage.objects;
CREATE POLICY inquiry_files_staff_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'inquiry-files'
    AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name))
  )
  WITH CHECK (
    bucket_id = 'inquiry-files'
    AND public.is_staff_of_tenant(public._inquiry_files_tenant_from_path(name))
  );

COMMIT;
