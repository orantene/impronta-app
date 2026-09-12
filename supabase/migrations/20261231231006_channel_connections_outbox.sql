-- WhatsApp linked-device channel: connection + outbox.
-- Additive. Isolated first. Production is applied by the merge workflow.

BEGIN;

-- ── platform kill switch ────────────────────────────────────────────────

ALTER TABLE public.platform_settings
  ADD COLUMN IF NOT EXISTS workspace_messaging_channels_enabled boolean NOT NULL DEFAULT false;

-- ── inbound thread key ──────────────────────────────────────────────────

ALTER TABLE public.inquiries
  ADD COLUMN IF NOT EXISTS external_thread_ref text;

CREATE INDEX IF NOT EXISTS inquiries_external_thread_ref_idx
  ON public.inquiries (tenant_id, external_thread_ref);

-- Dedupe inbound WhatsApp messages on the provider id per channel.
CREATE UNIQUE INDEX IF NOT EXISTS message_delivery_provider_ref_channel
  ON public.message_delivery (channel, provider_ref)
  WHERE provider_ref IS NOT NULL;

-- ── channel_connections ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  channel text NOT NULL CHECK (channel IN ('whatsapp')),
  state text NOT NULL CHECK (state IN (
    'disconnected', 'pairing', 'connected', 'phone_offline',
    'reconnecting', 'unlinked', 'blocked'
  )),
  phone_e164 text,
  display_name text,
  session_ciphertext bytea,
  pairing_qr text,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  last_error text,
  consented_by uuid REFERENCES public.profiles(id),
  consented_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, channel)
);

CREATE INDEX IF NOT EXISTS channel_connections_state_idx
  ON public.channel_connections (state)
  WHERE state IN ('connected', 'reconnecting', 'pairing');

ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_connections_select_staff ON public.channel_connections;
CREATE POLICY channel_connections_select_staff ON public.channel_connections
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE ALL ON public.channel_connections FROM PUBLIC, anon, authenticated;
-- session_ciphertext and pairing_qr stay off the staff SELECT grant.
GRANT SELECT (
  id, tenant_id, channel, state, phone_e164, display_name,
  pairing_expires_at, paired_at, last_seen_at, last_error,
  consented_by, consented_at, created_at, updated_at
) ON public.channel_connections TO authenticated;
GRANT ALL ON public.channel_connections TO service_role;

CREATE OR REPLACE VIEW public.channel_connections_public
WITH (security_invoker = true) AS
SELECT
  id,
  tenant_id,
  channel,
  state,
  phone_e164,
  display_name,
  pairing_expires_at,
  paired_at,
  last_seen_at,
  last_error,
  consented_by,
  consented_at,
  created_at,
  updated_at
FROM public.channel_connections;

REVOKE ALL ON public.channel_connections_public FROM PUBLIC, anon;
GRANT SELECT ON public.channel_connections_public TO authenticated;
GRANT SELECT ON public.channel_connections_public TO service_role;

-- ── channel_outbox ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.channel_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  channel text NOT NULL DEFAULT 'whatsapp',
  message_id uuid NOT NULL REFERENCES public.inquiry_messages(id) ON DELETE CASCADE,
  to_e164 text NOT NULL,
  body text NOT NULL,
  media_url text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'sending', 'sent', 'failed')),
  attempts int NOT NULL DEFAULT 0,
  provider_ref text,
  last_error text,
  not_before timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, channel)
);

CREATE INDEX IF NOT EXISTS channel_outbox_claim_idx
  ON public.channel_outbox (tenant_id, state, not_before)
  WHERE state = 'queued';

ALTER TABLE public.channel_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.channel_outbox FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS channel_outbox_select_staff ON public.channel_outbox;
CREATE POLICY channel_outbox_select_staff ON public.channel_outbox
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

REVOKE ALL ON public.channel_outbox FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.channel_outbox TO authenticated;
GRANT ALL ON public.channel_outbox TO service_role;

COMMIT;
