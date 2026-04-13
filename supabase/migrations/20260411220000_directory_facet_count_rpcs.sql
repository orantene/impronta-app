-- Faceted directory filter counts (public directory; respects same visibility rules as listing).

BEGIN;
CREATE OR REPLACE FUNCTION public.directory_facet_taxonomy_counts_for_kind(
  p_kind text,
  p_location_city_slug text,
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text
)
RETURNS TABLE (taxonomy_term_id uuid, profile_count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH sel AS (
    SELECT tt.id, tt.kind
    FROM unnest(coalesce(p_selected_taxonomy_ids, array[]::uuid[])) AS x(id)
    JOIN public.taxonomy_terms tt ON tt.id = x.id AND tt.archived_at IS NULL
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
$$;
CREATE OR REPLACE FUNCTION public.directory_facet_location_counts(
  p_height_min int,
  p_height_max int,
  p_selected_taxonomy_ids uuid[],
  p_search text
)
RETURNS TABLE (city_slug text, profile_count bigint)
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
  )
  SELECT l.city_slug::text, count(DISTINCT tp.id)::bigint AS profile_count
  FROM public.locations l
  INNER JOIN public.talent_profiles tp
    ON (tp.residence_city_id = l.id OR tp.location_id = l.id)
  INNER JOIN constrained c ON c.id = tp.id
  WHERE l.archived_at IS NULL
  GROUP BY l.city_slug;
$$;
GRANT EXECUTE ON FUNCTION public.directory_facet_taxonomy_counts_for_kind(text, text, int, int, uuid[], text) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_taxonomy_counts_for_kind(text, text, int, int, uuid[], text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.directory_facet_location_counts(int, int, uuid[], text) TO anon;
GRANT EXECUTE ON FUNCTION public.directory_facet_location_counts(int, int, uuid[], text) TO authenticated;
COMMIT;
