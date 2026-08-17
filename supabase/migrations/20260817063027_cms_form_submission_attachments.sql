-- FORMS-3 — contact-form attachments.
--
-- Until now the CMS contact_form's `file` field was a lie: the visitor picked a
-- file, the form reported success, and /api/cms/forms/submit kept only
-- File.name. This migration adds the relation the bytes land in.
--
-- SECURITY SHAPE
-- ──────────────
-- The bytes arrive inside the SAME anonymous multipart POST that carries the
-- honeypot, the captcha token and the section id. The submit route validates
-- them (allow-list + magic-byte sniff + size + count) and writes them with the
-- SERVICE ROLE after every anti-abuse gate has passed. No signed upload URL is
-- ever minted for an unauthenticated caller and the visitor's browser never
-- learns the bucket name or a storage path. There is therefore NO anon insert
-- policy on either the table or the bucket below — exactly like
-- cms_form_submissions itself.
--
-- WHY A SEPARATE TABLE AND A SEPARATE BUCKET (not media_assets / media-public)
-- ───────────────────────────────────────────────────────────────────────────
--   * media_assets is the tenant's LIBRARY: quota-counted, picker-listed, and
--     wrapped in ownership/approval/grant machinery that means nothing for a
--     stranger's lead attachment. Putting untrusted visitor uploads there would
--     require every library query to exclude them, and one missed query shows
--     an operator a stranger's file as if it were their own brand asset.
--   * The storage reaper walks MANAGED_BUCKETS = ("media-public",
--     "media-originals") only. `form-attachments` sits outside that list — the
--     same reason `inquiry-files` has never been at risk — so a live lead
--     attachment cannot be reaped no matter what MEDIA_REAPER_ENABLED is set
--     to. web/src/lib/site-admin/sections/contact_form/attachments.test.ts
--     asserts the bucket never joins MANAGED_BUCKETS.
--
-- RETENTION: rows cascade with their submission. Submissions are never hard
-- deleted today (status moves to archived/spam), so no orphan path exists yet.
-- If a hard-delete surface is ever added it MUST remove the storage objects
-- too — nothing else will, because no reaper covers this bucket.

BEGIN;

CREATE TABLE IF NOT EXISTS public.cms_form_submission_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL
    REFERENCES public.cms_form_submissions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  /* The contact_form field this file arrived on (schema-validated name). */
  field_name text NOT NULL,
  /* Visitor-supplied name, sanitized for display. NEVER part of storage_path. */
  original_filename text NOT NULL,
  /* The SNIFFED content type, not the browser-declared one. */
  mime_type text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  bucket_id text NOT NULL DEFAULT 'form-attachments',
  /* "<tenant_id>/<submission_id>/<attachment_id>.<sniffed ext>" */
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (bucket_id, storage_path)
);

CREATE INDEX IF NOT EXISTS cms_form_submission_attachments_submission_idx
  ON public.cms_form_submission_attachments (submission_id);
CREATE INDEX IF NOT EXISTS cms_form_submission_attachments_tenant_idx
  ON public.cms_form_submission_attachments (tenant_id, created_at DESC);

ALTER TABLE public.cms_form_submission_attachments ENABLE ROW LEVEL SECURITY;

-- Staff read only, tenant-scoped. Inserts are service-role (the public POST
-- endpoint), mirroring cms_form_submissions: no anon or authenticated INSERT
-- policy exists, so RLS denies it by default.
DROP POLICY IF EXISTS cms_form_submission_attachments_staff_read
  ON public.cms_form_submission_attachments;
CREATE POLICY cms_form_submission_attachments_staff_read
  ON public.cms_form_submission_attachments
  FOR SELECT TO authenticated
  USING (
    public.is_staff_of_tenant(cms_form_submission_attachments.tenant_id)
  );

COMMENT ON TABLE public.cms_form_submission_attachments IS
  'Files attached to CMS contact_form submissions. Written by the service role from /api/cms/forms/submit after honeypot + rate-limit + captcha pass; never by an anon or authenticated client. Objects live in the private form-attachments bucket, which the media reaper does not manage.';

-- ── Storage ─────────────────────────────────────────────────────────────────
-- Private bucket. file_size_limit is a belt-and-braces backstop BELOW the
-- route's own 3 MB per-file cap; allowed_mime_types repeats the route's
-- allow-list so a future code path cannot widen it by accident. SVG is
-- deliberately absent (script container, and nothing sanitizes it on this
-- anonymous lane).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'form-attachments',
  'form-attachments',
  FALSE,
  3145728,                       -- 3 MB
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Helper: tenant_id is the first path segment, exactly like pitch-files.
CREATE OR REPLACE FUNCTION public._form_attachments_tenant_from_path(name TEXT)
RETURNS UUID
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT NULLIF(split_part(name, '/', 1), '')::UUID
$$;

GRANT EXECUTE ON FUNCTION public._form_attachments_tenant_from_path(TEXT) TO authenticated;

-- Staff may read their own tenant's attachments directly; the admin inbox
-- actually serves them through a short-lived signed URL minted server-side.
-- There is no INSERT/UPDATE/DELETE policy at all: only the service role, which
-- bypasses RLS, ever writes to this bucket.
DROP POLICY IF EXISTS form_attachments_staff_select ON storage.objects;
CREATE POLICY form_attachments_staff_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'form-attachments'
    AND public.is_staff_of_tenant(public._form_attachments_tenant_from_path(name))
  );

COMMIT;
