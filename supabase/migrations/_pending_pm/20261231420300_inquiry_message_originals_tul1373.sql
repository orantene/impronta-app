-- TUL-1373: the ORIGINAL text of a client-chat message whose phone/email was hidden by contact masking.
--
-- HELD in _pending_pm. Only used when the COORDINATOR_CONTACT_MASKING_ENABLED flag is on; with the
-- flag off nothing writes here. Additive and idempotent. No backfill, no change to inquiry_messages.
--
-- Decision (PM, 2026-10-20): the original is NOT destroyed. It is kept here for safety and disputes,
--   * written only by the service role (no insert/update/delete policy, no grant to anon/authenticated
--     for writes),
--   * readable only by the service role and by a platform admin (SELECT policy on is_platform_admin()),
--   * never shown in any UI (no screen reads it).
--
-- message_id has NO foreign key on purpose: the original is written BEFORE the message so that a failed
-- save refuses the send (the privacy filter and the record both fail closed), and it must outlive a
-- message edit. kind = 'insert' (first text) or 'edit' (a later edit of the same message).
-- RETENTION: account anonymisation / purge jobs must also clear these rows for the person concerned;
-- tracked as a follow-up before the flag is ever enabled.
--
-- Rollback (only if nothing has written here yet):
--   DROP TABLE IF EXISTS public.inquiry_message_originals;

BEGIN;

CREATE TABLE IF NOT EXISTS public.inquiry_message_originals (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    uuid        NOT NULL,
  inquiry_id    uuid        NOT NULL,
  tenant_id     uuid        NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  kind          text        NOT NULL CHECK (kind IN ('insert', 'edit')),
  original_body text        NOT NULL,
  masked_count  integer     NOT NULL CHECK (masked_count >= 1),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inquiry_message_originals_message_idx
  ON public.inquiry_message_originals (message_id);
CREATE INDEX IF NOT EXISTS inquiry_message_originals_inquiry_idx
  ON public.inquiry_message_originals (inquiry_id);

ALTER TABLE public.inquiry_message_originals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_message_originals_platform_admin_read ON public.inquiry_message_originals;
CREATE POLICY inquiry_message_originals_platform_admin_read ON public.inquiry_message_originals
  FOR SELECT TO authenticated
  USING (public.is_platform_admin());

REVOKE ALL ON public.inquiry_message_originals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inquiry_message_originals TO authenticated;

COMMENT ON TABLE public.inquiry_message_originals IS
  'TUL-1373: original text of client-chat messages hidden by contact masking. Service role writes; service role and platform admin read; never shown in a UI.';

COMMIT;
