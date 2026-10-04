-- TAL-JORGBEAUTY: bilingual URL grammar (ES primary, EN secondary).
-- Without secondary_locales, /es was treated as a page slug → 404 on the
-- public host. Demo camila-nails (preferred_locale=es) correctly 302s /es → /
-- with locale=es. languages already listed Español + English.
-- Idempotent: safe to re-apply.

UPDATE public.talent_profiles
SET
  preferred_locale = 'es',
  secondary_locales = ARRAY['en']::text[]
WHERE profile_code = 'TAL-JORGBEAUTY'
  AND (
    preferred_locale IS DISTINCT FROM 'es'
    OR secondary_locales IS DISTINCT FROM ARRAY['en']::text[]
  );
