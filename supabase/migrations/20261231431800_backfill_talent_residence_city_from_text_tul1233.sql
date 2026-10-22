-- TUL-1233 / TUL-1789 -- backfill talent_profiles.residence_city_id (and residence_country_id) from home_city_text. HELD in _pending_pm (PM applies).
--
-- WHY. The directory facet counts read ids (talent_profiles.residence_city_id OR location_id joined to public.locations), while a
-- card shows a city from the free text when the ids are null. On staging (fxlank) 129 of 130 listed profiles have both ids NULL
-- but 105 have home_city_text, so the header said "92 perfiles" and the location facet showed "Mexico (1) / Guadalajara (1)".
-- Production: 39 of 321 listed have no city ids, 287 have home_city_text. Filling the ids makes the facet and the card agree
-- (cards read residence_city first, then location_id; the facet joins residence_city_id OR location_id).
--
-- WHAT IT TOUCHES. Only public.talent_profiles.residence_city_id and residence_country_id, and only on rows where
-- residence_city_id IS NULL AND location_id IS NULL AND home_city_text is non-empty.
--   * residence_city_id    <- the ONE public.locations row (archived_at IS NULL) whose en name, es name or city_slug
--                             matches home_city_text. No match, or more than one match, leaves the row alone.
--   * residence_country_id <- public.countries.id for that location's country_code, only when it is currently NULL.
--   * home_country_text, when present, must also match the location's country (iso2, name_en or name_es). A present but
--     non-matching country leaves the row alone (a "Buenos Aires, Mexico" pairing is never produced).
-- Matching is case- and accent-insensitive: lower(trim()) plus translate() of common accents (unaccent is not used in any
-- migration, so it is not relied on). It never inserts or edits locations / countries, never overwrites a non-null value,
-- and writes no other column. Safe to re-run: a row that was filled no longer satisfies the WHERE, so a second run changes nothing.
--
-- PREVIEW (read-only, run first). How many rows would change, and which texts stay unmatched:
--
--   WITH cand AS (
--     SELECT tp.id, tp.home_city_text, tp.home_country_text,
--            lower(translate(trim(tp.home_city_text), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')) AS ck
--     FROM public.talent_profiles tp
--     WHERE tp.residence_city_id IS NULL AND tp.location_id IS NULL AND nullif(trim(tp.home_city_text), '') IS NOT NULL
--   ), m AS (
--     SELECT c.id, count(DISTINCT l.id) AS n
--     FROM cand c
--     LEFT JOIN public.locations l ON l.archived_at IS NULL AND c.ck IN (
--         lower(translate(trim(l.display_name_i18n->>'en'), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
--         lower(translate(trim(l.display_name_i18n->>'es'), 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ', 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
--         lower(replace(l.city_slug, '-', ' ')))
--     GROUP BY c.id
--   )
--   SELECT c.home_city_text, c.home_country_text, m.n AS matching_locations, count(*) AS profiles
--   FROM cand c JOIN m USING (id)
--   GROUP BY 1, 2, 3 ORDER BY m.n, profiles DESC;   -- n = 1 will be backfilled (before the country check); n = 0 unmatched; n > 1 ambiguous
--
-- ROLLBACK: not automatic (the prior state was NULL). To undo, null the two columns for the ids this run filled; capture them first with
--   SELECT id FROM public.talent_profiles WHERE residence_city_id IS NULL AND location_id IS NULL AND nullif(trim(home_city_text), '') IS NOT NULL;

BEGIN;

WITH cand AS (
  SELECT
    tp.id,
    lower(translate(trim(tp.home_city_text),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')) AS city_key,
    nullif(lower(translate(trim(tp.home_country_text),
      'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
      'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')), '') AS country_key
  FROM public.talent_profiles tp
  WHERE tp.residence_city_id IS NULL
    AND tp.location_id IS NULL
    AND nullif(trim(tp.home_city_text), '') IS NOT NULL
),
matches AS (
  SELECT DISTINCT c.id AS talent_id, l.id AS location_id, l.country_code
  FROM cand c
  JOIN public.locations l
    ON l.archived_at IS NULL
   AND c.city_key IN (
     lower(translate(trim(l.display_name_i18n ->> 'en'),
       'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
       'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
     lower(translate(trim(l.display_name_i18n ->> 'es'),
       'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
       'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
     lower(replace(l.city_slug, '-', ' '))
   )
  WHERE c.country_key IS NULL
     OR EXISTS (
       SELECT 1
       FROM public.countries co
       WHERE upper(co.iso2) = upper(l.country_code)
         AND c.country_key IN (
           lower(co.iso2),
           lower(translate(trim(co.name_en),
             'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
             'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC')),
           lower(translate(trim(co.name_es),
             'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
             'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'))
         )
     )
),
unambiguous AS (
  SELECT talent_id, min(location_id::text)::uuid AS location_id, min(country_code) AS country_code
  FROM matches
  GROUP BY talent_id
  HAVING count(DISTINCT location_id) = 1
)
UPDATE public.talent_profiles tp
SET residence_city_id = u.location_id,
    residence_country_id = COALESCE(
      tp.residence_country_id,
      (SELECT co.id FROM public.countries co WHERE upper(co.iso2) = upper(u.country_code) LIMIT 1)
    )
FROM unambiguous u
WHERE tp.id = u.talent_id
  AND tp.residence_city_id IS NULL
  AND tp.location_id IS NULL;

COMMIT;
