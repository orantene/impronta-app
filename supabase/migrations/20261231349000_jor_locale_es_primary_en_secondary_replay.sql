-- TUL-261: replay of 20261004015107 (TAL-JORGBEAUTY: ES primary, EN secondary).
-- The original ran before talent_profiles.secondary_locales existed (added by
-- 20261231299510), so on a fresh database it is a no-op. This copy sorts after
-- the column exists. Same single row, idempotent; no-op where already set.

UPDATE public.talent_profiles
SET
  preferred_locale = 'es',
  secondary_locales = ARRAY['en']::text[]
WHERE profile_code = 'TAL-JORGBEAUTY'
  AND (
    preferred_locale IS DISTINCT FROM 'es'
    OR secondary_locales IS DISTINCT FROM ARRAY['en']::text[]
  );
