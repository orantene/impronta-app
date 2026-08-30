-- Email-keyed suppression for guest support mail. Service-role only.
-- HMAC tokens are stateless; this table records the unsubscribe action.

CREATE TABLE public.guest_email_unsubscribes (
  email_normalized TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  unsubscribed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.guest_email_unsubscribes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.guest_email_unsubscribes FROM PUBLIC;
REVOKE ALL ON TABLE public.guest_email_unsubscribes FROM anon;
REVOKE ALL ON TABLE public.guest_email_unsubscribes FROM authenticated;
GRANT ALL ON TABLE public.guest_email_unsubscribes TO service_role;
