-- TAL-JORGBEAUTY: bilingual URL grammar (ES primary, EN secondary).
-- Without secondary_locales, /es was treated as a page slug → 404 on the
-- public host. Demo camila-nails (preferred_locale=es) correctly 302s /es → /
-- with locale=es. languages already listed Español + English.
-- Idempotent: safe to re-apply.
--
-- TUL-261: secondary_locales is added later (20261231299510). Guarded so a
-- fresh database replaying the chain in version order does not fail with
-- 42703; on such a DB this is a no-op and 20261231349000 applies the data fix.
-- Where the column exists the effect is unchanged.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'talent_profiles'
      AND column_name = 'secondary_locales'
  ) THEN
    UPDATE public.talent_profiles
    SET
      preferred_locale = 'es',
      secondary_locales = ARRAY['en']::text[]
    WHERE profile_code = 'TAL-JORGBEAUTY'
      AND (
        preferred_locale IS DISTINCT FROM 'es'
        OR secondary_locales IS DISTINCT FROM ARRAY['en']::text[]
      );
  END IF;
END $$;
