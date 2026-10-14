-- TUL-649: talent_profiles.home_country_text held "MX", "México", "Mexico",
-- "mexico" and NULL side by side. Writers now store the ISO-3166 alpha-2 code
-- (web/src/lib/geo/country-code.ts); this backfill brings existing rows in line.
-- NOT APPLIED by the author: a production write that needs sign-off.
-- Idempotent: rows already holding a valid ISO-2 code are left alone, and text
-- that matches no country is left untouched (nothing is guessed or dropped).

-- 1. Free text (name in EN or ES, accents and case folded) -> ISO-2.
UPDATE public.talent_profiles tp
SET home_country_text = c.iso2
FROM public.countries c
WHERE tp.home_country_text IS NOT NULL
  AND tp.home_country_text IS DISTINCT FROM c.iso2
  AND lower(translate(btrim(tp.home_country_text), 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN'))
      IN (
        lower(translate(c.name_en, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN')),
        lower(translate(coalesce(c.name_es, c.name_en), 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN')),
        lower(c.iso2)
      );

-- 2. A lower-case code that slipped through ("mx") -> upper case.
UPDATE public.talent_profiles
SET home_country_text = upper(home_country_text)
WHERE home_country_text ~ '^[a-z]{2}$';

-- 3. No text at all but a structured residence country -> take its code.
UPDATE public.talent_profiles tp
SET home_country_text = c.iso2
FROM public.countries c
WHERE tp.home_country_text IS NULL
  AND tp.residence_country_id = c.id;
