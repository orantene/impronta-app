-- Phase 2 — notification_prefs column on user_prefs.
--
-- Stores per-user notification preferences as JSONB.
-- Shape: { [eventId: string]: { email: boolean, push: boolean } }
-- Empty object = all-default (unset = follows system defaults).

ALTER TABLE public.user_prefs
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_prefs.notification_prefs IS
  'Per-event notification channel prefs. Keys are event IDs; values are {email: bool, push: bool}.';
