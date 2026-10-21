-- TUL-1233 / TUL-1789 -- the hub (no-tenant) facet-count overloads use the SAME search as the result list. HELD in _pending_pm (PM applies).
--
-- 20261231413000 moved the three TENANT-scoped facet functions onto public.directory_search_public_talent_ids(text),
-- the function the result list searches with. The three NO-TENANT overloads (what the cross-tenant hub directory calls)
-- were left on the old plain ILIKE of name / bio / profile_code, so a trade word such as 'limpieza' still counted far
-- fewer profiles than the list showed on the hub. Same change, same single edit per function: ONLY the inline ILIKE
-- block becomes `tp.id IN (SELECT public.directory_search_public_talent_ids(p_search))`. Signatures, return shapes and
-- every other predicate are copied from the live definitions (read from production 2026-10-21) and unchanged.
--
-- The gender / boolean / text count functions read through directory_facet_scalar_base_ids, so they follow.
--
-- ROLLBACK: re-create the three functions with the ILIKE block (20260522061322 / 20260627120000 hold the older bodies).

BEGIN;

CREATE OR REPLACE FUNCTION public.directory_facet_location_counts(
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text
)
RETURNS TABLE(city_slug text, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
    WHERE tt.kind::text NOT IN ('location_city', 'location_country')
  ),
  base_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND public.talent_is_site_visible_anywhere(tp.id)
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.id IN (SELECT public.directory_search_public_talent_ids(p_search))
      )
  ),
  other_kinds AS (
    SELECT sk.kind, array_agg(sk.id) AS term_ids
    FROM sel sk
    GROUP BY sk.kind
  ),
  constrained AS (
    SELECT b.id
    FROM base_tp b
    WHERE NOT EXISTS (
      SELECT 1
      FROM other_kinds ok
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = b.id
          AND tpt.taxonomy_term_id = ANY (ok.term_ids)
      )
    )
  )
  SELECT l.city_slug::text, count(DISTINCT tp.id)::bigint AS profile_count
  FROM public.locations l
  INNER JOIN public.talent_profiles tp
    ON (tp.residence_city_id = l.id OR tp.location_id = l.id)
  INNER JOIN constrained c ON c.id = tp.id
  WHERE l.archived_at IS NULL
  GROUP BY l.city_slug;
$function$;

CREATE OR REPLACE FUNCTION public.directory_facet_taxonomy_counts_for_kind(
  p_kind text,
  p_location_city_slug text,
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text
)
RETURNS TABLE(taxonomy_term_id uuid, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
  ),
  base_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND public.talent_is_site_visible_anywhere(tp.id)
      AND (
        p_location_city_slug IS NULL
        OR trim(p_location_city_slug) = ''
        OR EXISTS (
          SELECT 1
          FROM public.locations l
          WHERE l.archived_at IS NULL
            AND l.city_slug = trim(p_location_city_slug)
            AND (tp.residence_city_id = l.id OR tp.location_id = l.id)
        )
      )
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.id IN (SELECT public.directory_search_public_talent_ids(p_search))
      )
  ),
  other_kinds AS (
    SELECT ok.kind, array_agg(ok.id) AS term_ids
    FROM sel ok
    WHERE ok.kind::text <> p_kind
      AND ok.kind::text NOT IN ('location_city', 'location_country')
    GROUP BY ok.kind
  ),
  constrained AS (
    SELECT b.id
    FROM base_tp b
    WHERE NOT EXISTS (
      SELECT 1
      FROM other_kinds ok
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = b.id
          AND tpt.taxonomy_term_id = ANY (ok.term_ids)
      )
    )
  ),
  tall AS (
    SELECT tt.id AS tid
    FROM public.taxonomy_terms tt
    WHERE tt.kind = p_kind::public.taxonomy_kind AND tt.archived_at IS NULL
  ),
  agg AS (
    SELECT tpt.taxonomy_term_id AS tid, count(DISTINCT tpt.talent_profile_id)::bigint AS c
    FROM constrained c
    JOIN public.talent_profile_taxonomy tpt ON tpt.talent_profile_id = c.id
    JOIN public.taxonomy_terms tt ON tt.id = tpt.taxonomy_term_id
      AND tt.kind = p_kind::public.taxonomy_kind
      AND tt.archived_at IS NULL
    GROUP BY tpt.taxonomy_term_id
  )
  SELECT tall.tid AS taxonomy_term_id, coalesce(agg.c, 0::bigint) AS profile_count
  FROM tall
  LEFT JOIN agg ON agg.tid = tall.tid;
$function$;

CREATE OR REPLACE FUNCTION public.directory_facet_scalar_base_ids(
  p_location_city_slug text,
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
    WHERE tt.kind::text NOT IN ('location_city', 'location_country')
  ),
  base_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND public.talent_is_site_visible_anywhere(tp.id)
      AND (
        p_location_city_slug IS NULL
        OR trim(p_location_city_slug) = ''
        OR EXISTS (
          SELECT 1
          FROM public.locations l
          WHERE l.archived_at IS NULL
            AND l.city_slug = trim(p_location_city_slug)
            AND (tp.residence_city_id = l.id OR tp.location_id = l.id)
        )
      )
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.id IN (SELECT public.directory_search_public_talent_ids(p_search))
      )
  ),
  other_kinds AS (
    SELECT sk.kind, array_agg(sk.id) AS term_ids
    FROM sel sk
    GROUP BY sk.kind
  ),
  constrained AS (
    SELECT b.id
    FROM base_tp b
    WHERE NOT EXISTS (
      SELECT 1
      FROM other_kinds ok
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_taxonomy tpt
        WHERE tpt.talent_profile_id = b.id
          AND tpt.taxonomy_term_id = ANY (ok.term_ids)
      )
    )
  ),
  gender_filtered AS (
    SELECT c.id
    FROM constrained c
    JOIN public.talent_profiles tp ON tp.id = c.id
    WHERE (
      p_gender_filter IS NULL
      OR coalesce(array_length(p_gender_filter, 1), 0) = 0
      OR (tp.gender IS NOT NULL AND (tp.gender)::text = ANY (p_gender_filter))
    )
  ),
  -- BOOLEAN cross-filter (System B). For every boolean facet selection, the
  -- talent must have a B value (resolved synthetic-id -> B def) whose jsonb scalar
  -- coerces (jsonScalarToBool token set) to one of the requested booleans.
  bool_filtered AS (
    SELECT gf.id
    FROM gender_filtered gf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_boolean_filters, '[]'::jsonb)) bf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_field_values bv
        WHERE bv.talent_profile_id = gf.id
          AND bv.field_definition_id =
              public.directory_facet_b_def_id_for_legacy_id((bf->>'id')::uuid)
          AND (
            CASE lower(btrim(bv.value #>> '{}'))
              WHEN 'true' THEN true WHEN '1' THEN true WHEN 'yes' THEN true WHEN 't' THEN true
              WHEN 'false' THEN false WHEN '0' THEN false WHEN 'no' THEN false WHEN 'f' THEN false
              ELSE NULL
            END
          ) IN (
            SELECT (elem)::boolean
            FROM jsonb_array_elements_text(bf->'v') AS elem
          )
      )
    )
  ),
  -- TEXT cross-filter (System B). For every text facet selection, the talent must
  -- have a B value (resolved synthetic-id -> B def) whose NORMALIZED jsonb scalar
  -- is in the normalized candidate set of one of the requested slugs. The
  -- candidate set per slug = { norm(slug) } U { norm(label) for each B option
  -- label matchLabelOption-equivalent to the slug } (mirrors the TS
  -- directoryFacetSlugToBMatchSet).
  text_filtered AS (
    SELECT bf.id
    FROM bool_filtered bf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_text_filters, '[]'::jsonb)) tf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.talent_profile_field_values bv
        JOIN public.profile_field_definitions pfd
          ON pfd.id = bv.field_definition_id
        WHERE bv.talent_profile_id = bf.id
          AND bv.field_definition_id =
              public.directory_facet_b_def_id_for_legacy_id((tf->>'id')::uuid)
          AND public.directory_facet_normalize_value(bv.value #>> '{}') IN (
            -- candidate normalized set across all requested slugs
            SELECT public.directory_facet_normalize_value(slug.val)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            UNION
            SELECT public.directory_facet_normalize_value(lbl.label)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(pfd.options) = 'array' THEN pfd.options ELSE '[]'::jsonb END
            ) AS lbl(label)
            WHERE
              -- matchLabelOption(slug, label): exact/ci/slug equality
              lower(btrim(lbl.label)) = lower(btrim(slug.val))
              OR public.directory_facet_slugify(lbl.label) = public.directory_facet_slugify(slug.val)
          )
      )
    )
  )
  SELECT id FROM text_filtered;
$function$;

COMMIT;
