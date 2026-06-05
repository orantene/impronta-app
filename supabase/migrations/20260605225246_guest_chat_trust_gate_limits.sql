-- ─────────────────────────────────────────────────────────────────────────────
-- guest_chat_trust_gate_limits — per-tenant active-conversation limits for the
-- public guest-chat front door (U3 trust gate).
--
-- Extends the EXISTING `tenant_guest_chat_settings` table
-- (20260604184507_tenant_guest_chat_settings.sql) with THREE per-trust-tier
-- caps on how many active (non-terminal) conversations a single guest can have
-- open at once on this tenant. The unlock currency is VERIFICATION, not money —
-- a guest who hits the cap is nudged to verify their email / create a free
-- account, which raises the cap; it is NEVER a paywall.
--
--   guest_conversation_limit          — cookie-only guest (default 1)
--   email_verified_conversation_limit — magic-link-verified email (default 3)
--   account_conversation_limit        — registered client account (default 10)
--
-- These mirror strategy §7 (limits are trust-gates, not paywalls) + §5 (the
-- guest→account trust ladder). The server-side gate
-- (web/src/lib/inquiry/guest-trust-gate.ts) reads these on the inquiry-CREATE
-- path ONLY — continuing an already-owned thread is never gated.
--
-- DEFAULTS PRESERVE INTENT: a tenant with NO row falls back to 1/3/10 in the
-- reader (fail-open, like loadGuestChatSettings). Existing rows get the column
-- defaults, so no tenant is suddenly more restrictive than the ladder intends.
--
-- RLS: NO new policies. The existing permissive SELECT (public read) and the
-- staff-only write policy on `tenant_guest_chat_settings` already cover these
-- new columns — adding columns does not require new RLS.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

ALTER TABLE public.tenant_guest_chat_settings
  ADD COLUMN IF NOT EXISTS guest_conversation_limit          INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS email_verified_conversation_limit INT NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS account_conversation_limit        INT NOT NULL DEFAULT 10;

-- Guardrails: a limit must be at least 1 (a tenant can never lock a verified
-- buyer out of starting even one conversation) and is bounded to a sane ceiling
-- so a fat-fingered admin value can't disable the gate entirely by accident.
ALTER TABLE public.tenant_guest_chat_settings
  DROP CONSTRAINT IF EXISTS tenant_guest_chat_settings_guest_limit_range;
ALTER TABLE public.tenant_guest_chat_settings
  ADD CONSTRAINT tenant_guest_chat_settings_guest_limit_range
  CHECK (guest_conversation_limit BETWEEN 1 AND 1000);

ALTER TABLE public.tenant_guest_chat_settings
  DROP CONSTRAINT IF EXISTS tenant_guest_chat_settings_email_limit_range;
ALTER TABLE public.tenant_guest_chat_settings
  ADD CONSTRAINT tenant_guest_chat_settings_email_limit_range
  CHECK (email_verified_conversation_limit BETWEEN 1 AND 1000);

ALTER TABLE public.tenant_guest_chat_settings
  DROP CONSTRAINT IF EXISTS tenant_guest_chat_settings_account_limit_range;
ALTER TABLE public.tenant_guest_chat_settings
  ADD CONSTRAINT tenant_guest_chat_settings_account_limit_range
  CHECK (account_conversation_limit BETWEEN 1 AND 1000);

COMMENT ON COLUMN public.tenant_guest_chat_settings.guest_conversation_limit IS
  'Max active (non-terminal) conversations a cookie-only guest may have open at once. Unlock = verify email. Default 1.';
COMMENT ON COLUMN public.tenant_guest_chat_settings.email_verified_conversation_limit IS
  'Max active conversations for an email-verified (magic-link) guest. Unlock = create a free account. Default 3.';
COMMENT ON COLUMN public.tenant_guest_chat_settings.account_conversation_limit IS
  'Max active conversations for a registered client account. Default 10.';

COMMIT;
