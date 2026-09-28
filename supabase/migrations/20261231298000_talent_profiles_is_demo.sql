-- Demo talents (Stream D, 2026-09-28): fictional people used as theme
-- examples. The public site reads this flag to show a "Demo" pill + footer
-- line, and inquiry/booking entry points return a simulated result instead of
-- creating real rows. Additive only; default false for every real talent.

ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.talent_profiles.is_demo IS
  'TRUE for fictional demo talents (seeded by web/scripts/demo-talents). Public site shows a Demo marker; inquiries and bookings are simulated, never created.';

-- Backfill the seeded batch: only profiles whose auth user carries the
-- demo_batch marker, never by display name or is_test_account.
UPDATE public.talent_profiles tp
   SET is_demo = true
  FROM auth.users u
 WHERE u.id = tp.user_id
   AND tp.profile_code LIKE 'TAL-93%'
   AND u.raw_app_meta_data->>'demo_batch' = 'demo-2026-09-28';
