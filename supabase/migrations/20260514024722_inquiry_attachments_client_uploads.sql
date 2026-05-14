-- Step 14 of the inquiry-funnel sprint (2026-05-14).
--
-- The `inquiry_attachments` table + `inquiry-files` storage bucket already
-- exist from 20260907110000_inquiry_attachments.sql. That earlier migration
-- only allowed staff to write; participants could only read rows tagged
-- `visibility='shared'`. Step 14 opens uploads to the inquiry's primary
-- client (and lays the schema groundwork for tagging mood boards vs
-- contracts vs references).
--
-- Schema delta:
--   • `attachment_kind` text column (NULL allowed for legacy rows)
--   • `inquiry_attachments_kind_idx` partial index for kind-filtered reads
--
-- RLS delta:
--   • inquiry_attachments_client_insert     — primary client can INSERT
--     rows for THEIR inquiry, scoped to their own auth.uid().
--   • inquiry_attachments_client_select     — primary client can SELECT
--     rows for their inquiry regardless of `visibility` (legacy
--     `inquiry_attachments_participant_select` only matched 'shared').
--   • inquiry_attachments_uploader_softdel  — uploader can soft-delete
--     their own row.
--
-- Storage bucket RLS stays staff-only — the client server action
-- (`uploadInquiryAttachmentAsClient`) uses the service-role client to
-- write the file, then writes the metadata row using a regular client
-- that passes the new RLS policy.

BEGIN;

-- ── 1. attachment_kind column ────────────────────────────────────────────────

ALTER TABLE public.inquiry_attachments
  ADD COLUMN IF NOT EXISTS attachment_kind TEXT
    CHECK (attachment_kind IS NULL OR attachment_kind IN (
      'mood_board', 'contract', 'reference', 'other'
    ));

COMMENT ON COLUMN public.inquiry_attachments.attachment_kind IS
  'Optional file role: mood_board | contract | reference | other. NULL on legacy rows.';

CREATE INDEX IF NOT EXISTS inquiry_attachments_kind_idx
  ON public.inquiry_attachments (inquiry_id, attachment_kind)
  WHERE deleted_at IS NULL AND attachment_kind IS NOT NULL;

-- ── 2. Client-facing RLS ─────────────────────────────────────────────────────
--
-- Policies are additive: the existing staff-all + participant-shared-select
-- policies stay in place; PG's RLS combines policies with OR for the same
-- operation, so adding rows here strictly widens read/write access.

-- Client (primary inquiry contact) can INSERT.
DROP POLICY IF EXISTS inquiry_attachments_client_insert ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_client_insert ON public.inquiry_attachments
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_attachments.inquiry_id
        AND i.tenant_id = inquiry_attachments.tenant_id
        AND i.client_user_id = auth.uid()
    )
  );

-- Client can SELECT all (non-deleted) attachments on their inquiry — the
-- legacy participant-select policy only allowed visibility='shared'. The
-- client should see anything attached to their own thread regardless of
-- the staff/shared flag.
DROP POLICY IF EXISTS inquiry_attachments_client_select ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_client_select ON public.inquiry_attachments
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.inquiries i
      WHERE i.id = inquiry_attachments.inquiry_id
        AND i.tenant_id = inquiry_attachments.tenant_id
        AND i.client_user_id = auth.uid()
    )
  );

-- Uploader can soft-delete their own attachment (UPDATE deleted_at).
-- The existing staff-all policy already covers staff deletes, so this
-- only widens to non-staff uploaders (clients and talent).
DROP POLICY IF EXISTS inquiry_attachments_uploader_softdel ON public.inquiry_attachments;
CREATE POLICY inquiry_attachments_uploader_softdel ON public.inquiry_attachments
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid())
  WITH CHECK (uploaded_by = auth.uid());

COMMIT;
