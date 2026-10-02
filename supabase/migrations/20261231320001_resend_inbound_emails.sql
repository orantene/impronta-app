-- Interim inbound mailbox for Resend receiving (Track C).
-- Desk / Support SoT lands in Phase 3; until then every email.received
-- webhook must persist here BEFORE Gmail forward so mail is not lost if
-- forward fails or Gmail drops it.
--
-- Service-role writes only. No authenticated policies — platform inbox,
-- not tenant data. Super-admins will read via a later Desk surface.

BEGIN;

CREATE TABLE IF NOT EXISTS public.resend_inbound_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resend_email_id text NOT NULL UNIQUE,
  message_id text,
  from_address text NOT NULL,
  to_addresses text[] NOT NULL DEFAULT '{}'::text[],
  subject text NOT NULL DEFAULT '',
  body_text text,
  body_html text,
  -- Truncation markers when body exceeded the store budget at write time.
  body_truncated boolean NOT NULL DEFAULT false,
  forward_to text,
  forward_status text NOT NULL DEFAULT 'pending'
    CHECK (forward_status IN ('pending', 'sent', 'failed', 'skipped')),
  forward_error text,
  forwarded_at timestamptz,
  provider_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS resend_inbound_emails_created_idx
  ON public.resend_inbound_emails (created_at DESC);

CREATE INDEX IF NOT EXISTS resend_inbound_emails_forward_status_idx
  ON public.resend_inbound_emails (forward_status, created_at DESC)
  WHERE forward_status IN ('pending', 'failed');

ALTER TABLE public.resend_inbound_emails ENABLE ROW LEVEL SECURITY;

-- No policies: service role bypasses RLS. Authenticated clients see nothing.

COMMENT ON TABLE public.resend_inbound_emails IS
  'Durable log of Resend email.received inbound mail. Interim SoT before Support Desk Phase 3. '
  'Gmail forward is best-effort; this table is the retention guarantee.';

COMMIT;
