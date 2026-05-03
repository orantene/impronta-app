-- Backfill public.talent_languages from existing language data.
--
-- Sources, in priority order:
--   1. talent_profile_taxonomy assignments where the term kind='language'
--      (slug is the ISO code, name_en is the display name).
--   2. talent_profiles.languages TEXT[] (M8 editorial — display names only).
--      Resolved back to language_code via taxonomy_terms WHERE kind='language'.
--   3. Free-text values in talent_profiles.languages that don't match any
--      taxonomy_terms language row are inserted with a lower-cased fallback
--      code derived from the first three letters of the name. These rows
--      should be cleaned up by an admin.
--
-- The cache-refresh trigger is disabled during backfill to avoid N updates
-- per profile, then re-enabled with a single resync UPDATE at the end.
--
-- After backfill, legacy taxonomy_terms WHERE kind='language' rows are
-- flagged invisible (is_profile_badge=FALSE, is_public_filter=FALSE) so
-- profile cards stop showing the raw language taxonomy badges.
--
-- Defaults applied to backfilled rows:
--   speaking_level = 'conversational'
--   reading_level / writing_level = NULL
--   is_native, can_host, can_sell, can_translate, can_teach = FALSE
--
-- DOWN (manual):
--   DELETE FROM public.talent_languages
--    WHERE created_at <= now()
--      AND speaking_level = 'conversational'
--      AND can_host = FALSE AND can_sell = FALSE
--      AND can_translate = FALSE AND can_teach = FALSE;
--   UPDATE public.taxonomy_terms SET is_profile_badge = TRUE
--    WHERE kind = 'language';

BEGIN;

-- ─── Helper: numeric rank for language proficiency ─────────────────────────
-- Used by directory/search to filter "minimum speaking level". Stable
-- ordering: basic(1) < conversational(2) < professional(3) < fluent(4) < native(5).
CREATE OR REPLACE FUNCTION public.language_level_rank(p_level TEXT)
RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CASE p_level
    WHEN 'basic'          THEN 1
    WHEN 'conversational' THEN 2
    WHEN 'professional'   THEN 3
    WHEN 'fluent'         THEN 4
    WHEN 'native'         THEN 5
    ELSE 0
  END;
$$;

COMMENT ON FUNCTION public.language_level_rank(TEXT) IS
  'Returns 1..5 for basic..native. Use for "speaking_level >= ?" filters: WHERE language_level_rank(speaking_level) >= language_level_rank(''professional'').';

-- Pause cache trigger for the duration of the bulk load.
ALTER TABLE public.talent_languages DISABLE TRIGGER trg_talent_languages_refresh_cache;

-- ─── Source 1: legacy talent_profile_taxonomy(kind='language') ─────────────
INSERT INTO public.talent_languages (
  tenant_id,
  talent_profile_id,
  language_code,
  language_name,
  speaking_level,
  display_order
)
SELECT
  COALESCE(tp.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID) AS tenant_id,
  tpt.talent_profile_id,
  lower(tt.slug)                                                                  AS language_code,
  COALESCE(tt.name_en, initcap(tt.slug))                                          AS language_name,
  'conversational'                                                                AS speaking_level,
  0                                                                               AS display_order
  FROM public.talent_profile_taxonomy tpt
  JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
  JOIN public.talent_profiles tp ON tp.id = tpt.talent_profile_id
 WHERE tt.kind::text = 'language'
   AND tt.archived_at IS NULL
ON CONFLICT (talent_profile_id, language_code) DO NOTHING;

-- ─── Source 2: talent_profiles.languages TEXT[] resolved via lookup ────────
-- For each (profile, name) pair, try to match the name against a
-- taxonomy_terms language row (case-insensitive on name_en, name_es, or any
-- alias). If no match, derive a fallback code from the first three lowercase
-- letters of the name. Free-text "Spanish" will resolve to slug='es'.
WITH name_pairs AS (
  SELECT
    tp.id                       AS talent_profile_id,
    tp.created_by_agency_id     AS created_by_agency_id,
    btrim(name)                 AS raw_name,
    ROW_NUMBER() OVER (PARTITION BY tp.id ORDER BY ordinality) AS display_order
    FROM public.talent_profiles tp,
         UNNEST(tp.languages) WITH ORDINALITY AS u(name, ordinality)
   WHERE array_length(tp.languages, 1) IS NOT NULL
),
resolved AS (
  SELECT
    np.talent_profile_id,
    np.created_by_agency_id,
    np.raw_name,
    np.display_order,
    COALESCE(
      (SELECT lower(tt.slug) FROM public.taxonomy_terms tt
        WHERE tt.kind::text = 'language'
          AND (
            lower(tt.name_en) = lower(np.raw_name)
            OR lower(COALESCE(tt.name_es, '')) = lower(np.raw_name)
            OR lower(np.raw_name) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
          )
        LIMIT 1),
      lower(left(regexp_replace(np.raw_name, '[^a-zA-Z]', '', 'g'), 3))
    ) AS language_code,
    COALESCE(
      (SELECT tt.name_en FROM public.taxonomy_terms tt
        WHERE tt.kind::text = 'language'
          AND (
            lower(tt.name_en) = lower(np.raw_name)
            OR lower(COALESCE(tt.name_es, '')) = lower(np.raw_name)
            OR lower(np.raw_name) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
          )
        LIMIT 1),
      np.raw_name
    ) AS language_name
  FROM name_pairs np
)
INSERT INTO public.talent_languages (
  tenant_id,
  talent_profile_id,
  language_code,
  language_name,
  speaking_level,
  display_order
)
SELECT
  COALESCE(r.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID),
  r.talent_profile_id,
  r.language_code,
  r.language_name,
  'conversational',
  r.display_order::INTEGER
  FROM resolved r
 WHERE r.language_code IS NOT NULL
   AND r.language_code <> ''
ON CONFLICT (talent_profile_id, language_code) DO NOTHING;

-- ─── Resync the denormalized cache (single bulk update) ────────────────────
UPDATE public.talent_profiles tp
   SET languages = COALESCE(agg.names, ARRAY[]::TEXT[])
  FROM (
    SELECT
      talent_profile_id,
      array_agg(language_name ORDER BY display_order, language_name) AS names
      FROM public.talent_languages
     GROUP BY talent_profile_id
  ) agg
 WHERE tp.id = agg.talent_profile_id;

-- Profiles with no rows in talent_languages should have an empty array. The
-- previous UPDATE only touched rows that had at least one language.
UPDATE public.talent_profiles
   SET languages = ARRAY[]::TEXT[]
 WHERE id NOT IN (SELECT DISTINCT talent_profile_id FROM public.talent_languages)
   AND array_length(languages, 1) IS NOT NULL;

-- ─── Re-enable cache trigger ───────────────────────────────────────────────
ALTER TABLE public.talent_languages ENABLE TRIGGER trg_talent_languages_refresh_cache;

-- ─── Demote legacy language taxonomy rows from profile badges/filters ──────
UPDATE public.taxonomy_terms
   SET is_profile_badge = FALSE,
       is_public_filter = FALSE
 WHERE kind::text = 'language';

COMMIT;
