-- Cross-custom-domain SSO hand-off nonces (Tenant Registration Engine, S6).
--
-- Auth cookies are scoped to the parent domain only for *.tulala.digital /
-- *.lvh.me (see lib/supabase/cookie-domain.ts); tenant CUSTOM domains stay
-- host-only, so a session on the app host is invisible there. To let an
-- existing Tulala talent "sign in to apply" on a custom domain, we mint a
-- single-use, short-TTL nonce on a host where the session IS readable, then
-- redeem it on the custom domain to establish a fresh host-only session.
--
-- SECURITY: the row references only a user_id — NO session tokens are stored
-- at rest. Redemption re-mints the session via Supabase generateLink +
-- verifyOtp (service role). Single-use (used_at), short TTL (expires_at), and
-- bound to a specific target_host that must be a verified custom domain in
-- agency_domains. RLS is enabled with NO policies, so only the service role
-- (which bypasses RLS) can read or write these rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.sso_handoff_tokens (
  token       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_host TEXT        NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sso_handoff_tokens IS
  'Single-use, short-TTL nonces for cross-custom-domain SSO. References a user_id only — no session tokens at rest. Service-role only (RLS enabled, no policies).';

CREATE INDEX IF NOT EXISTS idx_sso_handoff_tokens_expires_at
  ON public.sso_handoff_tokens (expires_at);

ALTER TABLE public.sso_handoff_tokens ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies: only the service role may touch these rows.

COMMIT;
