-- Scalar directory facets (gender on profile, boolean/text enum via field_values): base set + per-option counts.
-- Used with public `ff` URL params; respects same visibility / taxonomy / location / height / legacy search as existing facet RPCs.

BEGIN;

CREATE OR REPLACE FUNCTION public.directory_facet_scalar_base_ids(
  p_location_city_slug text,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
      AND tp.workflow_status = 'approved'
      AND tp.visibility = 'public'
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
        OR tp.display_name ILIKE '%' || trim(p_search) || '%'
        OR tp.first_name ILIKE '%' || trim(p_search) || '%'
        OR tp.last_name ILIKE '%' || trim(p_search) || '%'
        OR tp.short_bio ILIKE '%' || trim(p_search) || '%'
        OR tp.profile_code ILIKE '%' || trim(p_search) || '%'
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
  bool_filtered AS (
    SELECT gf.id
    FROM gender_filtered gf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_boolean_filters, '[]'::jsonb)) bf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.field_values fv
        WHERE fv.talent_profile_id = gf.id
          AND fv.field_definition_id = (bf->>'id')::uuid
          AND fv.value_boolean IN (
            SELECT (elem)::boolean
            FROM jsonb_array_elements_text(bf->'v') AS elem
          )
      )
    )
  ),
  text_filtered AS (
    SELECT bf.id
    FROM bool_filtered bf
    WHERE NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(coalesce(p_text_filters, '[]'::jsonb)) tf
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.field_values fv
        WHERE fv.talent_profile_id = bf.id
          AND fv.field_definition_id = (tf->>'id')::uuid
          AND fv.value_text IS NOT NULL
          AND trim(fv.value_text) IN (
            SELECT trim(elem::text)
            FROM jsonb_array_elements_text(tf->'v') AS elem
          )
      )
    )
  )
  SELECT id FROM text_filtered;
$$;

CREATE OR REPLACE FUNCTION public.directory_facet_gender_value_counts(
  p_location_city_slug text,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE (gender_value text, profile_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT tp.gender::text AS gender_value, count(*)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_location_city_slug,
    p_height_min,
    p_height_max,
    p_selected_taxonomy_ids,
    p_search,
    NULL::text[],
    p_boolean_filters,
    p_text_filters
  ) sid
  JOIN public.talent_profiles tp ON tp.id = sid
  WHERE tp.gender IS NOT NULL
  GROUP BY tp.gender;
$$;

CREATE OR REPLACE FUNCTION public.directory_facet_boolean_field_value_counts(
  p_field_definition_id uuid,
  p_location_city_slug text,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE (value_bool boolean, profile_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT fv.value_boolean AS value_bool, count(DISTINCT sid)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_location_city_slug,
    p_height_min,
    p_height_max,
    p_selected_taxonomy_ids,
    p_search,
    p_gender_filter,
    p_boolean_filters,
    p_text_filters
  ) sid
  JOIN public.field_values fv
    ON fv.talent_profile_id = sid
   AND fv.field_definition_id = p_field_definition_id
  WHERE fv.value_boolean IS NOT NULL
  GROUP BY fv.value_boolean;
$$;

CREATE OR REPLACE FUNCTION public.directory_facet_text_field_value_counts(
  p_field_definition_id uuid,
  p_location_city_slug text,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE (value_text text, profile_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT trim(fv.value_text) AS value_text, count(DISTINCT sid)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_location_city_slug,
    p_height_min,
    p_height_max,
    p_selected_taxonomy_ids,
    p_search,
    p_gender_filter,
    p_boolean_filters,
    p_text_filters
  ) sid
  JOIN public.field_values fv
    ON fv.talent_profile_id = sid
   AND fv.field_definition_id = p_field_definition_id
  WHERE fv.value_text IS NOT NULL
    AND trim(fv.value_text) <> ''
  GROUP BY trim(fv.value_text);
$$;

GRANT EXECUTE ON FUNCTION public.directory_facet_scalar_base_ids(text, int, int, uuid[], text, text[], jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_scalar_base_ids(text, int, int, uuid[], text, text[], jsonb, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.directory_facet_gender_value_counts(text, int, int, uuid[], text, jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_gender_value_counts(text, int, int, uuid[], text, jsonb, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.directory_facet_boolean_field_value_counts(uuid, text, int, int, uuid[], text, text[], jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_boolean_field_value_counts(uuid, text, int, int, uuid[], text, text[], jsonb, jsonb) TO authenticated;

GRANT EXECUTE ON FUNCTION public.directory_facet_text_field_value_counts(uuid, text, int, int, uuid[], text, text[], jsonb, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_text_field_value_counts(uuid, text, int, int, uuid[], text, text[], jsonb, jsonb) TO authenticated;

COMMIT;
