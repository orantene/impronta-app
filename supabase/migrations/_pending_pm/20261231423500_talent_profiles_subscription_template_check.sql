-- TUL-1596 (D-014 / D-103): production has talent_profiles.subscription_template and its CHECK
-- talent_profiles_subscription_template_check, but no migration creates either, so a fresh or
-- branch database (staging fxlank) lacks them. Definitions copied from production with
-- information_schema.columns and pg_get_constraintdef (pluhda, read-only, 2026-10-21):
--   subscription_template text NOT NULL DEFAULT 'roster'
--   CHECK ((subscription_template = ANY (ARRAY['roster','editorial','studio','stage','creator','epk'])))
-- Additive and idempotent: on production both already exist and this is a no-op.
-- HELD in _pending_pm until the PM schedules it.

BEGIN;

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS subscription_template text NOT NULL DEFAULT 'roster';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.talent_profiles'::regclass
      AND conname = 'talent_profiles_subscription_template_check'
  ) THEN
    ALTER TABLE public.talent_profiles
      ADD CONSTRAINT talent_profiles_subscription_template_check
      CHECK (subscription_template = ANY (ARRAY['roster'::text, 'editorial'::text, 'studio'::text, 'stage'::text, 'creator'::text, 'epk'::text]));
  END IF;
END
$$;

COMMIT;
