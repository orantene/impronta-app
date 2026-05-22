-- Directory facet-count RPCs — follow-on to the 20260522061318 visibility
-- overhaul. The directory listing, search and card data were already moved
-- onto the new gate; these filter-sidebar count functions were missed and
-- still gated on the dead workflow_status='approved' AND visibility='public'
-- lifecycle, so category / location / gender / boolean / text facet counts
-- under-reported any talent revealed via the directory eye.
--
-- Swap the talent gate to the new model (talent not globally hidden AND
-- site_visible/featured on a roster). The tenant-scoped location overload
-- already joins agency_talent_roster, so it gets the per-tenant eye check
-- inline; the non-scoped functions use talent_is_site_visible_anywhere().
--
-- The boolean / gender / text facet RPCs are unchanged: they derive their
-- base set from directory_facet_scalar_base_ids, so fixing that one
-- propagates to them.

BEGIN;

-- 1. directory_facet_location_counts — tenant-scoped overload. ───────────────
CREATE OR REPLACE FUNCTION public.directory_facet_location_counts(
  p_tenant_id uuid, p_height_min integer, p_height_max integer,
  p_selected_taxonomy_ids uuid[], p_search text
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
  tenant_tp AS (
    SELECT tp.id
    FROM public.talent_profiles tp
    JOIN public.agency_talent_roster r
      ON r.talent_profile_id = tp.id
      AND r.tenant_id = p_tenant_id
      AND r.status = 'active'
      AND r.agency_visibility IN ('site_visible', 'featured')
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
      AND (p_height_min IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm >= p_height_min))
      AND (p_height_max IS NULL OR (tp.height_cm IS NOT NULL AND tp.height_cm <= p_height_max))
      AND (
        p_search IS NULL
        OR trim(p_search) = ''
        OR tp.display_name ILIKE '%' || trim(p_search) || '%'
        OR tp.first_name  ILIKE '%' || trim(p_search) || '%'
        OR tp.last_name   ILIKE '%' || trim(p_search) || '%'
        OR tp.short_bio   ILIKE '%' || trim(p_search) || '%'
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
    FROM tenant_tp b
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

-- 2. directory_facet_location_counts — non-tenant-scoped overload. ───────────
CREATE OR REPLACE FUNCTION public.directory_facet_location_counts(
  p_height_min integer, p_height_max integer,
  p_selected_taxonomy_ids uuid[], p_search text
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
$function$;

-- 3. directory_facet_scalar_base_ids — base set for boolean/gender/text facets.
CREATE OR REPLACE FUNCTION public.directory_facet_scalar_base_ids(
  p_location_city_slug text, p_height_min integer, p_height_max integer,
  p_selected_taxonomy_ids uuid[], p_search text, p_gender_filter text[],
  p_boolean_filters jsonb, p_text_filters jsonb
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
$function$;

-- 4. directory_facet_taxonomy_counts_for_kind — category / role chip counts. ─
CREATE OR REPLACE FUNCTION public.directory_facet_taxonomy_counts_for_kind(
  p_kind text, p_location_city_slug text, p_height_min integer,
  p_height_max integer, p_selected_taxonomy_ids uuid[], p_search text
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
$function$;

COMMIT;
