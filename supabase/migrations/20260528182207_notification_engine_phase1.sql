-- Email Notification System — Phase 1 schema.
--
-- Implements the durable-log + suppression columns called out in
-- `web/docs/email-notification-system-spec-2026-05-28.md` §4.
--
-- This migration is intentionally ADDITIVE. The `notification_prefs`
-- jsonb shape change (per-event → per-category) ships with the UI
-- rewrite in Phase 6 so the DB never has new keys while old code
-- reads old keys.

BEGIN;

-- ─── 1. notification_dispatch_log: idempotency + delivery tracking ──────────
--
-- The original CHECK constraint on event_kind enumerated 15 values. The
-- new catalog dispatches for ~41 event types across auth.*, workspace.*,
-- inquiry.*, roster.*, offer.*, booking.*, payment.*, platform.*
-- namespaces. We drop the CHECK and switch to a non-empty-text contract,
-- mirroring the `inquiry_events.event_type` pattern (deliberately not an
-- enum so adding a new notification type doesn't need a migration).
--
-- Channel constraint stays — handlers are typed imports, not data.

ALTER TABLE public.notification_dispatch_log
  DROP CONSTRAINT IF EXISTS notification_dispatch_log_event_kind_check;

ALTER TABLE public.notification_dispatch_log
  ADD CONSTRAINT notification_dispatch_log_event_kind_nonempty
  CHECK (char_length(event_kind) > 0);

-- Delivery + idempotency + audit columns.
ALTER TABLE public.notification_dispatch_log
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT,
  ADD COLUMN IF NOT EXISTS template_id TEXT,
  ADD COLUMN IF NOT EXISTS locale TEXT DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS bounced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS complaint_at TIMESTAMPTZ,
  -- catalog_entry_id is the registry id (e.g. "offer.sent.client") that
  -- produced this row. Stored for analytics / dashboard grouping.
  ADD COLUMN IF NOT EXISTS catalog_entry_id TEXT;

-- Guest recipients (roster claim invites, guest inquiry contacts) have no
-- auth.users row. Relax recipient_user_id to nullable and add a raw-email
-- column so guest dispatches are still logged + deduped. The dedupe key for a
-- guest is "eventId:guest:<email>:channel". At least one recipient identity
-- (user id OR email) must be present.
ALTER TABLE public.notification_dispatch_log
  ALTER COLUMN recipient_user_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT;

ALTER TABLE public.notification_dispatch_log
  DROP CONSTRAINT IF EXISTS notification_dispatch_log_recipient_present;
ALTER TABLE public.notification_dispatch_log
  ADD CONSTRAINT notification_dispatch_log_recipient_present
  CHECK (recipient_user_id IS NOT NULL OR recipient_email IS NOT NULL);

COMMENT ON COLUMN public.notification_dispatch_log.recipient_email IS
  'Raw destination email for guest recipients (no auth.users row). For account-holders recipient_user_id is set and this mirrors the resolved address at send time.';

-- The dedupe key is "eventId:userId:channel" (see spec §3 D3).
-- Partial unique index — rows with NULL key (legacy / null-eventId) are
-- not deduplicated. Going forward the dispatcher always sets it.
CREATE UNIQUE INDEX IF NOT EXISTS notification_dispatch_log_dedupe_uq
  ON public.notification_dispatch_log (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- Catalog-grouped analytics index.
CREATE INDEX IF NOT EXISTS notification_dispatch_log_catalog_idx
  ON public.notification_dispatch_log (catalog_entry_id, created_at DESC)
  WHERE catalog_entry_id IS NOT NULL;

COMMENT ON COLUMN public.notification_dispatch_log.dedupe_key IS
  'Idempotency key, format "eventId:userId:channel". Unique across the table — duplicate dispatch attempts hit the unique index and are short-circuited.';
COMMENT ON COLUMN public.notification_dispatch_log.catalog_entry_id IS
  'Catalog registry id that produced this row, e.g. "offer.sent.client". See web/src/lib/notifications/catalog.ts.';

-- ─── 2. email_suppressions: hard bounce + complaint list ────────────────────
--
-- Resend webhook writes this. Email channel handler checks before send.
-- Scope is (user_id, email_address) so a user changing email gets a
-- fresh slate; the old address stays suppressed.

CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_address TEXT NOT NULL,
  reason TEXT NOT NULL
    CHECK (reason IN ('hard_bounce', 'soft_bounce_persistent', 'complaint', 'manual', 'invalid_address')),
  source TEXT,                              -- resend message_id that triggered
  notes TEXT,                               -- free text for manual suppressions
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT email_suppressions_uq UNIQUE (user_id, email_address)
);

CREATE INDEX IF NOT EXISTS email_suppressions_user_idx
  ON public.email_suppressions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS email_suppressions_address_idx
  ON public.email_suppressions (lower(email_address));

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

-- Self-read so the user can see why their email is suppressed.
DROP POLICY IF EXISTS email_suppressions_self_select ON public.email_suppressions;
CREATE POLICY email_suppressions_self_select ON public.email_suppressions
  FOR SELECT USING (user_id = auth.uid());

-- Platform admins read all (for support tooling). The existing
-- is_platform_admin() helper is created in earlier migrations.
DROP POLICY IF EXISTS email_suppressions_platform_admin ON public.email_suppressions;
CREATE POLICY email_suppressions_platform_admin ON public.email_suppressions
  FOR SELECT USING (is_platform_admin());

-- Writes are SECURITY DEFINER via the Resend webhook handler and the
-- service-role manual unsuppress path. No INSERT/UPDATE/DELETE policy.

COMMENT ON TABLE public.email_suppressions IS
  'Hard bounce + complaint suppression list. Email channel handler checks before send. Scope: (user_id, email_address).';

-- ─── 3. user_prefs.unsubscribe_token: one-click unsubscribe ─────────────────
--
-- Per-user UUID embedded in unsubscribe URLs. Rotates on use to prevent
-- replay (see spec §8). Existing rows backfilled to a fresh UUID.

ALTER TABLE public.user_prefs
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID DEFAULT gen_random_uuid();

UPDATE public.user_prefs
   SET unsubscribe_token = gen_random_uuid()
 WHERE unsubscribe_token IS NULL;

ALTER TABLE public.user_prefs
  ALTER COLUMN unsubscribe_token SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_prefs_unsubscribe_token_uq
  ON public.user_prefs (unsubscribe_token);

COMMENT ON COLUMN public.user_prefs.unsubscribe_token IS
  'Per-user one-click unsubscribe token. URL format: /unsubscribe/<token>?cat=<category>. Token rotates on each unsubscribe to prevent replay.';

-- ─── 4. Helper RPC: rotate_unsubscribe_token ────────────────────────────────
--
-- Called by the unsubscribe page server action after applying the
-- preference change. SECURITY DEFINER so the unauthenticated unsubscribe
-- flow (just has the token, not a session) can rotate.

CREATE OR REPLACE FUNCTION public.rotate_unsubscribe_token(p_user_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_token UUID := gen_random_uuid();
BEGIN
  UPDATE public.user_prefs
     SET unsubscribe_token = v_new_token
   WHERE user_id = p_user_id;
  RETURN v_new_token;
END;
$$;

REVOKE ALL ON FUNCTION public.rotate_unsubscribe_token(UUID) FROM PUBLIC;
-- Only the service-role / server-action callers should rotate. We don't
-- grant to authenticated; the unsubscribe page uses service-role.

COMMENT ON FUNCTION public.rotate_unsubscribe_token(UUID) IS
  'Rotate a user''s unsubscribe_token. Called by the unsubscribe page after applying the preference change. Service-role only.';

COMMIT;
