-- WS4 (multi-language platform) — taxonomy / locations / bios / services →
-- per-locale JSONB storage.
--
-- AGGRESSIVE, pre-launch one-shot transform (see
-- web/docs/multi-language-platform-execution-plan-2026-06-15.md §0.3):
--   for every translatable `<base>` (+ `<base>_es`) pair, ADD ONE column
--   `<base>_i18n jsonb NOT NULL DEFAULT '{}'::jsonb` shaped { "en": …, "es": … },
--   backfill from the old columns, then DROP the old columns. Readers move to
--   the universal resolver `resolveLocalized(map, locale, chain)`.
--
-- Columns migrated by this file:
--   taxonomy_terms:          name_en / name_es                 → name_i18n
--   agency_taxonomy_settings:custom_label / custom_label_es    → custom_label_i18n
--   locations:               display_name_en / display_name_es → display_name_i18n
--   talent_profiles bios:    bio_en / bio_es                   → bio_i18n
--                            bio_en_draft / bio_es_draft       → bio_draft_i18n
--                            bio_en_status / bio_es_status      → bio_status_i18n   (per-locale enum text)
--                            bio_en_updated_at / bio_es_updated_at → bio_updated_at_i18n
--   talent_profiles.services_menu (jsonb[]): each item's name → name_i18n {en}
--                            and description → description_i18n {en}
--
-- Dependent DB objects that reference the dropped columns are recreated to read
-- the new `_i18n` maps BEFORE the drops (Postgres blocks dropping a column a
-- SQL function / view / index hard-depends on):
--   • view  public.talent_skills_resolved      (taxonomy_terms.name_en/_es)
--   • func  public.api_directory_cards  (both overloads — LANGUAGE sql hard dep)
--   • func  public.directory_search_public_talent_ids
--   • func  public.ensure_city_location
--   • func  public.sync_location_taxonomy_terms
--   • func  public.talent_profiles_reverse_sync_v2   (trigger fn; CREATE OR REPLACE keeps the trigger)
--   • index idx_talent_profiles_directory_fts   (bio_en/bio_es in the tsvector)
--
-- Pre-launch: data currently lives in en/es columns; the i18n maps stay
-- {"en":…,"es":…} so no behavior change. Adding a 3rd language is data, not DDL.

BEGIN;

-- ========================================================================
-- 1. taxonomy_terms.name_en / name_es  →  name_i18n
-- ========================================================================
ALTER TABLE public.taxonomy_terms
  ADD COLUMN IF NOT EXISTS name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.taxonomy_terms
SET name_i18n = jsonb_strip_nulls(
  jsonb_build_object(
    'en', NULLIF(btrim(name_en), ''),
    'es', NULLIF(btrim(name_es), '')
  )
);

COMMENT ON COLUMN public.taxonomy_terms.name_i18n IS
  'Per-locale term name, e.g. {"en":"Model","es":"Modelo"}. Read via resolveLocalized.';

-- ========================================================================
-- 2. agency_taxonomy_settings.custom_label / custom_label_es → custom_label_i18n
-- ========================================================================
ALTER TABLE public.agency_taxonomy_settings
  ADD COLUMN IF NOT EXISTS custom_label_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.agency_taxonomy_settings
SET custom_label_i18n = jsonb_strip_nulls(
  jsonb_build_object(
    'en', NULLIF(btrim(custom_label), ''),
    'es', NULLIF(btrim(custom_label_es), '')
  )
);

COMMENT ON COLUMN public.agency_taxonomy_settings.custom_label_i18n IS
  'Per-locale tenant override label for a taxonomy term; {} = use the term default.';

-- ========================================================================
-- 3. locations.display_name_en / display_name_es → display_name_i18n
-- ========================================================================
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS display_name_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.locations
SET display_name_i18n = jsonb_strip_nulls(
  jsonb_build_object(
    'en', NULLIF(btrim(display_name_en), ''),
    'es', NULLIF(btrim(display_name_es), '')
  )
);

COMMENT ON COLUMN public.locations.display_name_i18n IS
  'Per-locale city display name, e.g. {"en":"Mexico City","es":"Ciudad de México"}.';

-- ========================================================================
-- 4. talent_profiles bios → per-locale JSONB
--    content + draft + status + updated_at all stay PER-LOCALE (status/updated_at
--    are tracked independently per language by the bio Translation Center engine —
--    a single collapsed status/updated_at would lose that behavior).
-- ========================================================================
ALTER TABLE public.talent_profiles
  ADD COLUMN IF NOT EXISTS bio_i18n            jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bio_draft_i18n      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bio_status_i18n     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS bio_updated_at_i18n jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.talent_profiles
SET
  bio_i18n = jsonb_strip_nulls(
    jsonb_build_object(
      'en', NULLIF(btrim(bio_en), ''),
      'es', NULLIF(btrim(bio_es), '')
    )
  ),
  bio_draft_i18n = jsonb_strip_nulls(
    jsonb_build_object(
      'en', NULLIF(btrim(bio_en_draft), ''),
      'es', NULLIF(btrim(bio_es_draft), '')
    )
  ),
  -- status is NOT NULL (default 'missing'); keep the textual enum value verbatim.
  bio_status_i18n = jsonb_strip_nulls(
    jsonb_build_object(
      'en', bio_en_status::text,
      'es', bio_es_status::text
    )
  ),
  bio_updated_at_i18n = jsonb_strip_nulls(
    jsonb_build_object(
      'en', to_jsonb(bio_en_updated_at),
      'es', to_jsonb(bio_es_updated_at)
    )
  );

COMMENT ON COLUMN public.talent_profiles.bio_i18n IS
  'Per-locale PUBLISHED bio, e.g. {"en":"…","es":"…"}. Read via resolveLocalized; short_bio remains the legacy EN mirror.';
COMMENT ON COLUMN public.talent_profiles.bio_draft_i18n IS
  'Per-locale unpublished bio DRAFT buffer (Translation Center). {} = no draft.';
COMMENT ON COLUMN public.talent_profiles.bio_status_i18n IS
  'Per-locale bio review status (bio_es_status enum values as text: missing/auto/reviewed/approved/stale). Absent locale ⇒ "missing".';
COMMENT ON COLUMN public.talent_profiles.bio_updated_at_i18n IS
  'Per-locale ISO timestamp of the last published-bio change for that language.';

-- ========================================================================
-- 5. talent_profiles.services_menu jsonb[] — localize name + description
--    name        → name_i18n        {"en": <name>}
--    description  → description_i18n  {"en": <description>}   (omitted when blank)
--    Idempotent: items already carrying *_i18n are left untouched.
-- ========================================================================
UPDATE public.talent_profiles tp
SET services_menu = (
  SELECT jsonb_agg(
    CASE
      WHEN jsonb_typeof(elem) <> 'object' THEN elem
      ELSE
        -- start from the item minus the now-localized scalar keys
        (elem - 'name' - 'description')
        -- name_i18n: keep an existing map, else wrap the legacy scalar
        || jsonb_build_object(
             'name_i18n',
             COALESCE(
               elem -> 'name_i18n',
               jsonb_strip_nulls(jsonb_build_object('en', NULLIF(btrim(elem ->> 'name'), '')))
             )
           )
        -- description_i18n: keep an existing map, else wrap the legacy scalar
        || jsonb_build_object(
             'description_i18n',
             COALESCE(
               elem -> 'description_i18n',
               jsonb_strip_nulls(jsonb_build_object('en', NULLIF(btrim(elem ->> 'description'), '')))
             )
           )
    END
    ORDER BY ord
  )
  FROM jsonb_array_elements(tp.services_menu) WITH ORDINALITY AS e(elem, ord)
)
WHERE jsonb_typeof(tp.services_menu) = 'array'
  AND jsonb_array_length(tp.services_menu) > 0;

-- ========================================================================
-- 6. Recreate dependent DB objects to read the new *_i18n maps
--    (must happen BEFORE the DROPs below).
-- ========================================================================

-- 6a. View talent_skills_resolved — same output columns, sources now from name_i18n.
CREATE OR REPLACE VIEW public.talent_skills_resolved AS
 SELECT tpt.talent_profile_id,
    tpt.taxonomy_term_id AS skill_term_id,
    t.slug AS skill_slug,
    NULLIF(btrim(t.name_i18n ->> 'en'), '') AS skill_name_en,
    NULLIF(btrim(t.name_i18n ->> 'es'), '') AS skill_name_es,
    t.is_generic_fallback,
    parent_category_of(t.id) AS parent_category_id,
    pc.slug AS parent_category_slug,
    NULLIF(btrim(pc.name_i18n ->> 'en'), '') AS parent_category_name_en,
    tpt.relationship_type,
    tpt.proficiency_level,
    tpt.years_experience,
    tpt.display_order,
    tpt.verified_at IS NOT NULL AS is_verified,
    tpt.verified_at,
    tpt.verified_by_user_id,
    tpt.verified_by_tenant_id,
    tpt.verification_note,
    tpt.tenant_id,
    tpt.created_at,
    tpt.updated_at,
    COALESCE(tsm.booking_count, 0) AS booking_count,
    tsm.last_booked_at
   FROM talent_profile_taxonomy tpt
     JOIN taxonomy_terms t ON t.id = tpt.taxonomy_term_id
     LEFT JOIN taxonomy_terms pc ON pc.id = parent_category_of(t.id)
     LEFT JOIN talent_skill_metrics tsm ON tsm.talent_profile_id = tpt.talent_profile_id AND tsm.taxonomy_term_id = tpt.taxonomy_term_id
  WHERE tpt.relationship_type = ANY (ARRAY['primary_role'::text, 'secondary_role'::text]);

-- 6b. api_directory_cards (cursor overload). Output columns unchanged; *_es now from *_i18n.
CREATE OR REPLACE FUNCTION public.api_directory_cards(p_limit integer DEFAULT 24, p_after_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_after_id uuid DEFAULT NULL::uuid, p_taxonomy_term_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(id uuid, profile_code text, public_slug_part text, display_name text, first_name text, last_name text, created_at timestamp with time zone, is_featured boolean, featured_level integer, thumb_width integer, thumb_height integer, thumb_bucket_id text, thumb_storage_path text, primary_talent_type_name_en text, primary_talent_type_name_es text, location_display_en text, location_display_es text, location_country_code text, fit_labels_jsonb jsonb, height_cm integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT
    t.id,
    t.profile_code,
    t.public_slug_part,
    t.display_name,
    t.first_name,
    t.last_name,
    t.created_at,
    t.is_featured,
    t.featured_level,
    m.width AS thumb_width,
    m.height AS thumb_height,
    m.bucket_id AS thumb_bucket_id,
    m.storage_path AS thumb_storage_path,
    tt_primary.name_en AS primary_talent_type_name_en,
    tt_primary.name_es AS primary_talent_type_name_es,
    (l.display_name_i18n ->> 'en') AS location_display_en,
    (l.display_name_i18n ->> 'es') AS location_display_es,
    l.country_code AS location_country_code,
    COALESCE(fl.fit_labels_jsonb, '[]'::jsonb) AS fit_labels_jsonb,
    t.height_cm
  FROM public.talent_profiles t
  LEFT JOIN public.locations l
    ON l.id = t.location_id
   AND l.archived_at IS NULL
  LEFT JOIN LATERAL (
    SELECT (tt.name_i18n ->> 'en') AS name_en, (tt.name_i18n ->> 'es') AS name_es
    FROM public.talent_profile_taxonomy tpt
    JOIN public.taxonomy_terms tt
      ON tt.id = tpt.taxonomy_term_id
     AND tt.archived_at IS NULL
    WHERE tpt.talent_profile_id = t.id
      AND tt.kind = 'talent_type'
    ORDER BY tpt.is_primary DESC, tt.sort_order, (tt.name_i18n ->> 'en')
    LIMIT 1
  ) tt_primary ON true
  LEFT JOIN LATERAL (
    SELECT COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'slug', sub.slug,
            'name_en', sub.name_en,
            'name_es', sub.name_es
          )
          ORDER BY sub.sort_order, sub.name_en
        )
        FROM (
          SELECT tt.slug, (tt.name_i18n ->> 'en') AS name_en, (tt.name_i18n ->> 'es') AS name_es, tt.sort_order
          FROM public.talent_profile_taxonomy tpt
          JOIN public.taxonomy_terms tt
            ON tt.id = tpt.taxonomy_term_id
           AND tt.archived_at IS NULL
          WHERE tpt.talent_profile_id = t.id
            AND tt.kind = 'fit_label'
          ORDER BY tt.sort_order, (tt.name_i18n ->> 'en')
          LIMIT 2
        ) sub
      ),
      '[]'::jsonb
    ) AS fit_labels_jsonb
  ) fl ON true
  LEFT JOIN LATERAL (
    SELECT ma.width, ma.height, ma.bucket_id, ma.storage_path
    FROM public.media_assets ma
    WHERE ma.owner_talent_profile_id = t.id
      AND ma.deleted_at IS NULL
      AND ma.approval_state = 'approved'
      AND ma.variant_kind IN ('card', 'public_watermarked', 'gallery')
    ORDER BY
      CASE ma.variant_kind
        WHEN 'card' THEN 0
        WHEN 'public_watermarked' THEN 1
        ELSE 2
      END,
      ma.sort_order,
      ma.created_at
    LIMIT 1
  ) m ON true
  WHERE t.deleted_at IS NULL
    AND t.workflow_status = 'approved'
    AND t.visibility = 'public'
    AND (
      p_after_created_at IS NULL
      OR (
        t.created_at < p_after_created_at
        OR (t.created_at = p_after_created_at AND t.id < p_after_id)
      )
    )
    AND (
      p_taxonomy_term_ids IS NULL
      OR cardinality(p_taxonomy_term_ids) = 0
      OR EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = t.id
          AND tpt.taxonomy_term_id = ANY (p_taxonomy_term_ids)
      )
    )
  ORDER BY t.created_at DESC, t.id DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 48);
$function$;

-- 6c. api_directory_cards (search/sort overload).
CREATE OR REPLACE FUNCTION public.api_directory_cards(p_limit integer DEFAULT 24, p_offset integer DEFAULT 0, p_taxonomy_term_ids uuid[] DEFAULT NULL::uuid[], p_query text DEFAULT NULL::text, p_location_slug text DEFAULT NULL::text, p_sort text DEFAULT 'recommended'::text)
 RETURNS TABLE(id uuid, profile_code text, public_slug_part text, display_name text, first_name text, last_name text, created_at timestamp with time zone, is_featured boolean, featured_level integer, thumb_width integer, thumb_height integer, thumb_bucket_id text, thumb_storage_path text, primary_talent_type_name_en text, primary_talent_type_name_es text, location_display_en text, location_display_es text, location_country_code text, fit_labels_jsonb jsonb, height_cm integer)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT
      t.id,
      t.profile_code,
      t.public_slug_part,
      t.display_name,
      t.first_name,
      t.last_name,
      t.short_bio,
      t.created_at,
      t.updated_at,
      t.listing_started_at,
      t.is_featured,
      t.featured_level,
      t.featured_position,
      t.height_cm,
      l.city_slug,
      (l.display_name_i18n ->> 'en') AS location_display_en,
      (l.display_name_i18n ->> 'es') AS location_display_es,
      l.country_code AS location_country_code,
      tt_primary.name_en AS primary_talent_type_name_en,
      tt_primary.name_es AS primary_talent_type_name_es,
      COALESCE(fl.fit_labels_jsonb, '[]'::jsonb) AS fit_labels_jsonb,
      m.width AS thumb_width,
      m.height AS thumb_height,
      m.bucket_id AS thumb_bucket_id,
      m.storage_path AS thumb_storage_path
    FROM public.talent_profiles t
    LEFT JOIN public.locations l
      ON l.id = COALESCE(t.residence_city_id, t.location_id)
     AND l.archived_at IS NULL
    LEFT JOIN LATERAL (
      SELECT (tt.name_i18n ->> 'en') AS name_en, (tt.name_i18n ->> 'es') AS name_es
      FROM public.talent_profile_taxonomy tpt
      JOIN public.taxonomy_terms tt
        ON tt.id = tpt.taxonomy_term_id
       AND tt.archived_at IS NULL
      WHERE tpt.talent_profile_id = t.id
        AND tt.kind = 'talent_type'
      ORDER BY tpt.is_primary DESC, tt.sort_order, (tt.name_i18n ->> 'en')
      LIMIT 1
    ) tt_primary ON true
    LEFT JOIN LATERAL (
      SELECT COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'slug', sub.slug,
              'name_en', sub.name_en,
              'name_es', sub.name_es
            )
            ORDER BY sub.sort_order, sub.name_en
          )
          FROM (
            SELECT tt.slug, (tt.name_i18n ->> 'en') AS name_en, (tt.name_i18n ->> 'es') AS name_es, tt.sort_order
            FROM public.talent_profile_taxonomy tpt
            JOIN public.taxonomy_terms tt
              ON tt.id = tpt.taxonomy_term_id
             AND tt.archived_at IS NULL
            WHERE tpt.talent_profile_id = t.id
              AND tt.kind = 'fit_label'
            ORDER BY tt.sort_order, (tt.name_i18n ->> 'en')
            LIMIT 2
          ) sub
        ),
        '[]'::jsonb
      ) AS fit_labels_jsonb
    ) fl ON true
    LEFT JOIN LATERAL (
      SELECT ma.width, ma.height, ma.bucket_id, ma.storage_path
      FROM public.media_assets ma
      WHERE ma.owner_talent_profile_id = t.id
        AND ma.deleted_at IS NULL
        AND ma.approval_state = 'approved'
        AND ma.variant_kind IN ('card', 'public_watermarked', 'gallery')
      ORDER BY
        CASE ma.variant_kind
          WHEN 'card' THEN 0
          WHEN 'public_watermarked' THEN 1
          ELSE 2
        END,
        ma.sort_order,
        ma.created_at
      LIMIT 1
    ) m ON true
    WHERE t.deleted_at IS NULL
      AND t.workflow_status = 'approved'
      AND t.visibility = 'public'
      AND (
        p_taxonomy_term_ids IS NULL
        OR cardinality(p_taxonomy_term_ids) = 0
        OR EXISTS (
          SELECT 1
          FROM public.talent_profile_taxonomy tpt
          WHERE tpt.talent_profile_id = t.id
            AND tpt.taxonomy_term_id = ANY (p_taxonomy_term_ids)
        )
      )
      AND (
        COALESCE(NULLIF(trim(p_location_slug), ''), '') = ''
        OR COALESCE(l.city_slug, '') = trim(p_location_slug)
      )
      AND (
        COALESCE(NULLIF(trim(p_query), ''), '') = ''
        OR COALESCE(t.profile_code, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(t.display_name, '') ILIKE '%' || trim(p_query) || '%'
        OR CONCAT_WS(' ', t.first_name, t.last_name) ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(t.short_bio, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(tt_primary.name_en, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE(tt_primary.name_es, '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE((l.display_name_i18n ->> 'en'), '') ILIKE '%' || trim(p_query) || '%'
        OR COALESCE((l.display_name_i18n ->> 'es'), '') ILIKE '%' || trim(p_query) || '%'
        OR EXISTS (
          SELECT 1
          FROM public.talent_profile_taxonomy tpt
          JOIN public.taxonomy_terms tt
            ON tt.id = tpt.taxonomy_term_id
           AND tt.archived_at IS NULL
          WHERE tpt.talent_profile_id = t.id
            AND (
              COALESCE((tt.name_i18n ->> 'en'), '') ILIKE '%' || trim(p_query) || '%'
              OR COALESCE((tt.name_i18n ->> 'es'), '') ILIKE '%' || trim(p_query) || '%'
              OR COALESCE(tt.slug, '') ILIKE '%' || trim(p_query) || '%'
            )
        )
      )
  )
  SELECT
    base.id,
    base.profile_code,
    base.public_slug_part,
    base.display_name,
    base.first_name,
    base.last_name,
    base.created_at,
    base.is_featured,
    base.featured_level,
    base.thumb_width,
    base.thumb_height,
    base.thumb_bucket_id,
    base.thumb_storage_path,
    base.primary_talent_type_name_en,
    base.primary_talent_type_name_es,
    base.location_display_en,
    base.location_display_es,
    base.location_country_code,
    base.fit_labels_jsonb,
    base.height_cm
  FROM base
  ORDER BY
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN CASE WHEN base.is_featured THEN 0 ELSE 1 END
      ELSE 0
    END,
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN base.featured_level
      ELSE 0
    END DESC,
    CASE
      WHEN COALESCE(p_sort, 'recommended') IN ('recommended', 'featured')
        THEN base.featured_position
      ELSE 0
    END ASC,
    CASE
      WHEN COALESCE(p_sort, 'recommended') = 'updated'
        THEN base.updated_at
      WHEN COALESCE(p_sort, 'recommended') = 'recent'
        THEN base.created_at
      ELSE COALESCE(base.listing_started_at, base.updated_at, base.created_at)
    END DESC,
    base.created_at DESC,
    base.id DESC
  OFFSET GREATEST(p_offset, 0)
  LIMIT LEAST(GREATEST(p_limit, 1), 48);
$function$;

-- 6d. directory_search_public_talent_ids — bio_en/bio_es + location/taxonomy *_es now from *_i18n.
CREATE OR REPLACE FUNCTION public.directory_search_public_talent_ids(p_query text)
 RETURNS SETOF uuid
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_raw text;
  v_safe text;
  v_like text;
  v_tsq tsquery;
BEGIN
  v_raw := trim(coalesce(p_query, ''));
  IF length(v_raw) < 1 THEN
    RETURN;
  END IF;

  v_safe := regexp_replace(v_raw, '\s+', ' ', 'g');
  v_safe := replace(replace(v_safe, '%', ''), '_', '');
  v_like := '%' || v_safe || '%';

  v_tsq := websearch_to_tsquery('simple', v_raw);

  RETURN QUERY
  SELECT DISTINCT x.id
  FROM (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND (
        (v_tsq IS NOT NULL AND numnode(v_tsq) > 0 AND to_tsvector(
          'simple',
          coalesce(tp.display_name, '')
            || ' ' || coalesce(tp.first_name, '')
            || ' ' || coalesce(tp.last_name, '')
            || ' ' || coalesce(tp.profile_code, '')
            || ' ' || coalesce(tp.short_bio, '')
            || ' ' || coalesce(tp.bio_i18n ->> 'en', '')
            || ' ' || coalesce(tp.bio_i18n ->> 'es', '')
        ) @@ v_tsq)
        OR (
          length(v_safe) >= 2
          AND (
            coalesce(tp.display_name, '') ILIKE v_like
            OR coalesce(tp.first_name, '') ILIKE v_like
            OR coalesce(tp.last_name, '') ILIKE v_like
            OR coalesce(tp.profile_code, '') ILIKE v_like
            OR coalesce(tp.short_bio, '') ILIKE v_like
            OR coalesce(tp.bio_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(tp.bio_i18n ->> 'es', '') ILIKE v_like
          )
        )
        OR (
          length(v_safe) >= 3
          AND (
            similarity(coalesce(tp.display_name, ''), v_safe) > 0.22
            OR similarity(coalesce(tp.profile_code, ''), v_safe) > 0.22
          )
        )
      )

    UNION

    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND EXISTS (
        SELECT 1
        FROM public.locations l
        WHERE l.archived_at IS NULL
          AND (l.id = tp.residence_city_id OR l.id = tp.location_id)
          AND (
            l.city_slug ILIKE v_like
            OR coalesce(l.display_name_i18n ->> 'en', '') ILIKE v_like
            OR coalesce(l.display_name_i18n ->> 'es', '') ILIKE v_like
          )
      )

    UNION

    SELECT tpt.talent_profile_id AS id
    FROM public.talent_profile_taxonomy tpt
    INNER JOIN public.talent_profiles tp ON tp.id = tpt.talent_profile_id
    INNER JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id AND tt.archived_at IS NULL
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND (
        coalesce(tt.name_i18n ->> 'en', '') ILIKE v_like
        OR coalesce(tt.name_i18n ->> 'es', '') ILIKE v_like
        OR tt.slug ILIKE v_like
        OR (
          length(v_safe) >= 3
          AND (
            similarity(coalesce(tt.name_i18n ->> 'en', ''), v_safe) > 0.2
            OR similarity(tt.slug, v_safe) > 0.25
          )
        )
      )

    UNION

    -- VALUE leg — System B (`talent_profile_field_values`). Mirrors
    -- `read-source-directory-search.ts`: ILIKE B's jsonb scalar (`value #>> '{}'`)
    -- across the canonical B defs for the searchable BRIDGED keys (resolved via
    -- the A→B key bridge) PLUS the three canonical SOCIAL handle fields.
    SELECT bv.talent_profile_id AS id
    FROM public.talent_profile_field_values bv
    INNER JOIN public.profile_field_definitions pfd
      ON pfd.id = bv.field_definition_id
     AND pfd.deprecated_at IS NULL
     AND pfd.field_key IN (
        'physical.body_type', 'physical.dress_size', 'physical.eye_color',
        'physical.hair_color', 'physical.hair_length', 'physical.shoe_size_eu',
        'experience.level', 'experience.notable_work',
        'experience.professional_highlights', 'availability.status',
        'availability.available_for', 'travel.scope', 'media.website_url',
        'creator.instagram_handle', 'creator.tiktok_handle', 'creator.youtube_channel'
     )
    INNER JOIN public.talent_profiles tp ON tp.id = bv.talent_profile_id
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND length(v_safe) >= 1
      AND coalesce(bv.value #>> '{}', '') ILIKE v_like
  ) x;
END;
$function$;

-- 6e. ensure_city_location — params unchanged; writes display_name into display_name_i18n.
CREATE OR REPLACE FUNCTION public.ensure_city_location(p_country_iso2 text, p_country_name_en text DEFAULT NULL::text, p_country_name_es text DEFAULT NULL::text, p_city_slug text DEFAULT NULL::text, p_city_name_en text DEFAULT NULL::text, p_city_name_es text DEFAULT NULL::text, p_lat double precision DEFAULT NULL::double precision, p_lng double precision DEFAULT NULL::double precision, p_population bigint DEFAULT NULL::bigint)
 RETURNS TABLE(country_id uuid, city_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_country_id UUID;
  v_country_iso2 TEXT := upper(trim(coalesce(p_country_iso2, '')));
  v_city_name_en TEXT := nullif(trim(coalesce(p_city_name_en, '')), '');
  v_city_name_es TEXT := nullif(trim(coalesce(p_city_name_es, '')), '');
  v_city_slug TEXT := public.normalize_location_slug(coalesce(p_city_slug, p_city_name_en, ''));
  v_name_i18n jsonb := jsonb_strip_nulls(jsonb_build_object('en', v_city_name_en, 'es', v_city_name_es));
BEGIN
  IF v_country_iso2 = '' OR length(v_country_iso2) <> 2 THEN
    RAISE EXCEPTION 'Valid country ISO2 required';
  END IF;
  IF v_city_slug = '' OR v_city_name_en IS NULL THEN
    RAISE EXCEPTION 'City slug and English city name required';
  END IF;

  v_country_id := public.ensure_country(v_country_iso2, p_country_name_en, p_country_name_es);

  INSERT INTO public.locations (
    country_code,
    country_id,
    city_slug,
    display_name_i18n,
    latitude,
    longitude,
    population,
    active,
    archived_at
  )
  VALUES (
    v_country_iso2,
    v_country_id,
    v_city_slug,
    v_name_i18n,
    p_lat,
    p_lng,
    p_population,
    TRUE,
    NULL
  )
  ON CONFLICT (country_code, city_slug) DO UPDATE
  SET
    country_id = excluded.country_id,
    -- merge: always refresh 'en'; keep existing 'es' when the caller omitted it.
    display_name_i18n = jsonb_strip_nulls(
      public.locations.display_name_i18n
        || jsonb_build_object('en', v_city_name_en)
        || CASE WHEN v_city_name_es IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('es', v_city_name_es) END
    ),
    latitude = coalesce(excluded.latitude, public.locations.latitude),
    longitude = coalesce(excluded.longitude, public.locations.longitude),
    population = coalesce(excluded.population, public.locations.population),
    active = TRUE,
    archived_at = NULL,
    updated_at = now();

  RETURN QUERY
  SELECT v_country_id, l.id
  FROM public.locations l
  WHERE l.country_code = v_country_iso2
    AND l.city_slug = v_city_slug
  LIMIT 1;
END;
$function$;

-- 6f. sync_location_taxonomy_terms — taxonomy name now name_i18n; sources locations.display_name_i18n.
CREATE OR REPLACE FUNCTION public.sync_location_taxonomy_terms()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.taxonomy_terms (kind, slug, name_i18n, sort_order, archived_at, updated_at, term_type, level)
  SELECT
    'location_country'::public.taxonomy_kind,
    lower(l.country_code),
    jsonb_build_object('en', upper(l.country_code), 'es', upper(l.country_code)),
    0,
    NULL,
    now(),
    'attribute',
    1
  FROM public.locations l
  WHERE l.archived_at IS NULL
  GROUP BY lower(l.country_code), upper(l.country_code)
  ON CONFLICT (kind, slug) DO UPDATE
    SET archived_at = NULL,
        term_type   = COALESCE(public.taxonomy_terms.term_type, 'attribute'),
        updated_at  = now();

  INSERT INTO public.taxonomy_terms (kind, slug, name_i18n, sort_order, archived_at, updated_at, term_type, level)
  SELECT
    'location_city'::public.taxonomy_kind,
    l.city_slug,
    jsonb_strip_nulls(jsonb_build_object(
      'en', NULLIF(btrim(l.display_name_i18n ->> 'en'), ''),
      'es', NULLIF(btrim(l.display_name_i18n ->> 'es'), '')
    )),
    0,
    l.archived_at,
    now(),
    'attribute',
    1
  FROM public.locations l
  ON CONFLICT (kind, slug) DO UPDATE
    SET name_i18n   = EXCLUDED.name_i18n,
        archived_at = EXCLUDED.archived_at,
        term_type   = COALESCE(public.taxonomy_terms.term_type, 'attribute'),
        updated_at  = now();

  -- Archive country terms whose only locations were deleted/archived.
  UPDATE public.taxonomy_terms t
  SET archived_at = COALESCE(t.archived_at, now()),
      updated_at  = now()
  WHERE t.kind = 'location_country'::public.taxonomy_kind
    AND NOT EXISTS (
      SELECT 1 FROM public.locations l
      WHERE l.archived_at IS NULL
        AND lower(l.country_code) = t.slug
    );
END;
$function$;

-- 6g. talent_profiles_reverse_sync_v2 (trigger fn) — language/destination matching now reads *_i18n.
CREATE OR REPLACE FUNCTION public.talent_profiles_reverse_sync_v2()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tenant UUID;
BEGIN
  IF pg_trigger_depth() > 1 THEN
    RETURN NEW;
  END IF;

  v_tenant := COALESCE(NEW.created_by_agency_id, '00000000-0000-0000-0000-000000000001'::UUID);

  -- talent_profiles.location_id → talent_service_areas (home_base)
  IF NEW.location_id IS DISTINCT FROM OLD.location_id THEN
    DELETE FROM public.talent_service_areas
     WHERE talent_profile_id = NEW.id
       AND service_kind = 'home_base'
       AND (NEW.location_id IS NULL OR location_id <> NEW.location_id);

    IF NEW.location_id IS NOT NULL THEN
      INSERT INTO public.talent_service_areas
        (tenant_id, talent_profile_id, location_id, service_kind, display_order)
      VALUES
        (v_tenant, NEW.id, NEW.location_id, 'home_base', 0)
      ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;
    END IF;
  END IF;

  -- talent_profiles.languages TEXT[] → talent_languages rows
  IF NEW.languages IS DISTINCT FROM OLD.languages
     AND NEW.languages IS NOT NULL THEN
    INSERT INTO public.talent_languages
      (tenant_id, talent_profile_id, language_code, language_name,
       speaking_level, display_order)
    SELECT
      v_tenant,
      NEW.id,
      COALESCE(
        (SELECT lower(tt.slug) FROM public.taxonomy_terms tt
          WHERE tt.kind::text = 'language'
            AND (
              lower(tt.name_i18n ->> 'en') = lower(btrim(name))
              OR lower(COALESCE(tt.name_i18n ->> 'es', '')) = lower(btrim(name))
              OR lower(btrim(name)) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
            )
          LIMIT 1),
        lower(left(regexp_replace(btrim(name), '[^a-zA-Z]', '', 'g'), 3))
      )                                                          AS language_code,
      COALESCE(
        (SELECT (tt.name_i18n ->> 'en') FROM public.taxonomy_terms tt
          WHERE tt.kind::text = 'language'
            AND (
              lower(tt.name_i18n ->> 'en') = lower(btrim(name))
              OR lower(COALESCE(tt.name_i18n ->> 'es', '')) = lower(btrim(name))
              OR lower(btrim(name)) = ANY(SELECT lower(a) FROM unnest(tt.aliases) a)
            )
          LIMIT 1),
        btrim(name)
      )                                                          AS language_name,
      'conversational',
      ord - 1
      FROM unnest(NEW.languages) WITH ORDINALITY AS u(name, ord)
     WHERE btrim(name) <> ''
    ON CONFLICT (talent_profile_id, language_code) DO NOTHING;
  END IF;

  -- talent_profiles.destinations TEXT[] → talent_service_areas (travel_to)
  IF NEW.destinations IS DISTINCT FROM OLD.destinations
     AND NEW.destinations IS NOT NULL THEN
    INSERT INTO public.talent_service_areas
      (tenant_id, talent_profile_id, location_id, service_kind, display_order)
    SELECT
      v_tenant,
      NEW.id,
      loc.id,
      'travel_to',
      ord - 1
      FROM unnest(NEW.destinations) WITH ORDINALITY AS u(raw, ord)
      JOIN public.locations loc
        ON loc.archived_at IS NULL
       AND (
            lower(loc.display_name_i18n ->> 'en') = lower(btrim(raw))
            OR lower(COALESCE(loc.display_name_i18n ->> 'es', '')) = lower(btrim(raw))
            OR lower(loc.city_slug) = lower(regexp_replace(btrim(raw), '\s+', '-', 'g'))
       )
     WHERE btrim(raw) <> ''
       AND (NEW.location_id IS NULL OR loc.id <> NEW.location_id)
    ON CONFLICT (talent_profile_id, location_id, service_kind) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- 6h. Directory FTS index — rebuild reading bio_i18n instead of bio_en/bio_es.
DROP INDEX IF EXISTS public.idx_talent_profiles_directory_fts;
CREATE INDEX idx_talent_profiles_directory_fts
  ON public.talent_profiles
  USING gin (to_tsvector('simple'::regconfig,
    (((((((((((((COALESCE(display_name, ''::text) || ' '::text)
      || COALESCE(first_name, ''::text)) || ' '::text)
      || COALESCE(last_name, ''::text)) || ' '::text)
      || COALESCE(profile_code, ''::text)) || ' '::text)
      || COALESCE(short_bio, ''::text)) || ' '::text)
      || COALESCE(bio_i18n ->> 'en', ''::text)) || ' '::text)
      || COALESCE(bio_i18n ->> 'es', ''::text))))
  WHERE ((deleted_at IS NULL) AND (is_publicly_hidden = false));

-- ========================================================================
-- 7. DROP the old per-column storage (no dependents remain).
-- ========================================================================
ALTER TABLE public.taxonomy_terms
  DROP COLUMN name_en,
  DROP COLUMN name_es;

ALTER TABLE public.agency_taxonomy_settings
  DROP COLUMN custom_label,        -- drops attached CHECK agency_taxonomy_settings_custom_label_len
  DROP COLUMN custom_label_es;

ALTER TABLE public.locations
  DROP COLUMN display_name_en,
  DROP COLUMN display_name_es;

ALTER TABLE public.talent_profiles
  DROP COLUMN bio_en,
  DROP COLUMN bio_es,
  DROP COLUMN bio_en_draft,
  DROP COLUMN bio_es_draft,
  DROP COLUMN bio_en_status,
  DROP COLUMN bio_es_status,
  DROP COLUMN bio_en_updated_at,
  DROP COLUMN bio_es_updated_at;

COMMIT;
