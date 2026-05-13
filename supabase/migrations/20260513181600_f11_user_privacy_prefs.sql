-- F.11 — Privacy preferences on user_prefs.
--
-- Extends user_prefs with a JSONB privacy_prefs column. One row per
-- user; preferences are per-channel + per-surface.
--
-- Shape:
--   {
--     marketing_email_opt_out: boolean,
--     profile_visibility: 'public' | 'agency_only' | 'hidden',
--     show_phone: 'everyone' | 'connections' | 'never',
--     read_receipts_enabled: boolean,
--     dm_controls: 'open' | 'trusted_clients_only' | 'agency_only',
--     analytics_opt_out: boolean,
--     data_export_requested_at: ISO timestamp or null
--   }
--
-- Empty object = system defaults. The loader merges with DEFAULT_PRIVACY
-- so callers always see a complete shape.
--
-- GDPR/CCPA: these preferences are durable, exportable via
-- /api/account/export, deletable via the cancel-account flow.

BEGIN;

ALTER TABLE public.user_prefs
  ADD COLUMN IF NOT EXISTS privacy_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_prefs.privacy_prefs IS
  'F.11 — Per-user privacy preferences (marketing opt-out, profile visibility, phone visibility, read receipts, DM controls, analytics opt-out). Required for GDPR/CCPA.';

COMMIT;
