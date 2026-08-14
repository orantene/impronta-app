-- Directory facet counts: tenant-scoped overloads.
--
-- BUG: on a tenant storefront every facet count was PLATFORM-WIDE. The filter
-- bar on improntamodels.com read "ALL MODELS · 38" while that roster holds 21 —
-- the counts were tallied across every tenant on the platform. Visitors filter
-- by a number that cannot match what the grid can ever show.
--
-- Cause: `directory_facet_taxonomy_counts_for_kind` and
-- `directory_facet_scalar_base_ids` (the shared base behind the gender /
-- boolean / text facet counts) take no tenant id and gate visibility with
-- `talent_is_site_visible_anywhere(tp.id)` — "visible on ANY tenant's site".
-- `directory_facet_location_counts` already had a tenant-scoped overload; this
-- brings the rest of the family in line with that precedent.
--
-- Shape: ADD overloads with `p_tenant_id uuid` FIRST, leave the existing
-- signatures untouched. The hub / global directory is genuinely cross-tenant
-- and must keep counting platform-wide, so the app picks the overload by
-- whether it has a tenant in scope. Nothing is dropped, so this is safe to
-- apply before the code that calls it ships.
--
-- Tenant scope = the same predicate the tenant directory grid itself uses:
-- an active roster row on this tenant with agency_visibility in
-- (site_visible, featured). `talent_is_site_visible_anywhere` is intentionally
-- NOT applied on top — roster membership IS the visibility rule here, and
-- keeping it would re-admit talent visible only via some other tenant.

-- ── Taxonomy counts (the top filter bar) ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.directory_facet_taxonomy_counts_for_kind(
  p_tenant_id uuid,
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
    JOIN public.agency_talent_roster r
      ON r.talent_profile_id = tp.id
     AND r.tenant_id = p_tenant_id
     AND r.status = 'active'
     AND r.agency_visibility IN ('site_visible', 'featured')
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
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

-- ── Shared scalar base (gender / boolean / text facet counts) ───────────────
CREATE OR REPLACE FUNCTION public.directory_facet_scalar_base_ids(
  p_tenant_id uuid,
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
    JOIN public.agency_talent_roster r
      ON r.talent_profile_id = tp.id
     AND r.tenant_id = p_tenant_id
     AND r.status = 'active'
     AND r.agency_visibility IN ('site_visible', 'featured')
    WHERE tp.deleted_at IS NULL
      AND tp.is_publicly_hidden = false
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
            SELECT public.directory_facet_normalize_value(slug.val)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            UNION
            SELECT public.directory_facet_normalize_value(lbl.label)
            FROM jsonb_array_elements_text(tf->'v') AS slug(val)
            CROSS JOIN LATERAL jsonb_array_elements_text(
              CASE WHEN jsonb_typeof(pfd.options) = 'array' THEN pfd.options ELSE '[]'::jsonb END
            ) AS lbl(label)
            WHERE
              lower(btrim(lbl.label)) = lower(btrim(slug.val))
              OR public.directory_facet_slugify(lbl.label) = public.directory_facet_slugify(slug.val)
          )
      )
    )
  )
  SELECT id FROM text_filtered;
$function$;

-- ── Gender counts ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.directory_facet_gender_value_counts(
  p_tenant_id uuid,
  p_location_city_slug text,
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE(gender_value text, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT tp.gender::text AS gender_value, count(*)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_tenant_id,
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
$function$;

-- ── Boolean field counts ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.directory_facet_boolean_field_value_counts(
  p_tenant_id uuid,
  p_field_definition_id uuid,
  p_location_city_slug text,
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE(value_bool boolean, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT vb.value_bool, count(DISTINCT sid)::bigint AS profile_count
  FROM public.directory_facet_scalar_base_ids(
    p_tenant_id,
    p_location_city_slug,
    p_height_min,
    p_height_max,
    p_selected_taxonomy_ids,
    p_search,
    p_gender_filter,
    p_boolean_filters,
    p_text_filters
  ) sid
  JOIN public.talent_profile_field_values bv
    ON bv.talent_profile_id = sid
   AND bv.field_definition_id =
       public.directory_facet_b_def_id_for_legacy_id(p_field_definition_id)
  CROSS JOIN LATERAL (
    SELECT (
      CASE lower(btrim(bv.value #>> '{}'))
        WHEN 'true' THEN true WHEN '1' THEN true WHEN 'yes' THEN true WHEN 't' THEN true
        WHEN 'false' THEN false WHEN '0' THEN false WHEN 'no' THEN false WHEN 'f' THEN false
        ELSE NULL
      END
    ) AS value_bool
  ) vb
  WHERE vb.value_bool IS NOT NULL
  GROUP BY vb.value_bool;
$function$;

-- ── Text field counts ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.directory_facet_text_field_value_counts(
  p_tenant_id uuid,
  p_field_definition_id uuid,
  p_location_city_slug text,
  p_height_min integer,
  p_height_max integer,
  p_selected_taxonomy_ids uuid[],
  p_search text,
  p_gender_filter text[],
  p_boolean_filters jsonb,
  p_text_filters jsonb
)
RETURNS TABLE(value_text text, profile_count bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH bdef AS (
    SELECT pfd.id,
           pfd.options,
           pfd.directory_filter_config
    FROM public.profile_field_definitions pfd
    WHERE pfd.id = public.directory_facet_b_def_id_for_legacy_id(p_field_definition_id)
    LIMIT 1
  ),
  slugs AS (
    SELECT DISTINCT s.slug
    FROM bdef,
    LATERAL (
      SELECT btrim(fo.val) AS slug
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(bdef.directory_filter_config->'filter_options') = 'array'
             THEN bdef.directory_filter_config->'filter_options' ELSE '[]'::jsonb END
      ) AS fo(val)
      WHERE btrim(fo.val) <> ''
      UNION ALL
      SELECT public.directory_facet_slugify(o.label) AS slug
      FROM jsonb_array_elements_text(
        CASE WHEN jsonb_typeof(bdef.options) = 'array' THEN bdef.options ELSE '[]'::jsonb END
      ) AS o(label)
      WHERE NOT EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(bdef.directory_filter_config->'filter_options') = 'array'
               THEN bdef.directory_filter_config->'filter_options' ELSE '[]'::jsonb END
        ) AS fo2(val)
        WHERE btrim(fo2.val) <> ''
      )
        AND public.directory_facet_slugify(o.label) <> ''
    ) s
  ),
  slug_match AS (
    SELECT slugs.slug, public.directory_facet_normalize_value(slugs.slug) AS norm_val
    FROM slugs
    UNION
    SELECT slugs.slug, public.directory_facet_normalize_value(lbl.label) AS norm_val
    FROM slugs
    CROSS JOIN bdef
    CROSS JOIN LATERAL jsonb_array_elements_text(
      CASE WHEN jsonb_typeof(bdef.options) = 'array' THEN bdef.options ELSE '[]'::jsonb END
    ) AS lbl(label)
    WHERE lower(btrim(lbl.label)) = lower(btrim(slugs.slug))
       OR public.directory_facet_slugify(lbl.label) = public.directory_facet_slugify(slugs.slug)
  ),
  base AS (
    SELECT sid
    FROM public.directory_facet_scalar_base_ids(
      p_tenant_id,
      p_location_city_slug,
      p_height_min,
      p_height_max,
      p_selected_taxonomy_ids,
      p_search,
      p_gender_filter,
      p_boolean_filters,
      p_text_filters
    ) sid
  ),
  vals AS (
    SELECT base.sid,
           public.directory_facet_normalize_value(bv.value #>> '{}') AS norm_val
    FROM base
    JOIN public.talent_profile_field_values bv
      ON bv.talent_profile_id = base.sid
     AND bv.field_definition_id = (SELECT id FROM bdef)
    WHERE coalesce(btrim(bv.value #>> '{}'), '') <> ''
  )
  SELECT sm.slug AS value_text, count(DISTINCT vals.sid)::bigint AS profile_count
  FROM slug_match sm
  JOIN vals ON vals.norm_val = sm.norm_val
  GROUP BY sm.slug;
$function$;
